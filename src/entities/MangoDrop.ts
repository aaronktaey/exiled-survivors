import Phaser from 'phaser';

import { MANGO, TEXTURES } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { t } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/**
 * 하얀 망고 on the ground. One in a thousand kills, so it wears the loudest
 * label there is. Expiry and the warning blink come from GroundItem.
 */
export class MangoDrop extends GroundItem {
  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.mango, 0xffffff);
    this.setDisplaySize(MANGO.size, MANGO.size);
    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number): void {
    this.begin(x, y, MANGO.size);
    this.setDisplaySize(MANGO.size, MANGO.size);
    this.nameplate.show(t().game.mango, 'mythic');
    this.nameplate.place(x, y, MANGO.size);
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
