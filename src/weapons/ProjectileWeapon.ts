import Phaser from 'phaser';

import { WEAPON } from '@/config';
import { Projectile, type LaunchSpec } from '@/entities/Projectile';
import { sfx } from '@/systems/Sfx';
import type { Enemy } from '@/entities/Enemy';
import { RepeatQueue, findNearest, type Weapon, type WeaponContext } from '@/weapons/Weapon';
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
  private readonly repeats = new RepeatQueue();
  private readonly scene: Phaser.Scene;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.projectiles = scene.physics.add.group({
      classType: Projectile,
      maxSize: WEAPON.maxProjectiles,
      runChildUpdate: true,
    });
  }

  public update(delta: number, context: WeaponContext): void {
    this.repeats.tick(delta, () => this.castAtNearest(context));
    this.sinceShotMs += delta;
    if (this.sinceShotMs < context.cooldownMs) {
      return;
    }

    if (!this.castAtNearest(context)) {
      // Hold the charge so the first enemy to wander in is hit immediately.
      this.sinceShotMs = context.cooldownMs;
      return;
    }

    this.sinceShotMs = 0;
    this.repeats.schedule(context.repeats ?? 0);
  }

  /** One cast at the nearest enemy in range. False when nobody is there. */
  private castAtNearest(context: WeaponContext): boolean {
    const target = findNearest(context.origin, context.enemies, context.range);
    if (!target) {
      return false;
    }
    this.fire(context, target);
    return true;
  }

  /** What one shot of this skill is, given the player's current stats. */
  protected abstract specFor(context: WeaponContext): LaunchSpec;

  /**
   * One cast: a shot at the target, and the extra projectiles fanned out
   * round it, WEAPON.extraShotSpread apart with the target in the middle
   * (0.75, the user's ask: they used to go for other enemies). Each shot
   * carries the skill's pierce, its 연쇄 and what a pierce costs it.
   */
  private fire(context: WeaponContext, target: Enemy): void {
    const { x, y } = context.origin;
    const first = Phaser.Math.Angle.Between(x, y, target.x, target.y);
    const shots = 1 + Math.max(0, Math.round(context.extraProjectiles ?? 0));
    const angles = Array.from({ length: shots }, (_, i) => first + (i - (shots - 1) / 2) * WEAPON.extraShotSpread);

    const spec = {
      ...this.specFor(context),
      skill: this.definition.id,
      chain: Math.max(0, Math.round(context.chainCount)),
      pierceKeep: context.pierceKeep ?? 1,
    };
    let launched = false;
    for (const angle of angles) {
      const shot = this.projectiles.get() as Projectile | null;
      if (!shot) {
        break;
      }
      shot.launch(x, y, angle, spec);
      launched = true;
    }

    // One sound a cast, however many it threw. Silent for the skills that
    // have no clip yet.
    if (launched) {
      sfx.playSkill(this.scene, this.definition.id);
    }
  }
}
