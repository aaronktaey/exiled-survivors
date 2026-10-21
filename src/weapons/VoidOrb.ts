import Phaser from 'phaser';

import { DEPTH, ENEMY_KINDS, SKILL_MASTERY, TEXTURES, VOID_ORB, VOID_VORTEX_FX, orbsHeld } from '@/config';
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
  /** 2차 각성: the ring inside, turning the other way. Public for tests. */
  public readonly inner: Phaser.GameObjects.Image[] = [];
  /**
   * Re-hit timers by enemy, one per orb: an orb does not hit the same enemy
   * again inside the cooldown, but every orb that sweeps through it does.
   */
  private readonly hits = new Map<Enemy, Map<number, HitRecord>>();

  /** Where the first orb is on the circle, in radians. */
  private angle = 0;
  /** 각성's 공허: the ones open now, and the time since the last opened. Public for tests. */
  public readonly vortices: { view: Phaser.GameObjects.Image; leftMs: number; reach: number }[] = [];
  private sinceVortexMs = 0;
  /** What an orb's radius is now, after the held 효과범위. */
  private orbRadius: number = VOID_ORB.radius;
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
    const innerCount = context.masteredTwice ? count : 0;
    this.orbRadius = VOID_ORB.radius * (context.areaScale ?? 1);
    this.sync(this.orbs, count);
    this.sync(this.inner, innerCount);

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
    // 2차 각성: the inner ring, the other way round, offset half a gap.
    const { radiusShare, damageShare } = SKILL_MASTERY.second.voidInner;
    for (let i = 0; i < innerCount; i++) {
      const orbAngle = -this.angle + ((i + 0.5) / innerCount) * TAU;
      this.inner[i]?.setPosition(x + Math.cos(orbAngle) * radius * radiusShare, y + Math.sin(orbAngle) * radius * radiusShare);
    }

    this.tickVortices(context, delta);
    this.sweep(context, this.orbs, count, 0, context.damage);
    if (innerCount > 0) {
      // Keys past the outer ring's, so the two rings keep their own timers.
      this.sweep(context, this.inner, innerCount, 1000, context.damage * damageShare);
    }
  }

  /**
   * 각성 (0.84): every SKILL_MASTERY.voidVortex.everyMs a 공허 opens at a
   * random spot within `spreadShare` × the orbit's radius of the survivor,
   * and for `lifeMs` draws every enemy within its reach toward its middle —
   * moving x/y the way Separation does. Stepped by the run, so a pause holds it.
   */
  private tickVortices(context: WeaponContext, delta: number): void {
    const { everyMs, lifeMs, spreadShare, reach, pullSpeed } = SKILL_MASTERY.voidVortex;
    const area = context.areaScale ?? 1;
    const step = (pullSpeed * delta) / 1000;
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const vortex = this.vortices[i]!;
      vortex.leftMs -= delta;
      const { x, y } = vortex.view;
      // It turns, fades in, and fades out at the end of its life.
      vortex.view.rotation -= (delta / 1000) * VOID_VORTEX_FX.spinPerSecond;
      vortex.view.setAlpha(VOID_VORTEX_FX.alpha * Math.min(1, (lifeMs - vortex.leftMs) / VOID_VORTEX_FX.fadeMs, vortex.leftMs / VOID_VORTEX_FX.fadeMs));
      if (vortex.leftMs <= 0) {
        vortex.view.destroy();
        this.vortices.splice(i, 1);
        continue;
      }
      for (const child of context.enemies.getChildren()) {
        const enemy = child as Enemy;
        if (!enemy.active) {
          continue;
        }
        const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
        if (dist > vortex.reach || dist <= 1) {
          continue;
        }
        const move = Math.min(step, dist);
        enemy.x += ((x - enemy.x) / dist) * move;
        enemy.y += ((y - enemy.y) / dist) * move;
      }
    }
    // A new one opens after the rest have aged: it does not lose this frame.
    if (context.mastered) {
      this.sinceVortexMs += delta;
      if (this.sinceVortexMs >= everyMs) {
        // One at a time, however long it was since the last.
        this.sinceVortexMs = 0;
        const spread = Math.max(1, context.range) * spreadShare;
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * spread;
        const view = this.scene.add
          .image(context.origin.x + Math.cos(a) * d, context.origin.y + Math.sin(a) * d, TEXTURES.voidVortex)
          .setDepth(DEPTH.pickups - 1)
          .setDisplaySize(reach * area * 2, reach * area * 2)
          .setAlpha(0);
        this.vortices.push({ view, leftMs: lifeMs, reach: reach * area });
      }
    }
  }

  /** Grows or hides a ring's orbs so exactly `count` of them are in the air. */
  private sync(orbs: Phaser.GameObjects.Image[], count: number): void {
    while (orbs.length < count) {
      orbs.push(
        this.scene.add
          .image(0, 0, TEXTURES.voidOrb)
          .setDepth(DEPTH.projectiles)
          .setDisplaySize(this.orbRadius * 2, this.orbRadius * 2),
      );
    }

    orbs.forEach((orb, index) => orb.setVisible(index < count).setDisplaySize(this.orbRadius * 2, this.orbRadius * 2));
  }

  /** Damages everything an orb is touching: each orb at most once per cooldown on each enemy. */
  private sweep(context: WeaponContext, orbs: readonly Phaser.GameObjects.Image[], count: number, key: number, damage: number): void {
    // Copy first: a kill recycles the enemy and mutates the group's list.
    for (const child of [...context.enemies.getChildren()]) {
      const enemy = child as Enemy;
      if (!enemy.active) {
        continue;
      }

      const reach = this.orbRadius + VOID_ORB.hitPadding + (ENEMY_KINDS[enemy.kind].size / 2);
      let records = this.hits.get(enemy);
      for (let i = 0; i < count && enemy.active; i++) {
        const orb = orbs[i];
        if (!orb || Phaser.Math.Distance.Between(orb.x, orb.y, enemy.x, enemy.y) > reach) {
          continue;
        }
        const record = records?.get(key + i);
        if (record !== undefined && record.life === enemy.lives && this.elapsedMs < record.readyAt) {
          continue;
        }
        if (!records) {
          records = new Map();
          this.hits.set(enemy, records);
        }
        records.set(key + i, { life: enemy.lives, readyAt: this.elapsedMs + context.cooldownMs });
        context.hit(enemy, damage);
        // Held well apart by its own gap, or an orbit would drone.
        sfx.playSkill(this.scene, this.definition.id);
      }
    }
  }
}
