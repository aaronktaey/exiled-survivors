import type Phaser from 'phaser';

import { SEPARATION } from '@/config';
import type { Enemy } from '@/entities/Enemy';

/** Offset so negative cell coordinates still hash to a unique positive key. */
const KEY_OFFSET = 4096;
const KEY_STRIDE = 8192;

/**
 * Keeps a crowd from collapsing into one point without paying for real
 * collisions: a spatial hash finds close pairs and nudges them apart.
 *
 * Only pairs where the second index is higher are resolved, so each pair is
 * handled once, and the buckets are reused between frames to avoid churning
 * arrays every tick.
 */
export class Separation {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly actives: Enemy[] = [];
  private readonly cells = new Map<number, number[]>();
  private readonly touched: number[] = [];

  public constructor(group: Phaser.Physics.Arcade.Group) {
    this.group = group;
  }

  public update(): void {
    this.rebuild();
    this.resolve();
  }

  private rebuild(): void {
    for (const key of this.touched) {
      const bucket = this.cells.get(key);
      if (bucket) {
        bucket.length = 0;
      }
    }
    this.touched.length = 0;
    this.actives.length = 0;

    const { cellSize } = SEPARATION;
    for (const child of this.group.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active) {
        continue;
      }

      const index = this.actives.length;
      this.actives.push(enemy);

      const key = Separation.keyOf(Math.floor(enemy.x / cellSize), Math.floor(enemy.y / cellSize));
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = [];
        this.cells.set(key, bucket);
      }
      if (bucket.length === 0) {
        this.touched.push(key);
      }
      bucket.push(index);
    }
  }

  private resolve(): void {
    const { cellSize, strength } = SEPARATION;

    for (let i = 0; i < this.actives.length; i++) {
      const a = this.actives[i]!;
      const cx = Math.floor(a.x / cellSize);
      const cy = Math.floor(a.y / cellSize);

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = this.cells.get(Separation.keyOf(cx + ox, cy + oy));
          if (!bucket) {
            continue;
          }

          for (const j of bucket) {
            if (j <= i) {
              continue;
            }
            this.separate(a, this.actives[j]!, strength);
          }
        }
      }
    }
  }

  /**
   * Room for this pair, off their own two sizes. Two 질주 need less of it
   * than two 거구, and a 우두머리 needs more than either.
   */
  private static roomFor(a: Enemy, b: Enemy): number {
    return Math.max(
      SEPARATION.minDistance,
      ((a.bodySize + b.bodySize) / 2) * SEPARATION.spacing,
    );
  }

  private separate(a: Enemy, b: Enemy, strength: number): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distSq = dx * dx + dy * dy;
    const minDist = Separation.roomFor(a, b);

    if (distSq >= minDist * minDist) {
      return;
    }

    if (distSq === 0) {
      // Exactly stacked: shove them apart on an arbitrary axis.
      a.x -= 0.5;
      b.x += 0.5;
      return;
    }

    const dist = Math.sqrt(distSq);
    const push = (minDist - dist) * strength;
    // The bigger one gives less ground, so a crowd of 일반 cannot walk a
    // 우두머리 off its line, and nothing hides inside it either.
    const total = a.bodySize + b.bodySize;
    const aShare = total > 0 ? b.bodySize / total : 0.5;
    const nx = dx / dist;
    const ny = dy / dist;

    a.x -= nx * push * aShare;
    a.y -= ny * push * aShare;
    b.x += nx * push * (1 - aShare);
    b.y += ny * push * (1 - aShare);
  }

  private static keyOf(cx: number, cy: number): number {
    return (cx + KEY_OFFSET) * KEY_STRIDE + (cy + KEY_OFFSET);
  }
}
