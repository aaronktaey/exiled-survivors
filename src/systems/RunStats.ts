import { ENEMY_KINDS, SCORE, type EnemyKind } from '@/config';
import type { SkillId } from '@/weapons/skills';

/** One line of the loadout, as it stood when the run ended. */
export interface RunSkillLine {
  /** The skill, for its icon on the end screen (0.116). */
  readonly id: string;
  readonly name: string;
  readonly level: number;
  /** Everything it dealt this run (0.121; it was its DPS until then). */
  readonly damage: number;
}

/** What a run amounted to, read out on the screen that ends it. */
export interface RunSummary {
  readonly damage: number;
  /** What the run is ranked by (SCORE, 0.116). */
  readonly score: number;
  readonly kills: number;
  /** Each kind killed: how many, and what they added to the score. */
  readonly byKind: readonly { readonly kind: EnemyKind; readonly count: number; readonly score: number }[];
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
  /** The score each kind has added (SCORE), before rounding. */
  private readonly scored = new Map<EnemyKind, number>();
  /** What each skill dealt (0.121), before rounding. */
  private readonly bySkill = new Map<SkillId, number>();

  public reset(): void {
    this.damageDealt = 0;
    this.bySkill.clear();
    this.kills.clear();
    this.scored.clear();
  }

  /**
   * Carries on from a saved run's count, so the damage and kills before it
   * was saved still count at the end (they were lost on every resume until
   * 2026-10-18 — and the board and 내 기록 went by the rest only).
   */
  public seed(
    damage: number,
    kills: Partial<Record<EnemyKind, number>> = {},
    scored: Partial<Record<EnemyKind, number>> = {},
    bySkill: Partial<Record<SkillId, number>> = {},
  ): void {
    this.damageDealt = Math.max(0, Number(damage) || 0);
    // A save from before 0.121 has none: each skill counts from the resume.
    this.bySkill.clear();
    for (const [skill, value] of Object.entries(bySkill) as [SkillId, number][]) {
      if (Number(value) > 0) {
        this.bySkill.set(skill, Number(value));
      }
    }
    this.kills.clear();
    this.scored.clear();
    for (const [kind, count] of Object.entries(kills) as [EnemyKind, number][]) {
      if (ENEMY_KINDS[kind] && Number(count) > 0) {
        this.kills.set(kind, Math.floor(Number(count)));
      }
    }
    // A save from before 0.116 has no score: the kills before it count for none.
    for (const [kind, value] of Object.entries(scored) as [EnemyKind, number][]) {
      if (ENEMY_KINDS[kind] && Number(value) > 0) {
        this.scored.set(kind, Number(value));
      }
    }
  }

  /** The score by kind, as the save keeps it. */
  public get scoreByKind(): Partial<Record<EnemyKind, number>> {
    return Object.fromEntries(this.scored);
  }

  /** The run's score (SCORE), whole. */
  public get score(): number {
    let total = 0;
    for (const value of this.scored.values()) {
      total += value;
    }
    return Math.round(total);
  }

  /** The kills as the save keeps them. */
  public get killsByKind(): Partial<Record<EnemyKind, number>> {
    return Object.fromEntries(this.kills);
  }

  /** The damage before rounding, as the save keeps it. */
  public get damageExact(): number {
    return this.damageDealt;
  }

  /** Every point of damage the survivor dealt, crits included — and, given its skill, to that skill. */
  public recordDamage(amount: number, source?: SkillId): void {
    if (amount > 0) {
      this.damageDealt += amount;
      if (source) {
        this.bySkill.set(source, (this.bySkill.get(source) ?? 0) + amount);
      }
    }
  }

  /** What each skill dealt, as the save keeps it. */
  public get damageBySkill(): Partial<Record<SkillId, number>> {
    return Object.fromEntries(this.bySkill);
  }

  /** What one skill dealt, whole. */
  public damageOf(skill: SkillId): number {
    return Math.round(this.bySkill.get(skill) ?? 0);
  }

  /** A kill: counted, and its full health (as it spawned) scored at its kind's share. */
  public recordKill(kind: EnemyKind, maxHp = 0): void {
    this.kills.set(kind, (this.kills.get(kind) ?? 0) + 1);
    const worth = Math.max(0, Number(maxHp) || 0) * (SCORE.byKind[kind] ?? 1);
    if (worth > 0) {
      this.scored.set(kind, (this.scored.get(kind) ?? 0) + worth);
    }
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
  public get byKind(): readonly { readonly kind: EnemyKind; readonly count: number; readonly score: number }[] {
    return (Object.keys(ENEMY_KINDS) as EnemyKind[])
      .map((kind) => ({ kind, count: this.kills.get(kind) ?? 0, score: Math.round(this.scored.get(kind) ?? 0) }))
      .filter((entry) => entry.count > 0);
  }
}
