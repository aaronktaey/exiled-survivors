import { KEYSTONES, PLAYER, SKILL_BASE } from '@/config';
import { SKILLS, type SkillId } from '@/weapons/skills';
import { NO_BONUS, type GearBonus } from '@/systems/Gear';
import { StatSheet } from '@/systems/StatSheet';

/**
 * Everything that changes what the survivor is, folded in one fixed order:
 *
 *   1. 패시브 — the tree, which is the same every run
 *   2. 장비 — the weapon carried into this one
 *   3. 전투 내 효과 — what the run itself has added since it started
 *
 * Within a layer the increases add up on the base, Path of Exile's
 * "increased" rule: ten picks of +3% damage on a base of 10 is 13, not
 * 10 × 1.03¹⁰. Between layers they multiply, so a base of 10 with +30% from
 * the tree and +50% from the run is 10 × 1.3 × 1.5. A 키스톤's numbers are
 * "more": they multiply on top of everything.
 */
export interface RunModifiers {
  readonly passive: StatSheet;
  readonly gear: GearBonus;
}

export const NO_MODIFIERS: RunModifiers = { passive: StatSheet.EMPTY, gear: NO_BONUS };

/**
 * What the run's own upgrades have multiplied a stat by.
 *
 * Progression keeps a skill's live stats as base plus the picks taken, and
 * each pick adds a share of the base — so the ratio between the two is the
 * run's multiplier, with nothing else having to be tracked for it.
 */
function runScale(base: number, upgraded: number): number {
  return base === 0 ? 1 : upgraded / base;
}

const tagsOf = (skill: SkillId) => SKILLS[skill].tags;
const hasTag = (skill: SkillId, tag: (typeof SKILLS)[SkillId]['tags'][number]) => tagsOf(skill).includes(tag);

/** The 키스톤 that multiply one skill's damage, whatever else is going on. */
export function keystoneDamageFor(skill: SkillId, passive: StatSheet): number {
  let more = 1;
  if (passive.has('slaughter') && hasTag(skill, '투사체')) {
    more *= KEYSTONES.slaughter.projectileMore;
  }
  if (passive.has('singleShot') && hasTag(skill, '투사체')) {
    more *= KEYSTONES.singleShot.projectileMore;
  }
  return more;
}

/** One skill's damage per hit. */
export function damageFor(skill: SkillId, upgraded: number, mods: RunModifiers): number {
  const base = SKILL_BASE[skill].damage;

  // 1. 패시브
  let damage = base * mods.passive.scale('damage', tagsOf(skill)) * keystoneDamageFor(skill, mods.passive);
  // 2. 장비 — the weapon's attack power is flat, and lands at its own layer;
  // a base whose 고정 속성 is 피해 scales the lot
  damage = (damage + mods.gear.attack) * mods.gear.damageScale;
  // 3. 전투 내 효과
  return damage * runScale(base, upgraded);
}

/** The tree's attack-speed layer for one skill, its 키스톤 included. */
export function passiveAttackSpeedFor(skill: SkillId, passive: StatSheet): number {
  const eternity = passive.has('eternity') ? KEYSTONES.eternity.attackSpeedMore : 1;
  return passive.scale('attackSpeed', tagsOf(skill)) * eternity;
}

/** One skill's attacks per second, folded the same way. */
export function attackSpeedFor(skill: SkillId, upgraded: number, mods: RunModifiers): number {
  const base = SKILL_BASE[skill].attackSpeed;

  let rate = base * passiveAttackSpeedFor(skill, mods.passive);
  rate *= gearAttackSpeedFor(skill, mods.gear);
  return rate * runScale(base, upgraded);
}

/** The weapon's attack-speed layer for one skill: every skill's, then its own. */
export function gearAttackSpeedFor(skill: SkillId, gear: GearBonus): number {
  return gear.attackSpeedScale * (gear.skillAttackSpeed[skill] ?? 1);
}

/** What one critical hit is worth, after everything that raises it. 원소 과부하 makes it worth nothing extra. */
export function critMultiplierFor(mods: RunModifiers): number {
  if (mods.passive.has('overload')) {
    return 1;
  }
  return PLAYER.critMultiplier + mods.gear.critMultiplierBonus + mods.passive.share('critMultiplier');
}

/** How the skill's shots fly, against its own speed. */
export function projectileSpeedScaleFor(skill: SkillId, mods: RunModifiers): number {
  return mods.passive.scale('projectileSpeed', tagsOf(skill));
}

/** Shots (or orbs) beyond the skill's own: the weapon's and the tree's — none at all under 일점사. */
export function extraProjectilesFor(skill: SkillId, mods: RunModifiers): number {
  if (mods.passive.has('singleShot') && hasTag(skill, '투사체')) {
    return 0;
  }
  return mods.gear.extraProjectiles + mods.passive.total('projectileCount', tagsOf(skill));
}

/** Bodies a shot passes through beyond its own, and jumps an arc makes, from the tree. */
export function extraPierceFor(skill: SkillId, mods: RunModifiers): number {
  return mods.passive.total('pierceCount', tagsOf(skill));
}

export function extraChainsFor(skill: SkillId, mods: RunModifiers): number {
  return mods.passive.total('chainCount', tagsOf(skill));
}

/**
 * What the skill's area is multiplied by. Area is Path of Exile's: a
 * radius grows by the square root, so +44% area is a fifth wider.
 */
export function areaRadiusFor(skill: SkillId, mods: RunModifiers): number {
  return Math.sqrt(mods.passive.scale('area', tagsOf(skill)));
}

/** How long what the skill leaves behind lasts, against its own. */
export function durationScaleFor(skill: SkillId, mods: RunModifiers): number {
  const eternity = mods.passive.has('eternity') ? KEYSTONES.eternity.durationMore : 1;
  return mods.passive.scale('duration', tagsOf(skill)) * eternity;
}
