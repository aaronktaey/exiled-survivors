import Phaser from 'phaser';

import { DEPTH, POISON_NOVA, POISON_NOVA_FX } from '@/config';
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

/** The poison on one enemy: its stacks share one clock, and every hit starts it over. */
interface Poisoned {
  readonly enemy: Enemy;
  /** Its life count when poisoned: a recycled sprite is someone else. */
  readonly lives: number;
  stacks: number;
  leftMs: number;
  /** Damage a second for each stack — the last hit's share. */
  perStack: number;
  sinceTickMs: number;
  /** Where it was last seen, for its burst (2차 각성). */
  x: number;
  y: number;
  /** Where its bubbles start their loop, so a crowd does not bubble in step. */
  readonly phase: number;
  /** Its stack count beside it, while it has one. */
  label?: Phaser.GameObjects.Text;
}

/** A droplet thrown out of a blast: its way, how far past the front it flies, how big. */
interface Spark {
  readonly angle: number;
  readonly reach: number;
  readonly size: number;
}

/** A smoke puff left inside a blast. */
interface Puff {
  readonly angle: number;
  readonly at: number;
  readonly size: number;
}

/**
 * How a blast looks (0.125, the user's ask: an explosion, not a circle): a
 * white-hot core that flashes, gas densest at the middle, a shock front
 * that thins as it spreads, droplets thrown out past it and smoke left
 * behind. The cast's ring and 2차 각성's burst both draw one.
 */
interface Blast {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** How long it takes to reach its edge. */
  readonly growMs: number;
  readonly sparks: readonly Spark[];
  readonly puffs: readonly Puff[];
  ageMs: number;
}

