import Phaser from 'phaser';

import { AUDIO } from '@/config';
import { settings } from '@/systems/Settings';
import type { SkillId } from '@/weapons/skills';

/** An effect's own volume under the player's 효과음 음량. Every sound but the music goes through it. */
export const effectVolume = (volume: number): number => volume * settings.value.sfxVolume;

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
  /** Queues every skill clip, and the boss horn. Called from BootScene. */
  preload(scene: Phaser.Scene): void {
    const base = import.meta.env.BASE_URL;

    scene.load.audio(AUDIO.bossAlert.key, `${base}${AUDIO.bossAlert.file}`);
    scene.load.audio(AUDIO.slot.key, `${base}${AUDIO.slot.file}`);

    for (const [skill, clip] of Object.entries(AUDIO.skills)) {
      if (!clip) {
        continue;
      }

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

  /**
   * The 슬롯머신's spin: one section of the slot file, looping, handed back
   * so the reel can fade it when it stops. Null when the file did not load.
   */
  startSlotSpin(scene: Phaser.Scene): Phaser.Sound.BaseSound | null {
    const clip = AUDIO.slot;
    if (!scene.cache.audio.exists(clip.key)) {
      return null;
    }

    const spin = scene.sound.add(clip.key, { volume: effectVolume(clip.volume) });
    spin.addMarker({ name: 'run', ...clip.run, config: { loop: true, volume: effectVolume(clip.volume) } });
    spin.play('run');
    return spin;
  },

  /** The slot file's one-shot: the clunk on 확정. */
  playSlot(scene: Phaser.Scene, part: 'stop'): void {
    const clip = AUDIO.slot;
    if (!scene.cache.audio.exists(clip.key)) {
      return;
    }

    scene.sound.play(clip.key, { name: part, ...clip[part], config: { volume: effectVolume(clip.volume) } });
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
