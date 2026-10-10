/**
 * Central game constants. Keep tunable numbers here so systems and weapons
 * read from one place instead of hard-coding values at their call sites.
 */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const COLORS = {
  background: '#0b0d12',
  text: '#f4f1e8',
  accent: '#e0564a',
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
