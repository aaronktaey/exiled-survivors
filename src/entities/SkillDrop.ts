import Phaser from 'phaser';

import { DEPTH, ICONS, SKILL_LABEL, TEXTURES } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { SKILLS, type SkillDefinition, type SkillId } from '@/weapons/skills';

/**
 * A skill lying on the ground: an orb the player walks over, like an XP gem,
 * with its name floating above on a white plate with a red border.
 *
 * Expiry and the warning blink come from GroundItem; what is added here is
 * the plate. It is a texture baked at boot with the name as a Text drawn
 * over it, because Phaser 4's DynamicTexture bakes empty here.
 */
export class SkillDrop extends GroundItem {
  public skillId: SkillId = SKILLS.fireball.id;

  private readonly plate: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.skillOrb, SKILL_LABEL.border);
    this.setDisplaySize(ICONS.skillOrb.size, ICONS.skillOrb.size);

    this.plate = scene.add
      .image(x, y, SKILLS.fireball.labelTexture)
      .setOrigin(0.5)
      .setDepth(DEPTH.skillDrop)
      .setVisible(false);

    this.label = scene.add
      .text(x, y, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: SKILL_LABEL.fontSize,
        color: SKILL_LABEL.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.skillDrop + 1)
      .setVisible(false);
  }

  public drop(x: number, y: number, skill: SkillDefinition): void {
    this.skillId = skill.id;
    this.begin(x, y, ICONS.skillOrb.size);

    this.plate.setTexture(skill.labelTexture);
    this.label.setText(skill.name);
    this.layout(x, y);
    this.plate.setVisible(true);
    this.label.setVisible(true);

    this.pop([this.plate, this.label]);
  }

  public override destroy(fromScene?: boolean): void {
    this.plate.destroy(fromScene);
    this.label.destroy(fromScene);
    super.destroy(fromScene);
  }

  protected override onHide(): void {
    this.scene.tweens.killTweensOf([this.plate, this.label]);
    this.plate.setVisible(false);
    this.label.setVisible(false);
  }

  /** Centres the plate (and its text) just above the orb. */
  private layout(x: number, y: number): void {
    const plateY = y - ICONS.skillOrb.size / 2 - SKILL_LABEL.gap - this.plate.height / 2;
    this.plate.setPosition(x, plateY);
    this.label.setPosition(x, plateY);
  }
}
