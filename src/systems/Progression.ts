import Phaser from 'phaser';

import { STATS, xpToNextLevel } from '@/config';
import type { SkillDefinition, SkillId } from '@/weapons/skills';

export type UpgradeId = 'damage' | 'attackSpeed';

export interface UpgradeOption {
  readonly id: UpgradeId;
  readonly label: string;
  readonly detail: string;
}

/** Damage and rate are tracked per skill, so an upgrade only hits its own. */
export interface SkillStats {
  damage: number;
  /** Attacks per second. Each "공격속도 +1" adds exactly 1. */
  attackSpeed: number;
}

/** The two picks offered, worded for whichever skill is being upgraded. */
export function upgradeOptionsFor(skill: SkillDefinition): readonly UpgradeOption[] {
  return [
    { id: 'damage', label: '공격력 +1', detail: `${skill.name}의 피해가 1 늘어납니다` },
    { id: 'attackSpeed', label: '공격속도 +1', detail: `${skill.name}의 초당 공격 횟수가 1 늘어납니다` },
  ];
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

  /** Live stats for a skill, created at base values on first use. */
  public statsFor(skill: SkillId): SkillStats {
    let existing = this.stats.get(skill);
    if (!existing) {
      existing = { damage: STATS.baseDamage, attackSpeed: STATS.baseAttackSpeed };
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
    const target = this.statsFor(skill);
    if (upgrade === 'damage') {
      target.damage += 1;
    } else {
      target.attackSpeed += 1;
    }
  }
}
