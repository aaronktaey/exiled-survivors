import Phaser from 'phaser';

import { WEAPON } from '@/config';
import { Projectile, type LaunchSpec } from '@/entities/Projectile';
import { sfx } from '@/systems/Sfx';
import type { Enemy } from '@/entities/Enemy';
import { CastRepeat, findNearest, findNearestEnemy, type Weapon, type WeaponContext } from '@/weapons/Weapon';
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
  /** 반복: whether this cast goes off once more. */
  private readonly repeat = new CastRepeat();
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

    this.sinceShotMs = this.repeat.restart(context);
    context.onCast?.(target.x);
    this.fire(context, target);
  }

  /** What one shot of this skill is, given the player's current stats. */
  protected abstract specFor(context: WeaponContext): LaunchSpec;

  /**
   * One cast: a shot at the target, and one more per extra projectile — at
   * the next-nearest enemy in range, or fanned out beside the first when
   * nobody else is there.
   */
  private fire(context: WeaponContext, target: Enemy): void {
    const { x, y } = context.origin;
    const first = Phaser.Math.Angle.Between(x, y, target.x, target.y);
    const angles = [first];
    const taken = new Set<Enemy>([target]);
    const extra = Math.max(0, Math.round(context.extraProjectiles ?? 0));

    for (let i = 1; i <= extra; i++) {
      const next = findNearestEnemy(x, y, context.enemies, context.range, taken);
      if (next) {
        taken.add(next);
        angles.push(Phaser.Math.Angle.Between(x, y, next.x, next.y));
      } else {
        // Alternate sides: +1, -1, +2, -2 steps of the spread.
        const side = i % 2 === 1 ? 1 : -1;
        angles.push(first + side * Math.ceil(i / 2) * WEAPON.extraShotSpread);
      }
    }

    const spec = this.specFor(context);
    let launched = false;
    for (const angle of angles) {
      const shot = this.projectiles.get() as Projectile | null;
      if (!shot) {
        break;
      }
      shot.launch(x, y, angle, spec);
      shot.skill = this.definition.id;
      launched = true;
    }

    // One sound a cast, however many it threw. Silent for the skills that
    // have no clip yet.
    if (launched) {
      sfx.playSkill(this.scene, this.definition.id);
    }
  }
}
