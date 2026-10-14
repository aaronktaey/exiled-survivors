import type { SkillId } from '@/weapons/skills';

/**
 * Engine wiring: canvas and world size, scene keys, where saves and
 * settings live, frame pacing, and the paths to the audio files. These are
 * plumbing rather than tuning.
 */

export const GAME_WIDTH = 960;

export const GAME_HEIGHT = 540;

/** The arena is larger than the viewport; the camera follows the player. */
export const WORLD = {
  width: 2400,
  height: 2400,
} as const;

/**
 * Scene keys. They live here so two scenes can hand off to each other
 * without importing each other's class, which would be a cycle.
 */
export const SCENES = {
  boot: "BootScene",
  menu: "MenuScene",
  game: "GameScene",
  upgrade: "UpgradeScene",
  pause: "PauseScene",
  settings: "SettingsScene",
  credits: "CreditsScene",
  info: "InfoScene",
  confirm: "ConfirmScene",
  gameOver: "GameOverScene",
  inventory: "InventoryScene",
  bones: "BoneScene",
  passives: "PassiveScene",
  slot: "SlotScene",
} as const;

/** Keys the browser keeps our state under. Bump the suffix to invalidate. */
export const STORAGE = {
  settings: "exiled-survivors:settings:v1",
  save: "exiled-survivors:save:v1",
  /** The equipment stash, which outlives any one run. */
  gear: "exiled-survivors:gear:v2",
  /** The passive tree, which outlives it too. */
  passives: "exiled-survivors:passives:v1",
  /** And the purse a run pays into. */
  gold: "exiled-survivors:gold:v1",
  /** The 구슬 drawer, which outlives a run beside the stash. */
  orbs: "exiled-survivors:orbs:v1",
  /** And the 뼈다귀 drawer, spent one run at a time. */
  bones: "exiled-survivors:bones:v1",
} as const;

export const SAVE = {
  /** How often a run writes itself out while playing. */
  autosaveMs: 10_000,
} as const;

/** Bounds for the adjustable settings. */
export const SETTINGS_RANGE = {
  joystickScale: { min: 0.6, max: 1.8, step: 0.1 },
  bgmVolume: { min: 0, max: 1, step: 0.1 },
} as const;

/** Tilt steering, for phones held flat-ish in two hands. */
export const TILT = {
  /** Degrees away from the held-still baseline that read as a full push. */
  fullTiltDeg: 22,
  /** Anything inside this reads as level, so a resting hand does not drift. */
  deadZoneDeg: 3.5,
  /** Smoothing on the raw sensor, 0-1 per frame. */
  smoothing: 0.25,
} as const;

/** Frame pacing. Everything in game logic runs off a clamped delta. */
export const TIMING = {
  /** Upper bound on the delta handed to game logic, in ms. */
  maxDeltaMs: 50,
} as const;

/** Enemies push each other apart instead of running full collisions. */
export const SEPARATION = {
  /**
   * How much room a pair keeps, as a share of their own two sizes. One flat
   * radius meant a 거구 sat half inside another 거구 while two 질주 had a
   * gap: the distance has to come off the pair, not off a constant.
   */
  spacing: 1.05,
  /** A floor under that, so the smallest two still do not share a pixel. */
  minDistance: 14,
  /**
   * And how much room they keep from the survivor, on the same reading of
   * their two sizes. Deliberately less than they keep from each other:
   * contact damage is an overlap, so an enemy that cannot touch the player
   * cannot hurt them either. This is enough to stop one sitting dead centre
   * on the sprite, and not enough to call off the fight.
   */
  playerSpacing: 0.6,
  /** Fraction of the overlap resolved per frame; 1 separates immediately. */
  strength: 0.7,
  /**
   * Spatial-hash cell size. Must be >= the largest distance kept above, or
   * the 3x3 lookup misses pairs: two 우두머리 want 44 x 1.05 of room.
   */
  cellSize: 48,
} as const;

export const DEBUG = {
  /** Enemies added per press of the stress-test key. */
  stressSpawnCount: 100,
  /** Frames averaged for the frame-time readout. */
  sampleFrames: 60,
} as const;

