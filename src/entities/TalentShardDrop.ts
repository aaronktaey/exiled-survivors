import Phaser from 'phaser';

import { TALENT_LUMP, TALENT_SHARD, TALENT_SHARD_FX, TEXTURES, type ShardStat } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { fill, t } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/**
 * A 재능의 파편 on the ground (0.102): the crystal in its stat's colour,
 * named for the stat, an 일반 drop since 0.111. Or a 재능의 덩어리 (0.111,
 * `lump`): a cluster of them, `TALENT_LUMP.shards` of the one stat, 신화.
 * Expiry and the warning blink come from GroundItem; nothing pulls it in
 * but the 자석.
 */
export class TalentShardDrop extends GroundItem {
  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;
  /** What it gives, and how many of it. Public for tests. */
  public stat: ShardStat = 'damage';
  public shards = 1;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.talentShard, TALENT_SHARD_FX.tint.damage);
    this.setDisplaySize(TALENT_SHARD.size, TALENT_SHARD.size);
    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number, stat: ShardStat, lump = false): void {
    this.stat = stat;
    this.shards = lump ? TALENT_LUMP.shards : 1;
    // The pool hands back either kind: every look is set again, never assumed.
    const size = lump ? TALENT_LUMP.size : TALENT_SHARD.size;
    this.setTexture(lump ? TEXTURES.talentLump : TEXTURES.talentShard);
    this.begin(x, y, size);
    this.setDisplaySize(size, size);
    this.setTint(TALENT_SHARD_FX.tint[stat]);
    this.glow.setFillStyle(TALENT_SHARD_FX.tint[stat], this.glow.fillAlpha);
    this.nameplate.show(
      lump ? fill(t().shard.lumpDrop, { stat: t().shard.stats[stat] }) : t().shard.drops[stat],
      lump ? 'mythic' : 'normal',
    );
    this.nameplate.place(x, y, size);
    this.pop();
  }

  /** A 재능의 덩어리, not a single 파편. */
  public get lump(): boolean {
    return this.shards > 1;
  }

  public override destroy(fromScene?: boolean): void {
    this.nameplate.destroy(fromScene);
    super.destroy(fromScene);
  }

  protected override onHide(): void {
    this.nameplate.hide();
  }
}
