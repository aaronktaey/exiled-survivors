import Phaser from 'phaser';

import { RUNE_CHISEL, TEXTURES } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { t } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/** A 룬 끌 on the ground: walked over, it asks which skill gets one more 강화 슬롯. */
export class ChiselDrop extends GroundItem {
  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.runeChisel, RUNE_CHISEL.color);
    this.setDisplaySize(RUNE_CHISEL.size, RUNE_CHISEL.size);
    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number): void {
    this.begin(x, y, RUNE_CHISEL.size);
    this.setDisplaySize(RUNE_CHISEL.size, RUNE_CHISEL.size);
    this.nameplate.show(t().runes.chisel, 'rare');
    this.nameplate.place(x, y, RUNE_CHISEL.size);
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
