import Phaser from 'phaser';

import { COLORS, SHARD, TEXTURES } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { t } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/**
 * 신성한 조각, left by a 우두머리 half the time. Ten of them make a
 * 신성한 구슬, which is one point in the passive tree.
 *
 * It is the rarest thing a run puts on the ground — a point in the tree is
 * worth more than any one weapon — so it wears the loudest label.
 */
export class ShardDrop extends GroundItem {
  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.shard, COLORS.shardGlow);
    this.setDisplaySize(SHARD.size, SHARD.size);

    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number): void {
    this.begin(x, y, SHARD.size);

    this.nameplate.show(t().passives.shardName, 'rare');
    this.nameplate.place(x, y, SHARD.size);

    this.pop();
  }

  public override destroy(fromScene?: boolean): void {
    this.nameplate.destroy(fromScene);
    super.destroy(fromScene);
  }

  protected override onHide(): void {
    this.nameplate.hide();
  }
}
