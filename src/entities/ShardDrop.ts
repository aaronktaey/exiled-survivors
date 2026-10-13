import Phaser from 'phaser';

import { COLORS, SHARD, TEXTURES } from '@/config';
import { GroundItem } from '@/entities/GroundItem';

/**
 * 신성한 조각, left by a 우두머리 half the time. Ten of them make a
 * 신성한 구슬, which is one point in the passive tree.
 *
 * It carries nothing of its own — every shard is the same shard — so unlike
 * a weapon it needs no label above it.
 */
export class ShardDrop extends GroundItem {
  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.shard, COLORS.shardGlow);
    this.setDisplaySize(SHARD.size, SHARD.size);
  }

  public drop(x: number, y: number): void {
    this.begin(x, y, SHARD.size);
    this.pop();
  }
}
