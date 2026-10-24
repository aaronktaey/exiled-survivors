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
  /** Where it was last seen: a death bursts there, after the sprite has gone back to the pool. */
  x: number;
  y: number;
  /** Where its bubbles start their loop, so a crowd does not bubble in step. */
  readonly phase: number;
  /** Its stack count beside it, while it has one. */
  label?: Phaser.GameObjects.Text;
}

/** A flash where a poison burst (2차 각성), fading over POISON_NOVA_FX.burstMs. */
interface Burst {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
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
 * 각성: `stacksPerHitAwakened` stacks a hit. 2차 각성: a poisoned enemy
 * that dies, or reaches `maxStacks`, bursts — the whole of its poison
 * (every stack it holds for a whole `durationMs`) at once on everything
 * within the skill's range of where it stood, itself included, and its
 * stacks gone. A burst poisons nothing; one that kills a poisoned enemy sets
 * that one off in turn, a frame later, and the chain ends because each
 * enemy dies once (a version that spread stacks chained without end).
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
  private readonly bursts: Burst[] = [];
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
      if (ring.ageMs >= POISON_NOVA.ringMs + POISON_NOVA_FX.fadeMs) {
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
    this.bursts.push({ x, y, radius: context.range, ageMs: 0 });
    this.burstCount += 1;
  }

  /** Every poisoned enemy takes its stacks' worth each tick, until its clock runs out. */
  private tickPoison(delta: number, context: WeaponContext): void {
    for (const [enemy, entry] of this.poisoned) {
      if (!enemy.active || enemy.lives !== entry.lives) {
        // 2차 각성: a poisoned enemy that died bursts where it fell.
        if (context.masteredTwice && entry.stacks > 0) {
          this.burst(entry, context);
        } else {
          this.poisoned.delete(enemy);
          this.release(entry);
        }
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

  private draw(delta: number): void {
    this.fx.clear();
    for (const ring of this.rings) {
      const grow = Math.min(1, ring.ageMs / POISON_NOVA.ringMs);
      const fade = ring.ageMs <= POISON_NOVA.ringMs ? 1 : 1 - (ring.ageMs - POISON_NOVA.ringMs) / POISON_NOVA_FX.fadeMs;
      const r = ring.radius * grow;
      this.fx.fillStyle(POISON_NOVA_FX.color, POISON_NOVA_FX.fillAlpha * fade).fillCircle(ring.x, ring.y, r);
      this.fx.lineStyle(POISON_NOVA_FX.edgeWidth, POISON_NOVA_FX.edge, fade).strokeCircle(ring.x, ring.y, r);
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]!;
      burst.ageMs += delta;
      const left = 1 - burst.ageMs / POISON_NOVA_FX.burstMs;
      if (left <= 0) {
        this.bursts.splice(i, 1);
        continue;
      }
      const r = burst.radius * (1 - left * 0.4);
      this.fx.fillStyle(POISON_NOVA_FX.edge, 0.35 * left).fillCircle(burst.x, burst.y, r);
      this.fx.lineStyle(3, POISON_NOVA_FX.color, left).strokeCircle(burst.x, burst.y, r);
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
