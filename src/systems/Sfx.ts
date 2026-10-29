import Phaser from 'phaser';

import { AUDIO, type EnemyKind, type EnemySoundPart } from '@/config';
import { settings } from '@/systems/Settings';
import type { SkillId } from '@/weapons/skills';

/** An effect's own volume under the player's 효과음 음량. Every sound but the music goes through it. */
export const effectVolume = (volume: number): number => volume * settings.value.sfxVolume;

/** Cache key for one variant of one skill's sound. */
const keyFor = (skill: SkillId, index: number): string => `sfx-${skill}-${index}`;

/** Cache key for one variant of one of an enemy kind's sounds. */
const enemyKeyFor = (kind: EnemyKind, part: EnemySoundPart, index: number): string =>
  `sfx-enemy-${kind}-${part}-${index}`;

/** The same two, for an enemy's sounds, by kind and part. */
const enemyLast = new Map<string, number>();
const enemyReadyAt = new Map<string, number>();

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
  /** Queues every skill clip, the boss horn and the choice chime. Called from BootScene. */
  preload(scene: Phaser.Scene): void {
    const base = import.meta.env.BASE_URL;

    scene.load.audio(AUDIO.bossAlert.key, `${base}${AUDIO.bossAlert.file}`);
    scene.load.audio(AUDIO.choice.key, `${base}${AUDIO.choice.file}`);

    for (const [skill, clip] of Object.entries(AUDIO.skills)) {
      if (!clip) {
        continue;
      }

      clip.files.forEach((file, index) => {
        scene.load.audio(keyFor(skill as SkillId, index), `${base}${file}`);
      });
    }

    for (const [kind, parts] of Object.entries(AUDIO.enemies)) {
      for (const [part, sound] of Object.entries(parts ?? {})) {
        sound?.files.forEach((file, index) => {
          scene.load.audio(enemyKeyFor(kind as EnemyKind, part as EnemySoundPart, index), `${base}${file}`);
        });
      }
    }
  },

  /** One of an enemy kind's sounds, if it has that one and it is not resting. */
  playEnemy(scene: Phaser.Scene, kind: EnemyKind, part: EnemySoundPart): void {
    const sound = AUDIO.enemies[kind]?.[part];
    if (!sound || sound.files.length === 0) {
      return;
    }
    const id = `${kind}-${part}`;
    const now = scene.time.now;
    if (now < (enemyReadyAt.get(id) ?? 0)) {
      return;
    }
    enemyReadyAt.set(id, now + (sound.gapMs ?? AUDIO.minGapMs));

    let index = Math.floor(Math.random() * sound.files.length);
    if (sound.files.length > 1 && index === enemyLast.get(id)) {
      index = (index + 1) % sound.files.length;
    }
    enemyLast.set(id, index);
    const key = enemyKeyFor(kind, part, index);
    if (scene.cache.audio.exists(key)) {
      scene.sound.play(key, { volume: effectVolume(sound.volume) });
    }
  },

  /** Plays one of a skill's clips, if it has any and is not still ringing. */
  playSkill(scene: Phaser.Scene, skill: SkillId): void {
    const clip = AUDIO.skills[skill];
    if (!clip) {
      return;
    }

    // A very fast weapon would otherwise stack dozens of copies a second,
    // and a skill that touches something every frame needs a longer rest.
    const now = scene.time.now;
    if (now < (readyAt.get(skill) ?? 0)) {
      return;
    }
    readyAt.set(skill, now + (clip.gapMs ?? AUDIO.minGapMs));

    const index = sfx.pick(skill, clip.files.length);
    const key = keyFor(skill, index);
    if (!scene.cache.audio.exists(key)) {
      return;
    }

    scene.sound.play(key, { volume: effectVolume(clip.volume) });
  },

  /** The horn that announces a 우두머리. */
  playBossAlert(scene: Phaser.Scene): void {
    if (!scene.cache.audio.exists(AUDIO.bossAlert.key)) {
      return;
    }

    scene.sound.play(AUDIO.bossAlert.key, { volume: effectVolume(AUDIO.bossAlert.volume) });
  },

  /** A choice coming up mid-run, shown or taken by 전술 교본. */
  playChoice(scene: Phaser.Scene): void {
    if (!scene.cache.audio.exists(AUDIO.choice.key)) {
      return;
    }

    scene.sound.play(AUDIO.choice.key, { volume: effectVolume(AUDIO.choice.volume) });
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
    enemyLast.clear();
    enemyReadyAt.clear();
  },
};
