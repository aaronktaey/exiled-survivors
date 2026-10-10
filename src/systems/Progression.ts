import Phaser from 'phaser';

import { SKILL_BASE, STATS, UPGRADE_STEP, xpToNextLevel } from '@/config';
import type { SkillDefinition, SkillId } from '@/weapons/skills';

export type UpgradeId = 'damage' | 'attackSpeed' | 'range' | 'projectileSpeed';

export interface UpgradeOption {
  readonly id: UpgradeId;
  readonly label: string;
  readonly detail: string;
}

/** Every stat is tracked per skill, so an upgrade only hits its own. */
export type SkillStats = Record<UpgradeId, number>;

/**
 * The picks offered, worded for whichever skill is being upgraded. Melee
 * skills get damage and rate; a 투사체 skill also flies, so it can trade for
 * reach and for how fast the shot gets there.
 */
export function upgradeOptionsFor(skill: SkillDefinition): readonly UpgradeOption[] {
  const options: UpgradeOption[] = [
    {
      id: 'damage',
      label: `공격력 +${UPGRADE_STEP.damage}`,
      detail: `${skill.name}의 피해가 ${UPGRADE_STEP.damage} 늘어납니다`,
    },
    {
      id: 'attackSpeed',
      label: `공격속도 +${UPGRADE_STEP.attackSpeed}`,
      detail: `${skill.name}의 초당 공격 횟수가 ${UPGRADE_STEP.attackSpeed} 늘어납니다`,
    },
  ];

  if (skill.tags.includes('투사체')) {
    options.push(
      {
        id: 'range',
        label: `사정거리 +${UPGRADE_STEP.range}`,
        detail: `${skill.name}의 사정거리가 ${UPGRADE_STEP.range}px 늘어납니다`,
      },
      {
        id: 'projectileSpeed',
        label: `투사체 속도 +${UPGRADE_STEP.projectileSpeed}`,
        detail: `${skill.name}가 초당 ${UPGRADE_STEP.projectileSpeed}px 더 빠르게 날아갑니다`,
      },
    );
  }

  return options;
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
    this.statsFor(skill)[upgrade] += UPGRADE_STEP[upgrade];
  }
}
