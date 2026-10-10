import Phaser from 'phaser';

import { COLORS, DAMAGE_NUMBERS, DEPTH } from '@/config';

interface Floater {
  readonly text: Phaser.GameObjects.Text;
  remainingMs: number;
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

      this.pool.push({ text, remainingMs: 0 });
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

  public spawn(x: number, y: number, amount: number): void {
    const floater = this.take();

    floater.remainingMs = DAMAGE_NUMBERS.lifespanMs;
    floater.text
      .setText(Number.isInteger(amount) ? String(amount) : amount.toFixed(1))
      .setPosition(x, y)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
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
      floater.text.setAlpha(floater.remainingMs / DAMAGE_NUMBERS.lifespanMs);
    }
  }

  /** Clears every floater, e.g. on a restart. */
  public reset(): void {
    for (const floater of this.pool) {
      floater.remainingMs = 0;
      floater.text.setActive(false).setVisible(false);
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
