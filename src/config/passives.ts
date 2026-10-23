import type { ShardStat } from '@/config/balance';

/**
 * ★ 패시브 — what carries over between runs. A point buys a rank of one
 * of the lines below, and the ranks stack.
 *
 * Since 0.102 (the user's ask) every line is a 재능의 파편 line: each rank
 * adds `shardWeight` to its stat's weight when a shard lands (ten ranks of
 * +5%: 1.5 against the others' 1 — it comes up more, they come up less;
 * 0.104, the user's word: the drop chance itself is shared and not raised). No line has a cap of its own
 * (the user's word): any can take every point there is. Every player holds
 * PASSIVE_POINTS in all, nothing earns more, and a tree from before is
 * started over (PASSIVE_SCHEME): its damage, attack speed, move speed and
 * 행운 lines went, and the enemies were dampened for it (ENEMY_DAMPEN).
 *
 * The lines make a tree: a line with `requires` hangs from another and
 * opens once that one holds enough ranks. The screen draws whatever shape
 * this table gives, so a new line is a new entry.
 */

export type PassiveId = 'shardDamage' | 'shardAttackSpeed' | 'shardMoveSpeed' | 'shardMaxHp' | 'shardArea' | 'shardRegen';

/** Every player's points, spent and not (0.102). */
export const PASSIVE_POINTS = 30;
/** The tree's shape: a stored tree without it is from before 0.102 and starts over at PASSIVE_POINTS. */
export const PASSIVE_SCHEME = 2;

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
  /** The 재능의 파편 stat it makes likelier when a shard lands, and by how much a rank (a share of its weight). */
  readonly shardStat: ShardStat;
  readonly shardWeight: number;
}

const shardLine = (id: PassiveId, stat: ShardStat, name: string): PassiveSpec => ({
  id,
  name: `${name} 파편`,
  detail: `${name} 파편 등장 확률 +5%`,
  // No cap but the points themselves.
  maxRank: PASSIVE_POINTS,
  shardStat: stat,
  shardWeight: 0.05,
});

export const PASSIVES: Record<PassiveId, PassiveSpec> = {
  shardDamage: shardLine('shardDamage', 'damage', '피해량'),
  shardAttackSpeed: shardLine('shardAttackSpeed', 'attackSpeed', '공격속도'),
  shardMoveSpeed: shardLine('shardMoveSpeed', 'moveSpeed', '이동속도'),
  shardMaxHp: shardLine('shardMaxHp', 'maxHp', '최대체력'),
  shardArea: shardLine('shardArea', 'area', '효과범위'),
  shardRegen: shardLine('shardRegen', 'regen', '체력회복'),
};

export const ALL_PASSIVES: readonly PassiveSpec[] = Object.values(PASSIVES);
