import Phaser from 'phaser';

import { DEPTH, ENEMY_KINDS, TEXTURES, VOID_ORB } from '@/config';
import type { Enemy } from '@/entities/Enemy';
import { sfx } from '@/systems/Sfx';
import { SKILLS } from '@/weapons/skills';
import type { Weapon, WeaponContext } from '@/weapons/Weapon';

const TAU = Math.PI * 2;

/** When one orb may hit a given enemy again. Paired with the sprite's life
 *  count, so a recycled enemy starts clean. */
interface HitRecord {
  life: number;
  readyAt: number;
}

/**
 * Drop-only skill: orbs that ride around the player clockwise and hurt
 * whatever they sweep through. Nothing is fired and nothing is aimed — the
 * damage is in where the player stands.
 *
 * It reads the shared stats as an orbit: `range` is how far out the orbs
 * ride, `orbitSpeed` how fast they travel around that circle, and the
 * cooldown (from attack speed) how often one orb may hit the same enemy
 * again. Tags: 공허 · 주문 · 투사체.
 */
export class VoidOrb implements Weapon {
  public readonly definition = SKILLS.voidOrb;

  private readonly scene: Phaser.Scene;
  private readonly orbs: Phaser.GameObjects.Image[] = [];
  /** Per-enemy re-hit timers, so a swept enemy is not hit every frame. */
  private readonly hits = new Map<Enemy, HitRecord>();

  /** Where the first orb is on the circle, in radians. */
  private angle = 0;
  private elapsedMs = 0;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** The live orbs, for tests and debug readouts. */
  public get active(): readonly Phaser.GameObjects.Image[] {
    return this.orbs.filter((orb) => orb.visible);
  }

  public update(delta: number, context: WeaponContext): void {
    this.elapsedMs += delta;

    const count = Math.max(1, Math.round(context.orbCount + (context.extraProjectiles ?? 0)));
    const radius = Math.max(1, context.range);
    this.sync(count);

    // Screen y grows downward, so a growing angle sweeps clockwise.
    const angularSpeed = context.orbitSpeed / radius;
    this.angle = Phaser.Math.Angle.Wrap(this.angle + angularSpeed * (delta / 1000));

    const { x, y } = context.origin;
    for (let i = 0; i < count; i++) {
      // Evenly spaced around the circle, so two orbs sit opposite.
      const orbAngle = this.angle + (i / count) * TAU;
      this.orbs[i]?.setPosition(x + Math.cos(orbAngle) * radius, y + Math.sin(orbAngle) * radius);
    }

    this.sweep(context, count);
  }

  /** Grows or hides orbs so exactly `count` of them are in the air. */
  private sync(count: number): void {
    while (this.orbs.length < count) {
      this.orbs.push(
        this.scene.add
          .image(0, 0, TEXTURES.voidOrb)
          .setDepth(DEPTH.projectiles)
          .setDisplaySize(VOID_ORB.radius * 2, VOID_ORB.radius * 2),
      );
    }

    this.orbs.forEach((orb, index) => orb.setVisible(index < count));
  }

  /** Damages everything an orb is touching, at most once per cooldown. */
  private sweep(context: WeaponContext, count: number): void {
    // Copy first: a kill recycles the enemy and mutates the group's list.
    for (const child of [...context.enemies.getChildren()]) {
      const enemy = child as Enemy;
      if (!enemy.active) {
        continue;
      }

      const record = this.hits.get(enemy);
      const onCooldown = record !== undefined && record.life === enemy.lives && this.elapsedMs < record.readyAt;
      if (onCooldown) {
        continue;
      }

      const reach = VOID_ORB.radius + VOID_ORB.hitPadding + (ENEMY_KINDS[enemy.kind].size / 2);
      for (let i = 0; i < count; i++) {
        const orb = this.orbs[i];
        if (!orb) {
          continue;
        }

        if (Phaser.Math.Distance.Between(orb.x, orb.y, enemy.x, enemy.y) > reach) {
          continue;
        }

        this.hits.set(enemy, { life: enemy.lives, readyAt: this.elapsedMs + context.cooldownMs });
        context.hit(enemy, context.damage);
        // Held well apart by its own gap, or an orbit would drone.
        sfx.playSkill(this.scene, this.definition.id);
        break;
      }
    }
  }
}
