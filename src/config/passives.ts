/**
 * ★ 패시브 — what carries over between runs, bought with what a 우두머리
 * leaves behind.
 *
 * A 우두머리 drops a 신성한 조각 half the time; ten of them make one
 * 신성한 구슬, and one 구슬 is one point. A point buys a rank of one of the
 * two lines below, and the ranks stack.
 *
 * Health regeneration is not one of them, and no longer anywhere else
 * either: life comes back from potions.
 *
 * The lines make a tree: a line with `requires` hangs from another and
 * opens once that one holds enough ranks. Ranks already bought are never
 * taken away by it — a line that is shut only stops taking more. The screen
 * draws whatever shape this table gives, so a new line is a new entry.
 */

export type PassiveId = 'attackSpeed' | 'damage' | 'moveSpeed' | 'luck';

export interface PassiveSpec {
  readonly id: PassiveId;
  /** Korean name; a locale renames it through `names.passives`. */
  readonly name: string;
  /** What one rank is worth, written out. */
  readonly detail: string;
  /** How many ranks it can hold. */
  readonly maxRank: number;
  /** The line it hangs from, and the ranks that one needs before this opens. Without it, it hangs from the root. */
  readonly requires?: { readonly id: PassiveId; readonly rank: number };
  /** Multiplies every skill's attacks per second, per rank. */
  readonly attackSpeedScale?: number;
  /** Multiplies every skill's damage, per rank. */
  readonly damageScale?: number;
  /** Multiplies the survivor's move speed, per rank. */
  readonly moveSpeedScale?: number;
  /**
   * 행운, per rank, as a share. Nothing reads it yet — it is bought and
   * shown now so the points spent on it are there when it starts to count.
   */
  readonly luck?: number;
}

export const PASSIVES: Record<PassiveId, PassiveSpec> = {
  damage: {
    id: 'damage',
    name: '피해',
    detail: '피해 +3%',
    maxRank: 10,
    damageScale: 1.03,
  },
  attackSpeed: {
    id: 'attackSpeed',
    name: '공격속도',
    detail: '공격속도 +3%',
    maxRank: 10,
    requires: { id: 'damage', rank: 1 },
    attackSpeedScale: 1.03,
  },
  moveSpeed: {
    id: 'moveSpeed',
    name: '이동속도',
    detail: '이동속도 +1%',
    maxRank: 10,
    moveSpeedScale: 1.01,
  },
  luck: {
    id: 'luck',
    name: '행운',
    detail: '행운 +1% (아직 효과 없음)',
    maxRank: 10,
    requires: { id: 'moveSpeed', rank: 1 },
    luck: 0.01,
  },
};

export const ALL_PASSIVES: readonly PassiveSpec[] = Object.values(PASSIVES);

export const SHARD = {
  /** Share of 우두머리 kills that leave one. */
  chance: 0.195,
  /** How many make one 신성한 구슬. */
  perOrb: 10,
  /** One 구슬 is worth this many points. */
  pointsPerOrb: 1,
  /** How big it is drawn on the ground. */
  size: 16,
} as const;
