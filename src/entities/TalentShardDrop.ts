import Phaser from 'phaser';

import { TALENT_SHARD, TALENT_SHARD_FX, TEXTURES, type ShardStat } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { t } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/**
 * A 재능의 파편 on the ground (0.102): the crystal in its stat's colour,
 * named for the stat, in a red pillar (an extreme-rare drop,
 * CombatSystem.land). Expiry and the warning blink come from GroundItem;
 * nothing pulls it in but the 자석.
 */
export class TalentShardDrop extends GroundItem {
  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;
  /** What it gives. Public for tests. */
  public stat: ShardStat = 'damage';

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.talentShard, TALENT_SHARD_FX.tint.damage);
    this.setDisplaySize(TALENT_SHARD.size, TALENT_SHARD.size);
    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number, stat: ShardStat): void {
    this.stat = stat;
    this.begin(x, y, TALENT_SHARD.size);
    this.setDisplaySize(TALENT_SHARD.size, TALENT_SHARD.size);
    this.setTint(TALENT_SHARD_FX.tint[stat]);
    this.glow.setFillStyle(TALENT_SHARD_FX.tint[stat], this.glow.fillAlpha);
    this.nameplate.show(t().shard.drops[stat], 'mythic');
    this.nameplate.place(x, y, TALENT_SHARD.size);
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
