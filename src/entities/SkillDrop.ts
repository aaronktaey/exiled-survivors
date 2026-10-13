import Phaser from 'phaser';

import { COLORS, SKILL_ICON_SIZE, SKILL_ICONS, TEXTURES } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { skillName } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';
import { SKILLS, type SkillDefinition, type SkillId } from '@/weapons/skills';

/**
 * A skill lying on the ground: an orb the player walks over, like an XP gem,
 * with its name floating above it.
 *
 * A skill is an ordinary drop however good it is, so it wears the plainest
 * of the three labels. Expiry and the warning blink come from GroundItem.
 */
export class SkillDrop extends GroundItem {
  public skillId: SkillId = SKILLS.fireball.id;

  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.skillOrb, COLORS.skillOrb);
    this.setDisplaySize(SKILL_ICON_SIZE.drop, SKILL_ICON_SIZE.drop);

    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number, skill: SkillDefinition): void {
    this.skillId = skill.id;
    // Each skill lies on the ground wearing its own icon.
    this.setTexture(SKILL_ICONS[skill.id]?.key ?? TEXTURES.skillOrb);
    this.begin(x, y, SKILL_ICON_SIZE.drop);

    this.nameplate.show(skillName(skill.id), 'normal');
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
