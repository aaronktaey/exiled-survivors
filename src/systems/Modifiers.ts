import { PLAYER, SKILL_BASE } from '@/config';
import { type SkillId } from '@/weapons/skills';
import { NO_BONUS, type GearBonus } from '@/systems/Gear';
import { StatSheet } from '@/systems/StatSheet';

/**
 * Everything that changes a skill, folded in one fixed order:
 *
 *   1. 룬 — what is set in that skill's 강화 슬롯 (0.74; the passive tree
 *      had this layer before, and was taken out)
 *   2. 장비 — what the survivor wears
 *   3. 전투 내 효과 — what the run's upgrades have added since it started
 *
 * Within a layer the increases add up on the base, Path of Exile's
 * "increased" rule: two 룬 of +30% damage are +60%, not ×1.3². Between
 * layers they multiply, so a base of 10 with +30% from a 룬 and +50% from
 * the run is 10 × 1.3 × 1.5.
 */
export interface RunModifiers {
  /** Each skill's 룬, as one sheet; a skill with none is not in it. */
  readonly runes: Partial<Record<SkillId, StatSheet>>;
  readonly gear: GearBonus;
}

export const NO_MODIFIERS: RunModifiers = { runes: {}, gear: NO_BONUS };

/** One skill's 룬 layer. */
export const runesOf = (skill: SkillId, mods: RunModifiers): StatSheet => mods.runes[skill] ?? StatSheet.EMPTY;

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

/** One skill's damage per hit. */
export function damageFor(skill: SkillId, upgraded: number, mods: RunModifiers): number {
  const base = SKILL_BASE[skill].damage;

  // 1. 룬
  let damage = base * runesOf(skill, mods).scale('damage');
  // 2. 장비 — the weapon's attack power is flat, and lands at its own layer;
  // a base whose 고정 속성 is 피해 scales the lot
  damage = (damage + mods.gear.attack) * mods.gear.damageScale;
  // 3. 전투 내 효과
  return damage * runScale(base, upgraded);
}

/** The 룬 layer of one skill's attack speed. */
export function runeAttackSpeedFor(skill: SkillId, mods: RunModifiers): number {
  return runesOf(skill, mods).scale('attackSpeed');
}

/** One skill's attacks per second, folded the same way. */
export function attackSpeedFor(skill: SkillId, upgraded: number, mods: RunModifiers): number {
  const base = SKILL_BASE[skill].attackSpeed;

  let rate = base * runeAttackSpeedFor(skill, mods);
  rate *= gearAttackSpeedFor(skill, mods.gear);
  return rate * runScale(base, upgraded);
}

/** The weapon's attack-speed layer for one skill: every skill's, then its own. */
export function gearAttackSpeedFor(skill: SkillId, gear: GearBonus): number {
  return gear.attackSpeedScale * (gear.skillAttackSpeed[skill] ?? 1);
}

/**
 * One skill's crit chance: the base, raised by its share of the gear's 치명
 * and the skill's own 룬 (a share of the base each, added), never past 1.
 */
export function critChanceFor(skill: SkillId | undefined, mods: RunModifiers): number {
  const runes = skill ? runesOf(skill, mods).share('critChance') : 0;
  return Math.min(1, Math.max(0, PLAYER.critChance * (1 + mods.gear.critChanceIncrease + runes)));
}

/** What one critical hit from this skill is worth, after everything that raises it. */
export function critMultiplierFor(mods: RunModifiers, skill?: SkillId): number {
  const runes = skill ? runesOf(skill, mods).share('critMultiplier') : 0;
  return PLAYER.critMultiplier + mods.gear.critMultiplierBonus + runes;
}

/** How the skill's shots fly, against its own speed. */
export function projectileSpeedScaleFor(skill: SkillId, mods: RunModifiers): number {
  return runesOf(skill, mods).scale('projectileSpeed');
}

/** Shots (or orbs) beyond the skill's own: the weapon's and the skill's 룬. */
export function extraProjectilesFor(skill: SkillId, mods: RunModifiers): number {
  return mods.gear.extraProjectiles + runesOf(skill, mods).total('projectileCount');
}

/** Bodies a shot passes through beyond its own, and jumps an arc makes, from the 룬. */
export function extraPierceFor(skill: SkillId, mods: RunModifiers): number {
  return runesOf(skill, mods).total('pierceCount');
}

export function extraChainsFor(skill: SkillId, mods: RunModifiers): number {
  return runesOf(skill, mods).total('chainCount');
}

/**
 * What the skill's area is multiplied by. Area is Path of Exile's: a
 * radius grows by the square root, so +44% area is a fifth wider.
 */
export function areaRadiusFor(skill: SkillId, mods: RunModifiers): number {
  return Math.sqrt(runesOf(skill, mods).scale('area'));
}

/** How long what the skill leaves behind lasts, against its own. */
export function durationScaleFor(skill: SkillId, mods: RunModifiers): number {
  return runesOf(skill, mods).scale('duration');
}
