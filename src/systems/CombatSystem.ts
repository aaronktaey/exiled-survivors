import Phaser from 'phaser';

import { ENEMY, WEAPON, XP } from '@/config';
import { Enemy } from '@/entities/Enemy';
import { Player } from '@/entities/Player';
import { Projectile } from '@/entities/Projectile';
import { XpGem } from '@/entities/XpGem';
import type { Progression } from '@/systems/Progression';

/**
 * Wires the overlaps that make the loop work: shots hurt enemies, enemies
 * hurt the player, and gems get picked up.
 */
export class CombatSystem {
  public readonly gems: Phaser.Physics.Arcade.Group;

  private readonly player: Player;
  private readonly progression: Progression;

  public constructor(
    scene: Phaser.Scene,
    player: Player,
    enemies: Phaser.Physics.Arcade.Group,
    projectiles: Phaser.Physics.Arcade.Group,
    progression: Progression,
  ) {
    this.player = player;
    this.progression = progression;

    this.gems = scene.physics.add.group({
      classType: XpGem,
      maxSize: SPAWNED_GEM_CAP,
      runChildUpdate: true,
    });

    scene.physics.add.overlap(projectiles, enemies, this.onProjectileHit, undefined, this);
    scene.physics.add.overlap(player, enemies, this.onEnemyTouch, undefined, this);
    scene.physics.add.overlap(player, this.gems, this.onGemTouch, undefined, this);
  }

  private onProjectileHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (a, b) => {
    const bolt = a as unknown as Projectile;
    const enemy = b as unknown as Enemy;
    if (!bolt.active || !enemy.active) {
      return;
    }

    bolt.despawn();

    if (enemy.takeDamage(bolt.damage)) {
      this.killEnemy(enemy);
    }
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

  private killEnemy(enemy: Enemy): void {
    const { x, y } = enemy;
    enemy.destroy();

    const gem = this.gems.get() as XpGem | null;
    gem?.drop(x, y, XP.perEnemy, this.player);
  }
}

/** Roughly one gem per projectile in flight is plenty of headroom. */
const SPAWNED_GEM_CAP = WEAPON.maxProjectiles;
