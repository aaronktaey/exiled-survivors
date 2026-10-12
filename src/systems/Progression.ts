import Phaser from 'phaser';

import { SKILL_BASE, STATS, UPGRADE_STEP, xpToNextLevel } from '@/config';
import { subjectParticle } from '@/systems/korean';
import type { SkillDefinition, SkillId } from '@/weapons/skills';

export type UpgradeId =
  | 'damage'
  | 'attackSpeed'
  | 'range'
  | 'projectileSpeed'
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

/** How each upgrade is worded, for whichever skill is being upgraded. */
const OPTION_TEXT: Record<UpgradeId, (name: string) => Omit<UpgradeOption, 'id'>> = {
  damage: (name) => ({
    label: `공격력 +${UPGRADE_STEP.damage}`,
    detail: `${name}의 피해가 ${UPGRADE_STEP.damage} 늘어납니다`,
  }),
  attackSpeed: (name) => ({
    label: `공격속도 +${UPGRADE_STEP.attackSpeed}`,
    detail: `${name}의 초당 공격 횟수가 ${UPGRADE_STEP.attackSpeed} 늘어납니다`,
  }),
  range: (name) => ({
    label: `사정거리 +${UPGRADE_STEP.range}`,
    detail: `${name}의 사정거리가 ${UPGRADE_STEP.range}px 늘어납니다`,
  }),
  projectileSpeed: (name) => ({
    label: `투사체 속도 +${UPGRADE_STEP.projectileSpeed}`,
    detail: `${name}${subjectParticle(name)} 초당 ${UPGRADE_STEP.projectileSpeed}px 더 빠르게 날아갑니다`,
  }),
  chainCount: (name) => ({
    label: `연쇄 횟수 +${UPGRADE_STEP.chainCount}`,
    detail: `${name}${subjectParticle(name)} ${UPGRADE_STEP.chainCount}명에게 더 옮겨붙습니다`,
  }),
  pierceCount: (name) => ({
    label: `관통 횟수 +${UPGRADE_STEP.pierceCount}`,
    detail: `${name}${subjectParticle(name)} ${UPGRADE_STEP.pierceCount}명을 더 꿰뚫고 지나갑니다`,
  }),
  orbCount: (name) => ({
    label: `구체 수 +${UPGRADE_STEP.orbCount}`,
    detail: `${name}${subjectParticle(name)} ${UPGRADE_STEP.orbCount}개 더 공전합니다`,
  }),
};

/**
 * The picks offered, in the order the skill lists them. Which upgrades a
 * skill can take is part of its definition, because two skills can share a
 * tag without sharing a stat — 얼음창 flies like 화염구 but trades for
 * 관통 횟수 instead of reach.
 */
export function upgradeOptionsFor(skill: SkillDefinition): readonly UpgradeOption[] {
  return skill.upgrades.map((id) => ({ id, ...OPTION_TEXT[id](skill.name) }));
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
