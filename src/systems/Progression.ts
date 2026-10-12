import Phaser from 'phaser';

import {
  ENEMY,
  SKILL_BASE,
  STATS,
  UPGRADE_CAP,
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
}

/** Every stat is tracked per skill, so an upgrade only hits its own. */
export type SkillStats = Record<UpgradeId, number>;

/**
 * How each upgrade is worded. The wording lives in the locale; the amount
 * comes from UPGRADE_STEP, so a tuning change shows up in the text.
 */
function optionText(id: UpgradeId, skill: SkillId): Omit<UpgradeOption, 'id'> {
  const copy = t().upgrades[id];
  const step = upgradeStep(skill, id);
  const values = { n: Number(step.toFixed(2)), skill: skillName(skill) };

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
      const cap = UPGRADE_CAP[id];
      return cap === undefined || stats === undefined || stats[id] < cap;
    })
    .map((id) => ({ id, ...optionText(id, skill.id) }));
}

/**
 * Damage per second for a stat line, counting every body a skill touches at
 * once — that is what makes two skills comparable at a glance.
 */
export function dpsFromStats(stats: SkillStats): number {
  const perSecond = 1000 / Math.max(STATS.minCooldownMs, 1000 / stats.attackSpeed);
  const targets = 1 + stats.chainCount + stats.pierceCount + Math.max(0, stats.orbCount - 1);

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
    const cap = UPGRADE_CAP[upgrade];
    const raised = stats[upgrade] + upgradeStep(skill, upgrade);

    stats[upgrade] = cap === undefined ? raised : Math.min(cap, raised);
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
