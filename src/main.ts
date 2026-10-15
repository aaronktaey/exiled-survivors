// First of all: a player's things brought over from the old address are
// written in before any store reads storage (see CarryOver.ts).
import '@/systems/CarryOver';
import Phaser from 'phaser';

import './style.css';

import * as balance from '@/config';
import { COLORS } from '@/config';
import { settings } from '@/systems/Settings';
import { registerSharpText } from '@/systems/SharpText';
import { gear, gearBonusFor, orbApplied } from '@/systems/Gear';
import { ranking } from '@/systems/Ranking';
import { account } from '@/systems/Account';
import { cloudSave } from '@/systems/CloudSave';
import { gold } from '@/systems/Gold';
import { critMultiplierFor } from '@/systems/Modifiers';
import { bones as bonesStore } from '@/systems/Bones';
import { orbs } from '@/systems/Orbs';
import { passives } from '@/systems/Passives';
import { currentCanvasSize } from '@/systems/Viewport';
import {
  AccountScene,
  ConflictScene,
  BootScene,
  ConfirmScene,
  CreditsScene,
  GameOverScene,
  GameScene,
  BoneScene,
  InventoryScene,
  InfoScene,
  PassiveScene,
  MenuScene,
  PauseScene,
  SettingsScene,
  UpgradeScene,
  SlotScene,
  RankingScene,
  RankEntryScene,
  SkillPickScene,
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
    SlotScene,
    RankingScene,
    RankEntryScene,
    SkillPickScene,
    PauseScene,
    SettingsScene,
    CreditsScene,
    InfoScene,
    ConfirmScene,
    GameOverScene,
    InventoryScene,
    PassiveScene,
    BoneScene,
    AccountScene,
    ConflictScene,
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
    config?: typeof balance;
    gear?: typeof gear;
    gearBonusFor?: typeof gearBonusFor;
    passives?: typeof passives;
    gold?: typeof gold;
    orbs?: typeof orbs;
    bones?: typeof bonesStore;
    orbApplied?: typeof orbApplied;
    critMultiplierFor?: typeof critMultiplierFor;
    ranking?: typeof ranking;
    account?: typeof account;
    cloudSave?: typeof cloudSave;
  };
  dev.game = game;
  // So a test can read a tuned number instead of carrying a copy of it.
  dev.config = balance;
  dev.gear = gear;
  dev.gearBonusFor = gearBonusFor;
  dev.passives = passives;
  dev.gold = gold;
  dev.orbs = orbs;
  dev.bones = bonesStore;
  dev.orbApplied = orbApplied;
  dev.critMultiplierFor = critMultiplierFor;
  dev.ranking = ranking;
  dev.account = account;
  dev.cloudSave = cloudSave;
}
