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

export interface PodiumResult {
  /** The board's day the three are from. */
  readonly day: number;
  /** First, second and third, best first; fewer when fewer ran that day. */
  readonly entries: readonly RankEntry[];
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
    return { day: Number(body.day) || 0, entries };
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