/** How rare a drop is, which is what it sounds like when it lands. */
export type DropTier = 'normal' | 'magic' | 'rare';

export const AUDIO = {
  /**
   * What a drop sounds like, by how rare it is — Path of Exile's own ladder.
   * A weapon is normal up to two 속성, magic at three or four, rare at five
   * or six. A 신성한 조각 is rare whatever else is on the floor; a skill and
   * a potion are normal. It is the same ladder the nameplates use, so what
   * a drop looks like and what it sounds like can never disagree.
   *
   * The rare one is a single file: the hit and the swell behind it were two
   * recordings, mixed down to one so there is nothing to keep in step at
   * playback time. See assets/CREDITS.txt.
   */
  drops: {
    normal: { key: "sfx-drop-normal", file: "assets/normalDrop.mp3", volume: 0.55 },
    magic: { key: "sfx-drop-magic", file: "assets/magicDrop.mp3", volume: 0.5 },
    rare: { key: "sfx-drop-rare", file: "assets/rareDrop.mp3", volume: 0.6 },
  } as const,
  /**
   * How many 속성 a weapon needs to be the next rarity up. One ladder: it
   * is what the drop is labelled as and what it sounds like when it lands,
   * so the two can never disagree.
   */
  dropTiers: {
    magicFrom: 3,
    rareFrom: 5,
  } as const,
  /**
   * Background music. 5.6MB, so it is fetched after the menu is already on
   * screen rather than held in front of the first frame.
   */
  bgm: {
    key: "bgm-main",
    file: "assets/Constance.mp3",
    defaultVolume: 0.35,
  },
  /**
   * Per-skill sound. Several recordings for one skill are variants: each
   * use picks one at random. They are small, so they load at boot.
   */
  skills: {
    meleeStrike: {
      files: ['assets/attack1.mp3', 'assets/attack2.mp3', 'assets/attack3.mp3'],
      volume: 0.45,
    },
    chainLightning: {
      // The file is spelled "Lightening"; matched here rather than renamed.
      files: ['assets/chainLightening1.mp3'],
      volume: 0.45,
    },
    fireball: { files: ['assets/fireball.mp3'], volume: 0.4 },
    iceSpear: { files: ['assets/iceSpear.mp3'], volume: 0.4 },
    // The orbs touch something most frames, so this one is held well apart.
    voidOrb: { files: ['assets/voidSphere.mp3'], volume: 0.35, gapMs: 600 },
    // No clip of its own yet: it borrows 연쇄번개's crack, a little quieter.
    thunderStrike: { files: ['assets/chainLightening1.mp3'], volume: 0.35, gapMs: 200 },
  } as Partial<
    Record<
      SkillId,
      { readonly files: readonly string[]; readonly volume: number; readonly gapMs?: number }
    >
  >,
  /** A skill cannot be heard again inside this, however fast it attacks. */
  minGapMs: 70,
  /** The horn when a 우두머리 walks in. */
  bossAlert: {
    key: 'sfx-boss-alert',
    file: 'assets/bossAlert.mp3',
    volume: 0.6,
  },
  /**
   * The 슬롯머신, as one file in three parts: the spin (a seamless loop, for
   * as long as the reel turns), the clunk when 확정 is pressed, and the
   * fanfare when it lands. Mixed from the five clips in assets-src/slot by
   * tools/mix-slot.py, which prints these offsets — re-run it and copy them
   * here if the clips change.
   */
  slot: {
    key: 'sfx-slot',
    file: 'assets/slot.mp3',
    volume: 0.5,
    run: { start: 0, duration: 6.6 },
    stop: { start: 6.9, duration: 1.071 },
    win: { start: 8.271, duration: 4.9973 },
  },
} as const;

/**
 * How the canvas is sized for the window it lands in. The numbers are in
 * game units: see systems/Viewport.ts for how they are turned into a size.
 */
export const VIEWPORT = {
  /** The short side on a desktop — the shape the game was laid out in. */
  designShortSide: 540,
  /** Never smaller than this, or a menu has nowhere to go. */
  minShortSide: 420,
  /** Bounds on long ÷ short, so neither a square nor an ultrawide goes odd. */
  minAspect: 1.2,
  maxAspect: 2.2,
} as const;
