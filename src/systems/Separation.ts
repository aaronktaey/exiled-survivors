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
    const { cellSize, radius, strength } = SEPARATION;
    const minDistSq = radius * radius;

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
            this.separate(a, this.actives[j]!, radius, minDistSq, strength);
          }
        }
      }
    }
  }

  private separate(a: Enemy, b: Enemy, minDist: number, minDistSq: number, strength: number): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distSq = dx * dx + dy * dy;

    if (distSq >= minDistSq) {
      return;
    }

    if (distSq === 0) {
      // Exactly stacked: shove them apart on an arbitrary axis.
      a.x -= 0.5;
      b.x += 0.5;
      return;
    }

    const dist = Math.sqrt(distSq);
    const push = ((minDist - dist) / 2) * strength;
    const nx = (dx / dist) * push;
    const ny = (dy / dist) * push;

    a.x -= nx;
    a.y -= ny;
    b.x += nx;
    b.y += ny;
  }

  private static keyOf(cx: number, cy: number): number {
    return (cx + KEY_OFFSET) * KEY_STRIDE + (cy + KEY_OFFSET);
  }
}
