import Phaser from 'phaser';

import { COLORS, DEPTH, GEAR_DROP, SKILL_LABEL, TEXT, TEXTURES, type GearId } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { gearName } from '@/i18n';
import { STARTING_GEAR, type GearSpec } from '@/config';

/**
 * A piece of equipment lying on the ground. Walk over it and it goes into
 * the stash, to be put on from the title screen between runs.
 *
 * It wears its name above it like a dropped skill does, but in plain gold
 * text rather than on a baked plate: there is no plate to bake per piece
 * yet, and every label already carries a dark outline that reads over the
 * field on its own.
 */
export class GearDrop extends GroundItem {
  public gearId: GearId = STARTING_GEAR;

  private readonly label: Phaser.GameObjects.Text;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.gear, COLORS.gearGlow);
    this.setDisplaySize(GEAR_DROP.size, GEAR_DROP.size);

    this.label = scene.add
      .text(x, y, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.gearText,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.skillDrop + 1)
      .setVisible(false);
  }

  public drop(x: number, y: number, spec: GearSpec): void {
    this.gearId = spec.id;
    this.begin(x, y, GEAR_DROP.size);

    this.label.setText(gearName(spec.id));
    this.label.setPosition(x, y - GEAR_DROP.size / 2 - SKILL_LABEL.gap - this.label.height / 2);
    this.label.setVisible(true);

    this.pop([this.label]);
  }

  public override destroy(fromScene?: boolean): void {
    this.label.destroy(fromScene);
    super.destroy(fromScene);
  }

  protected override onHide(): void {
    this.scene.tweens.killTweensOf([this.label]);
    this.label.setVisible(false);
  }
}
