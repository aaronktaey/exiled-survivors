import Phaser from 'phaser';

import './style.css';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { BootScene, GameScene } from '@/scenes';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.background,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      // Top-down: no gravity in either axis.
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, GameScene],
};

const game = new Phaser.Game(config);

// Console handle for poking at the running game while developing.
// `import.meta.env.DEV` is false in builds, so this drops out of the bundle.
if (import.meta.env.DEV) {
  (window as Window & { game?: Phaser.Game }).game = game;
}
