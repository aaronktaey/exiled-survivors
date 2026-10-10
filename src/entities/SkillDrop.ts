import Phaser from 'phaser';

import { DEPTH, SKILL_LABEL, SKILL_ORB, TEXTURES } from '@/config';
import { SKILLS, type SkillDefinition, type SkillId } from '@/weapons/skills';

/**
 * A skill lying on the ground: an orb the player walks over, like an XP gem,
 * with its name floating above on a white plate with a red border.
 *
 * The plate is a texture baked at boot; the name is a Text drawn over it,
 * because Phaser 4's DynamicTexture bakes empty here.
 */
export class SkillDrop extends Phaser.Physics.Arcade.Image {
  public skillId: SkillId = SKILLS.fireball.id;

  private readonly plate: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.skillOrb);
    this.setDepth(DEPTH.pickups);

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
    this.enableBody(true, x, y, true, true);
    this.setVelocity(0, 0);

    this.plate.setTexture(skill.labelTexture);
    this.label.setText(skill.name);
    this.layout(x, y);
    this.plate.setVisible(true);
    this.label.setVisible(true);

    // Small pop so a drop stands out against the static grid.
    const targets = [this, this.plate, this.label];
    this.scene.tweens.killTweensOf(targets);
    targets.forEach((target) => target.setScale(0.6));
    this.scene.tweens.add({ targets, scale: 1, duration: 180, ease: 'Back.easeOut' });
  }

  public collect(): void {
    this.scene.tweens.killTweensOf([this, this.plate, this.label]);
    this.plate.setVisible(false);
    this.label.setVisible(false);
    this.disableBody(true, true);
  }

  public override destroy(fromScene?: boolean): void {
    this.plate.destroy(fromScene);
    this.label.destroy(fromScene);
    super.destroy(fromScene);
  }

  /** Centres the plate (and its text) just above the orb. */
  private layout(x: number, y: number): void {
    const plateY = y - SKILL_ORB.size / 2 - SKILL_LABEL.gap - this.plate.height / 2;
    this.plate.setPosition(x, plateY);
    this.label.setPosition(x, plateY);
  }
}