/**
 * 독성폭발 (0.122, the user's design): a burst of poison goes out from the
 * survivor as a ring to the skill's range over `POISON_NOVA.ringMs`.
 * Everything it passes takes the hit and a stack of 중독 — `poisonShare` of
 * the hit a second a stack, ticking every `tickMs`, up to `maxStacks`. Every
 * hit starts the whole poison's `durationMs` over, so an enemy that stays
 * near keeps stacking, and one that gets away loses it all at once.
 *
 * 각성: `stacksPerHitAwakened` stacks a hit. 2차 각성: an enemy that
 * reaches `maxStacks` bursts — the whole of its poison (every stack for a
 * whole `durationMs`) at once on everything within the skill's range of it,
 * itself included, and its stacks gone. A burst poisons nothing, so one
 * never sets off another (a version that spread stacks chained without end;
 * 0.123–0.124 also burst a poisoned enemy as it died — 0.125 took that out,
 * the user's ask).
 *
 * A poisoned enemy bubbles green, its stacks counted beside it in green.
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
  private readonly blasts: Blast[] = [];
  /** Stack counts not in use, for the next poisoned enemy. */
  private readonly spareLabels: Phaser.GameObjects.Text[] = [];
  private clockMs = 0;
  /** Every enemy under poison. Public for tests. */
  public readonly poisoned = new Map<Enemy, Poisoned>();
  /** How many 2차 각성 bursts have gone off. Public for tests. */
  public burstCount = 0;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.fx = scene.add.graphics().setDepth(DEPTH.vfx);
    this.marks = scene.add.graphics().setDepth(DEPTH.vfx);
  }

  /** 가시 (0.143): the next update casts, the cooldown run out. */
  public castNow(): void {
    this.sinceCastMs = Number.POSITIVE_INFINITY;
  }

  public update(delta: number, context: WeaponContext): void {
    this.clockMs += delta;
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

    this.spreadRings(delta, context);
    this.tickPoison(delta, context);
    this.draw(delta);
  }

  private cast(context: WeaponContext): void {
    const { x, y } = context.origin;
    this.rings.push({ x, y, radius: context.range, ageMs: 0, struck: new Set() });
    this.blast(x, y, context.range, POISON_NOVA.ringMs, 1);
    sfx.playSkill(this.scene, this.definition.id);
  }

  /** Each ring grows over POISON_NOVA.ringMs; what it reaches is hit, then poisoned. */
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
      for (const enemy of caught) {
        ring.struck.add(enemy);
      }
      // Poisoned only if it lived: its life count is read first, since a kill
      // recycles the sprite and the pool may hand it straight back out.
      for (const enemy of caught) {
        if (!enemy.active) {
          continue;
        }
        const lives = enemy.lives;
        context.hit(enemy, context.damage);
        if (enemy.active && enemy.lives === lives) {
          this.poison(enemy, context);
        }
      }
      if (ring.ageMs >= POISON_NOVA.ringMs) {
        this.rings.splice(i, 1);
      }
    }
  }

  /** More stacks on `enemy`, its clock started over; at the top, awakened twice, it bursts. Public for tests. */
  public poison(enemy: Enemy, context: WeaponContext): void {
    if (!enemy.active) {
      return;
    }
    let entry = this.poisoned.get(enemy);
    if (!entry || entry.lives !== enemy.lives) {
      this.release(entry);
      entry = { enemy, lives: enemy.lives, stacks: 0, leftMs: 0, perStack: 0, sinceTickMs: 0, x: enemy.x, y: enemy.y, phase: Math.random() * 1000 };
      this.poisoned.set(enemy, entry);
    }
    const add = context.mastered ? POISON_NOVA.stacksPerHitAwakened : 1;
    entry.stacks = Math.min(POISON_NOVA.maxStacks, entry.stacks + add);
    entry.leftMs = POISON_NOVA.durationMs;
    entry.perStack = context.damage * POISON_NOVA.poisonShare;
    entry.x = enemy.x;
    entry.y = enemy.y;
    if (context.masteredTwice && entry.stacks >= POISON_NOVA.maxStacks) {
      this.burst(entry, context);
    }
  }

  /**
   * 2차 각성: the stacks go, and the whole of the poison — every stack it
   * held for a whole durationMs — lands at once on all within the skill's
   * range of where it stood, itself included if it lives. It poisons nothing.
   */
  private burst(entry: Poisoned, context: WeaponContext): void {
    const damage = entry.stacks * entry.perStack * (POISON_NOVA.durationMs / 1000);
    const { x, y } = entry;
    this.poisoned.delete(entry.enemy);
    this.release(entry);
    const caught: Enemy[] = [];
    for (const child of context.enemies.getChildren()) {
      const other = child as Enemy;
      if (other.active && Phaser.Math.Distance.Between(x, y, other.x, other.y) <= context.range + other.shownRadius) {
        caught.push(other);
      }
    }
    caught.forEach((other) => {
      if (other.active) {
        context.hit(other, damage);
      }
    });
    this.blast(x, y, context.range, POISON_NOVA_FX.burstGrowMs, POISON_NOVA_FX.burstSparkScale);
    this.burstCount += 1;
  }

  /** Every poisoned enemy takes its stacks' worth each tick, until its clock runs out. */
  private tickPoison(delta: number, context: WeaponContext): void {
    for (const [enemy, entry] of this.poisoned) {
      if (!enemy.active || enemy.lives !== entry.lives) {
        this.poisoned.delete(enemy);
        this.release(entry);
        continue;
      }
      entry.x = enemy.x;
      entry.y = enemy.y;
      entry.sinceTickMs += Math.min(delta, entry.leftMs);
      entry.leftMs -= delta;
      let ticks = 0;
      while (entry.sinceTickMs >= POISON_NOVA.tickMs) {
        entry.sinceTickMs -= POISON_NOVA.tickMs;
        ticks += 1;
      }
      const amount = ticks * entry.stacks * entry.perStack * (POISON_NOVA.tickMs / 1000);
      if (entry.leftMs <= 0) {
        this.poisoned.delete(enemy);
        this.release(entry);
      }
      // Poison wears on it quietly: a 도망자 does not run from it (0.124).
      if (amount > 0) {
        context.hit(enemy, amount, false);
      }
    }
  }

  /** Puts an enemy's stack count back for the next one. */
  private release(entry?: Poisoned): void {
    if (entry?.label) {
      entry.label.setVisible(false);
      this.spareLabels.push(entry.label);
      entry.label = undefined;
    }
  }

  private labelFor(entry: Poisoned): Phaser.GameObjects.Text {
    if (!entry.label) {
      entry.label =
        this.spareLabels.pop() ??
        this.scene.add
          .text(0, 0, '', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${POISON_NOVA_FX.stackSize}px`,
            color: POISON_NOVA_FX.stackColor,
            stroke: POISON_NOVA_FX.stackStroke,
            strokeThickness: 3,
          })
          .setOrigin(0, 0.5)
          .setDepth(DEPTH.vfx + 1);
      entry.label.setVisible(true).setData('stacks', -1);
    }
    return entry.label;
  }

  /** A blast to draw: its droplets and smoke rolled now, so each one looks its own. */
  private blast(x: number, y: number, radius: number, growMs: number, sparkScale: number): void {
    const sparks: Spark[] = [];
    const count = Math.round(POISON_NOVA_FX.sparks * sparkScale);
    for (let i = 0; i < count; i++) {
      sparks.push({
        angle: ((i + Math.random() * 0.8) / count) * Math.PI * 2,
        reach: 0.75 + Math.random() * 0.5,
        size: 1.6 + Math.random() * 1.8,
      });
    }
    const puffs: Puff[] = [];
    for (let i = 0; i < POISON_NOVA_FX.puffs; i++) {
      puffs.push({ angle: Math.random() * Math.PI * 2, at: 0.2 + Math.random() * 0.55, size: 0.16 + Math.random() * 0.12 });
    }
    this.blasts.push({ x, y, radius, growMs, sparks, puffs, ageMs: 0 });
  }

  private drawBlast(blast: Blast): void {
    const fx = POISON_NOVA_FX;
    const grow = Math.min(1, blast.ageMs / blast.growMs);
    const out = 1 - (1 - grow) * (1 - grow);
    const fade = blast.ageMs <= blast.growMs ? 1 : Math.max(0, 1 - (blast.ageMs - blast.growMs) / fx.fadeMs);
    const r = blast.radius * out;
    const { x, y } = blast;

    // The gas, densest at the middle.
    this.fx.fillStyle(fx.color, fx.fillAlpha * fade).fillCircle(x, y, r);
    this.fx.fillStyle(fx.color, fx.fillAlpha * 1.2 * fade).fillCircle(x, y, r * 0.66);
    this.fx.fillStyle(fx.edge, fx.fillAlpha * 1.4 * fade).fillCircle(x, y, r * 0.33);
    // Smoke left where it passed, swelling as it thins.
    for (const puff of blast.puffs) {
      const d = r * puff.at;
      const size = blast.radius * puff.size * (0.6 + 0.6 * out);
      this.fx.fillStyle(fx.smoke, fx.smokeAlpha * fade).fillCircle(x + Math.cos(puff.angle) * d, y + Math.sin(puff.angle) * d, size);
    }
    // The white-hot core, only for an instant.
    if (blast.ageMs < fx.flashMs) {
      const t = blast.ageMs / fx.flashMs;
      this.fx.fillStyle(fx.edge, 0.7 * (1 - t)).fillCircle(x, y, blast.radius * (0.22 + 0.18 * t));
      this.fx.fillStyle(fx.core, 0.95 * (1 - t)).fillCircle(x, y, blast.radius * (0.12 + 0.1 * t));
    }
    // The shock front: thick as it leaves, thin as it spreads, a faint echo inside it.
    this.fx.lineStyle(Math.max(1, fx.edgeWidth * (1.4 - out)), fx.edge, 0.95 * fade).strokeCircle(x, y, r);
    this.fx.lineStyle(1, fx.core, 0.45 * fade).strokeCircle(x, y, r * 0.86);
    // Droplets thrown out past the front, each with a short streak behind it.
    for (const spark of blast.sparks) {
      const d = r * spark.reach;
      const cos = Math.cos(spark.angle);
      const sin = Math.sin(spark.angle);
      const sx = x + cos * d;
      const sy = y + sin * d;
      const tail = Math.min(d, blast.radius * 0.18) * (1 - grow * 0.5);
      this.fx.lineStyle(spark.size * 0.8, fx.color, 0.7 * fade).lineBetween(sx - cos * tail, sy - sin * tail, sx, sy);
      this.fx.fillStyle(fx.edge, fade).fillCircle(sx, sy, spark.size * (1 - 0.4 * grow));
    }
  }

  private draw(delta: number): void {
    this.fx.clear();
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const blast = this.blasts[i]!;
      blast.ageMs += delta;
      if (blast.ageMs >= blast.growMs + POISON_NOVA_FX.fadeMs) {
        this.blasts.splice(i, 1);
        continue;
      }
      this.drawBlast(blast);
    }

    // 중독: green bubbles rising off it, and its stacks in green beside it.
    this.marks.clear();
    const { bubbles, bubbleRiseMs, bubbleSize } = POISON_NOVA_FX;
    for (const entry of this.poisoned.values()) {
      const { enemy } = entry;
      const r = enemy.shownRadius;
      for (let b = 0; b < bubbles; b++) {
        const t = ((this.clockMs + entry.phase + (b * bubbleRiseMs) / bubbles) % bubbleRiseMs) / bubbleRiseMs;
        const bx = enemy.x + Math.sin(t * Math.PI * 2 + b * 2.1 + entry.phase) * r * 0.45;
        const by = enemy.y + r * 0.3 - t * r * 1.5;
        const size = bubbleSize * (0.6 + t * 0.6);
        this.marks.fillStyle(POISON_NOVA_FX.color, 0.8 * (1 - t)).fillCircle(bx, by, size);
        this.marks.lineStyle(1, POISON_NOVA_FX.edge, 0.9 * (1 - t)).strokeCircle(bx, by, size);
      }
      const label = this.labelFor(entry);
      if (label.getData('stacks') !== entry.stacks) {
        label.setData('stacks', entry.stacks).setText(String(entry.stacks));
      }
      // Beside it, clear of the damage numbers that float up off its middle.
      label.setPosition(enemy.x + r + 3, enemy.y);
    }
  }
}
