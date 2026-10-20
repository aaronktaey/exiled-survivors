/**
 * ★ 밸런스 다이얼 — the numbers the admin's in-game panel can turn, by path
 * into the config tables (balance.ts, equipment.ts, bones.ts, passives.ts).
 *
 * Pure data, no imports: the Worker reads this too, to accept only these
 * paths when the panel's values are made everyone's (server/tuning.ts).
 * Adding a dial is a line here and its label in the locales' `tuning.labels`.
 *
 * A dial's range runs from 0 (or `min`) to `max`, or to `maxFactor` × the
 * value balance.ts gives it (3 when unset); `kind` says how it reads.
 */
export type DialKind =
  /** A share, read as a percentage: 0.015 → 1.5%. */
  | 'chance'
  /** A multiplier: 1.2 → ×1.20. */
  | 'scale'
  /** Milliseconds, read as seconds. */
  | 'ms'
  /** A whole number. */
  | 'count'
  /** Anything else, as it is. */
  | 'number';

export type DialTab = 'skills' | 'enemies' | 'drops';

export interface DialSpec {
  /** Where the value lives: `SKILL_BASE.fireball.damage`. */
  readonly path: string;
  readonly kind: DialKind;
  readonly tab: DialTab;
  /** Within the 스킬 tab, whose page it is on ('common' for every skill). */
  readonly skill?: string;
  readonly min?: number;
  readonly max?: number;
  readonly maxFactor?: number;
}

/**
 * Every dial was taken off on the user's word (2026-10-19), and a dial comes
 * back only when the user asks for that one. Back since (0.77): enemy health
 * (the overall multiplier, the step a minute and each tier of it) and every
 * drop rate. A new 구슬, 뼈다귀 or gear base that drops off kills needs its
 * line here; the panel names it from the tables.
 */
export const DIALS: readonly DialSpec[] = [
  // Enemy health: how tough overall, how much more each minute, and from
  // which minute each tier steps it up (DIFFICULTY.hpStepTiers, by index).
  { path: 'BALANCE.enemyHpScale', kind: 'scale', tab: 'enemies', min: 0.1, max: 5 },
  { path: 'DIFFICULTY.hpScalePerMinute', kind: 'scale', tab: 'enemies', min: 1, max: 2 },
  { path: 'DIFFICULTY.hpStepTiers.0.afterMinute', kind: 'count', tab: 'enemies', min: 0, max: 60 },
  { path: 'DIFFICULTY.hpStepTiers.0.multiplier', kind: 'scale', tab: 'enemies', min: 0, max: 20 },
  { path: 'DIFFICULTY.hpStepTiers.1.afterMinute', kind: 'count', tab: 'enemies', min: 0, max: 60 },
  { path: 'DIFFICULTY.hpStepTiers.1.multiplier', kind: 'scale', tab: 'enemies', min: 0, max: 20 },

  // What falls, as a share of kills (before a rare's or a 우두머리's bonus).
  { path: 'RUNE_DROP.chance', kind: 'chance', tab: 'drops', max: 0.2 },
  { path: 'RUNE_CHISEL.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'RANDOM_SKILL.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'POTION.chance', kind: 'chance', tab: 'drops', max: 0.3 },
  { path: 'MANGO.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'MAGNET.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'ALTAR.fromKill', kind: 'chance', tab: 'drops', max: 0.2 },
  { path: 'ALTAR.fromBoss', kind: 'chance', tab: 'drops', max: 1 },
  { path: 'ORBS.transmute.chance', kind: 'chance', tab: 'drops', max: 0.1 },
  { path: 'ORBS.chaos.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'ORBS.awaken.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'ORBS.explode.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'ORBS.mango.chance', kind: 'chance', tab: 'drops', max: 0.02 },
  { path: 'BONES.skull.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'BONES.rib.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'BONES.spine.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.steelSword.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.ironSword.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.rustySword.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.chainArmor.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.leatherArmor.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.clothArmor.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.jadeAmulet.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.silverRing.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.copperRing.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
];

/** Every path the panel may set — what the Worker accepts and nothing else. */
export const DIAL_PATHS: ReadonlySet<string> = new Set(DIALS.map((dial) => dial.path));

export const TUNING = {
  /** Where the panel's own, not-yet-shared values wait (this browser only — not synced). */
  draftKey: 'exiled-survivors:tuning-draft:v1',
  /** How long the edge keeps everyone's values before asking the database again. */
  cacheSeconds: 60,
  /** Anything bigger than this is not a value a dial can reach. */
  maxValue: 1_000_000,
} as const;
