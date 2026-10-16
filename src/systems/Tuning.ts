/**
 * 밸런스 다이얼 — the values laid over balance.ts while the game runs.
 *
 * Three layers, the later winning:
 *   1. balance.ts as built (captured here before anything is laid over it)
 *   2. everyone's — what the admin made everyone's, from /api/balance
 *   3. the admin's draft — their own experiment, on this browser only
 *
 * A value is written straight into the config table it belongs to, so every
 * system that reads the table sees it at once. Everyone's values change only
 * on the title (`settle`), never in the middle of a run; the admin's draft
 * changes the moment a dial turns, and a run that saw one is kept off both
 * boards (GameScene.devRun).
 */
import type Phaser from 'phaser';

import {
  ALTAR,
  BALANCE,
  BONES,
  BOSS,
  DIALS,
  DIFFICULTY,
  ENEMY_KINDS,
  GEAR,
  MANGO,
  ORBS,
  PLAYER,
  POTION,
  RARE,
  SCENES,
  SHARD,
  SKILL_BASE,
  SKILL_DROP,
  SKILL_PICK,
  SPAWN,
  TUNING,
  UPGRADE_PERCENT,
  type DialSpec,
} from '@/config';
import { accountRequest } from '@/systems/Account';
import { devToolsAllowed } from '@/systems/DevAccess';

type Listener = (path: string, was: number, now: number) => void;

const ROOTS: Record<string, unknown> = {
  ALTAR, BALANCE, BONES, BOSS, DIFFICULTY, ENEMY_KINDS, GEAR, MANGO, ORBS, PLAYER, POTION, RARE,
  SHARD, SKILL_BASE, SKILL_DROP, SKILL_PICK, SPAWN, UPGRADE_PERCENT,
};

/** The object a path's value sits on, and its key there. */
function locate(path: string): { holder: Record<string, number>; key: string } | null {
  const parts = path.split('.');
  const key = parts.pop();
  let at: unknown = ROOTS[parts.shift() ?? ''];
  for (const part of parts) {
    at = (at as Record<string, unknown> | undefined)?.[part];
  }
  return at && typeof at === 'object' && key && typeof (at as Record<string, unknown>)[key] === 'number'
    ? { holder: at as Record<string, number>, key }
    : null;
}

/** balance.ts as built, before anything is laid over it. */
const DEFAULTS = new Map<string, number>(
  DIALS.flatMap((dial) => {
    const spot = locate(dial.path);
    return spot ? [[dial.path, spot.holder[spot.key]!] as [string, number]] : [];
  }),
);

class TuningStore {
  /** Everyone's values, as the server last gave them. */
  public shared: Record<string, number> = {};
  /** When they were made everyone's (ms), 0 if never. */
  public sharedAt = 0;
  /** The admin's own experiment. */
  public draft: Record<string, number> = {};
  private incoming: { overrides: Record<string, number>; updatedAt: number } | null = null;
  private game?: Phaser.Game;
  private readonly listeners = new Set<Listener>();

