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

/**
 * One skill's damage per hit, the rule since 0.93 (the user's):
 *
 *   플랫 (기본 피해 + 무기 공격력) × 증가 (1 + every 증가, added) × 증폭 (every 증폭, multiplied)
 *
 * 증가 — the run's 공격력 picks (each a share of the base).
 * 증폭 — the passive tree's 피해, and the weapon's 강력 and 피해 고정 속성 (강철 검),
 *        which add within the weapon as its lines always do.
 * GameScene multiplies in the rest: the skill's own 보정 (BALANCE.damageScale)
 * and the held 얼음창's 증폭; a hit then takes 감전, 각성 and 치명타 on top.
 */
export function damageFor(skill: SkillId, upgraded: number, mods: RunModifiers): number {
  const parts = damageParts(skill, upgraded, mods);
  return parts.flat * parts.increase * parts.amplify;
}

/** The three layers of damageFor, for the HUD to spell out. */
export function damageParts(
  skill: SkillId,
  upgraded: number,
  mods: RunModifiers,
): { readonly base: number; readonly attack: number; readonly flat: number; readonly increase: number; readonly amplify: number } {
  const base = SKILL_BASE[skill].damage;
  const flat = base + mods.gear.attack;
  const increase = 1 + (runScale(base, upgraded) - 1) + mods.gear.damageIncrease;
  const amplify = mods.passive.damageScale * mods.gear.damageAmplify;
  return { base, attack: mods.gear.attack, flat, increase, amplify };
}

/** One skill's attacks per second, folded the same way. */
export function attackSpeedFor(skill: SkillId, upgraded: number, mods: RunModifiers): number {
  const base = SKILL_BASE[skill].attackSpeed;

  let rate = base * mods.passive.attackSpeedScale;
  rate *= gearAttackSpeedFor(skill, mods.gear);
  return rate * runScale(base, upgraded);
}

/** The weapon's attack-speed layer for one skill: every skill's, then its own. */
export function gearAttackSpeedFor(skill: SkillId, gear: GearBonus): number {
  return gear.attackSpeedScale * (gear.skillAttackSpeed[skill] ?? 1);
}

/** What one critical hit is worth, after everything that raises it. */
export function critMultiplierFor(mods: RunModifiers): number {
  return PLAYER.critMultiplier + mods.gear.critMultiplierBonus;
}
