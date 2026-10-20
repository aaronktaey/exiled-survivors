import {
  GEAR,
  GEAR_SLOTS,
  ORBS,
  RUNES,
  RUNE_SLOTS,
  STARTING_KIT,
  type GearSlot,
  type OrbId,
  type RuneId,
} from '@/config';
import { SKILLS, type SkillId } from '@/weapons/skills';
import { bareItem, gearBonusFor, readItem, slotOf, type GearBonus, type GearItem } from '@/systems/Gear';

/** What a run is carrying, as a save writes it. */
export interface RunKitState {
  readonly equipped: Partial<Record<GearSlot, GearItem | null>>;
  /** The 보관함, until 0.78: a save that still has one has it dropped. */
  readonly bag?: readonly GearItem[];
  readonly orbs: Partial<Record<OrbId, number>>;
  /** 룬 held, not set in anything (a save from 0.74–0.77). Absent before 0.74. */
  readonly runes?: Partial<Record<RuneId, number>>;
  /**
   * Each skill's 강화 슬롯: the 룬 set there, oldest first, then the empty
   * ones (null). Its length is the slots it has.
   */
  readonly sockets?: Partial<Record<SkillId, readonly (RuneId | null)[]>>;
}

/** Where an item is in the kit: only what is worn, since there is no 보관함 (0.78). */
export type KitPlace = { readonly item: GearItem; readonly worn: boolean };

/** What putting a 룬 in a skill did: the slot it went to, and the 룬 it pushed out (null when a slot was free). */
export interface RuneFit {
  readonly slot: number;
  readonly removed: RuneId | null;
}

type Listener = () => void;

/**
 * 장비, for one run (2026-10-19): what is worn in each of the three slots,
 * the 구슬 picked up, and each skill's 강화 슬롯. There is no 보관함 since
 * 0.78: a piece found is worn or let go there and then. It is made fresh when
 * a run starts (STARTING_KIT, bare) and goes when the run does; a save
 * carries it across a 불러오기 and no further.
 */
export class RunKit {
  private readonly worn: Record<GearSlot, GearItem | null> = { weapon: null, armor: null, accessory: null };
  private readonly held: Partial<Record<OrbId, number>> = {};
  private readonly runeBag: Partial<Record<RuneId, number>> = {};
  private readonly socketed: Partial<Record<SkillId, (RuneId | null)[]>> = {};
  private readonly listeners = new Set<Listener>();

  /** A fresh run's: STARTING_KIT worn, bare. */
  public static fresh(): RunKit {
    const kit = new RunKit();
    for (const slot of GEAR_SLOTS) {
      const id = STARTING_KIT[slot];
      kit.worn[slot] = id && GEAR[id]?.slot === slot ? bareItem(id) : null;
    }
    return kit;
  }

  /**
   * A saved run's, read back. A save from before the kit carried only the
   * weapon it went out with (`gear`), which is worn again; one with neither
   * starts as a fresh run would.
   */
  public static restore(saved: { readonly kit?: RunKitState; readonly gear?: GearItem | null } | null): RunKit {
    if (!saved || (!saved.kit && saved.gear === undefined)) {
      return RunKit.fresh();
    }
    const kit = new RunKit();
    if (saved.kit) {
      for (const slot of GEAR_SLOTS) {
        const item = readItem(saved.kit.equipped?.[slot]);
        kit.worn[slot] = item && slotOf(item) === slot ? item : null;
      }
      for (const id of Object.keys(ORBS) as OrbId[]) {
        const count = Math.floor(Number(saved.kit.orbs?.[id]) || 0);
        if (count > 0) {
          kit.held[id] = count;
        }
      }
      for (const id of Object.keys(RUNES) as RuneId[]) {
        const count = Math.floor(Number(saved.kit.runes?.[id]) || 0);
        if (count > 0) {
          kit.runeBag[id] = count;
        }
      }
      for (const [skill, raw] of Object.entries(saved.kit.sockets ?? {}) as [SkillId, readonly unknown[]][]) {
        if (SKILLS[skill] && Array.isArray(raw)) {
          kit.socketed[skill] = packed(
            raw.slice(0, RUNE_SLOTS.max).map((rune) => (typeof rune === 'string' && rune in RUNES ? (rune as RuneId) : null)),
          );
        }
      }
    } else {
      const weapon = readItem(saved.gear);
      kit.worn.weapon = weapon && slotOf(weapon) === 'weapon' ? weapon : null;
    }
    return kit;
  }

