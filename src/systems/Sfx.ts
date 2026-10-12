import Phaser from 'phaser';

import { AUDIO } from '@/config';
import type { SkillId } from '@/weapons/skills';

/** Cache key for one variant of one skill's sound. */
const keyFor = (skill: SkillId, index: number): string => `sfx-${skill}-${index}`;

/** The variant each skill played last, so the next one is a different clip. */
const lastPlayed = new Map<SkillId, number>();
/** When each skill may be heard again, by scene clock. */
const readyAt = new Map<SkillId, number>();

/**
 * Skill sound effects. A skill can have several recordings; each use picks
 * one at random, never the same one twice in a row, so a weapon firing
 * once a second does not turn into a metronome.
 */
export const sfx = {
  /** Queues every skill clip. Called from BootScene.preload. */
  preload(scene: Phaser.Scene): void {
    const base = import.meta.env.BASE_URL;

    for (const [skill, clip] of Object.entries(AUDIO.skills)) {
      clip.files.forEach((file, index) => {
        scene.load.audio(keyFor(skill as SkillId, index), `${base}${file}`);
      });
    }
  },

  /** Plays one of a skill's clips, if it has any and is not still ringing. */
  playSkill(scene: Phaser.Scene, skill: SkillId): void {
    const clip = AUDIO.skills[skill];
    if (!clip) {
      return;
    }

    // A very fast weapon would otherwise stack dozens of copies a second.
    const now = scene.time.now;
    if (now < (readyAt.get(skill) ?? 0)) {
      return;
    }
    readyAt.set(skill, now + AUDIO.minGapMs);

    const index = sfx.pick(skill, clip.files.length);
    const key = keyFor(skill, index);
    if (!scene.cache.audio.exists(key)) {
      return;
    }

    scene.sound.play(key, { volume: clip.volume });
  },

  /** A random variant, avoiding an immediate repeat when there is a choice. */
  pick(skill: SkillId, count: number): number {
    if (count <= 1) {
      return 0;
    }

    const last = lastPlayed.get(skill);
    let index = Math.floor(Math.random() * count);
    if (index === last) {
      index = (index + 1 + Math.floor(Math.random() * (count - 1))) % count;
    }

    lastPlayed.set(skill, index);
    return index;
  },

  /** Test seam: forgets the gap and the last-played variant. */
  reset(): void {
    lastPlayed.clear();
    readyAt.clear();
  },
};
