import {
  AFFIXES,
  AUDIO,
  GEAR,
  GEAR_DROP,
  PREFIXES,
  STARTING_GEAR,
  STORAGE,
  SUFFIXES,
  LEGACY_AFFIX_TIER,
  ORBS,
  affixTier,
  attackForTier,
  rollAffixTier,
  type AffixId,
  type AffixLine,
  type GearAffixEffect,
  type AffixSpec,
  type GearId,
  type DropTier,
  type GearSpec,
  type OrbSpec,
} from '@/config';

/**
 * One weapon, as it was rolled. Two 강철 검 can both be held and be worth
 * different things, so an item carries its own id rather than being its
 * base.
 */
export interface GearItem {
  readonly uid: string;
  readonly id: GearId;
  readonly prefixes: readonly AffixLine[];
  readonly suffixes: readonly AffixLine[];
}

/** What the stash holds, as it is written to localStorage. */
export interface GearState {
  readonly items: readonly GearItem[];
  /** The uid of the weapon in hand. */
  readonly equipped: string;
}

/** Everything a weapon is worth to whoever is holding it. */
export interface GearBonus {
  /** Flat damage added to every skill's hit. */
  readonly attack: number;
  readonly attackSpeedScale: number;
  readonly maxHpScale: number;
  readonly moveSpeedScale: number;
  readonly pickupScale: number;
  readonly invulnerableScale: number;
  /** Health returned every REGEN.periodMs. */
  readonly regen: number;
  readonly critChance: number;
  /** Added to RARE.critMultiplier when one lands. */
  readonly critMultiplierBonus: number;
}

export const NO_BONUS: GearBonus = {
  attack: 0,
  attackSpeedScale: 1,
  maxHpScale: 1,
  moveSpeedScale: 1,
  pickupScale: 1,
  invulnerableScale: 1,
  regen: 0,
  critChance: 0,
  critMultiplierBonus: 0,
};

const STARTER_UID = 'starter';

const DEFAULTS: GearState = {
  items: [{ uid: STARTER_UID, id: STARTING_GEAR, prefixes: [], suffixes: [] }],
  equipped: STARTER_UID,
};

type Listener = (state: GearState) => void;

let nextUid = 1;

/** One 속성 on a weapon: which it is, which rung, and what that rung does. */
export interface RolledAffix {
  readonly line: AffixLine;
  readonly spec: AffixSpec;
  readonly effect: GearAffixEffect;
  /** What this rung reads as on a weapon. */
  readonly detail: string;
}

/** Every 속성 on an item, prefixes first, each at the rung it rolled. */
export function affixesOf(item: GearItem): readonly RolledAffix[] {
  const out: RolledAffix[] = [];
  for (const line of [...item.prefixes, ...item.suffixes]) {
    const spec = AFFIXES[line.id];
    const rung = affixTier(line.id, line.tier);
    if (spec && rung) {
      out.push({ line, spec, effect: rung.gear, detail: rung.detail });
    }
  }
  return out;
}

/**
 * What an item is worth. The scales multiply, so two 강력 compound, and crit
 * chance adds up and stops at certain — the same arithmetic a rare enemy's
 * affixes go through.
 */
export function gearBonusFor(item: GearItem | null): GearBonus {
  if (!item || !GEAR[item.id]) {
    return NO_BONUS;
  }

  let attackBonus = 0;
  let attackScale = 1;
  let attackSpeedScale = 1;
  let maxHpScale = 1;
  let moveSpeedScale = 1;
  let pickupScale = 1;
  let invulnerableScale = 1;
  let regen = 0;
  let critChance = 0;
  let critMultiplierBonus = 0;

  for (const { effect } of affixesOf(item)) {
    attackBonus += effect.attackBonus ?? 0;
    attackScale *= effect.attackScale ?? 1;
    attackSpeedScale *= effect.attackSpeedScale ?? 1;
    maxHpScale *= effect.maxHpScale ?? 1;
    moveSpeedScale *= effect.moveSpeedScale ?? 1;
    pickupScale *= effect.pickupScale ?? 1;
    invulnerableScale *= effect.invulnerableScale ?? 1;
    regen += effect.regen ?? 0;
    critChance = Math.min(1, critChance + (effect.critChance ?? 0));
    critMultiplierBonus += effect.critMultiplierBonus ?? 0;
  }

  return {
    attack: Math.round((attackForTier(GEAR[item.id].tier) + attackBonus) * attackScale),
    attackSpeedScale,
    maxHpScale,
    moveSpeedScale,
    pickupScale,
    invulnerableScale,
    regen,
    critChance,
    critMultiplierBonus,
  };
}

/**
 * How rare a weapon came out, which is both how it is labelled on the
 * ground and what it sounds like when it lands. Up to two 속성 is ordinary,
 * three or four is magic, five or six is rare.
 */
export function dropTierFor(item: GearItem): DropTier {
  return tierForLines(item.prefixes.length + item.suffixes.length);
}