  public get state(): RunKitState {
    // A 구슬 spent down to none is not held at all.
    const orbs = Object.fromEntries(Object.entries(this.held).filter(([, n]) => (n ?? 0) > 0));
    const runes = Object.fromEntries(Object.entries(this.runeBag).filter(([, n]) => (n ?? 0) > 0));
    const sockets = Object.fromEntries(Object.entries(this.socketed).map(([skill, list]) => [skill, [...(list ?? [])]]));
    return { equipped: { ...this.worn }, orbs, runes, sockets };
  }

  /** What is worn in each slot. */
  public get equipped(): Readonly<Record<GearSlot, GearItem | null>> {
    return this.worn;
  }

  /** What everything worn is worth together. */
  public get bonus(): GearBonus {
    return gearBonusFor(GEAR_SLOTS.map((slot) => this.worn[slot]));
  }

  public find(uid: string): KitPlace | null {
    for (const slot of GEAR_SLOTS) {
      const item = this.worn[slot];
      if (item?.uid === uid) {
        return { item, worn: true };
      }
    }
    return null;
  }

  /**
   * Puts a piece found on. What was worn in its slot is let go — there is
   * nowhere to keep it (0.78). Returns what was taken off, if anything.
   */
  public equip(item: GearItem): GearItem | null {
    if (!GEAR[item.id]) {
      return null;
    }
    const slot = slotOf(item);
    const off = this.worn[slot];
    this.worn[slot] = item;
    this.changed();
    return off && off.uid !== item.uid ? off : null;
  }

  /** Gone for good, off the survivor (a 구슬 that destroyed it). */
  public remove(uid: string): boolean {
    for (const slot of GEAR_SLOTS) {
      if (this.worn[slot]?.uid === uid) {
        this.worn[slot] = null;
        this.changed();
        return true;
      }
    }
    return false;
  }

  /** A worn piece changed in place (a 구슬): the same uid. */
  public replace(item: GearItem): boolean {
    for (const slot of GEAR_SLOTS) {
      if (this.worn[slot]?.uid === item.uid) {
        this.worn[slot] = item;
        this.changed();
        return true;
      }
    }
    return false;
  }

  public count(orb: OrbId): number {
    return this.held[orb] ?? 0;
  }

  public get orbTotal(): number {
    return Object.values(this.held).reduce((sum, n) => sum + (n ?? 0), 0);
  }

  public addOrb(orb: OrbId): void {
    this.held[orb] = this.count(orb) + 1;
    this.changed();
  }

  public spend(orb: OrbId): boolean {
    if (this.count(orb) <= 0) {
      return false;
    }
    this.held[orb] = this.count(orb) - 1;
    this.changed();
    return true;
  }

  // --- 룬 ---------------------------------------------------------------

  public runeCount(rune: RuneId): number {
    return this.runeBag[rune] ?? 0;
  }

  public get runeTotal(): number {
    return Object.values(this.runeBag).reduce((sum, n) => sum + (n ?? 0), 0);
  }

  public addRune(rune: RuneId): void {
    this.runeBag[rune] = this.runeCount(rune) + 1;
    this.changed();
  }

  /** A skill's 강화 슬롯, in order (empty when it has none). */
  public socketsOf(skill: SkillId): readonly (RuneId | null)[] {
    return this.socketed[skill] ?? [];
  }

