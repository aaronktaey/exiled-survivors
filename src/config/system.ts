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
} as const;

/** Keys the browser keeps our state under. Bump the suffix to invalidate. */
export const STORAGE = {
  settings: "exiled-survivors:settings:v1",
  save: "exiled-survivors:save:v1",
} as const;

export const SAVE = {
  /** How often a run writes itself out while playing. */
  autosaveMs: 10_000,
} as const;

/** Bounds for the adjustable settings. */
export const SETTINGS_RANGE = {
  joystickScale: { min: 0.6, max: 1.8, step: 0.1 },
  bgmVolume: { min: 0, max: 1, step: 0.1 },
  /** Nudge per key press while placing the stick. */
  joystickNudgePx: 8,
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
  /** Enemies closer than this get nudged apart. */
  radius: 14,
  /** Fraction of the overlap resolved per frame; 1 separates immediately. */
  strength: 0.5,
  /** Spatial-hash cell size. Must be >= radius for the 3x3 lookup to be sound. */
  cellSize: 28,
} as const;

export const DEBUG = {
  /** Enemies added per press of the stress-test key. */
  stressSpawnCount: 100,
  /** Frames averaged for the frame-time readout. */
  sampleFrames: 60,
} as const;

export const AUDIO = {
  skillDrop: {
    key: "sfx-skill-drop",
    file: "assets/bulletcasing.wav",
    volume: 0.6,
    /** The clip opens with ~1s of silence; start just before the impact. */
    seek: 0.95,
  },
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
  } as Partial<Record<SkillId, { readonly files: readonly string[]; readonly volume: number }>>,
  /** A skill cannot be heard again inside this, however fast it attacks. */
  minGapMs: 70,
} as const;
