import Phaser from 'phaser';

import {
  ENEMY,
  SKILL_BASE,
  STATS,
  UPGRADE_CAP,
  orbsHeld,
  UPGRADE_MAX_PICKS,
  upgradeShown,
  upgradeStep,
  xpToNextLevel,
} from '@/config';
import { fill, skillName, t } from '@/i18n';
import type { SkillDefinition, SkillId } from '@/weapons/skills';

export type UpgradeId =
  | 'damage'
  | 'attackSpeed'
  | 'range'
  | 'projectileSpeed'
  | 'orbitSpeed'
  | 'chainCount'
  | 'pierceCount'
  | 'orbCount';

export interface UpgradeOption {
  readonly id: UpgradeId;
  readonly label: string;
  readonly detail: string;
  /**
   * Where the stat stands and where this pick takes it, and how many picks
   * it has had of how many it can (null: no ceiling). Only when the options
   * were asked for with the skill's stats — the guide lists them without.
   */
  readonly now?: number;
  readonly next?: number;
  readonly taken?: number;
  readonly maxPicks?: number | null;
}

/**
 * How many times this upgrade can be taken on this skill at all: the pick
 * limit, or the picks it takes from the base to the stat's ceiling — the
 * smaller when both apply. Null when nothing stops it.
 */
export function maxPicksFor(skill: SkillId, upgrade: UpgradeId): number | null {
  const limits: number[] = [];
  const picks = UPGRADE_MAX_PICKS[upgrade];
  if (picks !== undefined) {
    limits.push(picks);
  }
  const cap = UPGRADE_CAP[upgrade];
  const step = upgradeStep(skill, upgrade);
  if (cap !== undefined && step > 0) {
    limits.push(Math.max(0, Math.ceil((cap - SKILL_BASE[skill][upgrade]) / step)));
  }
  return limits.length > 0 ? Math.min(...limits) : null;
}

/** Every stat is tracked per skill, so an upgrade only hits its own. */
export type SkillStats = Record<UpgradeId, number>;

/**
 * How each upgrade is worded. The wording lives in the locale; the number
 * comes from the config, so a tuning change shows up in the text. A stat
 * that is a quantity shows a percentage — the card says "+20%" because
 * that is what it does — and a count shows the count.
 */
function optionText(id: UpgradeId, skill: SkillId): Omit<UpgradeOption, 'id'> {
  const copy = t().upgrades[id];
  const shown = upgradeShown(skill, id);
  const values = { n: Number(shown.toFixed(2)), skill: skillName(skill) };

  return { label: fill(copy.label, values), detail: fill(copy.detail, values) };
}

/**
 * The picks offered, in the order the skill lists them. Which upgrades a
 * skill can take is part of its definition, because two skills can share a
 * tag without sharing a stat — 얼음창 flies like 화염구 but trades for
 * 관통 횟수 instead of reach.
 */
export function upgradeOptionsFor(
  skill: SkillDefinition,
  stats?: SkillStats,
): readonly UpgradeOption[] {
  return skill.upgrades
    // An upgrade at its ceiling is not offered: a pick that does nothing is
    // worse than one fewer card.
    .filter((id) => {
      if (stats === undefined) {
        return true;
      }
      const cap = UPGRADE_CAP[id];
      const picks = UPGRADE_MAX_PICKS[id];
      return (
        (cap === undefined || stats[id] < cap) &&
        (picks === undefined || picksTaken(skill.id, stats, id) < picks)
      );
    })
    .map((id) => {
      const text = { id, ...optionText(id, skill.id) };
      if (stats === undefined) {
        return text;
      }
      const cap = UPGRADE_CAP[id];
      const raised = stats[id] + upgradeStep(skill.id, id);
      return {
        ...text,
        now: stats[id],
        next: cap === undefined ? raised : Math.min(cap, raised),
        taken: picksTaken(skill.id, stats, id),
        maxPicks: maxPicksFor(skill.id, id),
      };
    });
}

/**
 * How many times this upgrade has been taken on this skill, counted back out
 * of the stat the same way the level is.
 */
export function picksTaken(skill: SkillId, stats: SkillStats, upgrade: UpgradeId): number {
  const step = upgradeStep(skill, upgrade);
  return step > 0 ? Math.round((stats[upgrade] - SKILL_BASE[skill][upgrade]) / step) : 0;
}

