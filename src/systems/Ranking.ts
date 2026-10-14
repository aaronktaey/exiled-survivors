import { RANKING, STORAGE } from '@/config';

/** One place on the board. */
export interface RankEntry {
  /** Up to RANKING.nameLength letters, A to Z. */
  readonly name: string;
  /** One of RANKING.emoji, or empty. */
  readonly emoji: string;
  readonly damage: number;
  readonly level: number;
  readonly survivedMs: number;
  /** When it was set, as an ISO string. */
  readonly at: string;
}

/** What a run hands in to be ranked. */
export type RankSubmission = Omit<RankEntry, 'at' | 'name' | 'emoji'> & {
  readonly name: string;
  readonly emoji: string;
};

/** Up to three letters, A to Z, upper case; anything else is dropped. */
export function cleanName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, RANKING.nameLength);
}

/** One of the offered emoji, or none. */
export function cleanEmoji(raw: string): string {
  return (RANKING.emoji as readonly string[]).includes(raw) ? raw : '';
}

/** "ABC 😀", or "???" for a name with nothing in it. */
export function rankLabel(entry: Pick<RankEntry, 'name' | 'emoji'>): string {
  const name = entry.name || '???';
  return entry.emoji ? `${name} ${entry.emoji}` : name;
}

type Listener = (entries: readonly RankEntry[]) => void;

/**
 * 랭킹 — the best runs by damage dealt, best first, RANKING.size of them.
 *
 * It lives on this device, in localStorage, like everything else the
 * survivor keeps. The plan is a board shared between players; when that
 * comes, `load` and `save` turn into requests and the rest — the order, the
 * cut-off, what an entry holds — stays as it is, which is why the screens
 * only ever talk to `top`, `qualifies` and `submit`.
 */
class RankingStore {
  private current: RankEntry[] = [];
  private readonly listeners = new Set<Listener>();
  private loaded = false;
  /** The name last entered, so the next entry starts on it. */
  public lastName = '';
  public lastEmoji = '';

  /** The board, best first. */
  public get top(): readonly RankEntry[] {
    if (!this.loaded) {
      this.load();
    }
    return this.current;
  }

  /** First place, if anyone has set one. */
  public get first(): RankEntry | undefined {
    return this.top[0];
  }

  /**
   * The place a run of this much damage would take, from 1, or 0 when it
   * would not make the board at all. A tie goes below what is already there.
   */
  public placeFor(damage: number): number {
    if (damage <= 0) {
      return 0;
    }
    const board = this.top;
    const above = board.filter((entry) => entry.damage >= damage).length;
    return above < RANKING.size ? above + 1 : 0;
  }

  public qualifies(damage: number): boolean {
    return this.placeFor(damage) > 0;
  }

  /** Puts a run on the board. Returns the place it took, or 0 if none. */
  public submit(run: RankSubmission): number {
    const place = this.placeFor(run.damage);
    if (place === 0) {
      return 0;
    }

    const entry: RankEntry = {
      name: cleanName(run.name),
      emoji: cleanEmoji(run.emoji),
      damage: Math.floor(run.damage),
      level: run.level,
      survivedMs: run.survivedMs,
      at: new Date().toISOString(),
    };
    this.lastName = entry.name;
    this.lastEmoji = entry.emoji;

    const next = [...this.top];
    next.splice(place - 1, 0, entry);
    this.commit(next.slice(0, RANKING.size));
    return place;
  }

  public reset(): void {
    this.commit([]);
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: RankEntry[]): void {
    this.current = next;
    try {
      window.localStorage.setItem(STORAGE.ranking, JSON.stringify(next));
    } catch {
      // The board lasts as long as the tab, then.
    }
    this.listeners.forEach((listener) => listener(this.current));
  }

  /** A hand-edited or stale board cannot break the screen that reads it. */
  private load(): void {
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(STORAGE.ranking);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      this.current = (Array.isArray(parsed) ? parsed : [])
        .filter((e): e is RankEntry => !!e && typeof e === 'object' && Number.isFinite((e as RankEntry).damage))
        .map((e) => ({
          name: cleanName(String(e.name ?? '')),
          emoji: cleanEmoji(String(e.emoji ?? '')),
          damage: Math.max(0, Math.floor(e.damage)),
          level: Number(e.level) || 1,
          survivedMs: Number(e.survivedMs) || 0,
          at: String(e.at ?? ''),
        }))
        .sort((a, b) => b.damage - a.damage)
        .slice(0, RANKING.size);
    } catch {
      this.current = [];
    }
  }
}

export const ranking = new RankingStore();
