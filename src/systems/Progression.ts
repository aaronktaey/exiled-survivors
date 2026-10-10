import Phaser from 'phaser';

import { STATS, XP } from '@/config';

export type UpgradeId = 'damage' | 'attackSpeed';

export interface UpgradeOption {
  readonly id: UpgradeId;
  readonly label: string;
  readonly detail: string;
}

/** The two picks offered on every level-up. */
export const UPGRADES: readonly UpgradeOption[] = [
  { id: 'damage', label: '공격력 +1', detail: '탄환 하나가 주는 피해가 1 늘어납니다' },
  { id: 'attackSpeed', label: '공격속도 +1', detail: '초당 발사 수가 1 늘어납니다' },
] as const;

/**
 * Tracks XP, level and the two upgradeable stats.
 * Emits 'levelup' with the new level when a threshold is crossed.
 */
export class Progression extends Phaser.Events.EventEmitter {
  public static readonly LEVEL_UP = 'levelup';

  public level = 1;
  public xp = 0;
  public damage = STATS.baseDamage;
  public attackSpeed = STATS.baseAttackSpeed;

  /** XP required to leave the current level. */
  public get xpToNext(): number {
    return XP.base + XP.step * (this.level - 1);
  }

  public get cooldownMs(): number {
    return Math.max(STATS.minCooldownMs, 1000 / this.attackSpeed);
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

  public apply(upgrade: UpgradeId): void {
    if (upgrade === 'damage') {
      this.damage += 1;
    } else {
      this.attackSpeed += 1;
    }
  }
}
