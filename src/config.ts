/**
 * Central game constants. Keep tunable numbers here so systems and weapons
 * read from one place instead of hard-coding values at their call sites.
 */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/** The arena is larger than the viewport; the camera follows the player. */
export const WORLD = {
  width: 2400,
  height: 2400,
} as const;

export const COLORS = {
  background: '#0b0d12',
  text: '#f4f1e8',
  accent: '#e0564a',
  grid: 0x1a1f2b,
  player: 0x8fd3ff,
  enemy: 0xe0564a,
} as const;

export const DEPTH = {
  ground: 0,
  pickups: 10,
  enemies: 20,
  player: 30,
  projectiles: 40,
  vfx: 50,
  ui: 100,
} as const;

/** Texture keys generated at boot — placeholder art until real sprites land. */
export const TEXTURES = {
  grid: 'tex-grid',
  player: 'tex-player',
  enemy: 'tex-enemy',
} as const;

export const PLAYER = {
  size: 20,
  speed: 220,
} as const;

export const ENEMY = {
  size: 16,
  /** Base chase speed; each enemy gets a small random multiplier on top. */
  speed: 70,
  speedVariance: 0.25,
} as const;

export const SPAWN = {
  /** Delay between spawns at the start of a run, in ms. */
  startIntervalMs: 900,
  /** Floor the interval ramps down to. */
  minIntervalMs: 180,
  /** How much of the gap to the floor is closed each minute. */
  rampPerMinute: 0.55,
  /** Hard cap so the arcade physics step stays cheap. */
  maxAlive: 220,
  /** Spawned this far beyond the camera corner, so they walk into view. */
  offscreenMargin: 80,
} as const;
