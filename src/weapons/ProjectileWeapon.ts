import Phaser from 'phaser';

import { WEAPON } from '@/config';
import { Projectile, type LaunchSpec } from '@/entities/Projectile';
import { findNearest, type Weapon, type WeaponContext } from '@/weapons/Weapon';
import type { SkillDefinition } from '@/weapons/skills';

/**
 * Shared body of every skill that throws something: own the pool, hold the
 * cooldown, aim at the nearest enemy in range. What that something is — how
 * it looks, how far it pierces, what it leaves behind — is the subclass's
 * business, expressed as the spec each shot launches with.
 */
export abstract class ProjectileWeapon implements Weapon {
  public abstract readonly definition: SkillDefinition;
  public readonly projectiles: Phaser.Physics.Arcade.Group;

  protected sinceShotMs = 0;

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

  /** What one shot of this skill is, given the player's current stats. */
  protected abstract specFor(context: WeaponContext): LaunchSpec;

  private fire(context: WeaponContext, target: Phaser.GameObjects.Components.Transform): void {
    const shot = this.projectiles.get() as Projectile | null;
    if (!shot) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(context.origin.x, context.origin.y, target.x, target.y);
    shot.launch(context.origin.x, context.origin.y, angle, this.specFor(context));
  }
}
