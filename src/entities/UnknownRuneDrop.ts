import Phaser from 'phaser';

import { UNKNOWN_RUNE, UNKNOWN_RUNE_LOOKS, unknownRuneTexture } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { t } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/**
 * 알수없는 룬 on the ground (0.89): one of the old 룬 stones, under the
 * loudest label there is. Expiry and the warning blink come from GroundItem.
 */
export class UnknownRuneDrop extends GroundItem {
  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;
  /** Which of UNKNOWN_RUNE_LOOKS it wears. Public for tests. */
  public look = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, unknownRuneTexture(0), UNKNOWN_RUNE_LOOKS[0]!.color);
    this.setDisplaySize(UNKNOWN_RUNE.size, UNKNOWN_RUNE.size);
    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number, look: number): void {
    this.look = Phaser.Math.Clamp(Math.floor(look), 0, UNKNOWN_RUNE_LOOKS.length - 1);
    this.setTexture(unknownRuneTexture(this.look));
    this.begin(x, y, UNKNOWN_RUNE.size);
    this.setDisplaySize(UNKNOWN_RUNE.size, UNKNOWN_RUNE.size);
    this.glow.setFillStyle(UNKNOWN_RUNE_LOOKS[this.look]!.color, this.glow.fillAlpha);
    this.nameplate.show(t().game.unknownRune, 'rare');
    this.nameplate.place(x, y, UNKNOWN_RUNE.size);
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
