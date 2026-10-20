import Phaser from 'phaser';

import { COLORS, SKILL_ICON_SIZE, TEXTURES } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { t } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/**
 * 무작위 스킬 on the ground: the plain skill orb, with no skill of its own
 * yet. Walking over it spins the 슬롯머신 over the skills not held, and what
 * it lands on is a 보조 스킬 (0.76). Expiry and the warning blink come from
 * GroundItem.
 */
export class RandomSkillDrop extends GroundItem {
  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.skillOrb, COLORS.skillOrb);
    this.setDisplaySize(SKILL_ICON_SIZE.drop, SKILL_ICON_SIZE.drop);
    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number): void {
    this.begin(x, y, SKILL_ICON_SIZE.drop);
    this.nameplate.show(t().slot.dropTitle, 'magic');
    this.nameplate.place(x, y, SKILL_ICON_SIZE.drop);
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
