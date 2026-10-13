import { RARE, SKILL_BASE } from '@/config';
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
 * The order is the point. Each layer is applied to the result of the one
 * before it, so a percentage from the tree lifts the weapon's own base and
 * not the upgrades picked up along the way, and an upgrade taken at level
 * seven is worth exactly what the card said it was worth.
 */
export interface RunModifiers {
  readonly passive: PassiveBonus;
  readonly gear: GearBonus;
}

export const NO_MODIFIERS: RunModifiers = { passive: NO_PASSIVES, gear: NO_BONUS };

/**
 * One skill's damage per hit.
 *
 * `upgraded` is the skill's live damage, which is its base plus whatever the
 * run has added to it. The difference between the two is the run's own
 * contribution, and it goes on last.
 */
export function damageFor(skill: SkillId, upgraded: number, mods: RunModifiers): number {
  const base = SKILL_BASE[skill].damage;
  const fromRun = upgraded - base;

  // 1. 패시브
  let damage = base * mods.passive.damageScale;
  // 2. 장비
  damage = (damage + mods.gear.attack) * 1;
  // 3. 전투 내 효과
  return damage + fromRun;
}

/** One skill's attacks per second, folded the same way. */
export function attackSpeedFor(skill: SkillId, upgraded: number, mods: RunModifiers): number {
  const base = SKILL_BASE[skill].attackSpeed;
  const fromRun = upgraded - base;

  let rate = base * mods.passive.attackSpeedScale;
  rate = rate * mods.gear.attackSpeedScale;
  return rate + fromRun;
}

/** What one critical hit is worth, after everything that raises it. */
export function critMultiplierFor(mods: RunModifiers): number {
  return RARE.critMultiplier + mods.gear.critMultiplierBonus;
}

/** Health returned every REGEN.periodMs, from the tree and from the weapon. */
export function regenFor(mods: RunModifiers): number {
  return mods.passive.regen + mods.gear.regen;
}