  /** Every 룬 set in a skill, in slot order. */
  public runesIn(skill: SkillId): RuneId[] {
    return this.socketsOf(skill).filter((rune): rune is RuneId => rune !== null);
  }

  /** Gives a skill at least `slots` 강화 슬롯 (the main skill's, as the run starts). */
  public ensureSlots(skill: SkillId, slots: number): void {
    const list = [...this.socketsOf(skill)];
    if (list.length >= slots) {
      return;
    }
    while (list.length < Math.min(slots, RUNE_SLOTS.max)) {
      list.push(null);
    }
    this.socketed[skill] = list;
    this.changed();
  }

  /** Whether a 룬 끌 can add a slot to this skill. */
  public canAddSlot(skill: SkillId): boolean {
    return this.socketsOf(skill).length < RUNE_SLOTS.max;
  }

  /** 룬 끌: one more 강화 슬롯. False at RUNE_SLOTS.max. */
  public addSlot(skill: SkillId): boolean {
    if (!this.canAddSlot(skill)) {
      return false;
    }
    this.socketed[skill] = [...this.socketsOf(skill), null];
    this.changed();
    return true;
  }

  /**
   * Sets a held 룬 in a skill's slot (the 룬 screen, for a 룬 a save still
   * holds). What was there is overwritten — gone, not given back (0.76) —
   * and the new one counts as the newest set. False when the slot or the 룬
   * is not there to use.
   */
  public socket(skill: SkillId, slot: number, rune: RuneId): boolean {
    const list = [...this.socketsOf(skill)];
    if (slot < 0 || slot >= list.length || this.runeCount(rune) <= 0) {
      return false;
    }
    this.runeBag[rune] = this.runeCount(rune) - 1;
    list[slot] = null;
    this.socketed[skill] = withNewest(packed(list), rune).list;
    this.changed();
    return true;
  }

  /**
   * A 룬 just picked up, put straight into a skill (0.78): the first empty
   * slot, or — every slot full — in place of the one set longest ago.
   * Null when the skill has no slot at all.
   */
  public fit(skill: SkillId, rune: RuneId): RuneFit | null {
    const list = packed([...this.socketsOf(skill)]);
    if (list.length === 0) {
      return null;
    }
    const { list: next, removed } = withNewest(list, rune);
    this.socketed[skill] = next;
    this.changed();
    return { slot: next.lastIndexOf(rune), removed };
  }

  /** The 룬 a full skill would lose to the next one fitted: the one set longest ago. Null while a slot is free. */
  public oldestIn(skill: SkillId): RuneId | null {
    const list = this.socketsOf(skill);
    return list.length > 0 && list.every((rune) => rune !== null) ? list[0]! : null;
  }

  /** Takes a 룬 out of a slot and back among those held. The 룬 screen offers no way to (0.76); kept for tests and tools. */
  public unsocket(skill: SkillId, slot: number): boolean {
    const list = [...this.socketsOf(skill)];
    const was = list[slot];
    if (!was) {
      return false;
    }
    list[slot] = null;
    this.runeBag[was] = this.runeCount(was) + 1;
    this.socketed[skill] = list;
    this.changed();
    return true;
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    this.listeners.forEach((listener) => listener());
  }
}

/** The 룬 set first, in the order they went in, then the empty slots. */
function packed(list: readonly (RuneId | null)[]): (RuneId | null)[] {
  const set = list.filter((rune): rune is RuneId => rune !== null);
  return [...set, ...list.slice(set.length).map(() => null)];
}

/** A packed list with `rune` added as the newest: into the first empty slot, or pushing out the oldest. */
function withNewest(list: readonly (RuneId | null)[], rune: RuneId): { list: (RuneId | null)[]; removed: RuneId | null } {
  const free = list.indexOf(null);
  if (free >= 0) {
    const next = [...list];
    next[free] = rune;
    return { list: next, removed: null };
  }
  return { list: [...list.slice(1), rune], removed: list[0] ?? null };
}
