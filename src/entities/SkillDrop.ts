import Phaser from 'phaser';

import { DEPTH, SKILL_DROP, SKILL_LABEL, SKILL_ORB, TEXTURES } from '@/config';
import { SKILLS, type SkillDefinition, type SkillId } from '@/weapons/skills';

/**
 * A skill lying on the ground: an orb the player walks over, like an XP gem,
 * with its name floating above on a white plate with a red border.
 *
 * It expires after SKILL_DROP.lifespanMs. Over the last warningMs a halo in
 * the label's border colour blinks behind it, faster and faster as the drop
 * runs out of time.
 *
 * The plate is a texture baked at boot; the name is a Text drawn over it,
 * because Phaser 4's DynamicTexture bakes empty here.
 */
export class SkillDrop extends Phaser.Physics.Arcade.Image {
  public skillId: SkillId = SKILLS.fireball.id;

  private readonly glow: Phaser.GameObjects.Arc;
  private readonly plate: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;

  private remainingMs = 0;
  /** Blink cycles elapsed; fractional part drives the on/off state. */
  private blinkPhase = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.skillOrb);
    this.setDepth(DEPTH.pickups);

    this.glow = scene.add
      .circle(x, y, SKILL_DROP.glowRadius, SKILL_LABEL.border, SKILL_DROP.glowAlpha)
      .setDepth(DEPTH.pickups - 1)
      .setVisible(false);

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

  /** Milliseconds left before this drop vanishes. */
  public get timeLeftMs(): number {
    return this.remainingMs;
  }

  public drop(x: number, y: number, skill: SkillDefinition): void {
    this.skillId = skill.id;
    this.remainingMs = SKILL_DROP.lifespanMs;
    this.blinkPhase = 0;

    this.enableBody(true, x, y, true, true);
    this.setVelocity(0, 0);

    this.plate.setTexture(skill.labelTexture);
    this.label.setText(skill.name);
    this.layout(x, y);
    this.plate.setVisible(true);
    this.label.setVisible(true);
    this.glow.setVisible(false);

    // Small pop so a drop stands out against the static grid.
    const targets = [this, this.plate, this.label];
    this.scene.tweens.killTweensOf(targets);
    targets.forEach((target) => target.setScale(0.6));
    this.scene.tweens.add({ targets, scale: 1, duration: 180, ease: 'Back.easeOut' });
  }

  public collect(): void {
    this.hide();
  }

  public override update(_time: number, delta: number): void {
    if (!this.active) {
      return;
    }

    this.remainingMs -= delta;
    if (this.remainingMs <= 0) {
      this.hide();
      return;
    }

    this.updateBlink(delta);
  }

  /**
   * Blinks the halo once the drop is nearly out of time, shortening the
   * period as it goes so the flashing visibly speeds up.
   */
  private updateBlink(delta: number): void {
    if (this.remainingMs > SKILL_DROP.warningMs) {
      if (this.glow.visible) {
        this.glow.setVisible(false);
      }
      return;
    }

    const urgency = 1 - this.remainingMs / SKILL_DROP.warningMs;
    const period = Phaser.Math.Linear(SKILL_DROP.blinkSlowMs, SKILL_DROP.blinkFastMs, urgency);

    // Accumulating phase rather than deriving it from the clock keeps the
    // blink continuous while the period shrinks.
    this.blinkPhase += delta / period;
    this.glow.setVisible(this.blinkPhase % 1 < 0.5);
  }

  public override destroy(fromScene?: boolean): void {
    this.glow.destroy(fromScene);
    this.plate.destroy(fromScene);
    this.label.destroy(fromScene);
    super.destroy(fromScene);
  }

  private hide(): void {
    this.scene.tweens.killTweensOf([this, this.plate, this.label]);
    this.glow.setVisible(false);
    this.plate.setVisible(false);
    this.label.setVisible(false);
    this.remainingMs = 0;
    this.disableBody(true, true);
  }

  /** Centres the plate (and its text) just above the orb. */
  private layout(x: number, y: number): void {
    const plateY = y - SKILL_ORB.size / 2 - SKILL_LABEL.gap - this.plate.height / 2;
    this.glow.setPosition(x, y);
    this.plate.setPosition(x, plateY);
    this.label.setPosition(x, plateY);
  }
}
