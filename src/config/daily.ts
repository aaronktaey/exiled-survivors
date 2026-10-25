import type { EnemyKind, ShardStat } from '@/config/balance';
import type { SkillId } from '@/weapons/skills';

/**
 * ★ 오늘의 규칙 (0.126, the user's design, 2026-10-25): every ranking day
 * (it starts at RANKING.dailyReset, 05:00 KST) lays three rules on every
 * run started that day — one skill nobody may take, one 재능 whose 파편 do
 * not drop, and one kind of enemy made stronger. Nothing good comes with
 * them (the user's word). The same day always draws the same three, on the
 * client and on the Worker alike, so the server can refuse a run that used
 * the day's banned skill.
 *
 * Pure data and a pure function: the Worker imports this file, so it must
 * not import anything that pulls in Phaser.
 */

/** What a strengthened enemy has more of. */
export type DailyEnemyStat = 'hp' | 'speed' | 'contact' | 'shotSpeed' | 'hopDistance' | 'rareChance';

export interface DailyEnemyBuff {
  readonly id: string;
  /** The kind it lays on; `all` for every kind (the rare chance). */
  readonly kind: EnemyKind | 'all';
  readonly stat: DailyEnemyStat;
  /** What that stat is multiplied by. */
  readonly scale: number;
}

export const DAILY_RULES = {
  /** The first ranking day with rules: 2026-10-26 05:00 KST (the user's "내일부터"). */
  since: Date.UTC(2026, 9, 25, 20, 0, 0),
  /** The skills a day can ban — every one a player can pick. A new skill goes here too. */
  skills: ['meleeStrike', 'fireball', 'chainLightning', 'iceSpear', 'voidOrb', 'thunderStrike', 'drone', 'poisonNova'] as readonly SkillId[],
  /** The 재능 a day can ban: its 파편 stop dropping (TALENT_SHARD.stats). */
  talents: ['damage', 'attackSpeed', 'moveSpeed', 'maxHp', 'area', 'regen'] as readonly ShardStat[],
  /** The strengthened enemies a day draws from — only the ones the user picked (2026-10-25). */
  enemyBuffs: [
    { id: 'runnerContact', kind: 'runner', stat: 'contact', scale: 1.5 },
    { id: 'gruntHp', kind: 'grunt', stat: 'hp', scale: 1.3 },
    { id: 'gruntSpeed', kind: 'grunt', stat: 'speed', scale: 1.15 },
    { id: 'bruteContact', kind: 'brute', stat: 'contact', scale: 1.5 },
    { id: 'bruteHp', kind: 'brute', stat: 'hp', scale: 1.5 },
    { id: 'shooterShotSpeed', kind: 'shooter', stat: 'shotSpeed', scale: 1.3 },
    { id: 'erraticHop', kind: 'erratic', stat: 'hopDistance', scale: 1.3 },
    { id: 'rareChance', kind: 'all', stat: 'rareChance', scale: 1.5 },
  ] as readonly DailyEnemyBuff[],
} as const;

/** One day's three rules. */
export interface DailyRuleSet {
  /** The ranking day they belong to (rankingDayStart). */
  readonly day: number;
  readonly bannedSkill: SkillId;
  readonly bannedTalent: ShardStat;
  readonly enemyBuff: DailyEnemyBuff;
}

const DAY_MS = 86_400_000;

/** A number in [0, 1) that is always the same for the same day and salt. */
function roll(day: number, salt: number): number {
  let h = (Math.imul(day, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

/**
 * The rules of the ranking day that starts at `dayStart`, or null before
 * DAILY_RULES.since. Each pick is drawn from the day's own roll, and never
 * the same as the day before's.
 */
export function dailyRulesFor(dayStart: number): DailyRuleSet | null {
  if (dayStart < DAILY_RULES.since) {
    return null;
  }
  const first = Math.round(DAILY_RULES.since / DAY_MS);
  const last = Math.round(dayStart / DAY_MS);
  const pools = [DAILY_RULES.skills.length, DAILY_RULES.talents.length, DAILY_RULES.enemyBuffs.length];
  let picks = [-1, -1, -1];
  for (let day = first; day <= last; day++) {
    picks = pools.map((size, i) => {
      let index = Math.floor(roll(day, i) * size);
      if (size > 1 && index === picks[i]) {
        index = (index + 1) % size;
      }
      return index;
    });
  }
  return {
    day: dayStart,
    bannedSkill: DAILY_RULES.skills[picks[0]!]!,
    bannedTalent: DAILY_RULES.talents[picks[1]!]!,
    enemyBuff: DAILY_RULES.enemyBuffs[picks[2]!]!,
  };
}
