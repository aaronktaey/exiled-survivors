import Phaser from 'phaser';

import { AUDIO, COLORS, PLAYER, POTION, WEAPON, type EnemyShotSpec } from '@/config';
import { Enemy } from '@/entities/Enemy';
import { EnemyShot } from '@/entities/EnemyShot';
import { HealthPotion } from '@/entities/HealthPotion';
import { Player } from '@/entities/Player';
import { Projectile } from '@/entities/Projectile';
import { SkillDrop } from '@/entities/SkillDrop';
import { XpGem } from '@/entities/XpGem';
import type { DamageNumbers } from '@/systems/DamageNumbers';
import type { Progression } from '@/systems/Progression';
import type { SkillDefinition, SkillId } from '@/weapons/skills';

export interface CombatHooks {
  /**
   * Picks a skill to drop on a kill, or null to drop nothing. `bonus`
   * multiplies the chance — a rare's affixes make it likelier.
   */
  readonly rollSkillDrop: (bonus: number) => SkillDefinition | null;
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
  /** Everything the shooting kinds have thrown at the player. */
  public readonly enemyShots: Phaser.Physics.Arcade.Group;
  public readonly potions: Phaser.Physics.Arcade.Group;

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

    this.enemyShots = scene.physics.add.group({
      classType: EnemyShot,
      maxSize: WEAPON.maxProjectiles,
      runChildUpdate: true,
    });

    this.potions = scene.physics.add.group({ classType: HealthPotion, runChildUpdate: true });

    scene.physics.add.overlap(player, enemies, this.onEnemyTouch, undefined, this);
    scene.physics.add.overlap(player, this.enemyShots, this.onEnemyShotHit, undefined, this);
    scene.physics.add.overlap(player, this.potions, this.onPotionTouch, undefined, this);
    scene.physics.add.overlap(player, this.gems, this.onGemTouch, undefined, this);
    scene.physics.add.overlap(player, this.skillDrops, this.onSkillTouch, undefined, this);
  }

  /** Wires a newly acquired projectile weapon into enemy collisions. */
  public registerProjectiles(projectiles: Phaser.Physics.Arcade.Group, enemies: Phaser.Physics.Arcade.Group): void {
    this.scene.physics.add.overlap(projectiles, enemies, this.onProjectileHit, undefined, this);
  }

  /** Fires one enemy bolt. Handed to every enemy that can shoot. */
  public fireEnemyShot = (x: number, y: number, angle: number, spec: EnemyShotSpec): void => {
    const shot = this.enemyShots.get() as EnemyShot | null;
    shot?.fire(x, y, angle, spec);
  };

  /** Places a potion directly — used by the kill roll and by debug keys. */
  public dropPotionAt(x: number, y: number): void {
    const potion = this.potions.get() as HealthPotion | null;
    potion?.drop(x, y);
  }

  /** Places a drop directly — used by the spawner's roll and by debug keys. */
  public dropSkillAt(x: number, y: number, skill: SkillDefinition): void {
    const drop = this.skillDrops.get() as SkillDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, skill);
    this.playDropSound();
  }

  private playDropSound(): void {
    const { key, volume, seek } = AUDIO.skillDrop;
    // Stay quiet rather than warn if the clip failed to load.
    if (this.scene.cache.audio.exists(key)) {
      this.scene.sound.play(key, { volume, seek });
    }
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
    const shot = a as unknown as Projectile;
    const enemy = b as unknown as Enemy;
    if (!shot.active || !enemy.active) {
      return;
    }

    // A piercing shot overlaps the same body for several frames on its way
    // through; only the frame that books the hit does anything.
    if (!shot.registerHit(enemy)) {
      return;
    }

    if (shot.chillMs > 0) {
      enemy.chill(shot.chillMs);
    }

    // Spend the pierce before the hit: a kill recycles the enemy, and the
    // shot has to know whether it is done either way.
    const carriesOn = shot.consumePierce();
    this.hit(enemy, shot.damage);

    if (!carriesOn) {
      shot.despawn();
    }
  };

  private onEnemyTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const enemy = b as unknown as Enemy;
    if (!enemy.active) {
      return;
    }

    // Each kind hits for its own weight: a 거구 costs far more to stand in,
    // and a rare adds whatever its affixes are worth.
    this.player.takeDamage(enemy.rollDamage(enemy.contactDamage));
  };

  private onEnemyShotHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const shot = b as unknown as EnemyShot;
    if (!shot.active) {
      return;
    }

    shot.despawn();
    this.player.takeDamage(shot.damage);
  };

  private onGemTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const gem = b as unknown as XpGem;
    if (!gem.active) {
      return;
    }

    gem.collect();
    this.progression.addXp(gem.value);
  };

  private onPotionTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const potion = b as unknown as HealthPotion;
    if (!potion.active) {
      return;
    }

    // Walking over a full health bar would waste it, so leave it lying there.
    if (this.player.hp >= PLAYER.maxHp) {
      return;
    }

    potion.collect();
    const healed = this.player.heal(HealthPotion.healing);
    this.damageNumbers.spawn(this.player.x, this.player.y - 18, healed, {
      prefix: '+',
      color: COLORS.healText,
    });
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
    // Read the rewards before recycling, which resets the kind and affixes.
    const worth = enemy.xpValue;
    const dropBonus = enemy.dropBonus;
    // Pooled: back to the spawner's pool rather than destroyed.
    enemy.recycle();

    const gem = this.gems.get() as XpGem | null;
    gem?.drop(x, y, worth, this.player);

    const skill = this.hooks.rollSkillDrop(dropBonus);
    if (skill) {
      this.dropSkillAt(x, y, skill);
    }

    // Rolled on its own, so a kill can leave both a skill and a potion.
    if (Math.random() < POTION.chance) {
      this.dropPotionAt(x, y);
    }
  }
}
