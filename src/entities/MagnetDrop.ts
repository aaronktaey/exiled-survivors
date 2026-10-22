import Phaser from 'phaser';

import { MAGNET, TEXTURES } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { t } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/**
 * 자석 on the ground. As rare as the 하얀 망고, so it wears the same loud
 * label. Expiry and the warning blink come from GroundItem; what it does
 * when picked up is CombatSystem.collectEverything.
 */
export class MagnetDrop extends GroundItem {
  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.magnet, 0xffffff);
    this.setDisplaySize(MAGNET.size, MAGNET.size);
    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number): void {
    this.begin(x, y, MAGNET.size);
    this.setDisplaySize(MAGNET.size, MAGNET.size);
    this.nameplate.show(t().game.magnet, 'mythic');
    this.nameplate.place(x, y, MAGNET.size);
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