  public constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(TUNING.draftKey) ?? '{}') as Record<string, unknown>;
      for (const [path, value] of Object.entries(raw)) {
        if (DEFAULTS.has(path) && typeof value === 'number' && Number.isFinite(value)) {
          this.draft[path] = value;
        }
      }
    } catch {
      // No draft.
    }
  }

  /** The admin is trying values no one else has. */
  public get drafting(): boolean {
    return devToolsAllowed() && Object.keys(this.draft).length > 0;
  }

  public defaultOf(path: string): number {
    return DEFAULTS.get(path) ?? 0;
  }

  /** What everyone plays on. */
  public sharedOf(path: string): number {
    return this.shared[path] ?? this.defaultOf(path);
  }

  /** What this game is playing on right now. */
  public valueOf(path: string): number {
    const spot = locate(path);
    return spot ? spot.holder[spot.key]! : 0;
  }

  /** Where a dial runs from and to, and how far one notch moves it. */
  public range(dial: DialSpec): { min: number; max: number; step: number } {
    const base = this.defaultOf(dial.path);
    const min = dial.min ?? 0;
    const max = Math.max(min + 1e-9, dial.max ?? Math.max(base * (dial.maxFactor ?? 3), min + 1));
    // A round notch — 1, 0.01, 0.0001 — about a two-hundredth of the sweep,
    // so a turned value reads as a number someone would type.
    const step = dial.kind === 'count' ? 1 : Math.max(dial.kind === 'ms' ? 10 : 1e-6, 10 ** Math.floor(Math.log10((max - min) / 200)));
    return { min, max, step };
  }

  /** Turns a dial on this game: the admin's draft, at once. */
  public set(path: string, value: number): void {
    if (!DEFAULTS.has(path)) {
      return;
    }
    const dial = DIALS.find((d) => d.path === path)!;
    const { min, max, step } = this.range(dial);
    let next = Math.min(max, Math.max(min, value));
    next = dial.kind === 'count' ? Math.round(next) : Math.round(next / step) * step;
    next = Number(next.toPrecision(6));
    if (Math.abs(next - this.sharedOf(path)) < 1e-12) {
      delete this.draft[path];
    } else {
      this.draft[path] = next;
    }
    this.saveDraft();
    this.apply([path]);
  }

  /** Back to everyone's values. */
  public clearDraft(): void {
    const paths = Object.keys(this.draft);
    this.draft = {};
    this.saveDraft();
    this.apply(paths);
  }

  /** Asks the server for everyone's values. Laid over at once unless a run is on. */
  public async load(game?: Phaser.Game): Promise<void> {
    this.game = game ?? this.game;
    const reply = await accountRequest('/api/balance', { cache: 'no-store' });
    const body = reply.body as { overrides?: Record<string, number>; updatedAt?: number } | null;
    if (!reply.ok || !body) {
      return;
    }
    this.incoming = { overrides: body.overrides ?? {}, updatedAt: Number(body.updatedAt) || 0 };
    if (!this.game?.scene.isActive(SCENES.game)) {
      this.settle();
    }
  }

  /** On the title: everyone's newest values, and the draft over them (for the admin). */
  public settle(): void {
    if (this.incoming) {
      const paths = new Set([...Object.keys(this.shared), ...Object.keys(this.incoming.overrides)]);
      this.shared = { ...this.incoming.overrides };
      this.sharedAt = this.incoming.updatedAt;
      this.incoming = null;
      this.apply([...paths, ...Object.keys(this.draft)]);
      return;
    }
    this.apply(Object.keys(this.draft));
  }

  /** Makes the draft everyone's. */
  public async publish(): Promise<boolean> {
    const overrides = { ...this.shared, ...this.draft };
    // A value turned back to where balance.ts has it needs no override.
    for (const [path, value] of Object.entries(overrides)) {
      if (Math.abs(value - this.defaultOf(path)) < 1e-12) {
        delete overrides[path];
      }
    }
    const reply = await accountRequest('/api/balance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides }),
    });
    const body = reply.body as { overrides?: Record<string, number>; updatedAt?: number } | null;
    if (!reply.ok || !body?.overrides) {
      return false;
    }
    this.shared = body.overrides;
    this.sharedAt = Number(body.updatedAt) || Date.now();
    this.draft = {};
    this.saveDraft();
    this.apply(DIALS.map((d) => d.path));
    return true;
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Writes what each path should be into its table, and says what moved. */
  private apply(paths: readonly string[]): void {
    const useDraft = devToolsAllowed();
    for (const path of new Set(paths)) {
      const spot = locate(path);
      if (!spot) {
        continue;
      }
      const want = (useDraft ? this.draft[path] : undefined) ?? this.sharedOf(path);
      const was = spot.holder[spot.key]!;
      if (was !== want) {
        spot.holder[spot.key] = want;
        this.listeners.forEach((listener) => listener(path, was, want));
      }
    }
  }

  private saveDraft(): void {
    try {
      if (Object.keys(this.draft).length === 0) {
        localStorage.removeItem(TUNING.draftKey);
      } else {
        localStorage.setItem(TUNING.draftKey, JSON.stringify(this.draft));
      }
    } catch {
      // Kept for this visit only.
    }
  }
}

export const tuning = new TuningStore();
