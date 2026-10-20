import { ALL_RUNES, RUNES, type RuneId } from '@/config';

/** A 룬 by RUNES' weights: what a drop turns out to be. */
export function rollRune(): RuneId {
  const total = ALL_RUNES.reduce((sum, rune) => sum + rune.weight, 0);
  let roll = Math.random() * total;
  for (const rune of ALL_RUNES) {
    roll -= rune.weight;
    if (roll < 0) {
      return rune.id;
    }
  }
  return ALL_RUNES[0]?.id ?? 'power';
}

/** Whether a 룬 does anything for a skill (RuneSpec.skills; every skill when it names none). */
export function runeWorksFor(rune: RuneId, skill: string): boolean {
  const skills = RUNES[rune]?.skills;
  return !skills || (skills as readonly string[]).includes(skill);
}
