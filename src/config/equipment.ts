/**
 * ★ 장비 — the weapon the survivor carries, and what one can come out of a
 * 우두머리 carrying.
 *
 * A weapon is a base plus its 속성. The base gives flat attack power,
 * which is added to every skill's damage, and the roster is four swords a
 * step apart. The affixes are the same ones a rare enemy wears, split into
 * prefixes and suffixes the way Path of Exile splits them — see AFFIXES in
 * balance.ts.
 *
 * Adding a sword means a line in GEAR and a name in the locales.
 */

export type GearSlot = 'weapon';

export type GearId = 'rustySword' | 'ironSword' | 'steelSword' | 'runedSword';

export interface GearSpec {
  readonly id: GearId;
  readonly slot: GearSlot;
  /** 1 to 4. One step is GEAR_BASE.attackPerTier of attack power. */
  readonly tier: number;
  /** Korean name; a locale renames it through `names.gear`. */
  readonly name: string;
  /**
   * Relative chance of being the sword a 우두머리 leaves. Lower tiers are
   * commoner, so the better swords stay worth waiting for.
   */
  readonly weight: number;
}

export const GEAR_BASE = {
  /**
   * Attack power of the first tier, and what one step up the roster adds.
   *
   * These are flat damage on every skill, and a skill starts at 15, so they
   * are deliberately small: at 3 and 3 the top sword was worth +80% damage
   * on its own and nothing else in the run could compete with it.
   */
  tier1Attack: 1,
  attackPerTier: 1,
} as const;

/** Attack power for a tier, so the roster stays in step with the dial. */
export const attackForTier = (tier: number): number =>
  GEAR_BASE.tier1Attack + (tier - 1) * GEAR_BASE.attackPerTier;

export const GEAR: Record<GearId, GearSpec> = {
  rustySword: { id: 'rustySword', slot: 'weapon', tier: 1, name: '녹슨 검', weight: 4 },
  ironSword: { id: 'ironSword', slot: 'weapon', tier: 2, name: '무쇠 검', weight: 3 },
  steelSword: { id: 'steelSword', slot: 'weapon', tier: 3, name: '강철 검', weight: 2 },
  runedSword: { id: 'runedSword', slot: 'weapon', tier: 4, name: '룬 각인 검', weight: 1 },
};

export const ALL_GEAR: readonly GearSpec[] = Object.values(GEAR);

/** What every survivor starts out holding. */
export const STARTING_GEAR: GearId = 'rustySword';

export const GEAR_DROP = {
  /**
   * Only a 우두머리 leaves one, and it always does. One a minute, which is
   * what makes a 우두머리 worth walking towards.
   */
  fromBossOnly: true,
  /**
   * Each affix line has to win its own roll, and the roll repeats until one
   * fails: a fifth of drops carry a line, a twenty-fifth carry two, and a
   * full six-line weapon is something you would tell someone about.
   */
  affixChance: 0.2,
  /** Path of Exile's ceiling for a rare: three of each. */
  maxPrefixes: 3,
  maxSuffixes: 3,
  /** How big it is drawn on the ground. */
  size: 20,
} as const;

/**
 * ★ 구슬 — the consumables a weapon is rerolled with.
 *
 * Path of Exile's currency, in the smallest form this game needs: one orb
 * rerolls a weapon's 속성 to a small count, one rerolls it to a wide one,
 * and one adds a line to what is already there. They drop off any kill at
 * the rates below, so a weapon is no longer only what the 우두머리 happened
 * to leave — it is something to work on.
 *
 * Adding one means a line in ORBS, a name in the locales, and nothing else:
 * the stash, the drop, the label and the button all read this table.
 */
export type OrbId = 'transmute' | 'chaos' | 'awaken';

export interface OrbSpec {
  readonly id: OrbId;
  /** Korean name; a locale renames it through `names.orbs`. */
  readonly name: string;
  /** The one word that fits on a button beside a count. */
  readonly short: string;
  /** What it does, written out. */
  readonly detail: string;
  /** Share of kills that leave one. */
  readonly chance: number;
  /** How loudly it lands: its nameplate and its drop sound both read this. */
  readonly tier: 'normal' | 'magic' | 'rare';
  readonly color: number;
  /**
   * Rerolls the weapon to somewhere in this many 속성, counting prefixes and
   * suffixes together. Exactly one of `reroll` and `add` is set.
   */
  readonly reroll?: { readonly min: number; readonly max: number };
  /** Or adds this many lines to whatever is already on it. */
  readonly add?: number;
}

export const ORBS: Record<OrbId, OrbSpec> = {
  transmute: {
    id: 'transmute',
    name: '변화의 구슬',
    short: '변화',
    detail: '속성을 1~2개로 다시 굴립니다',
    chance: 0.01,
    tier: 'magic',
    color: 0x6aa9ff,
    reroll: { min: 1, max: 2 },
  },
  chaos: {
    id: 'chaos',
    name: '혼돈의 구슬',
    short: '혼돈',
    detail: '속성을 2~4개로 다시 굴립니다',
    chance: 0.003,
    tier: 'rare',
    color: 0xd45fd0,
    reroll: { min: 2, max: 4 },
  },
  awaken: {
    id: 'awaken',
    name: '각성의 구슬',
    short: '각성',
    detail: '속성 1개를 더합니다 (최대 6)',
    chance: 0.001,
    tier: 'rare',
    color: 0xffd34d,
    add: 1,
  },
};

export const ALL_ORBS: readonly OrbSpec[] = Object.values(ORBS);

export const ORB_DROP = {
  /** How big one is drawn on the ground. */
  size: 16,
} as const;
