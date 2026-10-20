import { ALL_RUNES, RUNES, type RuneId } from '@/config';

/**
 * A 룬 by RUNES' weights: what a drop turns out to be — among those `fits`
 * lets through (0.78: only a 룬 some skill held can take falls, since it goes
 * straight into one). Null when none does.
 */
export function rollRune(fits: (id: RuneId) => boolean = () => true): RuneId | null {
  const pool = ALL_RUNES.filter((rune) => fits(rune.id));
  const total = pool.reduce((sum, rune) => sum + rune.weight, 0);
  let roll = Math.random() * total;
  for (const rune of pool) {
    roll -= rune.weight;
    if (roll < 0) {
      return rune.id;
    }
  }
  return pool[0]?.id ?? null;
}

/** Whether a 룬 does anything for a skill (RuneSpec.skills; every skill when it names none). */
export function runeWorksFor(rune: RuneId, skill: string): boolean {
  const skills = RUNES[rune]?.skills;
  return !skills || (skills as readonly string[]).includes(skill);
}
