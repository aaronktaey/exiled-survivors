import Phaser from 'phaser';

import { GameScene } from '@/scenes/GameScene';

/**
 * Loads assets needed before gameplay starts, then hands off to GameScene.
 * Currently there is nothing to load, so it transitions immediately.
 */
export class BootScene extends Phaser.Scene {
  public static readonly KEY = 'BootScene';

  public constructor() {
    super(BootScene.KEY);
  }

  public preload(): void {
    // Asset loading goes here, e.g.:
    // this.load.image('player', 'assets/player.png');
  }

  public create(): void {
    this.scene.start(GameScene.KEY);
  }
}
