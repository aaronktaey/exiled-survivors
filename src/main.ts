import Phaser from 'phaser';

import './style.css';

import { COLORS } from '@/config';
import { settings } from '@/systems/Settings';
import { registerSharpText } from '@/systems/SharpText';
import { gear, gearBonusFor } from '@/systems/Gear';
import { currentCanvasSize } from '@/systems/Viewport';
import {
  BootScene,
  ConfirmScene,
  CreditsScene,
  GameOverScene,
  GameScene,
  GearScene,
  InfoScene,
  MenuScene,
  PauseScene,
  SettingsScene,
  UpgradeScene,
} from '@/scenes';

// Language first: every scene reads its text as it is built.
settings.prime();
// And every label it builds renders at more than one pixel per pixel.
registerSharpText();

// The canvas is the shape of the window it opens in, so a phone is not
// handed a letterboxed strip of a desktop layout.
const { width, height } = currentCanvasSize();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width,
  height,
  backgroundColor: COLORS.background,
  // No pixel-art assets yet, and nearest-neighbour upscaling under Scale.FIT
  // chews up the HUD and menu text. Revisit when real sprites land.
  antialias: true,
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
  scene: [
    BootScene,
    MenuScene,
    GameScene,
    UpgradeScene,
    PauseScene,
    SettingsScene,
    CreditsScene,
    InfoScene,
    ConfirmScene,
    GameOverScene,
    GearScene,
  ],
};

const game = new Phaser.Game(config);

// Console handles for poking at the running game while developing. The
// stash is one of them because it outlives a run, so it cannot be reached
// through a scene. `import.meta.env.DEV` is false in builds, so this drops
// out of the bundle.
if (import.meta.env.DEV) {
  const dev = window as Window & {
    game?: Phaser.Game;
    gear?: typeof gear;
    gearBonusFor?: typeof gearBonusFor;
  };
  dev.game = game;
  dev.gear = gear;
  dev.gearBonusFor = gearBonusFor;
}
