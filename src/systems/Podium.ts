/**
 * 어제의 랭킹 — the day before's first, second and third, shown once on the
 * first visit to the title after the board starts over (RANKING.dailyReset).
 *
 * Seen is kept twice: on this device (STORAGE.podiumSeen, never synced — two
 * devices writing it each morning would make the records disagree), and on
 * the signed-in account (users.podium_seen, read back through /api/me), so a
 * player who has seen it on one device is not shown it again on another.
 */
import { RANKING, STORAGE, rankingDayStart } from '@/config';
import { account, accountRequest } from '@/systems/Account';
import { cleanRankEntry, type RankEntry } from '@/systems/Ranking';

/** The signed-in account's own run that day, and where it placed. */
export interface PodiumMine {
  readonly place: number;
  readonly damage: number;
  readonly level: number;
  readonly survivedMs: number;
}

export interface PodiumResult {
  /** The board's day the three are from. */
  readonly day: number;
  /** First, second and third, best first; fewer when fewer ran that day. */
  readonly entries: readonly RankEntry[];
  /** Signed in: whether this account was asked about at all. */
  readonly signedIn: boolean;
  /** This account's place that day, or null without a run (or signed out). */
  readonly mine: PodiumMine | null;
  /** How many accounts ran that day. */
  readonly total: number;
}

class PodiumStore {
  /** Asked once a visit at most. Public so a test can ask again. */
  public asked = false;

  /** Whether today's has been seen: here, or by the signed-in account anywhere. */
  public seenToday(now = Date.now()): boolean {
    const today = rankingDayStart(now);
    if (account.user?.podiumSeen === today) {
      return true;
    }
    try {
      return Number(localStorage.getItem(STORAGE.podiumSeen)) === today;
    } catch {
      return false;
    }
  }

  /** The day before's first three, or null when the server cannot be reached. */
  public async fetch(): Promise<PodiumResult | null> {
    const reply = await accountRequest(RANKING.shared.podiumUrl, { cache: 'no-store' });
    const body = reply.body as { day?: unknown; entries?: unknown } | null;
    if (!reply.ok || !body || !Array.isArray(body.entries)) {
      return null;
    }
    const entries = body.entries
      .map(cleanRankEntry)
      .filter((entry): entry is RankEntry => entry !== null)
      .slice(0, 3);
    // Signed in, where this account placed that day too.
    const signedIn = account.user !== null;
    let mine: PodiumMine | null = null;
    let total = 0;
    if (signedIn) {
      const own = await accountRequest(`${RANKING.shared.podiumUrl}/me`, { cache: 'no-store' });
      const found = own.body as { total?: unknown; mine?: Partial<PodiumMine> | null } | null;
      total = Math.max(0, Math.floor(Number(found?.total) || 0));
      const m = found?.mine;
      if (own.ok && m && Number(m.place) >= 1) {
        mine = {
          place: Math.floor(Number(m.place)),
          damage: Math.max(0, Math.floor(Number(m.damage) || 0)),
          level: Math.max(1, Math.floor(Number(m.level) || 1)),
          survivedMs: Math.max(0, Math.floor(Number(m.survivedMs) || 0)),
        };
      }
    }
    return { day: Number(body.day) || 0, entries, signedIn, mine, total };
  }

  /** It has been seen: not again today, here or — signed in — anywhere. */
  public markSeen(now = Date.now()): void {
    try {
      localStorage.setItem(STORAGE.podiumSeen, String(rankingDayStart(now)));
    } catch {
      // Seen for this visit only.
    }
    if (account.user) {
      void accountRequest(`${RANKING.shared.podiumUrl}/seen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    }
  }
}

export const podium = new PodiumStore();
