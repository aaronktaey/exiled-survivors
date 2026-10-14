/**
 * Weapons: one file per skill. A weapon owns its cooldown, its scaling and
 * how it spawns hitboxes; `skills.ts` holds the shared definitions and tags.
 */
export { MeleeStrike } from '@/weapons/MeleeStrike';
export { Fireball } from '@/weapons/Fireball';
export { ChainLightning } from '@/weapons/ChainLightning';
export { IceSpear } from '@/weapons/IceSpear';
export { VoidOrb } from '@/weapons/VoidOrb';
export { ThunderStrike } from '@/weapons/ThunderStrike';
export { ProjectileWeapon } from '@/weapons/ProjectileWeapon';
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
