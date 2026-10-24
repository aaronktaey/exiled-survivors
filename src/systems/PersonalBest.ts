/**
 * 내 기록 — this player's own best runs, every run counted, entered on the
 * shared board or not. Kept in localStorage under the game's prefix, so a
 * signed-in player's list travels with the rest of their records.
 */
import { RANKING, STORAGE } from '@/config';

export interface PersonalRun {
  /** The damage it dealt — what 내 기록 went by before 0.116. */
  readonly damage: number;
  /** Its score (SCORE, 0.116): what it is ranked by now. Absent on a run from before. */
  readonly score?: number;
  readonly level: number;
  readonly survivedMs: number;
  /** When it ended, as an ISO string. */
  readonly at: string;
}

type Listener = () => void;

/** Scored runs first, best first; runs from before 0.116 (no score) after them, by damage. */
const byRank = (a: PersonalRun, b: PersonalRun): number =>
  (b.score ?? -1) - (a.score ?? -1) || b.damage - a.damage || a.at.localeCompare(b.at);

/** A stored run, trusting nothing about it. */
function clean(raw: unknown): PersonalRun | null {
  const r = raw as Partial<PersonalRun> | null;
  const damage = Math.floor(Number(r?.damage));
  if (!r || !Number.isFinite(damage) || damage <= 0) {
    return null;
  }
  const score = Math.floor(Number(r.score));
  return {
    damage,
    ...(Number.isFinite(score) && score >= 0 ? { score } : {}),
    level: Math.max(1, Math.floor(Number(r.level) || 1)),
    survivedMs: Math.max(0, Math.floor(Number(r.survivedMs) || 0)),
    at: String(r.at ?? ''),
  };
}

class PersonalStore {
  private current: PersonalRun[] = [];
  private loaded = false;
  private readonly listeners = new Set<Listener>();

  /** Best first, RANKING.size of them at most. */
  public get runs(): readonly PersonalRun[] {
    if (!this.loaded) {
      this.load();
    }
    return this.current;
  }

  /** Where a run of this score stands among this player's own, from 1. */
  public placeFor(score: number): number {
    return this.runs.filter((run) => (run.score ?? -1) >= score).length + 1;
  }

  /** A run that ended. Kept if it is among the best RANKING.size. */
  public record(run: Omit<PersonalRun, 'at'>): number {
    const entry = clean({ ...run, at: new Date().toISOString() });
    if (!entry) {
      return 0;
    }
    const next = [...this.runs, entry]
      .sort(byRank)
      .slice(0, RANKING.size);
    this.current = next;
    try {
      localStorage.setItem(STORAGE.personal, JSON.stringify(next));
    } catch {
      // Kept for as long as the tab is open, then.
    }
    this.listeners.forEach((listener) => listener());
    return next.indexOf(entry) + 1;
  }

  public reset(): void {
    this.current = [];
    this.loaded = true;
    try {
      localStorage.removeItem(STORAGE.personal);
    } catch {
      // Nothing to remove.
    }
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): void {
    this.loaded = true;
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE.personal) ?? '[]') as unknown;
      this.current = (Array.isArray(parsed) ? parsed : [])
        .map(clean)
        .filter((run): run is PersonalRun => run !== null)
        .sort(byRank)
        .slice(0, RANKING.size);
    } catch {
      this.current = [];
    }
  }
}

export const personal = new PersonalStore();
