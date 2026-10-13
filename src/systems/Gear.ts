import { GEAR, STARTING_GEAR, STORAGE, type GearId, type GearSpec } from '@/config';

/** What the stash holds, as it is written to localStorage. */
export interface GearState {
  /** Every piece found so far, including the one that was there to start. */
  readonly owned: readonly GearId[];
  readonly equipped: GearId;
}

const DEFAULTS: GearState = { owned: [STARTING_GEAR], equipped: STARTING_GEAR };

type Listener = (state: GearState) => void;

/**
 * The equipment stash: what has been found, and what is being worn.
 *
 * It sits beside the settings rather than inside a save, because it outlives
 * a run on purpose — a piece found in a run that ended badly is still yours,
 * and the title screen is where it goes on. Storage is allowed to fail: a
 * blocked localStorage just means the stash lasts as long as the tab does.
 */
class GearStore {
  private current: GearState = { ...DEFAULTS };
  private readonly listeners = new Set<Listener>();
  private loaded = false;

  public get value(): GearState {
    if (!this.loaded) {
      this.load();
    }
    return this.current;
  }

  /** Every owned piece, in the order the roster lists them. */
  public get owned(): readonly GearSpec[] {
    const held = new Set(this.value.owned);
    return Object.values(GEAR).filter((spec) => held.has(spec.id));
  }

  public get equipped(): GearSpec {
    return GEAR[this.value.equipped] ?? GEAR[STARTING_GEAR];
  }

  public has(id: GearId): boolean {
    return this.value.owned.includes(id);
  }

  /** Adds a piece to the stash. Returns false if it was already there. */
  public own(id: GearId): boolean {
    if (!GEAR[id] || this.has(id)) {
      return false;
    }

    this.commit({ ...this.value, owned: [...this.value.owned, id] });
    return true;
  }

  /** Puts a piece on. Only something already in the stash can be worn. */
  public equip(id: GearId): boolean {
    if (!this.has(id) || this.value.equipped === id) {
      return false;
    }

    this.commit({ ...this.value, equipped: id });
    return true;
  }

  public reset(): GearState {
    this.commit({ ...DEFAULTS });
    return this.current;
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: GearState): void {
    this.current = this.sanitise(next);
    this.save();
    this.listeners.forEach((listener) => listener(this.current));
  }

  private load(): void {
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(STORAGE.gear);
      this.current = raw
        ? this.sanitise({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<GearState>) })
        : { ...DEFAULTS };
    } catch {
      this.current = { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE.gear, JSON.stringify(this.current));
    } catch {
      // The stash lasts as long as the tab, then.
    }
  }

  /** A hand-edited or stale payload cannot leave the survivor empty-handed. */
  private sanitise(raw: GearState): GearState {
    const owned = (Array.isArray(raw.owned) ? raw.owned : []).filter(
      (id: GearId) => GEAR[id] !== undefined,
    );
    if (!owned.includes(STARTING_GEAR)) {
      owned.unshift(STARTING_GEAR);
    }

    const equipped = owned.includes(raw.equipped) ? raw.equipped : STARTING_GEAR;
    return { owned: [...new Set(owned)], equipped };
  }
}

export const gear = new GearStore();
