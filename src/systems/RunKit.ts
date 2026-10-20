import {
  GEAR,
  GEAR_COMBINE,
  GEAR_SLOTS,
  ORBS,
  RUNES,
  RUNE_SLOTS,
  RUN_BAG,
  STARTING_KIT,
  type GearSlot,
  type OrbId,
  type RuneId,
} from '@/config';
import { SKILLS, type SkillId } from '@/weapons/skills';
import {
  bareItem,
  combineTargetFor,
  gearBonusFor,
  readItem,
  rollGearItem,
  slotOf,
  type GearBonus,
  type GearItem,
} from '@/systems/Gear';

/** What a run is carrying, as a save writes it. */
export interface RunKitState {
  readonly equipped: Partial<Record<GearSlot, GearItem | null>>;
  readonly bag: readonly GearItem[];
  readonly orbs: Partial<Record<OrbId, number>>;
  /** 룬 held, not set in anything. Absent before 0.74. */
  readonly runes?: Partial<Record<RuneId, number>>;
  /** Each skill's 강화 슬롯, in order: the 룬 set there, or null. Its length is the slots it has. */
  readonly sockets?: Partial<Record<SkillId, readonly (RuneId | null)[]>>;
}

/** Why a 합성 cannot go ahead: too few of the base, or one already at GEAR_COMBINE.bestTier. */
export type CombineProblem = 'count' | 'top';

/** Where an item is in the kit. */
export type KitPlace = { readonly item: GearItem; readonly worn: boolean };

type Listener = () => void;

/**
 * 장비, for one run (2026-10-19): what is worn in each of the three slots,
 * the 보관함 for what was found and not worn, and the 구슬 picked up. It is
 * made fresh when a run starts — a bare 녹슨 검 in hand, nothing else — and
 * goes when the run does; a save carries it across a 불러오기 and no further.
 */
export class RunKit {
  private readonly worn: Record<GearSlot, GearItem | null> = { weapon: null, armor: null, accessory: null };
  private readonly kept: GearItem[] = [];
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
      for (const raw of saved.kit.bag ?? []) {
        const item = readItem(raw);
        if (item && kit.kept.length < RUN_BAG.capacity) {
          kit.kept.push(item);
        }
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
          kit.socketed[skill] = raw
            .slice(0, RUNE_SLOTS.max)
            .map((rune) => (typeof rune === 'string' && rune in RUNES ? (rune as RuneId) : null));
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
    return { equipped: { ...this.worn }, bag: [...this.kept], orbs, runes, sockets };
  }

  /** What is worn in each slot. */
  public get equipped(): Readonly<Record<GearSlot, GearItem | null>> {
    return this.worn;
  }

  public get bag(): readonly GearItem[] {
    return this.kept;
  }

  public get bagFull(): boolean {
    return this.kept.length >= RUN_BAG.capacity;
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
    const kept = this.kept.find((item) => item.uid === uid);
    return kept ? { item: kept, worn: false } : null;
  }

  /**
   * Puts a piece on: one found just now, or one from the 보관함. What was
   * worn in its slot goes into the 보관함 — or, with no room, is let go.
   * Returns what was taken off, if anything.
   */
  public equip(item: GearItem): GearItem | null {
    if (!GEAR[item.id]) {
      return null;
    }
    const slot = slotOf(item);
    const off = this.worn[slot];
    const at = this.kept.findIndex((kept) => kept.uid === item.uid);
    if (at >= 0) {
      this.kept.splice(at, 1);
    }
    this.worn[slot] = item;
    if (off && off.uid !== item.uid && this.kept.length < RUN_BAG.capacity) {
      this.kept.push(off);
    }
    this.changed();
    return off && off.uid !== item.uid ? off : null;
  }

  /** Into the 보관함. False when it is full. */
  public store(item: GearItem): boolean {
    if (this.bagFull || this.find(item.uid)) {
      return false;
    }
    this.kept.push(item);
    this.changed();
    return true;
  }

  /** Gone for good: from the 보관함, or off the survivor. */
  public remove(uid: string): boolean {
    for (const slot of GEAR_SLOTS) {
      if (this.worn[slot]?.uid === uid) {
        this.worn[slot] = null;
        this.changed();
        return true;
      }
    }
    const at = this.kept.findIndex((item) => item.uid === uid);
    if (at < 0) {
      return false;
    }
    this.kept.splice(at, 1);
    this.changed();
    return true;
  }

  /** A piece changed in place (a 구슬): the same uid, wherever it was. */
  public replace(item: GearItem): boolean {
    for (const slot of GEAR_SLOTS) {
      if (this.worn[slot]?.uid === item.uid) {
        this.worn[slot] = item;
        this.changed();
        return true;
      }
    }
    const at = this.kept.findIndex((kept) => kept.uid === item.uid);
    if (at < 0) {
      return false;
    }
    this.kept[at] = item;
    this.changed();
    return true;
  }

  /**
   * The pieces a 합성 on `uid` would spend: it, and GEAR_COMBINE.count − 1
   * more of the same base from the 보관함 — those with the fewest 속성, so
   * the better ones stay. Worn pieces never go in.
   */
  public combineSet(uid: string): readonly GearItem[] | CombineProblem {
    const item = this.kept.find((kept) => kept.uid === uid);
    if (!item) {
      return 'count';
    }
    if (GEAR[item.id].tier - 1 < GEAR_COMBINE.bestTier) {
      return 'top';
    }
    const lines = (piece: GearItem) => piece.prefixes.length + piece.suffixes.length;
    const others = this.kept
      .filter((kept) => kept.id === item.id && kept.uid !== uid)
      .sort((a, b) => lines(a) - lines(b))
      .slice(0, GEAR_COMBINE.count - 1);
    return others.length === GEAR_COMBINE.count - 1 ? [item, ...others] : 'count';
  }

  /**
   * 합성: spends the set `combineSet` names and puts the piece a tier better
   * in the 보관함 — always. Returns it, or why it could not be done.
   */
  public combine(uid: string): GearItem | CombineProblem {
    const set = this.combineSet(uid);
    if (!Array.isArray(set)) {
      return set as CombineProblem;
    }
    const target = combineTargetFor(set[0]!.id);
    if (!target) {
      return 'top';
    }
    const spent = new Set(set.map((piece) => piece.uid));
    const at = this.kept.findIndex((kept) => kept.uid === uid);
    const made = rollGearItem(target, 'normal');
    const rest = this.kept.filter((kept) => !spent.has(kept.uid));
    rest.splice(Math.min(at, rest.length), 0, made);
    this.kept.splice(0, this.kept.length, ...rest);
    this.changed();
    return made;
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
   * Sets a held 룬 in a skill's slot. What was there goes back among the
   * 룬 held. False when the slot or the 룬 is not there to use.
   */
  public socket(skill: SkillId, slot: number, rune: RuneId): boolean {
    const list = [...this.socketsOf(skill)];
    if (slot < 0 || slot >= list.length || this.runeCount(rune) <= 0) {
      return false;
    }
    const was = list[slot];
    this.runeBag[rune] = this.runeCount(rune) - 1;
    if (was) {
      this.runeBag[was] = this.runeCount(was) + 1;
    }
    list[slot] = rune;
    this.socketed[skill] = list;
    this.changed();
    return true;
  }

  /** Takes a 룬 out of a slot and back among those held. */
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
