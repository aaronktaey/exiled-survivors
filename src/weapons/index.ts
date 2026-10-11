/**
 * Weapons: one file per skill. A weapon owns its cooldown, its scaling and
 * how it spawns hitboxes; `skills.ts` holds the shared definitions and tags.
 */
export { MeleeStrike } from '@/weapons/MeleeStrike';
export { Fireball } from '@/weapons/Fireball';
export { ChainLightning } from '@/weapons/ChainLightning';
export { findNearest, findNearestEnemy, type Weapon, type WeaponContext } from '@/weapons/Weapon';
export {
  SKILLS,
  ALL_SKILLS,
  DROPPABLE_SKILLS,
  LEVEL_UP_SKILL,
  STARTING_SKILLS,
  type SkillDefinition,
  type SkillId,
  type SkillTag,
} from '@/weapons/skills';
