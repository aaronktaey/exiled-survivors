/**
 * A run waiting to go on the ranking across a sign-in. Signing in leaves the
 * page for the provider's, so the run — with the name already entered for it
 * — is kept in sessionStorage and handed in when the title comes back
 * signed in. Session storage, because it only has to outlive that one trip.
 */
import { STORAGE } from '@/config';
import type { RankSubmission } from '@/systems/Ranking';

export function keepPendingRank(run: RankSubmission): void {
  try {
    sessionStorage.setItem(STORAGE.pendingRank, JSON.stringify(run));
  } catch {
    // Without storage the run cannot wait; it is simply not entered.
  }
}

/** The run that was waiting, taken off the shelf; null when none was. */
export function takePendingRank(): RankSubmission | null {
  try {
    const raw = sessionStorage.getItem(STORAGE.pendingRank);
    sessionStorage.removeItem(STORAGE.pendingRank);
    const run = raw ? (JSON.parse(raw) as Partial<RankSubmission>) : null;
    if (!run || typeof run.damage !== 'number') {
      return null;
    }
    return {
      name: String(run.name ?? ''),
      emoji: String(run.emoji ?? ''),
      flag: String(run.flag ?? ''),
      damage: run.damage,
      level: Number(run.level) || 1,
      survivedMs: Number(run.survivedMs) || 0,
      skill: String(run.skill ?? ''),
    };
  } catch {
    return null;
  }
}
