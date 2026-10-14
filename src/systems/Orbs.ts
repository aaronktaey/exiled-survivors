import { ALL_ORBS, ORBS, STORAGE, type OrbId } from '@/config';

/** How many of each 구슬 the survivor is holding. */
export type OrbCounts = Record<OrbId, number>;

type Listener = (counts: OrbCounts) => void;

const empty = (): OrbCounts =>
  Object.fromEntries(ALL_ORBS.map((orb) => [orb.id, 0])) as OrbCounts;

/**
 * The 구슬 drawer: what has been picked up and not yet spent.
 *
 * It sits beside the stash, the tree and the purse, and outlives a run for
 * the same reason they do — a 각성의 구슬 found in a run that ended badly is
 * still yours, and the 인벤토리 on the title screen is where it gets used.
 */
class OrbStore {
  private current: OrbCounts = empty();
  private readonly listeners = new Set<Listener>();
  private loaded = false;

  public get value(): OrbCounts {
    if (!this.loaded) {
      this.load();
    }
    return this.current;
  }

  public count(id: OrbId): number {
    return this.value[id] ?? 0;
  }

  /** How many 구슬 are held in total, for the dot on the 장비 icon. */
  public get total(): number {
    return ALL_ORBS.reduce((sum, orb) => sum + this.count(orb.id), 0);
  }

  public add(id: OrbId, amount = 1): number {
    if (!ORBS[id] || amount <= 0) {
      return this.count(id);
    }

    this.commit({ ...this.value, [id]: this.count(id) + amount });
    return this.count(id);
  }

  /** True when there was one, and it has been spent. */
  public spend(id: OrbId): boolean {
    if (this.count(id) <= 0) {
      return false;
    }

    this.commit({ ...this.value, [id]: this.count(id) - 1 });
    return true;
  }

  public reset(): OrbCounts {
    this.commit(empty());
    return this.current;
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: OrbCounts): void {
    this.current = this.sanitise(next);
    this.save();
    this.listeners.forEach((listener) => listener(this.current));
  }

  private load(): void {
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(STORAGE.orbs);
      this.current = raw ? this.sanitise(JSON.parse(raw) as Partial<OrbCounts>) : empty();
    } catch {
      this.current = empty();
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE.orbs, JSON.stringify(this.current));
    } catch {
      // The drawer lasts as long as the tab, then.
    }
  }

  /** A hand-edited payload cannot invent an orb or a negative count. */
  private sanitise(raw: Partial<OrbCounts>): OrbCounts {
    const out = empty();
    for (const orb of ALL_ORBS) {
      const held = Number(raw?.[orb.id] ?? 0);
      out[orb.id] = Number.isFinite(held) ? Math.max(0, Math.floor(held)) : 0;
    }
    return out;
  }
}

export const orbs = new OrbStore();
