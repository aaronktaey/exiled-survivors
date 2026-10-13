/**
 * ★ 패시브 — what carries over between runs, bought with what a 우두머리
 * leaves behind.
 *
 * A 우두머리 drops a 신성한 조각 half the time; ten of them make one
 * 신성한 구슬, and one 구슬 is one point. A point buys a rank of one of the
 * three lines below, and the ranks stack.
 *
 * It is deliberately three flat lines rather than a tree: the shape — which
 * node unlocks which — is the next piece of work, and everything underneath
 * it (the currency, the points, the ranks, the order it is applied in) is
 * already here and will not have to move.
 */

export type PassiveId = 'attackSpeed' | 'damage' | 'regen';

export interface PassiveSpec {
  readonly id: PassiveId;
  /** Korean name; a locale renames it through `names.passives`. */
  readonly name: string;
  /** What one rank is worth, written out. */
  readonly detail: string;
  /** How many ranks it can hold. */
  readonly maxRank: number;
  /** Multiplies every skill's attacks per second, per rank. */
  readonly attackSpeedScale?: number;
  /** Multiplies every skill's damage, per rank. */
  readonly damageScale?: number;
  /** Health returned every REGEN.periodMs, per rank. */
  readonly regen?: number;
}

export const PASSIVES: Record<PassiveId, PassiveSpec> = {
  damage: {
    id: 'damage',
    name: '피해',
    detail: '피해 +10%',
    maxRank: 10,
    damageScale: 1.1,
  },
  attackSpeed: {
    id: 'attackSpeed',
    name: '공격속도',
    detail: '공격속도 +10%',
    maxRank: 10,
    attackSpeedScale: 1.1,
  },
  regen: {
    id: 'regen',
    name: '재생',
    detail: '5초당 체력 +1',
    maxRank: 10,
    regen: 1,
  },
};

export const ALL_PASSIVES: readonly PassiveSpec[] = Object.values(PASSIVES);

export const SHARD = {
  /** Share of 우두머리 kills that leave one. */
  chance: 0.5,
  /** How many make one 신성한 구슬. */
  perOrb: 10,
  /** One 구슬 is worth this many points. */
  pointsPerOrb: 1,
  /** How big it is drawn on the ground. */
  size: 16,
} as const;
