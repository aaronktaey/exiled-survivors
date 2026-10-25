import {
  DAILY_RULES,
  dailyRulesFor,
  rankingDayStart,
  type DailyEnemyStat,
  type DailyRuleSet,
  type EnemyKind,
  type ShardStat,
} from '@/config';
import type { SkillId } from '@/weapons/skills';

type DailyWindow = Window & { __harness?: boolean; __dailyOn?: boolean; __dailyDay?: number };

/**
 * 오늘의 규칙 (config/daily.ts) for the run being played. Module scope, like
 * the run's second clock: GameScene sets it as a run starts — the day it was
 * started, which a save carries, so a run that crosses 05:00 keeps its own
 * rules — and every system that a rule touches asks here.
 *
 * The harness sees no rules (they would move every number a suite reads)
 * unless a page sets `window.__dailyOn`; `window.__dailyDay` picks the day.
 * On the dev server a day before DAILY_RULES.since shows the first day's
 * rules, so they can be tried before they start.
 */
let active: DailyRuleSet | null = null;

function dailyOn(): boolean {
  const w = window as DailyWindow;
  if (w.__dailyOn) {
    return true;
  }
  return !(import.meta.env.DEV && (w.__harness || window.location.hash === '#run'));
}

export const dailyRules = {
  /** The ranking day a run started now belongs to, or null when rules are off. */
  dayNow(now = Date.now()): number | null {
    if (!dailyOn()) {
      return null;
    }
    const w = window as DailyWindow;
    const day = w.__dailyDay ?? rankingDayStart(now);
    return import.meta.env.DEV && !w.__harness ? Math.max(day, rankingDayStart(DAILY_RULES.since)) : day;
  },

  /** Today's rules, for the title: what a run started now would play under. */
  today(now = Date.now()): DailyRuleSet | null {
    const day = this.dayNow(now);
    return day === null ? null : dailyRulesFor(day);
  },

  /** The rules of the run being played: the day it began on, or none. */
  begin(day: number | null | undefined): void {
    active = day === null || day === undefined || !dailyOn() ? null : dailyRulesFor(day);
  },

  get active(): DailyRuleSet | null {
    return active;
  },

  skillBanned(id: SkillId): boolean {
    return active?.bannedSkill === id;
  },

  /** A 재능 whose 파편 do not drop today. */
  talentBanned(stat: ShardStat): boolean {
    return active?.bannedTalent === stat;
  },

  /** What today's strengthened enemy multiplies `stat` of `kind` by — 1 when it is not that one. */
  enemyScale(kind: EnemyKind | 'all', stat: DailyEnemyStat): number {
    const buff = active?.enemyBuff;
    return buff && buff.stat === stat && (buff.kind === kind || buff.kind === 'all') ? buff.scale : 1;
  },
};
