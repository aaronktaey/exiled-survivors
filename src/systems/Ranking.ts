import { ACCOUNT, RANKING, STORAGE, rankingDayStart } from '@/config';
import { forfeitLoot } from '@/systems/RunLoot';
import type { RunLoot } from '@/systems/SaveGame';
import { account, accountRequest } from '@/systems/Account';
import { turnstileToken } from '@/systems/Turnstile';
import { apiUrl } from '@/systems/Platform';

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
  /** And second, and third. */
  readonly seconds: number;
  readonly thirds: number;
}

/**
 * 판 내역: what a run says about itself when it is handed in — kept by the
 * server for the admin's review, never shown on the board. The server keeps
 * only these fields, in these shapes (server/ranking.ts cleanDetail).
 */
export interface RunDetail {
  /** The build it was played on (version.json's `build`), 'dev' locally. */
  readonly build: string;
  /** The patch note version it was played on. */
  readonly version: string;
  /** Kills by enemy kind; `boss` is the 우두머리. */
  readonly kills: Readonly<Record<string, number>>;
  /** The 뼈다귀 the run was started with. */
  readonly bones: readonly string[];
  /** The weapon it went out with. */
  readonly gear: {
    readonly id: string;
    readonly prefixes: readonly { readonly id: string; readonly tier: number }[];
    readonly suffixes: readonly { readonly id: string; readonly tier: number }[];
  } | null;
  readonly skills: readonly { readonly id: string; readonly level: number }[];
  /** 패시브 ranks. */
  readonly passives: Readonly<Record<string, number>>;
  /** It was picked up again from a save. */
  readonly resumed: boolean;
  /** The run's second clock, in ms (systems/RunLedger.ts): the server weighs it against the shown one. */
  readonly wall: number;
  /** The ranking day whose 오늘의 규칙 it played under (0.126): the server checks its banned skill. */
  readonly rules?: number | null;
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
  /** What the run says about itself, for the admin's review. */
  readonly detail?: RunDetail;
  /**
   * What the run put in the drawers (0.134). Never sent: kept beside the run
   * (in the outbox, across a sign-in) so the server turning it down as out of
   * reach takes it back.
   */
  readonly loot?: RunLoot;
}

/** The server's answers that mean the run itself could not have happened: its loot goes back. */
const FORFEITS = new Set(['refused', 'pace', 'damage', 'level']);

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
export function cleanRankEntry(raw: unknown): RankEntry | null {
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
    seconds: Math.max(0, Math.floor(Number(e.seconds) || 0)),
    thirds: Math.max(0, Math.floor(Number(e.thirds) || 0)),
  };
}

/** The entries in a reply from the server, or null when it is not a board. */
function entriesOf(body: unknown): RankEntry[] | null {
  const entries = (body as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) {
    return null;
  }
  return entries.map(cleanRankEntry).filter((entry): entry is RankEntry => entry !== null);
}

/** When the server read the board it sent (server time), or null from a server before 0.113. */
function asOfOf(body: unknown): number | null {
  const asOf = Number((body as { asOf?: unknown } | null)?.asOf);
  return Number.isFinite(asOf) && asOf > 0 ? asOf : null;
}

/** The same run: what the player did, whatever time either side stamped on it. */
const sameRun = (a: RankEntry, b: { name: string; damage: number; level: number; survivedMs: number }): boolean =>
  a.name === b.name && a.damage === b.damage && a.level === b.level && a.survivedMs === b.survivedMs;

/** A run handed in and not yet answered: what was sent, the board's day, and whose it was. */
interface Outbox {
  readonly run: RankSubmission;
  readonly day: number;
  readonly user: string;
}

