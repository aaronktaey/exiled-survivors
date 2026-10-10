import Phaser from 'phaser';

import { DEPTH, SKILL_LABEL } from '@/config';
import { SKILLS, type SkillDefinition, type SkillId } from '@/weapons/skills';

/**
 * A skill lying on the ground: its name in red on a white plate with a red
 * border. The plate is a texture baked at boot; the name is a Text drawn on
 * top, because Phaser 4's DynamicTexture bakes empty here.
 */
export class SkillDrop extends Phaser.Physics.Arcade.Image {
  public skillId: SkillId = SKILLS.fireball.id;

  private readonly label: Phaser.GameObjects.Text;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, SKILLS.fireball.labelTexture);
    this.setDepth(DEPTH.skillDrop);

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
    this.setTexture(skill.labelTexture);
    this.enableBody(true, x, y, true, true);
    this.setVelocity(0, 0);

    this.label.setText(skill.name).setPosition(x, y).setVisible(true);

    // Small pop so a drop stands out against the static grid.
    this.scene.tweens.killTweensOf([this, this.label]);
    this.setScale(0.6);
    this.label.setScale(0.6);
    this.scene.tweens.add({ targets: [this, this.label], scale: 1, duration: 180, ease: 'Back.easeOut' });
  }

  public collect(): void {
    this.scene.tweens.killTweensOf([this, this.label]);
    this.label.setVisible(false);
    this.disableBody(true, true);
  }

  public override destroy(fromScene?: boolean): void {
    this.label.destroy(fromScene);
    super.destroy(fromScene);
  }
}
