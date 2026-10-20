import { ENEMY_KINDS, type EnemyKind } from '@/config';

/** One line of the loadout, as it stood when the run ended. */
export interface RunSkillLine {
  readonly name: string;
  readonly level: number;
  readonly dps: number;
}

/** What a run amounted to, read out on the screen that ends it. */
export interface RunSummary {
  readonly damage: number;
  readonly kills: number;
  readonly byKind: readonly { readonly kind: EnemyKind; readonly count: number }[];
  readonly skills: readonly RunSkillLine[];
  readonly survivedMs: number;
  readonly level: number;
}

/**
 * What a run did, counted as it happens.
 *
 * Damage goes through CombatSystem.hit and kills through killEnemy, so both
 * are counted in one place each and cannot drift from what actually landed.
 * The numbers are the run's own: they start at zero every time, and the
 * screen that ends the run is what reads them.
 */
export class RunStats {
  private damageDealt = 0;
  private readonly kills = new Map<EnemyKind, number>();

  public reset(): void {
    this.damageDealt = 0;
    this.kills.clear();
  }

  /**
   * Carries on from a saved run's count, so the damage and kills before it
   * was saved still count at the end (they were lost on every resume until
   * 2026-10-18 — and the board, 내 기록 and the gold went by the rest only).
   */
  public seed(damage: number, kills: Partial<Record<EnemyKind, number>> = {}): void {
    this.damageDealt = Math.max(0, Number(damage) || 0);
    this.kills.clear();
    for (const [kind, count] of Object.entries(kills) as [EnemyKind, number][]) {
      if (ENEMY_KINDS[kind] && Number(count) > 0) {
        this.kills.set(kind, Math.floor(Number(count)));
      }
    }
  }

  /** The kills as the save keeps them. */
  public get killsByKind(): Partial<Record<EnemyKind, number>> {
    return Object.fromEntries(this.kills);
  }

  /** The damage before rounding, as the save keeps it. */
  public get damageExact(): number {
    return this.damageDealt;
  }

  /** Every point of damage the survivor dealt, crits included. */
  public recordDamage(amount: number): void {
    if (amount > 0) {
      this.damageDealt += amount;
    }
  }

  public recordKill(kind: EnemyKind): void {
    this.kills.set(kind, (this.kills.get(kind) ?? 0) + 1);
  }

  public get damage(): number {
    return Math.round(this.damageDealt);
  }

  public get killCount(): number {
    let total = 0;
    for (const count of this.kills.values()) {
      total += count;
    }
    return total;
  }

  /** Kills by kind, in the roster's own order so the line never reshuffles. */
  public get byKind(): readonly { readonly kind: EnemyKind; readonly count: number }[] {
    return (Object.keys(ENEMY_KINDS) as EnemyKind[])
      .map((kind) => ({ kind, count: this.kills.get(kind) ?? 0 }))
      .filter((entry) => entry.count > 0);
  }
}