/** The account's run the server took, as the board shows it, and when the server had it. */
interface Mine {
  readonly entry: RankEntry;
  readonly asOf: number;
  readonly day: number;
  readonly user: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Kept for this visit only, then.
  }
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
 *
 * Two things keep a run that went in from going missing (0.113 — a run
 * vanished from its own player's board after a reload onto a new version):
 * it waits in an outbox (STORAGE.rankOutbox) until the server answers, so a
 * page that went first hands it in again, and the title holds a new version
 * back while one is waiting (`busy`); and once the server has it, the run is
 * kept (STORAGE.rankMine) on any board read before it — the edge's copy of
 * the board is per data centre, so one from before the run can still come
 * back for a few seconds, and it used to replace the board here outright.
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
  /** A run being handed in right now. */
  private inFlight = false;

  /** A run is on its way, or waiting to go again: the page should not reload under it. */
  public get busy(): boolean {
    return this.inFlight || this.outbox() !== null;
  }

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

    const entry = cleanRankEntry({ ...run, at: new Date().toISOString() });
    if (!entry) {
      return 0;
    }
    this.remember(entry.name, entry.emoji, entry.flag);

    this.commit(ordered([...this.top, entry]));
    // Handed in as the cleaned entry: whole numbers, the way the server
    // takes them. A run's time is a sum of frame times, never a whole one.
    const handed: RankSubmission = {
      name: entry.name,
      emoji: entry.emoji,
      flag: entry.flag,
      damage: entry.damage,
      level: entry.level,
      survivedMs: entry.survivedMs,
      skill: entry.skill,
      detail: run.detail,
      loot: run.loot,
    };
    // Written down before it goes, so a page that reloads first sends it again.
    if (RANKING.shared.enabled) {
      writeJson(STORAGE.rankOutbox, { run: handed, day: rankingDayStart(Date.now()), user: account.user?.id ?? '' } satisfies Outbox);
    }
    void this.push(handed);
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
    this.commit(ordered(this.keepMine(remote.entries, remote.asOf)));
    await this.lookUpMine();
    // A run the page went before hearing back about: handed in again now.
    const waiting = this.outbox();
    if (waiting && !this.inFlight && account.signedIn && (account.user?.id ?? '') === waiting.user) {
      void this.push(waiting.run);
    }
    return this.source;
  }

  /** Today's run waiting to be handed in by this account, or null (one from another day is let go). */
  private outbox(): Outbox | null {
    const waiting = readJson<Outbox>(STORAGE.rankOutbox);
    if (!waiting || !waiting.run || waiting.day !== rankingDayStart(Date.now())) {
      if (waiting) {
        writeJson(STORAGE.rankOutbox, null);
      }
      return null;
    }
    return waiting;
  }

  /**
   * A board, with this account's run that the server took kept on it when the
   * board was read before the server had it (an edge copy from before) — in
   * place of whatever row this account had there. A board read after it is
   * left as it is: if the run is not there, it was taken off.
   */
  private keepMine(entries: RankEntry[], asOf: number | null): RankEntry[] {
    const mine = readJson<Mine>(STORAGE.rankMine);
    const today = rankingDayStart(Date.now());
    if (!mine || !mine.entry || mine.day !== today || (account.user?.id ?? '') !== mine.user) {
      return entries;
    }
    if (entries.some((entry) => sameRun(entry, mine.entry)) || (asOf !== null && asOf >= mine.asOf)) {
      return entries;
    }
    const entry = cleanRankEntry(mine.entry);
    return entry ? [...entries.filter((row) => row.name !== entry.name), entry] : entries;
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

    this.inFlight = true;
    let reply: { ok: boolean; status: number; body: unknown };
    try {
      const token = await turnstileToken(RANKING.shared.turnstileSiteKey, RANKING.shared.timeoutMs);
      const { loot: _kept, ...sent } = run;
      reply = await this.request('POST', { ...sent, token: token ?? '' });
    } finally {
      this.inFlight = false;
    }
    if (reply.status === 0) {
      // No connection: the run stays on this device's board, and in the outbox.
      this.source = 'offline';
      this.notify();
      return;
    }
    // Answered — taken or turned down — so it does not go again. Signed out,
    // it waits for the account to come back.
    if (reply.status !== 401) {
      writeJson(STORAGE.rankOutbox, null);
    }

    const entries = reply.ok ? entriesOf(reply.body) : null;
    if (entries) {
      this.source = 'shared';
      const now = Date.now();
      const today = this.myBestDay === rankingDayStart(now) ? this.myBest : null;
      this.myBest = Math.max(today ?? 0, run.damage);
      this.myBestDay = rankingDayStart(now);
      // The run as the board shows it, if it is this account's row there now.
      const shown = entries.find((entry) => sameRun(entry, run));
      if (shown) {
        writeJson(STORAGE.rankMine, {
          entry: shown,
          asOf: asOfOf(reply.body) ?? now,
          day: rankingDayStart(now),
          user: account.user?.id ?? '',
        } satisfies Mine);
      }
      this.commit(ordered(entries));
      return;
    }
    // Turned down as a run that could not have happened: what it found goes back.
    const error = (reply.body as { error?: unknown } | null)?.error;
    if (run.loot && typeof error === 'string' && FORFEITS.has(error)) {
      forfeitLoot(run.loot);
    }
    // Turned down: the server's board, without it, is the one to show.
    await this.refresh();
  }

  /** The server's board and when it was read, or null when it cannot be reached. */
  private async pull(): Promise<{ entries: RankEntry[]; asOf: number | null } | null> {
    const reply = await this.request('GET');
    const entries = reply.ok ? entriesOf(reply.body) : null;
    return entries ? { entries, asOf: asOfOf(reply.body) } : null;
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
      const response = await fetch(apiUrl(RANKING.shared.url), {
        method,
        // Never the browser's copy: an old board kept for hours was what a PC showed.
        cache: 'no-store',
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
          .map(cleanRankEntry)
          .filter((entry): entry is RankEntry => entry !== null),
      );
    } catch {
      this.current = [];
    }
  }
}

export const ranking = new RankingStore();
