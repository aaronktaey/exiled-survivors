import Phaser from 'phaser';

import { ORBS, ORB_DROP, TEXTURES, type OrbId } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { orbName } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/**
 * A 구슬 on the ground. One sprite tinted three ways rather than three
 * sprites: what tells them apart is the colour and the name above it, and
 * both come off the ORBS table.
 */
export class OrbDrop extends GroundItem {
  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;
  /** Which 구슬 this is. Public for the pickup and for tests. */
  public orb: OrbId = 'transmute';

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.orb, ORBS.transmute.color);
    this.setDisplaySize(ORB_DROP.size, ORB_DROP.size);

    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number, id: OrbId): void {
    const spec = ORBS[id] ?? ORBS.transmute;
    this.orb = spec.id;

    this.begin(x, y, ORB_DROP.size);
    this.setDisplaySize(ORB_DROP.size, ORB_DROP.size);
    this.setTint(spec.color);
    this.glow.setFillStyle(spec.color, this.glow.fillAlpha);

    this.nameplate.show(orbName(spec.id), spec.tier);
    this.nameplate.place(x, y, ORB_DROP.size);

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
