/**
 * 기록 동기화 — the signed-in player's records, kept in step with their
 * account on the server (server/save.ts).
 *
 * Everything the game keeps is in localStorage under `exiled-survivors:`; the
 * account holds a copy of those keys (not the ranking board, not this note).
 * This browser remembers, in STORAGE.sync, which account it last agreed with,
 * the server's version it agreed on, and a hash of what it held then. From
 * that, at start-up:
 *
 *   nothing changed on either side      → nothing to do
 *   only this browser changed           → upload
 *   only the account changed            → take it, and reload
 *   both changed (or first sign-in with
 *   records on both sides that differ)  → ask the player which to keep
 *
 * After that it uploads whenever what is held has changed, every
 * ACCOUNT.syncEveryMs and when the tab is hidden. A write that finds the
 * account moved on underneath it (another device) is the same question.
 */
import { ACCOUNT, STORAGE } from '@/config';
import { account, accountRequest } from '@/systems/Account';

const PREFIX = 'exiled-survivors:';

export type SaveData = Record<string, string>;

interface SyncNote {
  readonly user: string;
  /** The server's version this browser last agreed with. */
  readonly at: number;
  /** A hash of what this browser held then. */
  readonly hash: string;
}

/** Two sets of records to choose between. */
export interface Conflict {
  readonly local: SaveData;
  readonly server: SaveData;
  readonly serverAt: number;
}

/** What a set of records amounts to, for the choice between two of them. */
export interface SaveSummary {
  readonly swords: number;
  readonly passiveRanks: number;
  readonly points: number;
  readonly orbs: number;
  readonly bones: number;
  readonly savedRun: boolean;
}

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'error' | 'conflict';

/** The game's keys this browser holds, in a fixed order. */
export function snapshot(): SaveData {
  const out: SaveData = {};
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX) && !ACCOUNT.localOnly.includes(key)) {
      keys.push(key);
    }
  }
  for (const key of keys.sort()) {
    out[key] = localStorage.getItem(key) ?? '';
  }
  return out;
}