/**
 * A skill's level: 1 when it is picked up, and one more for every upgrade
 * taken since. It is counted back out of the stats rather than tracked
 * alongside them, because every upgrade moves exactly one stat by exactly
 * one step — so the stats already say how many were taken, and a save
 * written before this existed still reads correctly.
 */
export function skillLevelFromStats(skill: SkillId, stats: SkillStats): number {
  const base = SKILL_BASE[skill];
  let taken = 0;

  for (const id of Object.keys(stats) as UpgradeId[]) {
    const step = upgradeStep(skill, id);
    if (step > 0) {
      taken += Math.round((stats[id] - base[id]) / step);
    }
  }

  return 1 + Math.max(0, taken);
}

/**
 * How far a skill reaches — to pick a target, and for a thrown skill how far
 * the shot flies. A skill that throws something reaches further the faster it
 * throws it: its range moves with its projectile speed, in proportion to
 * where both started, and it has no range of its own to upgrade.
 */
export function rangeFromStats(skill: SkillId, stats: SkillStats): number {
  const base = SKILL_BASE[skill];
  if (base.projectileSpeed > 0) {
    return base.range * (stats.projectileSpeed / base.projectileSpeed);
  }

  return stats.range;
}

/**
 * Damage per second for a stat line, counting every body a skill touches at
 * once — that is what makes two skills comparable at a glance.
 */
export function dpsFromStats(stats: SkillStats): number {
  const perSecond = 1000 / Math.max(STATS.minCooldownMs, 1000 / stats.attackSpeed);
  const orbs = stats.orbCount > 0 ? orbsHeld(stats.orbCount) : 0;
  const targets = 1 + stats.chainCount + stats.pierceCount + Math.max(0, orbs - 1);

  return stats.damage * perSecond * targets;
}

/**
 * Tracks XP and level, and owns each skill's stats.
 * Emits 'levelup' with the new level when a threshold is crossed.
 */
export class Progression extends Phaser.Events.EventEmitter {
  public static readonly LEVEL_UP = 'levelup';

  public level = 1;
  public xp = 0;

  private readonly stats = new Map<SkillId, SkillStats>();

  /** XP required to leave the current level. */
  public get xpToNext(): number {
    return xpToNextLevel(this.level);
  }

  /** Live stats for a skill, created at its base values on first use. */
  public statsFor(skill: SkillId): SkillStats {
    let existing = this.stats.get(skill);
    if (!existing) {
      existing = { ...SKILL_BASE[skill] };
      this.stats.set(skill, existing);
    }
    return existing;
  }

  /** How far this skill reaches right now — see rangeFromStats. */
  public rangeFor(skill: SkillId): number {
    return rangeFromStats(skill, this.statsFor(skill));
  }

  public cooldownMsFor(skill: SkillId): number {
    return Math.max(STATS.minCooldownMs, 1000 / this.statsFor(skill).attackSpeed);
  }

  public addXp(amount: number): void {
    this.xp += amount;

    // A big pickup burst can cross more than one threshold.
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.emit(Progression.LEVEL_UP, this.level);
    }
  }

  public apply(skill: SkillId, upgrade: UpgradeId): void {
    const stats = this.statsFor(skill);
    const picks = UPGRADE_MAX_PICKS[upgrade];
    if (picks !== undefined && picksTaken(skill, stats, upgrade) >= picks) {
      return;
    }
    const cap = UPGRADE_CAP[upgrade];
    const raised = stats[upgrade] + upgradeStep(skill, upgrade);

    stats[upgrade] = cap === undefined ? raised : Math.min(cap, raised);
  }

  /** How many picks this skill has had, counting the pickup itself. */
  public levelFor(skill: SkillId): number {
    return skillLevelFromStats(skill, this.statsFor(skill));
  }

  /**
   * Damage per second, as the HUD shows it. Multi-target skills count every
   * body they touch, because that is what the number is for: comparing one
   * skill against another at a glance.
   */
  public dpsFor(skill: SkillId): number {
    return dpsFromStats(this.statsFor(skill));
  }

  /** A plain enemy's health, for reading a DPS against something. */
  public static get enemyHealth(): number {
    return ENEMY.maxHp;
  }
}
