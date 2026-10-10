import Phaser from 'phaser';

import { WEAPON } from '@/config';
import { Projectile } from '@/entities/Projectile';
import { findNearest, type Weapon, type WeaponContext } from '@/weapons/Weapon';

/**
 * Starting weapon: fires automatically at the nearest enemy in range.
 * Damage and rate come from Progression, so upgrades take effect immediately.
 */
export class BoltWeapon implements Weapon {
  public readonly projectiles: Phaser.Physics.Arcade.Group;

  private sinceShotMs = 0;

  public constructor(scene: Phaser.Scene) {
    this.projectiles = scene.physics.add.group({
      classType: Projectile,
      maxSize: WEAPON.maxProjectiles,
      runChildUpdate: true,
    });
  }

  public update(delta: number, context: WeaponContext): void {
    this.sinceShotMs += delta;
    if (this.sinceShotMs < context.cooldownMs) {
      return;
    }

    const target = findNearest(context.origin, context.enemies, WEAPON.rangePx);
    if (!target) {
      // Hold the charge so the first enemy to wander in is hit immediately.
      this.sinceShotMs = context.cooldownMs;
      return;
    }

    this.sinceShotMs = 0;
    this.fire(context, target);
  }

  private fire(context: WeaponContext, target: Phaser.GameObjects.Components.Transform): void {
    const bolt = this.projectiles.get() as Projectile | null;
    if (!bolt) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(context.origin.x, context.origin.y, target.x, target.y);
    bolt.launch(context.origin.x, context.origin.y, angle, context.damage);
  }
}
