import {
  ACCOUNT_LEVEL,
  ECONOMY,
  PASSIVE_NODES,
  PASSIVE_RESPEC,
  PASSIVE_START,
  STORAGE,
  type KeystoneId,
  type PassiveId,
} from '@/config';
import { gold } from '@/systems/Gold';
import { StatSheet } from '@/systems/StatSheet';
import { openRecord, sealRecord } from '@/systems/Seal';

/** The tree and what feeds it, kept between runs. */
export interface PassiveState {
  readonly version: 2;
  /** 신성한 조각 held: what taking a node back costs. */
  readonly shards: number;
  /** Account experience: every run's gems, added up. */
  readonly xp: number;
  /** Points owed from before the graph tree (the old ranks, given back), on top of the level's. */
  readonly bonusPoints: number;
  /** Nodes taken, the start not counted. */
  readonly allocated: readonly PassiveId[];
}

/** Where an account level stands: the level, and the experience into and needed for the next. */
export interface AccountLevel {
  readonly level: number;
  readonly into: number;
  readonly need: number;
}

/** Experience to leave account level `level`. */
export const accountXpToLeave = (level: number): number =>
  Math.round(ACCOUNT_LEVEL.base * Math.pow(level, ACCOUNT_LEVEL.power));

/** The account level a pot of experience reaches. */
export function accountLevelFor(xp: number): AccountLevel {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (level < ACCOUNT_LEVEL.maxLevel && left >= accountXpToLeave(level)) {
    left -= accountXpToLeave(level);
    level += 1;
  }
  return { level, into: left, need: level >= ACCOUNT_LEVEL.maxLevel ? 0 : accountXpToLeave(level) };
}

const DEFAULTS: PassiveState = { version: 2, shards: 0, xp: 0, bonusPoints: 0, allocated: [] };

type Listener = (state: PassiveState) => void;

/** What a set of nodes adds up to. */
export function passiveSheetFor(allocated: readonly PassiveId[]): StatSheet {
  const nodes = allocated.map((id) => PASSIVE_NODES[id]).filter((node) => node !== undefined);
  return new StatSheet(
    nodes.flatMap((node) => node.mods),
    nodes.map((node) => node.keystone).filter((k): k is KeystoneId => k !== undefined),
  );
}

/**
 * The passive tree's own state, kept beside the equipment stash: both
 * outlive a run on purpose, and both are spent on the title screen.
 *
 * A node can be taken while a point is free and it touches one already
 * taken (or the start); taken back for a 신성한 조각 while nothing else is
 * cut off from the start by it.
 */
class PassiveStore {
  private current: PassiveState = { ...DEFAULTS };
  private readonly listeners = new Set<Listener>();
  private loaded = false;
  private cachedSheet: StatSheet | null = null;

  public get value(): PassiveState {
    if (!this.loaded) {
      this.load();
    }
    return this.current;
  }

  /** What the tree is worth, for a run starting now. */
  public get sheet(): StatSheet {
    this.cachedSheet ??= passiveSheetFor(this.value.allocated);
    return this.cachedSheet;
  }

  public get account(): AccountLevel {
    return accountLevelFor(this.value.xp);
  }

  /** Every point the account has: one a level past the first, and the old tree's. */
  public get totalPoints(): number {
    return this.account.level - 1 + this.value.bonusPoints;
  }

  public get freePoints(): number {
    return Math.max(0, this.totalPoints - this.value.allocated.length);
  }

  public isAllocated(id: PassiveId): boolean {
    return id === PASSIVE_START || this.value.allocated.includes(id);
  }

  /** Touches the start or a node already taken. */
  public isReachable(id: PassiveId): boolean {
    return PASSIVE_NODES[id]?.links.some((link) => this.isAllocated(link)) ?? false;
  }

  public canAllocate(id: PassiveId): boolean {
    return PASSIVE_NODES[id] !== undefined && !this.isAllocated(id) && this.freePoints > 0 && this.isReachable(id);
  }

  public allocate(id: PassiveId): boolean {
    if (!this.canAllocate(id)) {
      return false;
    }
    this.commit({ ...this.value, allocated: [...this.value.allocated, id] });
    return true;
  }

