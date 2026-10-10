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
  muted: '#8b93a7',
  accent: '#e0564a',
  /** Same accent as a number, for shapes (text takes the string form). */
  accentFill: 0xe0564a,
  grid: 0x1a1f2b,
  player: 0x8fd3ff,
  enemy: 0xe0564a,
  projectile: 0xffe9a3,
  gem: 0x7ef0b0,
  panel: 0x141924,
  panelActive: 0x1e2636,
  panelEdge: 0x2b3445,
  hpFill: 0xe0564a,
  xpFill: 0x7ef0b0,
  barTrack: 0x222a38,
  stick: 0xf4f1e8,
  meleeArc: 0xdfe7f5,
  fireball: 0xffa63d,
} as const;

export const DEPTH = {
  ground: 0,
  pickups: 10,
  enemies: 20,
  player: 30,
  projectiles: 40,
  vfx: 50,
  /** Ground item labels read above the crowd. */
  skillDrop: 60,
  ui: 100,
} as const;

/** Texture keys generated at boot — placeholder art until real sprites land. */
export const TEXTURES = {
  grid: 'tex-grid',
  player: 'tex-player',
  enemy: 'tex-enemy',
  projectile: 'tex-projectile',
  gem: 'tex-gem',
} as const;

export const PLAYER = {
  size: 20,
  speed: 220,
  maxHp: 20,
  /** Invulnerability after taking a hit, so contact does not drain instantly. */
  invulnerableMs: 600,
  /** XP gems within this range drift toward the player. */
  pickupRadius: 110,
  pickupSpeed: 420,
} as const;

export const ENEMY = {
  size: 16,
  speed: 70,
  speedVariance: 0.25,
  maxHp: 3,
  contactDamage: 1,
} as const;

export const SPAWN = {
  startIntervalMs: 900,
  minIntervalMs: 180,
  rampPerMinute: 0.55,
  maxAlive: 220,
  offscreenMargin: 80,
} as const;

export const MELEE = {
  /** How far the swing reaches from the player's centre. */
  reach: 88,
  /** Full width of the swing arc, in radians. */
  arcRadians: Math.PI * 0.8,
  /** How long the swing flash stays on screen. */
  flashMs: 150,
} as const;

export const SKILL_DROP = {
  /** Chance that killing an enemy drops a skill the player does not own. */
  chance: 0.03,
  maxOnGround: 24,
} as const;

/** Ground label for a dropped skill, baked into a texture at boot. */
export const SKILL_LABEL = {
  text: '#FE0000',
  background: 0xffffff,
  border: 0xfe0000,
  borderWidth: 2,
  paddingX: 10,
  paddingY: 6,
  fontSize: '16px',
} as const;

export const WEAPON = {
  size: 8,
  projectileSpeed: 460,
  /** Projectiles vanish after this long, so strays do not pile up. */
  lifespanMs: 1400,
  maxProjectiles: 240,
  /** Enemies beyond this are ignored when picking a target. */
  rangePx: 520,
} as const;

/** Starting values for the two stats the level-up screen upgrades. */
export const STATS = {
  baseDamage: 1,
  /** Shots per second. Each "공격속도 +1" adds exactly 1 to this. */
  baseAttackSpeed: 1.5,
  /** Floor on the resulting cooldown, so the stat cannot outrun the frame. */
  minCooldownMs: 50,
} as const;

export const JOYSTICK = {
  /** Radius of the outer ring. */
  baseRadius: 56,
  thumbRadius: 26,
  /** Distance from the bottom-left corner to the ring's centre. */
  margin: 96,
  /** Touches this far from the ring's centre still grab it. */
  grabRadius: 150,
  /** Below this tilt the stick reads as centred, to kill thumb jitter. */
  deadZone: 0.18,
  baseAlpha: 0.18,
  thumbAlpha: 0.38,
} as const;

export const XP = {
  size: 8,
  perEnemy: 1,
} as const;

/** PoE 경험치 곡선 근사식 (모양 유지, 크기는 SCALE로 조절) */
export const XP_CURVE = {
  A: 41.5,
  K: 1.75,
  B: 2.41,
  R: 1.0483,
  SCALE: 0.01, // 1.0 = PoE 원본 수치
} as const;

/** XP needed to leave `level`. Grows ~geometrically: 5, 11, 20, 34, 52, ... */
export function xpToNextLevel(level: number): number {
  const { A, K, B, R, SCALE } = XP_CURVE;
  return Math.max(1, Math.round(A * Math.pow(level + K, B) * Math.pow(R, level) * SCALE));
}
