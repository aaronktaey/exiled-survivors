/**
 * What a run gained, counted as it happened (0.91, the user's ask): every
 * level-up, and every skill level — a skill taken, an upgrade that raised
 * it. Kept here in module scope, not on the scene, like the second clock
 * (RunLedger.ts). At the end the run's levels must come to what was
 * counted; a run whose levels were changed some other way is not offered
 * to the ranking, and nothing says why.
 */
let levelUps = 0;
let skillLevels = 0;

export interface RunTallyCount {
  readonly levelUps: number;
  readonly skillLevels: number;
}

export const runTally = {
  /** A fresh run, or one coming back from a save at what it had counted. */
  begin(from: RunTallyCount = { levelUps: 0, skillLevels: 0 }): void {
    levelUps = Math.max(0, Math.floor(from.levelUps));
    skillLevels = Math.max(0, Math.floor(from.skillLevels));
  },

  levelUp(): void {
    levelUps += 1;
  },

  skillLevel(by = 1): void {
    skillLevels += by;
  },

  get value(): RunTallyCount {
    return { levelUps, skillLevels };
  },

  /** The character's level is one plus every level-up; the skills' levels add up to every one gained. */
  matches(level: number, totalSkillLevels: number): boolean {
    return level === 1 + levelUps && totalSkillLevels === skillLevels;
  },
};