/** The same ladder, for anything that knows its own count. */
export function tierForLines(lines: number): DropTier {
  if (lines >= AUDIO.dropTiers.rareFrom) {
    return 'rare';
  }

  return lines >= AUDIO.dropTiers.magicFrom ? 'magic' : 'normal';
}

/**
 * `count` affix lines, drawn with room on both sides. Prefixes and suffixes
 * are picked at random between whichever side still has space, so asking for
 * four does not quietly become three prefixes and a dead roll.
 */
export function rollAffixLines(count: number): {
  prefixes: AffixLine[];
  suffixes: AffixLine[];
} {
  const prefixes: AffixLine[] = [];
  const suffixes: AffixLine[] = [];

  for (let i = 0; i < count; i++) {
    const canPrefix = prefixes.length < GEAR_DROP.maxPrefixes && PREFIXES.length > 0;
    const canSuffix = suffixes.length < GEAR_DROP.maxSuffixes && SUFFIXES.length > 0;
    if (!canPrefix && !canSuffix) {
      break;
    }

    const takePrefix = canPrefix && (!canSuffix || Math.random() < 0.5);
    const pool = takePrefix ? PREFIXES : SUFFIXES;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked) {
      break;
    }

    (takePrefix ? prefixes : suffixes).push({ id: picked.id, tier: rollAffixTier(picked.id) });
  }

  return { prefixes, suffixes };
}

/** The most lines any one weapon can carry. */
export const MAX_AFFIX_LINES = GEAR_DROP.maxPrefixes + GEAR_DROP.maxSuffixes;

/**
 * What a 구슬 does to a weapon, or null when it would do nothing — a
 * 각성의 구슬 on a weapon already carrying six, which must not be spent.
 *
 * A reroll throws away everything that was on it, which is the whole bargain:
 * a 혼돈의 구슬 can turn a four-line weapon into two, and that is why it is
 * worth hesitating over.
 */
export function orbApplied(item: GearItem, orb: OrbSpec): GearItem | null {
  if (orb.reroll) {
    const span = orb.reroll.max - orb.reroll.min + 1;
    const count = orb.reroll.min + Math.floor(Math.random() * span);
    const rolled = rollAffixLines(Math.min(count, MAX_AFFIX_LINES));
    return { ...item, prefixes: rolled.prefixes, suffixes: rolled.suffixes };
  }

  const held = item.prefixes.length + item.suffixes.length;
  if (!orb.add || held >= MAX_AFFIX_LINES) {
    return null;
  }

  const prefixes: AffixLine[] = [...item.prefixes];
  const suffixes: AffixLine[] = [...item.suffixes];
  for (let i = 0; i < orb.add; i++) {
    const canPrefix = prefixes.length < GEAR_DROP.maxPrefixes && PREFIXES.length > 0;
    const canSuffix = suffixes.length < GEAR_DROP.maxSuffixes && SUFFIXES.length > 0;
    if (!canPrefix && !canSuffix) {
      break;
    }

    const takePrefix = canPrefix && (!canSuffix || Math.random() < 0.5);
    const pool = takePrefix ? PREFIXES : SUFFIXES;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked) {
      break;
    }

    (takePrefix ? prefixes : suffixes).push({ id: picked.id, tier: rollAffixTier(picked.id) });
  }

  return { ...item, prefixes, suffixes };
}

/** Rolls for a 구슬 off one kill. Returns the one that dropped, if any. */
export function rollOrbDrop(): OrbSpec | null {
  for (const orb of Object.values(ORBS)) {
    if (Math.random() < orb.chance) {
      return orb;
    }
  }

  return null;
}

/**
 * A weapon as a 우두머리 leaves it: a base from the roster, then affix lines
 * that each have to win their own roll. Repeats are allowed, the way a rare
 * enemy can be born doubly 거대 — there are fewer affixes than the ceiling,
 * and a second 강력 is a fine way to say "much harder".
 */
export function rollGearItem(): GearItem {
  const total = Object.values(GEAR).reduce((sum, spec) => sum + spec.weight, 0);
  let roll = Math.random() * total;
  let base: GearSpec = GEAR[STARTING_GEAR];
  for (const spec of Object.values(GEAR)) {
    roll -= spec.weight;
    if (roll <= 0) {
      base = spec;
      break;
    }
  }

  const prefixes: AffixLine[] = [];
  const suffixes: AffixLine[] = [];
  const room = () =>
    (prefixes.length < GEAR_DROP.maxPrefixes ? PREFIXES.length : 0) +
    (suffixes.length < GEAR_DROP.maxSuffixes ? SUFFIXES.length : 0);

  while (room() > 0 && Math.random() < GEAR_DROP.affixChance) {
    // Pick among whichever side still has room, so a full set of prefixes
    // does not stop the suffixes from rolling.
    const canPrefix = prefixes.length < GEAR_DROP.maxPrefixes && PREFIXES.length > 0;
    const canSuffix = suffixes.length < GEAR_DROP.maxSuffixes && SUFFIXES.length > 0;
    const takePrefix = canPrefix && (!canSuffix || Math.random() < 0.5);
    const pool = takePrefix ? PREFIXES : SUFFIXES;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked) {
      break;
    }

    (takePrefix ? prefixes : suffixes).push({ id: picked.id, tier: rollAffixTier(picked.id) });
  }

  nextUid += 1;
  return { uid: `g${Date.now().toString(36)}${nextUid}`, id: base.id, prefixes, suffixes };
}

