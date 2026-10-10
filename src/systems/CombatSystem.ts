import Phaser from 'phaser';

import { ENEMY, WEAPON, XP } from '@/config';
import { Enemy } from '@/entities/Enemy';
import { Player } from '@/entities/Player';
import { Projectile } from '@/entities/Projectile';
import { SkillDrop } from '@/entities/SkillDrop';
import { XpGem } from '@/entities/XpGem';
import type { DamageNumbers } from '@/systems/DamageNumbers';
import type { Progression } from '@/systems/Progression';
import type { SkillDefinition, SkillId } from '@/weapons/skills';

export interface CombatHooks {
  /** Picks a skill to drop on a kill, or null to drop nothing. */
  readonly rollSkillDrop: () => SkillDefinition | null;
  /** Called when the player walks over a dropped skill. */
  readonly onSkillCollected: (skill: SkillId) => void;
}

/**
 * Resolves everything that touches: melee and projectile damage, enemy
 * contact, and pickups. Weapons call `hit` so kills follow one path.
 */
export class CombatSystem {
  public readonly gems: Phaser.Physics.Arcade.Group;
  public readonly skillDrops: Phaser.Physics.Arcade.Group;

  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly progression: Progression;
  private readonly damageNumbers: DamageNumbers;
  private readonly hooks: CombatHooks;

  public constructor(
    scene: Phaser.Scene,
    player: Player,
    enemies: Phaser.Physics.Arcade.Group,
    progression: Progression,
    damageNumbers: DamageNumbers,
    hooks: CombatHooks,
  ) {
    this.scene = scene;
    this.player = player;
    this.progression = progression;
    this.damageNumbers = damageNumbers;
    this.hooks = hooks;

    this.gems = scene.physics.add.group({
      classType: XpGem,
      maxSize: WEAPON.maxProjectiles,
      runChildUpdate: true,
    });

    // No cap: drops expire on their own timer instead of being refused.
    this.skillDrops = scene.physics.add.group({
      classType: SkillDrop,
      runChildUpdate: true,
    });

    scene.physics.add.overlap(player, enemies, this.onEnemyTouch, undefined, this);
    scene.physics.add.overlap(player, this.gems, this.onGemTouch, undefined, this);
    scene.physics.add.overlap(player, this.skillDrops, this.onSkillTouch, undefined, this);
  }

  /** Wires a newly acquired projectile weapon into enemy collisions. */
  public registerProjectiles(projectiles: Phaser.Physics.Arcade.Group, enemies: Phaser.Physics.Arcade.Group): void {
    this.scene.physics.add.overlap(projectiles, enemies, this.onProjectileHit, undefined, this);
  }

  /** Places a drop directly — used by the spawner's roll and by debug keys. */
  public dropSkillAt(x: number, y: number, skill: SkillDefinition): void {
    const drop = this.skillDrops.get() as SkillDrop | null;
    drop?.drop(x, y, skill);
  }

  /** Single entry point for damage, so every kill drops the same things. */
  public hit = (enemy: Enemy, amount: number): void => {
    if (!enemy.active) {
      return;
    }

    this.damageNumbers.spawn(enemy.x, enemy.y - 10, amount);

    if (enemy.takeDamage(amount)) {
      this.killEnemy(enemy);
    }
  };

  private onProjectileHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (a, b) => {
    const bolt = a as unknown as Projectile;
    const enemy = b as unknown as Enemy;
    if (!bolt.active || !enemy.active) {
      return;
    }

    bolt.despawn();
    this.hit(enemy, bolt.damage);
  };

  private onEnemyTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const enemy = b as unknown as Enemy;
    if (!enemy.active) {
      return;
    }

    this.player.takeDamage(ENEMY.contactDamage);
  };

  private onGemTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const gem = b as unknown as XpGem;
    if (!gem.active) {
      return;
    }

    gem.collect();
    this.progression.addXp(gem.value);
  };

  private onSkillTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const drop = b as unknown as SkillDrop;
    if (!drop.active) {
      return;
    }

    const { skillId } = drop;
    drop.collect();
    this.hooks.onSkillCollected(skillId);
  };

  private killEnemy(enemy: Enemy): void {
    const { x, y } = enemy;
    // Pooled: back to the spawner's pool rather than destroyed.
    enemy.recycle();

    const gem = this.gems.get() as XpGem | null;
    gem?.drop(x, y, XP.perEnemy, this.player);

    const skill = this.hooks.rollSkillDrop();
    if (skill) {
      this.dropSkillAt(x, y, skill);
    }
  }
}