/** FNV-1a over the records, in key order: enough to tell two sets apart. */
export function hashOf(data: SaveData): string {
  let h = 0x811c9dc5;
  for (const key of Object.keys(data).sort()) {
    const text = `${key}\u0000${data[key]}\u0001`;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

const isEmpty = (data: SaveData): boolean => Object.keys(data).length === 0;

function parse<T>(text: string | undefined, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Swords, tree, 구슬, 뼈다귀 and whether a run is saved — read off the records. */
export function summarize(data: SaveData): SaveSummary {
  const sum = (record: Record<string, unknown>): number =>
    Object.values(record).reduce<number>((total, value) => total + (Number(value) || 0), 0);
  const gear = parse<{ items?: unknown[] }>(data[STORAGE.gear], {});
  const tree = parse<{ points?: number; ranks?: Record<string, number> }>(data[STORAGE.passives], {});
  return {
    swords: Array.isArray(gear.items) ? gear.items.length : 0,
    passiveRanks: sum(tree.ranks ?? {}),
    points: Number(tree.points) || 0,
    orbs: sum(parse<Record<string, number>>(data[STORAGE.orbs], {})),
    bones: sum(parse<Record<string, number>>(data[STORAGE.bones], {})),
    savedRun: Boolean(data[STORAGE.save]),
  };
}

type Listener = () => void;

class CloudSaveStore {
  public status: SyncStatus = 'off';
  public conflict: Conflict | null = null;
  /** When this browser last agreed with the account. */
  public syncedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private readonly listeners = new Set<Listener>();

  /**
   * Brings this browser and the signed-in account into step, then keeps them
   * there. Resolves once the first look is done (or a reload is under way).
   */
  public async start(): Promise<void> {
    const user = account.user;
    if (!ACCOUNT.enabled || !user) {
      this.stop();
      return;
    }

    this.set('syncing');
    const reply = await accountRequest('/api/save', { cache: 'no-store' });
    const body = reply.body as { data?: SaveData | null; updatedAt?: number } | null;
    if (!reply.ok || !body) {
      this.set('error');
      this.keepGoing();
      return;
    }

    const local = snapshot();
    const server = body.data ?? null;
    const serverAt = Number(body.updatedAt) || 0;
    const note = this.note();
    const known = note && note.user === user.id ? note : null;
    const localChanged = !known || hashOf(local) !== known.hash;
    const serverChanged = !known || serverAt !== known.at;

    if (!server || isEmpty(server)) {
      // Nothing on the account yet: whatever this browser has becomes its.
      if (isEmpty(local)) {
        this.agree(user.id, serverAt, local);
      } else {
        await this.upload(local, serverAt);
      }
    } else if (isEmpty(local)) {
      this.take(server, serverAt);
      return;
    } else if (hashOf(local) === hashOf(server)) {
      this.agree(user.id, serverAt, local);
    } else if (!serverChanged && localChanged) {
      await this.upload(local, serverAt);
    } else if (serverChanged && !localChanged) {
      this.take(server, serverAt);
      return;
    } else {
      this.ask({ local, server, serverAt });
    }
    this.keepGoing();
  }

  /** Stops syncing: signed out, or the account was deleted. */
  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.conflict = null;
    this.set('off');
  }

  /** Signing out: this browser keeps its records, but no longer agrees with anyone. */
  public forget(): void {
    this.stop();
    try {
      localStorage.removeItem(STORAGE.sync);
    } catch {
      // Nothing to forget.
    }
  }

  /** Uploads now if anything changed since the last agreement. */
  public async flush(): Promise<void> {
    const user = account.user;
    const note = this.note();
    if (!user || this.conflict || this.busy || !note || note.user !== user.id) {
      return;
    }
    const local = snapshot();
    if (hashOf(local) !== note.hash) {
      await this.upload(local, note.at);
    }
  }

  /** The player's answer to a conflict. Keeping the account's reloads the page. */
  public async resolve(keep: 'local' | 'server'): Promise<void> {
    const conflict = this.conflict;
    const user = account.user;
    if (!conflict || !user) {
      return;
    }
    this.conflict = null;
    if (keep === 'server') {
      this.take(conflict.server, conflict.serverAt);
      return;
    }
    // This browser's, written over the account's copy as it stands.
    await this.upload(snapshot(), conflict.serverAt);
    this.keepGoing();
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async upload(local: SaveData, base: number): Promise<void> {
    const user = account.user;
    if (!user) {
      return;
    }
    this.busy = true;
    this.set('syncing');
    const reply = await accountRequest('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: local, base }),
    });
    this.busy = false;
    const body = reply.body as { updatedAt?: number; data?: SaveData | null } | null;
    if (reply.ok && body?.updatedAt) {
      this.agree(user.id, body.updatedAt, local);
    } else if (reply.status === 409 && body) {
      // Another device wrote first.
      this.ask({ local, server: body.data ?? {}, serverAt: Number(body.updatedAt) || 0 });
    } else {
      this.set('error');
    }
  }

  /** The account's records, written in place of this browser's — then a fresh start. */
  private take(server: SaveData, serverAt: number): void {
    const user = account.user;
    if (!user) {
      return;
    }
    try {
      const mine: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(PREFIX) && !ACCOUNT.localOnly.includes(key)) {
          mine.push(key);
        }
      }
      mine.forEach((key) => localStorage.removeItem(key));
      for (const [key, value] of Object.entries(server)) {
        if (key.startsWith(PREFIX) && !ACCOUNT.localOnly.includes(key)) {
          // Always text, the way it was kept: anything else would be stored
          // as "[object Object]" and the store behind it would start empty.
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
      }
      this.agree(user.id, serverAt, snapshot());
    } catch {
      this.set('error');
      return;
    }
    // Every store caches what it read; the page starts over on the new records.
    window.location.reload();
  }

  private agree(user: string, at: number, held: SaveData): void {
    const note: SyncNote = { user, at, hash: hashOf(held) };
    try {
      localStorage.setItem(STORAGE.sync, JSON.stringify(note));
    } catch {
      // The next start-up will look again.
    }
    this.syncedAt = Date.now();
    this.set('synced');
  }

  private ask(conflict: Conflict): void {
    this.conflict = conflict;
    this.set('conflict');
  }

  private note(): SyncNote | null {
    try {
      const raw = localStorage.getItem(STORAGE.sync);
      const parsed = raw ? (JSON.parse(raw) as Partial<SyncNote>) : null;
      return parsed && typeof parsed.user === 'string' && typeof parsed.at === 'number' && typeof parsed.hash === 'string'
        ? (parsed as SyncNote)
        : null;
    } catch {
      return null;
    }
  }

  /** Uploads on a clock, and when the tab goes into the background. */
  private keepGoing(): void {
    if (this.timer === null) {
      this.timer = setInterval(() => void this.flush(), ACCOUNT.syncEveryMs);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          void this.flush();
        }
      });
    }
  }

  private set(status: SyncStatus): void {
    this.status = status;
    this.listeners.forEach((listener) => listener());
  }
}

export const cloudSave = new CloudSaveStore();
