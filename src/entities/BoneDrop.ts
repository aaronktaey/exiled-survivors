import Phaser from 'phaser';

import { BONES, BONE_RUN, type BoneId } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { boneName } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/**
 * A 뼈다귀 on the ground. Its own sprite and its own name, both off the
 * BONES table, so adding a third needs nothing here.
 */
export class BoneDrop extends GroundItem {
  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;
  /** Which 뼈다귀 this is. Public for the pickup and for tests. */
  public bone: BoneId = 'rib';

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, BONES.rib.texture, BONES.rib.color);
    this.setDisplaySize(BONE_RUN.size, BONE_RUN.size);

    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number, id: BoneId): void {
    const spec = BONES[id] ?? BONES.rib;
    this.bone = spec.id;

    this.setTexture(spec.texture);
    this.begin(x, y, BONE_RUN.size);
    this.setDisplaySize(BONE_RUN.size, BONE_RUN.size);
    this.glow.setFillStyle(spec.color, this.glow.fillAlpha);

    this.nameplate.show(boneName(spec.id), spec.tier);
    this.nameplate.place(x, y, BONE_RUN.size);

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
