// First of all: a player's things brought over from the old address are
// written in before any store reads storage (see CarryOver.ts).
import '@/systems/CarryOver';
import Phaser from 'phaser';

import './style.css';

import * as balance from '@/config';
import { COLORS, RETIRED_STORAGE } from '@/config';
import { settings } from '@/systems/Settings';
import { registerSharpText } from '@/systems/SharpText';
import { gearBonusFor, orbApplied, rollGearItem } from '@/systems/Gear';
import { ranking } from '@/systems/Ranking';
import { liveUpdate } from '@/systems/LiveUpdate';
import { personal } from '@/systems/PersonalBest';
import { account } from '@/systems/Account';
import { cloudSave } from '@/systems/CloudSave';
import { critMultiplierFor } from '@/systems/Modifiers';
import { bones as bonesStore } from '@/systems/Bones';
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
  RunGearScene,
  GearPickScene,
  OrbScene,
  RuneScene,
  RuneChiselScene,
  InfoScene,
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

// The equipment stash and the 구슬 drawer are gone (gear lives and dies with
// a run now): what a browser still holds of them is cleared.
for (const key of RETIRED_STORAGE) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage blocked: there is nothing held to clear, then.
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
    RunGearScene,
  GearPickScene,
  OrbScene,
    RuneScene,
    RuneChiselScene,
    BoneScene,
    AccountScene,
    ConflictScene,
    FilterScene,
    TuningScene,
    PodiumScene,
  ],
};

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
    rollGearItem?: typeof rollGearItem;
    gearBonusFor?: typeof gearBonusFor;
    sealRecord?: typeof sealRecord;
    openRecord?: typeof openRecord;
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
  };
  dev.game = game;
  // So a test can read a tuned number instead of carrying a copy of it.
  dev.config = balance;
  dev.rollGearItem = rollGearItem;
  dev.gearBonusFor = gearBonusFor;
  dev.sealRecord = sealRecord;
  dev.openRecord = openRecord;
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
}
