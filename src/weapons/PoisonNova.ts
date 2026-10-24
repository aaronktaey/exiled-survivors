import Phaser from 'phaser';

import { DEPTH, POISON_NOVA, POISON_NOVA_FX, SKILL_MASTERY } from '@/config';
import type { Enemy } from '@/entities/Enemy';
import { sfx } from '@/systems/Sfx';
import { SKILLS } from '@/weapons/skills';
import { CastRepeat, findNearest, type Weapon, type WeaponContext } from '@/weapons/Weapon';

/** One ring on its way out from where it was cast. */
interface Ring {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  ageMs: number;
  /** Struck by this ring already: each enemy once a ring. */
  readonly struck: Set<Enemy>;
}

/** One dose of poison on an enemy. */
interface Dose {
  leftMs: number;
  /** Damage each tick. */
  readonly perTick: number;
}

/** What poisons one enemy, and how it stood when last seen. */
interface Poisoned {
  readonly enemy: Enemy;
  /** Its life count when poisoned: a recycled sprite is someone else. */
  readonly lives: number;
  readonly doses: Dose[];
  sinceTickMs: number;
  x: number;
  y: number;
}

/**
 * 포이즌 노바 (0.122, the user's ask): a ring of poison goes out from the
 * survivor to the skill's range. Everything it passes takes the hit and a
 * dose of poison — `POISON_NOVA.poisonShare` of the hit a second for
 * `durationMs`, ticking every `tickMs`, up to `maxStacks` doses at once
 * (the oldest gives way). It needs no aim, only something within reach.
 *
 * 각성: a poisoned enemy that dies passes its doses to those within
 * `SKILL_MASTERY.poisonSpread.radius`. 2차 각성: a second, wider ring
 * follows the first (`SKILL_MASTERY.second.novaEcho`).
 *
 * Tags: 주문 · 독 · 범위.
 */
export class PoisonNova implements Weapon {
  public readonly definition = SKILLS.poisonNova;

