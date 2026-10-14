import { RANKING, STORAGE } from '@/config';

/** One place on the board. */
export interface RankEntry {
  /** Up to RANKING.nameLength letters, A to Z. */
  readonly name: string;
  /** One of RANKING.emoji, or empty. */
  readonly emoji: string;
  /** One of RANKING.flags, or empty. */
  readonly flag: string;
  readonly damage: number;
  readonly level: number;
  readonly survivedMs: number;
  /** When it was set, as an ISO string. */
  readonly at: string;
}

/** What a run hands in to be ranked. */
export interface RankSubmission {
  readonly name: string;
  readonly emoji: string;
  readonly flag: string;
  readonly damage: number;
  readonly level: number;
  readonly survivedMs: number;
}

/** Where the board on screen came from. */
export type RankSource = 'local' | 'shared' | 'offline';

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

/** One of the offered flags, or none. */
export function cleanFlag(raw: string): string {
  return (RANKING.flags as readonly string[]).includes(raw) ? raw : '';
}

/** "ABC 😀", or "???" for a name with nothing in it. The flag is drawn apart. */
export function rankLabel(entry: Pick<RankEntry, 'name' | 'emoji'>): string {
  const name = entry.name || '???';
  return entry.emoji ? `${name} ${entry.emoji}` : name;
}

/** The texture a flag is drawn from. */
export const flagTexture = (code: string): string => `tex-flag-${code}`;

/** Two records are the same record when everything that was entered matches. */
const sameEntry = (a: RankEntry, b: RankEntry): boolean =>
  a.at === b.at && a.name === b.name && a.damage === b.damage;

/** Best first, a tie to whoever got there first, cut to the board's size. */
function ordered(entries: readonly RankEntry[]): RankEntry[] {
  const unique: RankEntry[] = [];
  for (const entry of entries) {
    if (!unique.some((held) => sameEntry(held, entry))) {
      unique.push(entry);
    }
  }
  return unique
    .sort((a, b) => b.damage - a.damage || a.at.localeCompare(b.at))
    .slice(0, RANKING.size);
}

/** Reads an entry from anywhere — storage, the network — trusting none of it. */
function clean(raw: unknown): RankEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const e = raw as Record<string, unknown>;
  const damage = Math.floor(Number(e.damage));
  if (!Number.isFinite(damage) || damage <= 0 || damage > RANKING.shared.maxDamage) {
    return null;
  }
  return {
    name: cleanName(String(e.name ?? '')),
    emoji: cleanEmoji(String(e.emoji ?? '')),
    flag: cleanFlag(String(e.flag ?? '')),
    damage,
    level: Math.max(1, Math.floor(Number(e.level) || 1)),
    survivedMs: Math.max(0, Math.floor(Number(e.survivedMs) || 0)),
    at: String(e.at ?? ''),
  };
}

type Listener = (entries: readonly RankEntry[]) => void;

/**
 * 랭킹 — the best runs by damage dealt, best first, RANKING.size of them.
 *
 * Every board is kept on this device, so it opens at once and survives
 * having no connection. On top of that it is shared, for now, through one
 * object on a free public store (RANKING.shared): `refresh` pulls the
 * shared board and folds it into the local one, and `submit` puts a run on
 * the local board at once and then folds the two together and writes the
 * result back. Two runs entered at the same moment can overwrite each other
 * — a stopgap's price, until there is a server of our own.
 *
 * The screens only ever touch `top`, `placeFor`, `submit`, `refresh` and
 * `source`, which is what lets the store change underneath them.
 */
class RankingStore {
  private current: RankEntry[] = [];
  private readonly listeners = new Set<Listener>();
  private loaded = false;
  /** Where the board on screen last came from. */
  public source: RankSource = 'local';
  /** The name last entered, so the next entry starts on it. */
  public lastName = '';
  public lastEmoji = '';
  public lastFlag = '';

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
    const above = this.top.filter((entry) => entry.damage >= damage).length;
    return above < RANKING.size ? above + 1 : 0;
  }

  public qualifies(damage: number): boolean {
    return this.placeFor(damage) > 0;
  }

  /**
   * Puts a run on the board here at once, then on the shared board. Returns
   * the place it took on the board as this device knows it, or 0.
   */
  public submit(run: RankSubmission): number {
    const place = this.placeFor(run.damage);
    if (place === 0) {
      return 0;
    }

    const entry = clean({ ...run, at: new Date().toISOString() });
    if (!entry) {
      return 0;
    }
    this.lastName = entry.name;
    this.lastEmoji = entry.emoji;
    this.lastFlag = entry.flag;

    this.commit(ordered([...this.top, entry]));
    void this.push();
    return place;
  }

  /** Pulls the shared board and folds it into this one. */
  public async refresh(): Promise<RankSource> {
    if (!RANKING.shared.enabled) {
      this.source = 'local';
      return this.source;
    }

    const remote = await this.pull();
    if (remote === null) {
      this.source = 'offline';
      this.notify();
      return this.source;
    }

    this.source = 'shared';
    this.commit(ordered([...this.top, ...remote]));
    return this.source;
  }

  public reset(): void {
    this.commit([]);
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Folds the shared board and this one together and writes the result back. */
  private async push(): Promise<void> {
    if (!RANKING.shared.enabled) {
      return;
    }

    const remote = await this.pull();
    if (remote === null) {
      this.source = 'offline';
      this.notify();
      return;
    }

    const merged = ordered([...remote, ...this.top]);
    this.commit(merged);
    const ok = await this.request('PUT', {
      name: RANKING.shared.name,
      data: { v: 1, entries: merged },
    });
    this.source = ok ? 'shared' : 'offline';
    this.notify();
  }

  /** The shared board's entries, or null when it cannot be reached. */
  private async pull(): Promise<RankEntry[] | null> {
    const body = await this.request('GET');
    if (!body || typeof body !== 'object') {
      return null;
    }
    const entries = (body as { data?: { entries?: unknown } }).data?.entries;
    return (Array.isArray(entries) ? entries : [])
      .map(clean)
      .filter((entry): entry is RankEntry => entry !== null);
  }

  /** One request to the shared store, given up on after RANKING.shared.timeoutMs. */
  private async request(method: 'GET' | 'PUT', payload?: unknown): Promise<unknown> {
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = setTimeout(() => controller?.abort(), RANKING.shared.timeoutMs);
    try {
      const response = await fetch(RANKING.shared.url, {
        method,
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller?.signal,
      });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private commit(next: RankEntry[]): void {
    this.current = next;
    try {
      window.localStorage.setItem(STORAGE.ranking, JSON.stringify(next));
    } catch {
      // The board lasts as long as the tab, then.
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.current));
  }

  /** A hand-edited or stale board cannot break the screen that reads it. */
  private load(): void {
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(STORAGE.ranking);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      this.current = ordered(
        (Array.isArray(parsed) ? parsed : [])
          .map(clean)
          .filter((entry): entry is RankEntry => entry !== null),
      );
    } catch {
      this.current = [];
    }
  }
}

export const ranking = new RankingStore();
