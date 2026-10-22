import Phaser from 'phaser';

import { AFFIX_TIMING, DEPTH, ENEMY_KINDS, SKILL_MASTERY, TEXTURES, VOID_ORB, VOID_VORTEX_FX, orbsHeld } from '@/config';
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
  /** This hit was a 반복's, so the next waits out the whole cooldown. */
  repeated?: boolean;
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
  public readonly vortices: { view: Phaser.GameObjects.Image; leftMs: number; reach: number; sinceHealMs: number }[] = [];
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
   * 각성 (0.84; placed and healing since 0.98): every
   * SKILL_MASTERY.voidVortex.everyMs a 공허 opens where the enemies stand
   * thickest near the survivor (`thickest`), and for `lifeMs` draws every
   * enemy within its reach toward its middle — moving x/y the way
   * Separation does — and every `healEveryMs` heals `healPerEnemy` for each
   * enemy inside. Stepped by the run, so a pause holds it.
   */
  private tickVortices(context: WeaponContext, delta: number): void {
    const { everyMs, lifeMs, searchShare, reach, pullSpeed, healEveryMs, healPerEnemy } = SKILL_MASTERY.voidVortex;
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
      let inside = 0;
      for (const child of context.enemies.getChildren()) {
        const enemy = child as Enemy;
        if (!enemy.active) {
          continue;
        }
        const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
        if (dist > vortex.reach) {
          continue;
        }
        inside++;
        if (dist <= 1) {
          continue;
        }
        const move = Math.min(step, dist);
        enemy.x += ((x - enemy.x) / dist) * move;
        enemy.y += ((y - enemy.y) / dist) * move;
      }
      vortex.sinceHealMs += delta;
      if (vortex.sinceHealMs >= healEveryMs) {
        vortex.sinceHealMs -= healEveryMs;
        if (inside > 0) {
          context.heal?.(inside * healPerEnemy);
        }
      }
    }
    // A new one opens after the rest have aged: it does not lose this frame.
    if (context.mastered) {
      this.sinceVortexMs = Math.min(everyMs, this.sinceVortexMs + delta);
      if (this.sinceVortexMs >= everyMs) {
        const spot = this.thickest(context, Math.max(1, context.range) * searchShare, reach * area);
        // With no enemy near it waits, and opens on the first that comes.
        if (spot) {
          this.sinceVortexMs = 0;
          const view = this.scene.add
            .image(spot.x, spot.y, TEXTURES.voidVortex)
            .setDepth(DEPTH.pickups - 1)
            .setDisplaySize(reach * area * 2, reach * area * 2)
            .setAlpha(0);
          this.vortices.push({ view, leftMs: lifeMs, reach: reach * area, sinceHealMs: 0 });
        }
      }
    }
  }

  /**
   * Where a 공허 does the most: of the enemies within `search` of the
   * survivor, the one with the most enemies within `reach` of it (itself
   * counted), the nearer to the survivor on a tie. Null with none near.
   */
  private thickest(context: WeaponContext, search: number, reach: number): { x: number; y: number } | null {
    const { x, y } = context.origin;
    const all = (context.enemies.getChildren() as Enemy[]).filter((enemy) => enemy.active);
    let best: Enemy | null = null;
    let bestCount = 0;
    let bestDist = Infinity;
    for (const centre of all) {
      const dist = Phaser.Math.Distance.Between(x, y, centre.x, centre.y);
      if (dist > search) {
        continue;
      }
      let count = 0;
      for (const other of all) {
        if (Phaser.Math.Distance.Between(centre.x, centre.y, other.x, other.y) <= reach) {
          count++;
        }
      }
      if (count > bestCount || (count === bestCount && dist < bestDist)) {
        best = centre;
        bestCount = count;
        bestDist = dist;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
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
        // 반복: at its chance this orb hits the same enemy once more, soon.
        const again = !(record?.life === enemy.lives && record.repeated) && Math.random() < (context.repeatChance ?? 0);
        const wait = again ? Math.min(AFFIX_TIMING.repeatDelayMs, context.cooldownMs / 2) : context.cooldownMs;
        records.set(key + i, { life: enemy.lives, readyAt: this.elapsedMs + wait, repeated: again });
        context.hit(enemy, damage);
        // Held well apart by its own gap, or an orbit would drone.
        sfx.playSkill(this.scene, this.definition.id);
      }
    }
  }
}
