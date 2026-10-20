import Phaser from 'phaser';

import { DEPTH, ENEMY_KINDS, SKILL_MASTERY, TEXTURES, VOID_ORB, orbsHeld } from '@/config';
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
  /**
   * Re-hit timers by enemy, one per orb: an orb does not hit the same enemy
   * again inside the cooldown, but every orb that sweeps through it does.
   */
  private readonly hits = new Map<Enemy, Map<number, HitRecord>>();

  /** Where the first orb is on the circle, in radians. */
  private angle = 0;
  /** How far round the orbs have come since the last lap was counted, in radians. */
  private lap = 0;
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

    const count = orbsHeld(context.orbCount, context.extraProjectiles ?? 0);
    const radius = Math.max(1, context.range);
    this.sync(count);

    // Screen y grows downward, so a growing angle sweeps clockwise.
    const angularSpeed = context.orbitSpeed / radius;
    const turned = angularSpeed * (delta / 1000);
    this.angle = Phaser.Math.Angle.Wrap(this.angle + turned);
    // Nothing is cast and nothing aimed: the survivor raises its orb once a lap.
    this.lap += turned;
    if (this.lap >= TAU) {
      this.lap -= TAU;
      context.onCast?.();
    }

    const { x, y } = context.origin;
    for (let i = 0; i < count; i++) {
      // Evenly spaced around the circle, so two orbs sit opposite.
      const orbAngle = this.angle + (i / count) * TAU;
      this.orbs[i]?.setPosition(x + Math.cos(orbAngle) * radius, y + Math.sin(orbAngle) * radius);
    }

    if (context.mastered) {
      this.pull(context, count, delta);
    }
    this.sweep(context, count);
  }

  /**
   * 각성: every enemy within reach of the orbit is drawn slowly toward the
   * survivor — through the orbs' path. `count` is unused: the pull is the
   * survivor's, however many orbs ride round them.
   */
  private pull(context: WeaponContext, _count: number, delta: number): void {
    const { reach, speed } = SKILL_MASTERY.voidPull;
    const { x, y } = context.origin;
    const limit = Math.max(1, context.range) + reach;
    const step = (speed * delta) / 1000;
    for (const child of context.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active) {
        continue;
      }
      const d = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (d > limit || d <= 1) {
        continue;
      }
      const move = Math.min(step, d);
      enemy.x += ((x - enemy.x) / d) * move;
      enemy.y += ((y - enemy.y) / d) * move;
    }
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

  /** Damages everything an orb is touching: each orb at most once per cooldown on each enemy. */
  private sweep(context: WeaponContext, count: number): void {
    // Copy first: a kill recycles the enemy and mutates the group's list.
    for (const child of [...context.enemies.getChildren()]) {
      const enemy = child as Enemy;
      if (!enemy.active) {
        continue;
      }

      const reach = VOID_ORB.radius + VOID_ORB.hitPadding + (ENEMY_KINDS[enemy.kind].size / 2);
      let records = this.hits.get(enemy);
      for (let i = 0; i < count && enemy.active; i++) {
        const orb = this.orbs[i];
        if (!orb || Phaser.Math.Distance.Between(orb.x, orb.y, enemy.x, enemy.y) > reach) {
          continue;
        }
        const record = records?.get(i);
        if (record !== undefined && record.life === enemy.lives && this.elapsedMs < record.readyAt) {
          continue;
        }
        if (!records) {
          records = new Map();
          this.hits.set(enemy, records);
        }
        records.set(i, { life: enemy.lives, readyAt: this.elapsedMs + context.cooldownMs });
        context.hit(enemy, context.damage);
        // Held well apart by its own gap, or an orbit would drone.
        sfx.playSkill(this.scene, this.definition.id);
      }
    }
  }
}