  private readonly scene: Phaser.Scene;
  private readonly fx: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private sinceCastMs = 0;
  private readonly repeat = new CastRepeat();
  private readonly rings: Ring[] = [];
  /** The echo still to come (2차 각성): ms left, and where. */
  private echo: { leftMs: number; x: number; y: number; radius: number } | null = null;
  /** Where a dying enemy passed its poison on (각성), for a moment's ring. */
  private readonly bursts: { x: number; y: number; radius: number; ageMs: number }[] = [];
  /** Every enemy under poison. Public for tests. */
  public readonly poisoned = new Map<Enemy, Poisoned>();

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.fx = scene.add.graphics().setDepth(DEPTH.vfx);
    this.marks = scene.add.graphics().setDepth(DEPTH.vfx);
  }

  public update(delta: number, context: WeaponContext): void {
    this.sinceCastMs += delta;
    if (this.sinceCastMs >= context.cooldownMs) {
      const near = findNearest(context.origin, context.enemies, context.range);
      if (near) {
        this.sinceCastMs = this.repeat.restart(context);
        context.onCast?.(near.x);
        this.cast(context);
      } else {
        // Hold the charge so the first enemy to wander in is caught at once.
        this.sinceCastMs = context.cooldownMs;
      }
    }

    if (this.echo) {
      this.echo.leftMs -= delta;
      if (this.echo.leftMs <= 0) {
        const { x, y, radius } = this.echo;
        this.echo = null;
        this.rings.push({ x, y, radius, ageMs: 0, struck: new Set() });
      }
    }

    this.spreadRings(delta, context);
    this.tickPoison(delta, context);
    this.draw(delta);
  }

  private cast(context: WeaponContext): void {
    const { x, y } = context.origin;
    const radius = context.range;
    this.rings.push({ x, y, radius, ageMs: 0, struck: new Set() });
    if (context.masteredTwice) {
      const { delayMs, radiusScale } = SKILL_MASTERY.second.novaEcho;
      this.echo = { leftMs: delayMs, x, y, radius: radius * radiusScale };
    }
    sfx.playSkill(this.scene, this.definition.id);
  }

  /** Each ring grows over POISON_NOVA.ringMs; what it reaches is hit and poisoned. */
  private spreadRings(delta: number, context: WeaponContext): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]!;
      ring.ageMs += delta;
      const reach = ring.radius * Math.min(1, ring.ageMs / POISON_NOVA.ringMs);
      const caught: Enemy[] = [];
      for (const child of context.enemies.getChildren()) {
        const enemy = child as Enemy;
        if (enemy.active && !ring.struck.has(enemy) &&
            Phaser.Math.Distance.Between(ring.x, ring.y, enemy.x, enemy.y) <= reach + enemy.shownRadius) {
          caught.push(enemy);
        }
      }
      // Poisoned before the hit, since a kill recycles the sprite.
      for (const enemy of caught) {
        ring.struck.add(enemy);
        this.poison(enemy, context.damage * POISON_NOVA.poisonShare * (POISON_NOVA.tickMs / 1000));
      }
      for (const enemy of caught) {
        if (enemy.active) {
          context.hit(enemy, context.damage);
        }
      }
      if (ring.ageMs >= POISON_NOVA.ringMs + POISON_NOVA_FX.fadeMs) {
        this.rings.splice(i, 1);
      }
    }
  }

  /** One more dose on `enemy`; past maxStacks the one nearest its end gives way. */
  private poison(enemy: Enemy, perTick: number, leftMs: number = POISON_NOVA.durationMs): void {
    let entry = this.poisoned.get(enemy);
    if (!entry || entry.lives !== enemy.lives) {
      entry = { enemy, lives: enemy.lives, doses: [], sinceTickMs: 0, x: enemy.x, y: enemy.y };
      this.poisoned.set(enemy, entry);
    }
    entry.doses.push({ leftMs, perTick });
    if (entry.doses.length > POISON_NOVA.maxStacks) {
      entry.doses.sort((a, b) => b.leftMs - a.leftMs);
      entry.doses.length = POISON_NOVA.maxStacks;
    }
  }

  /** Every dose ticks; a poisoned enemy gone since passes its doses on, awakened. */
  private tickPoison(delta: number, context: WeaponContext): void {
    const spread = context.mastered ? SKILL_MASTERY.poisonSpread.radius * (context.areaScale ?? 1) : 0;
    const handOn: Poisoned[] = [];
    for (const [enemy, entry] of this.poisoned) {
      if (!enemy.active || enemy.lives !== entry.lives) {
        this.poisoned.delete(enemy);
        if (spread > 0) {
          handOn.push(entry);
        }
        continue;
      }
      entry.x = enemy.x;
      entry.y = enemy.y;
      entry.sinceTickMs += delta;
      let ticks = 0;
      while (entry.sinceTickMs >= POISON_NOVA.tickMs) {
        entry.sinceTickMs -= POISON_NOVA.tickMs;
        ticks += 1;
      }
      let amount = 0;
      for (const dose of entry.doses) {
        const due = Math.min(ticks, Math.ceil(dose.leftMs / POISON_NOVA.tickMs));
        amount += dose.perTick * due;
        dose.leftMs -= ticks * POISON_NOVA.tickMs;
      }
      entry.doses.splice(0, entry.doses.length, ...entry.doses.filter((dose) => dose.leftMs > 0));
      if (entry.doses.length === 0) {
        this.poisoned.delete(enemy);
      }
      if (amount > 0) {
        context.hit(enemy, amount);
      }
    }
    for (const gone of handOn) {
      for (const child of context.enemies.getChildren()) {
        const other = child as Enemy;
        if (!other.active || Phaser.Math.Distance.Between(gone.x, gone.y, other.x, other.y) > spread) {
          continue;
        }
        for (const dose of gone.doses) {
          if (dose.leftMs > 0) {
            this.poison(other, dose.perTick, dose.leftMs);
          }
        }
      }
      this.bursts.push({ x: gone.x, y: gone.y, radius: spread, ageMs: 0 });
    }
  }

  private draw(delta: number): void {
    this.fx.clear();
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]!;
      burst.ageMs += delta;
      const fade = 1 - burst.ageMs / POISON_NOVA_FX.fadeMs;
      if (fade <= 0) {
        this.bursts.splice(i, 1);
        continue;
      }
      this.fx.lineStyle(2, POISON_NOVA_FX.edge, 0.7 * fade).strokeCircle(burst.x, burst.y, burst.radius);
    }
    for (const ring of this.rings) {
      const grow = Math.min(1, ring.ageMs / POISON_NOVA.ringMs);
      const fade = ring.ageMs <= POISON_NOVA.ringMs ? 1 : 1 - (ring.ageMs - POISON_NOVA.ringMs) / POISON_NOVA_FX.fadeMs;
      const r = ring.radius * grow;
      this.fx.fillStyle(POISON_NOVA_FX.color, POISON_NOVA_FX.fillAlpha * fade).fillCircle(ring.x, ring.y, r);
      this.fx.lineStyle(POISON_NOVA_FX.edgeWidth, POISON_NOVA_FX.edge, fade).strokeCircle(ring.x, ring.y, r);
    }
    // A bubble over each poisoned enemy, bigger for more doses.
    this.marks.clear();
    for (const entry of this.poisoned.values()) {
      const size = POISON_NOVA_FX.markSize + entry.doses.length * 0.6;
      this.marks.fillStyle(POISON_NOVA_FX.color, 0.85).fillCircle(entry.x, entry.y - entry.enemy.shownRadius - 4, size);
    }
  }
}