/**
 * The equipment stash: what has been found, and what is being carried.
 *
 * It sits beside the settings rather than inside a save, because it outlives
 * a run on purpose — a weapon a 우두머리 left in a run that ended badly is
 * still yours, and the title screen is where it goes on. Storage is allowed
 * to fail: a blocked localStorage just means the stash lasts as long as the
 * tab does.
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

  /** Everything held, best first, so the list reads as a ladder. */
  public get items(): readonly GearItem[] {
    return [...this.value.items].sort((a, b) => {
      const tier = (GEAR[b.id]?.tier ?? 0) - (GEAR[a.id]?.tier ?? 0);
      return tier !== 0 ? tier : affixesOf(b).length - affixesOf(a).length;
    });
  }

  public get equipped(): GearItem {
    return this.value.items.find((item) => item.uid === this.value.equipped) ?? DEFAULTS.items[0];
  }

  public get equippedSpec(): GearSpec {
    return GEAR[this.equipped.id] ?? GEAR[STARTING_GEAR];
  }

  /** What the survivor is getting out of what they are holding. */
  public get bonus(): GearBonus {
    return gearBonusFor(this.equipped);
  }

  /** Adds a weapon to the stash. It is not put on; that is done on the title. */
  public add(item: GearItem): GearItem {
    this.commit({ ...this.value, items: [...this.value.items, item] });
    return item;
  }

  /**
   * Throws one away for good. Whatever is being carried stays: put something
   * else on first, which is also what keeps the stash from ever emptying.
   */
  public discard(uid: string): boolean {
    if (uid === this.value.equipped || !this.value.items.some((item) => item.uid === uid)) {
      return false;
    }

    this.commit({ ...this.value, items: this.value.items.filter((item) => item.uid !== uid) });
    return true;
  }

  /**
   * Swaps one weapon for a changed copy of itself, keeping its place in the
   * stash and whether it is being carried. This is what a 구슬 does: the
   * same weapon, different lines.
   */
  public replace(item: GearItem): boolean {
    if (!this.value.items.some((held) => held.uid === item.uid)) {
      return false;
    }

    this.commit({
      ...this.value,
      items: this.value.items.map((held) => (held.uid === item.uid ? item : held)),
    });
    return true;
  }

  /** Puts a weapon on. Only something already in the stash can be carried. */
  public equip(uid: string): boolean {
    if (!this.value.items.some((item) => item.uid === uid) || this.value.equipped === uid) {
      return false;
    }

    this.commit({ ...this.value, equipped: uid });
    return true;
  }

  public reset(): GearState {
    this.commit({ items: [...DEFAULTS.items], equipped: DEFAULTS.equipped });
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

  /**
   * Reads a stored list of 속성, in either shape. Before tiers a line was
   * just an id; those come back at the middle rung, which is about what they
   * were worth when they were written.
   */
  private static lines(
    raw: readonly (AffixLine | AffixId)[] | undefined,
    kind: 'prefix' | 'suffix',
  ): AffixLine[] {
    const out: AffixLine[] = [];
    for (const entry of raw ?? []) {
      const id = (typeof entry === 'string' ? entry : entry?.id) as AffixId;
      if (AFFIXES[id]?.kind !== kind || AFFIXES[id]?.gearTiers === undefined) {
        continue;
      }

      const tier = typeof entry === 'string' ? LEGACY_AFFIX_TIER : Number(entry?.tier);
      out.push({ id, tier: affixTier(id, tier)?.tier ?? LEGACY_AFFIX_TIER });
    }
    return out;
  }

  /** A hand-edited or stale payload cannot leave the survivor empty-handed. */
  private sanitise(raw: GearState): GearState {
    const items: GearItem[] = (Array.isArray(raw.items) ? raw.items : [])
      .filter(
        (item: GearItem) =>
          item && GEAR[item.id] !== undefined && typeof item.uid === 'string',
      )
      .map((item: GearItem) => ({
        uid: item.uid,
        id: item.id,
        prefixes: GearStore.lines(item.prefixes, 'prefix'),
        suffixes: GearStore.lines(item.suffixes, 'suffix'),
      }));

    // Empty-handed is the one state that cannot stand, so the 녹슨 검 comes
    // back then and only then. Throwing it away once there is something
    // better is allowed, and it stays thrown away.
    if (items.length === 0) {
      items.push({ ...DEFAULTS.items[0]! });
    }

    const equipped = items.some((item) => item.uid === raw.equipped)
      ? raw.equipped
      : items[0]!.uid;
    return { items, equipped };
  }
}

export const gear = new GearStore();
