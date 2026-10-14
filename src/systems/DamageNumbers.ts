import Phaser from 'phaser';

import { COLORS, DAMAGE_NUMBERS, DEPTH } from '@/config';

interface Floater {
  readonly text: Phaser.GameObjects.Text;
  remainingMs: number;
  /** Countdown on the settle from the pop; 0 once it has landed. */
  popMs: number;
  /** What it settles to. */
  scale: number;
}

/**
 * Floating hit numbers, pooled up front. Positions and fades are stepped by
 * hand rather than tweened, so a busy frame does not allocate a tween per
 * hit; when every slot is busy the oldest one is taken over.
 */
export class DamageNumbers {
  private readonly pool: Floater[] = [];
  /** Round-robin cursor used when nothing is free. */
  private next = 0;

  public constructor(scene: Phaser.Scene) {
    for (let i = 0; i < DAMAGE_NUMBERS.poolSize; i++) {
      const text = scene.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: DAMAGE_NUMBERS.fontSize,
          color: COLORS.damageText,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.vfx)
        .setActive(false)
        .setVisible(false);

      this.pool.push({ text, remainingMs: 0, popMs: 0, scale: 1 });
    }
  }

  public get activeCount(): number {
    let count = 0;
    for (const floater of this.pool) {
      if (floater.remainingMs > 0) {
        count++;
      }
    }
    return count;
  }

  /**
   * `style` marks a floater that is not an ordinary hit: a heal, or a
   * critical, which is drawn larger and outlined and starts with a pop.
   */
  public spawn(
    x: number,
    y: number,
    amount: number,
    style?: { readonly prefix?: string; readonly color?: string; readonly crit?: boolean },
  ): void {
    const floater = this.take();
    const shown = Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
    const crit = style?.crit === true;

    floater.remainingMs = crit ? DAMAGE_NUMBERS.critLifespanMs : DAMAGE_NUMBERS.lifespanMs;
    floater.popMs = crit ? DAMAGE_NUMBERS.critPopMs : 0;
    floater.scale = crit ? DAMAGE_NUMBERS.critScale : 1;

    floater.text
      .setText(`${style?.prefix ?? ''}${shown}`)
      .setColor(style?.color ?? COLORS.damageText)
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(crit ? DAMAGE_NUMBERS.critPopScale : 1)
      .setActive(true)
      .setVisible(true);

    if (crit) {
      floater.text.setStroke(COLORS.background, DAMAGE_NUMBERS.critOutline);
    } else {
      floater.text.setStroke(COLORS.background, 0);
    }
  }

  public update(delta: number): void {
    const rise = (DAMAGE_NUMBERS.riseSpeed * delta) / 1000;

    for (const floater of this.pool) {
      if (floater.remainingMs <= 0) {
        continue;
      }

      floater.remainingMs -= delta;
      if (floater.remainingMs <= 0) {
        floater.text.setActive(false).setVisible(false);
        continue;
      }

      floater.text.y -= rise;

      // The pop settles first, then the whole thing fades out over what is
      // left of its life — a crit is given longer than an ordinary hit.
      if (floater.popMs > 0) {
        floater.popMs -= delta;
        const settled = Phaser.Math.Clamp(1 - floater.popMs / DAMAGE_NUMBERS.critPopMs, 0, 1);
        floater.text.setScale(
          Phaser.Math.Linear(DAMAGE_NUMBERS.critPopScale, floater.scale, settled),
        );
      }

      const life = floater.scale > 1 ? DAMAGE_NUMBERS.critLifespanMs : DAMAGE_NUMBERS.lifespanMs;
      floater.text.setAlpha(Phaser.Math.Clamp(floater.remainingMs / life, 0, 1));
    }
  }

  /** Clears every floater, e.g. on a restart. */
  public reset(): void {
    for (const floater of this.pool) {
      floater.remainingMs = 0;
      floater.popMs = 0;
      floater.scale = 1;
      floater.text.setScale(1).setActive(false).setVisible(false);
    }
  }

  private take(): Floater {
    for (const floater of this.pool) {
      if (floater.remainingMs <= 0) {
        return floater;
      }
    }

    // All busy — reuse the next slot in rotation rather than allocating.
    const floater = this.pool[this.next]!;
    this.next = (this.next + 1) % this.pool.length;
    return floater;
  }
}