  /** Whether taking it back would leave every other node still joined to the start. */
  public isLeaf(id: PassiveId): boolean {
    if (id === PASSIVE_START || !this.value.allocated.includes(id)) {
      return false;
    }
    const keep = new Set(this.value.allocated.filter((other) => other !== id));
    const seen = new Set<PassiveId>([PASSIVE_START]);
    const queue: PassiveId[] = [PASSIVE_START];
    while (queue.length > 0) {
      const at = queue.pop()!;
      for (const next of PASSIVE_NODES[at]?.links ?? []) {
        if (keep.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return [...keep].every((other) => seen.has(other));
  }

  public canRefund(id: PassiveId): boolean {
    return this.isLeaf(id) && this.value.shards >= PASSIVE_RESPEC.shardCost;
  }

  /** Takes a node back for a 신성한 조각; its point is free again. */
  public refund(id: PassiveId): boolean {
    if (!this.canRefund(id)) {
      return false;
    }
    this.commit({
      ...this.value,
      shards: this.value.shards - PASSIVE_RESPEC.shardCost,
      allocated: this.value.allocated.filter((other) => other !== id),
    });
    return true;
  }

  /** One 신성한 조각, as a 우두머리 left it. */
  public addShard(): void {
    this.commit({ ...this.value, shards: this.value.shards + 1 });
  }

  /** Buys one 신성한 조각 with gold. */
  public buyShard(): boolean {
    if (!gold.spend(ECONOMY.shardPrice)) {
      return false;
    }
    this.addShard();
    return true;
  }

  /** A run's experience, into the account. Returns the levels before and after. */
  public addXp(amount: number): { before: number; after: number } {
    const before = this.account.level;
    const gained = Math.max(0, Math.floor(amount));
    if (gained > 0) {
      this.commit({ ...this.value, xp: this.value.xp + gained });
    }
    return { before, after: this.account.level };
  }

  public reset(): PassiveState {
    this.commit({ ...DEFAULTS });
    return this.current;
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: PassiveState): void {
    this.current = PassiveStore.sanitise(next);
    this.cachedSheet = null;
    this.save();
    this.listeners.forEach((listener) => listener(this.current));
  }

  private load(): void {
    this.loaded = true;
    this.cachedSheet = null;
    try {
      const raw = window.localStorage.getItem(STORAGE.passives);
      // A tree changed outside the game starts over; one from before the
      // seal is taken and written back sealed.
      const opened = raw ? openRecord<Partial<PassiveState>>(STORAGE.passives, raw) : null;
      this.current = opened && opened.state !== 'tampered' ? PassiveStore.sanitise(opened.value) : { ...DEFAULTS };
      if (opened && opened.state !== 'sealed') {
        this.save();
      }
    } catch {
      this.current = { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE.passives, sealRecord(STORAGE.passives, this.current));
    } catch {
      // The tree lasts as long as the tab, then.
    }
  }

  /**
   * A hand-edited payload cannot take a node that does not exist or is not
   * joined to the start; one from before the graph tree (ranks and points)
   * comes back as points to spend again, its shards kept.
   */
  private static sanitise(raw: Partial<PassiveState> & { ranks?: Record<string, number>; points?: number }): PassiveState {
    const whole = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
    if (raw.version !== 2) {
      const ranks = Object.values(raw.ranks ?? {}).reduce((sum, rank) => sum + whole(rank), 0);
      return { ...DEFAULTS, shards: whole(raw.shards), bonusPoints: whole(raw.points) + ranks };
    }

    // Kept in the order taken, and only while joined to what came before.
    const allocated: PassiveId[] = [];
    const taken = new Set<PassiveId>([PASSIVE_START]);
    let pending = [...new Set((raw.allocated ?? []).filter((id) => id !== PASSIVE_START && PASSIVE_NODES[id]))];
    let grew = true;
    while (grew) {
      grew = false;
      pending = pending.filter((id) => {
        if (PASSIVE_NODES[id]!.links.some((link) => taken.has(link))) {
          taken.add(id);
          allocated.push(id);
          grew = true;
          return false;
        }
        return true;
      });
    }

    const state: PassiveState = {
      version: 2,
      shards: whole(raw.shards),
      xp: whole(raw.xp),
      bonusPoints: whole(raw.bonusPoints),
      allocated,
    };
    // Never more nodes than points: the last taken go first.
    const points = accountLevelFor(state.xp).level - 1 + state.bonusPoints;
    return allocated.length > points ? { ...state, allocated: allocated.slice(0, points) } : state;
  }
}

export const passives = new PassiveStore();
