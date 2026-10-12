import Phaser from 'phaser';

import { AUDIO } from '@/config';
import { settings } from '@/systems/Settings';

const REGISTRY_KEY = 'bgm-track';

/**
 * The background music, owned by the game rather than any one scene so it
 * plays straight through the title, the run and the pause screen.
 *
 * The clip is several megabytes, so it is fetched in the background once
 * the first screen is already up, and it starts as soon as it lands — or,
 * when the browser is still holding audio back, on the first input.
 */
export const bgm = {
  /** Loads the track if needed, then plays it. Safe to call repeatedly. */
  start(scene: Phaser.Scene): void {
    const existing = scene.game.registry.get(REGISTRY_KEY) as Phaser.Sound.BaseSound | undefined;
    if (existing) {
      bgm.applyVolume(scene);
      if (!existing.isPlaying) {
        bgm.play(scene, existing);
      }
      return;
    }

    if (scene.cache.audio.exists(AUDIO.bgm.key)) {
      bgm.attach(scene);
      return;
    }

    // A loader of our own, started after the scene is drawn, so the menu
    // does not wait on a multi-megabyte download.
    scene.load.audio(AUDIO.bgm.key, `${import.meta.env.BASE_URL}${AUDIO.bgm.file}`);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (scene.scene.isActive() || scene.scene.isPaused()) {
        bgm.attach(scene);
      }
    });
    scene.load.start();
  },

  setVolume(scene: Phaser.Scene, volume: number): void {
    settings.update({ bgmVolume: volume });
    bgm.applyVolume(scene);
  },

  applyVolume(scene: Phaser.Scene): void {
    const track = scene.game.registry.get(REGISTRY_KEY) as Phaser.Sound.BaseSound | undefined;
    const volume = settings.value.bgmVolume;
    (track as Phaser.Sound.WebAudioSound | undefined)?.setVolume(volume);
  },

  stop(scene: Phaser.Scene): void {
    const track = scene.game.registry.get(REGISTRY_KEY) as Phaser.Sound.BaseSound | undefined;
    track?.stop();
  },

  get isPlaying(): boolean {
    return this.track?.isPlaying === true;
  },

  track: undefined as Phaser.Sound.BaseSound | undefined,

  attach(scene: Phaser.Scene): void {
    const track = scene.sound.add(AUDIO.bgm.key, {
      loop: true,
      volume: settings.value.bgmVolume,
    });
    scene.game.registry.set(REGISTRY_KEY, track);
    bgm.track = track;
    bgm.play(scene, track);
  },

  play(scene: Phaser.Scene, track: Phaser.Sound.BaseSound): void {
    track.play();

    // Autoplay rules: the manager stays locked until the player touches
    // something, and unlocks itself once they do.
    if (scene.sound.locked) {
      scene.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
        if (!track.isPlaying) {
          track.play();
        }
      });
    }
  },
};
