import { PLAYER, SKILL_BASE } from '@/config';
import type { SkillId } from '@/weapons/skills';
import { NO_BONUS, type GearBonus } from '@/systems/Gear';
import { NO_PASSIVES, type PassiveBonus } from '@/systems/Passives';

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
 * the tree and +50% from the run is 10 × 1.3 × 1.5. The tenth card is
 * therefore worth as much as the first within its own layer, and a layer
 * someone has invested in makes every other layer worth more.
 */
export interface RunModifiers {
  readonly passive: PassiveBonus;
  readonly gear: GearBonus;
}

export const NO_MODIFIERS: RunModifiers = { passive: NO_PASSIVES, gear: NO_BONUS };

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

  // 1. 패시브
  let damage = base * mods.passive.damageScale;
  // 2. 장비 — the weapon's attack power is flat, and lands at its own layer
  damage += mods.gear.attack;
  // 3. 전투 내 효과
  return damage * runScale(base, upgraded);
}

/** One skill's attacks per second, folded the same way. */
export function attackSpeedFor(skill: SkillId, upgraded: number, mods: RunModifiers): number {
  const base = SKILL_BASE[skill].attackSpeed;

  let rate = base * mods.passive.attackSpeedScale;
  rate *= mods.gear.attackSpeedScale;
  return rate * runScale(base, upgraded);
}

/** What one critical hit is worth, after everything that raises it. */
export function critMultiplierFor(mods: RunModifiers): number {
  return PLAYER.critMultiplier + mods.gear.critMultiplierBonus;
}
