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
 * Empty on the user's word (2026-10-19): every dial was taken off, and a dial
 * comes back only when the user asks for that one. The values they had on
 * the live server were copied into the tables first, so nothing played
 * differently for it.
 */
export const DIALS: readonly DialSpec[] = [];

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
