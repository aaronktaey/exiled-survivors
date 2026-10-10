import Phaser from 'phaser';

import { WEAPON } from '@/config';
import { Projectile } from '@/entities/Projectile';
import { SKILLS } from '@/weapons/skills';
import { findNearest, type Weapon, type WeaponContext } from '@/weapons/Weapon';

/**
 * Drop-only skill: lobs a homing-free bolt at the nearest enemy in range.
 * Tags: 투사체 · 원거리 · 주문 · 화염.
 */
export class Fireball implements Weapon {
  public readonly definition = SKILLS.fireball;
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

    const target = findNearest(context.origin, context.enemies, context.range);
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
    bolt.launch(context.origin.x, context.origin.y, angle, {
      damage: context.damage,
      speed: context.projectileSpeed,
      range: context.range,
    });
  }
}
