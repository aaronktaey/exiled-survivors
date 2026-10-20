import { PASSIVE_NODES, PASSIVE_POINTS, PASSIVE_START, STORAGE, type KeystoneId, type PassiveId } from '@/config';
import { StatSheet } from '@/systems/StatSheet';
import { openRecord, sealRecord } from '@/systems/Seal';

/** The tree, kept between runs: the nodes taken. */
export interface PassiveState {
  readonly version: 3;
  /** Nodes taken, the start not counted. */
  readonly allocated: readonly PassiveId[];
}

const DEFAULTS: PassiveState = { version: 3, allocated: [] };

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
 * The passive tree's own state: it outlives a run, and is spent on the title.
 *
 * A node can be taken while a point is free (PASSIVE_POINTS, the same for
 * every player) and it touches one already taken (or the start); taken back,
 * for nothing, while nothing else is cut off from the start by it.
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

  /** Every point there is to spend. */
  public get totalPoints(): number {
    return PASSIVE_POINTS;
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
    return this.isLeaf(id);
  }

  /** Takes a node back; its point is free again. */
  public refund(id: PassiveId): boolean {
    if (!this.canRefund(id)) {
      return false;
    }
    this.commit({ ...this.value, allocated: this.value.allocated.filter((other) => other !== id) });
    return true;
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
   * joined to the start, nor more than PASSIVE_POINTS. A tree from before
   * 0.72 (the account-level one, or the ranks before it) starts empty: the
   * grid moved every node, and every player has the same points now.
   */
  private static sanitise(raw: Partial<Omit<PassiveState, 'version'>> & { version?: number }): PassiveState {
    if (raw.version !== 3) {
      return { ...DEFAULTS };
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

    // Never more nodes than points: the last taken go first.
    return { version: 3, allocated: allocated.slice(0, PASSIVE_POINTS) };
  }
}

export const passives = new PassiveStore();
