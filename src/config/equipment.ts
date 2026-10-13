/**
 * ★ 장비 — equipment, as far as it goes today.
 *
 * The plumbing is here and working: a piece can drop while a run is on, it
 * goes into a stash that outlives the run, and the title screen's 장비 lets
 * you put one on for the next one. What is *not* here yet is any effect: no
 * piece changes a single number, by design. The real system — stats, slots
 * beyond a weapon, rarity, a reason to prefer one piece over another — is
 * still to be designed, and the names below are stand-ins for whatever it
 * turns out to want.
 *
 * So: adding a piece today means a line in GEAR and a name in the locales.
 * When the effects land, they go in GearSpec beside `name`.
 */

export type GearSlot = 'weapon';

export type GearId = 'rustySword' | 'chippedAxe' | 'wornDagger' | 'crackedWand';

export interface GearSpec {
  readonly id: GearId;
  readonly slot: GearSlot;
  /** Korean name; a locale renames it through `names.gear`. */
  readonly name: string;
  /**
   * Relative chance of being the piece a drop turns out to be. The starter
   * is 0 — it is already in the stash, so finding it again means nothing.
   */
  readonly weight: number;
}

export const GEAR: Record<GearId, GearSpec> = {
  rustySword: { id: 'rustySword', slot: 'weapon', name: '녹슨 칼', weight: 0 },
  chippedAxe: { id: 'chippedAxe', slot: 'weapon', name: '이 빠진 도끼', weight: 1 },
  wornDagger: { id: 'wornDagger', slot: 'weapon', name: '낡은 단검', weight: 1 },
  crackedWand: { id: 'crackedWand', slot: 'weapon', name: '금 간 지팡이', weight: 1 },
};

export const ALL_GEAR: readonly GearSpec[] = Object.values(GEAR);

/** What every survivor starts out holding. */
export const STARTING_GEAR: GearId = 'rustySword';

export const GEAR_DROP = {
  /** Chance that killing an enemy leaves a piece of equipment. */
  chance: 0.01,
  /** How big it is drawn on the ground. */
  size: 20,
  /** A piece already in the stash is not dropped again. */
  skipOwned: true,
} as const;
