// First of all: a player's things brought over from the old address are
// written in before any store reads storage (see CarryOver.ts).
import '@/systems/CarryOver';
import Phaser from 'phaser';

import './style.css';

import * as balance from '@/config';
import { COLORS, RETIRED_STORAGE } from '@/config';
import { settings } from '@/systems/Settings';
import { registerSharpText } from '@/systems/SharpText';
import { gear, gearBonusFor, orbApplied } from '@/systems/Gear';
import { ranking } from '@/systems/Ranking';
import { liveUpdate } from '@/systems/LiveUpdate';
import { personal } from '@/systems/PersonalBest';
import { account } from '@/systems/Account';
import { cloudSave } from '@/systems/CloudSave';
import { ore } from '@/systems/Ore';
import { critMultiplierFor } from '@/systems/Modifiers';
import { bones as bonesStore } from '@/systems/Bones';
import { orbs } from '@/systems/Orbs';
import { passives } from '@/systems/Passives';
import { openRecord, sealRecord } from '@/systems/Seal';
import { itemFilter } from '@/systems/ItemFilter';
import { tuning } from '@/systems/Tuning';
import { podium } from '@/systems/Podium';
import { currentCanvasSize, fitStage } from '@/systems/Viewport';
import {
  AccountScene,
  ConflictScene,
  FilterScene,
  TuningScene,
  BootScene,
  ConfirmScene,
  CreditsScene,
  GameOverScene,
  GameScene,
  BoneScene,
  InventoryScene,
  ForgeScene,
  OrbScene,
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
  PodiumScene,
} from '@/scenes';

// What nothing reads any more goes, so it is not synced about for ever.
for (const key of RETIRED_STORAGE) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage off: there is nothing to clear.
  }
}

// Language first: every scene reads its text as it is built.
settings.prime();
// And every label it builds renders at more than one pixel per pixel.
registerSharpText();

// The page first — on a phone, the height actually shown and an inset from
// the glass — then the canvas, the shape of what is left, so a phone is not
// handed a letterboxed strip of a desktop layout.
fitStage();
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
    ForgeScene,
  OrbScene,
    PassiveScene,
    BoneScene,
    AccountScene,
    ConflictScene,
    FilterScene,
    TuningScene,
    PodiumScene,
  ],
};

// 폰트 비교 (dev server only): the picked candidate is loaded before a word is drawn.
// The dynamic import keeps it out of the deployed bundle.
if (import.meta.env.DEV) {
  const { primeDevFont } = await import('@/systems/DevFonts');
  await primeDevFont();
}

const game = new Phaser.Game(config);
// The scale manager follows window resizes on its own; a phone's bars coming
// and going only move the visual viewport, so it is told then too (after
// fitStage, registered first, has set the stage's new height).
window.visualViewport?.addEventListener('resize', () => game.scale.refresh());

// Asks, now and then, whether a newer version is out (never on the dev server).
liveUpdate.start();
// Everyone's 밸런스 values, laid over balance.ts before the first run; and the
// admin's own draft over those once the account says it is the admin's.
void tuning.load(game);
account.onChange(() => tuning.settle());

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
    sealRecord?: typeof sealRecord;
    openRecord?: typeof openRecord;
    ore?: typeof ore;
    orbs?: typeof orbs;
    bones?: typeof bonesStore;
    orbApplied?: typeof orbApplied;
    critMultiplierFor?: typeof critMultiplierFor;
    ranking?: typeof ranking;
    liveUpdate?: typeof liveUpdate;
    personal?: typeof personal;
    itemFilter?: typeof itemFilter;
    tuning?: typeof tuning;
    account?: typeof account;
    cloudSave?: typeof cloudSave;
    podium?: typeof podium;
    settings?: typeof settings;
  };
  dev.game = game;
  // So a test can read a tuned number instead of carrying a copy of it.
  dev.config = balance;
  dev.gear = gear;
  dev.gearBonusFor = gearBonusFor;
  dev.passives = passives;
  dev.sealRecord = sealRecord;
  dev.openRecord = openRecord;
  dev.ore = ore;
  dev.orbs = orbs;
  dev.bones = bonesStore;
  dev.orbApplied = orbApplied;
  dev.critMultiplierFor = critMultiplierFor;
  dev.ranking = ranking;
  dev.liveUpdate = liveUpdate;
  dev.personal = personal;
  dev.itemFilter = itemFilter;
  dev.tuning = tuning;
  dev.account = account;
  dev.cloudSave = cloudSave;
  dev.podium = podium;
  dev.settings = settings;
}
