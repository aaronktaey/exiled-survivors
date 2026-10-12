import Phaser from 'phaser';

import { SKILL_LABEL } from '@/config';
import { skillName } from '@/i18n';
import { ALL_SKILLS, type SkillDefinition } from '@/weapons/skills';

/**
 * The plate a dropped skill's name sits on, baked to the width of that
 * name. It is a texture rather than a drawn rectangle because Phaser 4's
 * DynamicTexture bakes empty here; the name itself is a Text that SkillDrop
 * draws over the plate.
 *
 * Names change with the language, so the plates are baked again whenever it
 * does — a Korean name and an English one are rarely the same width.
 */
export function bakeSkillLabels(scene: Phaser.Scene): void {
  for (const skill of ALL_SKILLS) {
    bakeOne(scene, skill);
  }
}

function bakeOne(scene: Phaser.Scene, skill: SkillDefinition): void {
  const { borderWidth, paddingX, paddingY } = SKILL_LABEL;

  // Measure the name, then throw the probe away.
  const probe = scene.add.text(0, 0, skillName(skill.id), {
    fontFamily: 'system-ui, sans-serif',
    fontSize: SKILL_LABEL.fontSize,
    color: SKILL_LABEL.text,
  });
  const width = Math.ceil(probe.width) + paddingX * 2;
  const height = Math.ceil(probe.height) + paddingY * 2;
  probe.destroy();

  const plate = scene.add.graphics();
  plate.fillStyle(SKILL_LABEL.background, 1);
  plate.fillRect(0, 0, width, height);
  plate.lineStyle(borderWidth, SKILL_LABEL.border, 1);
  plate.strokeRect(borderWidth / 2, borderWidth / 2, width - borderWidth, height - borderWidth);

  if (scene.textures.exists(skill.labelTexture)) {
    scene.textures.remove(skill.labelTexture);
  }

  plate.generateTexture(skill.labelTexture, width, height);
  plate.destroy();
}
