import { ACCOUNT, RANKING, STORAGE, rankingDayStart } from '@/config';
import { account, accountRequest } from '@/systems/Account';
import { turnstileToken } from '@/systems/Turnstile';

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
  /** The skill the run was played on (its first, main skill), or empty. */
  readonly skill: string;
  /** How many days the account behind it finished first on the shared board. */
  readonly wins: number;
}

/** What a run hands in to be ranked. */
export interface RankSubmission {
  readonly name: string;
  readonly emoji: string;
  readonly flag: string;
  readonly damage: number;
  readonly level: number;
  readonly survivedMs: number;
  /** The run's main skill. */
  readonly skill?: string;
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

/**
 * Today's entries, best first, a tie to whoever got there first, cut to the
 * board's size — so one from before the reset never holds a place.
 */
function ordered(entries: readonly RankEntry[]): RankEntry[] {
  const since = rankingDayStart(Date.now());
  const unique: RankEntry[] = [];
  for (const entry of entries) {
    if (!(Date.parse(entry.at) >= since)) {
      continue;
    }
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
    skill: /^[A-Za-z]{1,32}$/.test(String(e.skill ?? '')) ? String(e.skill) : '',
    wins: Math.max(0, Math.floor(Number(e.wins) || 0)),
  };
}

/** The entries in a reply from the server, or null when it is not a board. */
function entriesOf(body: unknown): RankEntry[] | null {
  const entries = (body as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) {
    return null;
  }
  return entries.map(clean).filter((entry): entry is RankEntry => entry !== null);
}

type Listener = (entries: readonly RankEntry[]) => void;

/**
 * 랭킹 — the best runs by damage dealt, best first, RANKING.size of them.
 *
 * Every board is kept on this device, so it opens at once and survives
 * having no connection. The board that counts is the server's (the game's
 * Worker, RANKING.shared): `refresh` fetches it and it replaces this
 * device's, and `submit` puts a run on this device's board at once, hands
 * it in, and takes the board the server sends back. A run the server turns
 * down — a typed-in number, too many too fast — is dropped again by the
 * next board it sends.
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
  /** The name last entered, so the next entry starts on it — kept across visits. */
  public lastName = '';
  public lastEmoji = '';
  public lastFlag = '';
  /**
   * The signed-in account's best on the shared board, once known: a run that
   * does not beat it would change nothing there, so it is not offered.
   */
  public myBest: number | null = null;
  /** The board's day `myBest` was read on (rankingDayStart). */
  private myBestDay = 0;
  private namesLoaded = false;

  /**
   * The board, best first — today's only. The shared board starts over at
   * RANKING.dailyReset, and so does whatever this device kept of it.
   */
  public get top(): readonly RankEntry[] {
    if (!this.loaded) {
      this.load();
    }
    const since = rankingDayStart(Date.now());
    return this.current.filter((entry) => Date.parse(entry.at) >= since);
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

  /**
   * Whether ending on this much damage is worth entering: it makes the board,
   * and — the board holding each account's best once — it beats this
   * account's own best there.
   */
  public qualifies(damage: number): boolean {
    // A best from before the reset is no longer on the board.
    const best = this.myBestDay === rankingDayStart(Date.now()) ? this.myBest : null;
    return this.placeFor(damage) > 0 && (best === null || damage > best);
  }

  /** The name, emoji and flag last entered, read back from storage once. */
  public remembered(): { name: string; emoji: string; flag: string } {
    if (!this.namesLoaded) {
      this.namesLoaded = true;
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE.rankName) ?? 'null') as
          | { name?: string; emoji?: string; flag?: string }
          | null;
        if (saved) {
          this.lastName = cleanName(String(saved.name ?? ''));
          this.lastEmoji = cleanEmoji(String(saved.emoji ?? ''));
          this.lastFlag = cleanFlag(String(saved.flag ?? ''));
        }
      } catch {
        // Nothing remembered.
      }
    }
    return { name: this.lastName, emoji: this.lastEmoji, flag: this.lastFlag };
  }

  /** Remembers what was entered, so the next entry starts on it. */
  public remember(name: string, emoji: string, flag: string): void {
    this.namesLoaded = true;
    this.lastName = cleanName(name);
    this.lastEmoji = cleanEmoji(emoji);
    this.lastFlag = cleanFlag(flag);
    try {
      localStorage.setItem(
        STORAGE.rankName,
        JSON.stringify({ name: this.lastName, emoji: this.lastEmoji, flag: this.lastFlag }),
      );
    } catch {
      // Remembered for this visit only.
    }
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
    this.remember(entry.name, entry.emoji, entry.flag);

    this.commit(ordered([...this.top, entry]));
    // Handed in as the cleaned entry: whole numbers, the way the server
    // takes them. A run's time is a sum of frame times, never a whole one.
    void this.push({
      name: entry.name,
      emoji: entry.emoji,
      flag: entry.flag,
      damage: entry.damage,
      level: entry.level,
      survivedMs: entry.survivedMs,
      skill: entry.skill,
    });
    return place;
  }

  /** Fetches the server's board, which becomes this device's. */
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
    this.commit(ordered(remote));
    await this.lookUpMine();
    return this.source;
  }

  /** The signed-in account's own best on the shared board, or null. */
  private async lookUpMine(): Promise<void> {
    if (!ACCOUNT.enabled || !account.signedIn) {
      this.myBest = null;
      this.myBestDay = rankingDayStart(Date.now());
      return;
    }
    const reply = await accountRequest('/api/ranking/me', { cache: 'no-store' });
    const best = (reply.body as { best?: { damage?: number } | null } | null)?.best;
    this.myBest = reply.ok && best ? Number(best.damage) || null : null;
    this.myBestDay = rankingDayStart(Date.now());
  }

  public reset(): void {
    this.commit([]);
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Hands the run in, and takes the board the server answers with. */
  private async push(run: RankSubmission): Promise<void> {
    if (!RANKING.shared.enabled) {
      return;
    }

    const token = await turnstileToken(RANKING.shared.turnstileSiteKey, RANKING.shared.timeoutMs);
    const reply = await this.request('POST', { ...run, token: token ?? '' });
    if (reply.status === 0) {
      // No connection: the run stays on this device's board.
      this.source = 'offline';
      this.notify();
      return;
    }

    const entries = reply.ok ? entriesOf(reply.body) : null;
    if (entries) {
      this.source = 'shared';
      const today = this.myBestDay === rankingDayStart(Date.now()) ? this.myBest : null;
      this.myBest = Math.max(today ?? 0, run.damage);
      this.myBestDay = rankingDayStart(Date.now());
      this.commit(ordered(entries));
      return;
    }
    // Turned down: the server's board, without it, is the one to show.
    await this.refresh();
  }

  /** The server's board, or null when it cannot be reached. */
  private async pull(): Promise<RankEntry[] | null> {
    const reply = await this.request('GET');
    return reply.ok ? entriesOf(reply.body) : null;
  }

  /**
   * One request to the server, given up on after RANKING.shared.timeoutMs.
   * `status` is 0 when it never answered at all.
   */
  private async request(
    method: 'GET' | 'POST',
    payload?: unknown,
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = setTimeout(() => controller?.abort(), RANKING.shared.timeoutMs);
    try {
      const response = await fetch(RANKING.shared.url, {
        method,
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller?.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status, body };
    } catch {
      return { ok: false, status: 0, body: null };
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
