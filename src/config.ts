import type { SkillId } from "@/weapons/skills";

/**
 * Central game constants. Keep tunable numbers here so systems and weapons
 * read from one place instead of hard-coding values at their call sites.
 */

/**
 * Difficulty dials. Scale enemy toughness and each skill's damage from one
 * place, without touching the base numbers further down.
 */
export const BALANCE = {
  /** Multiplies every enemy's max HP. */
  enemyHpScale: 1,
  /** Multiplies each skill's damage, on top of its upgraded value. */
  damageScale: {
    meleeStrike: 1,
    fireball: 1,
    chainLightning: 1,
  } as Record<SkillId, number>,
};

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

export const DAMAGE_NUMBERS = {
  /** Pooled up front; the oldest is recycled once they are all in use. */
  poolSize: 96,
  lifespanMs: 650,
  /** Upward drift, px per second. */
  riseSpeed: 54,
  fontSize: '13px',
} as const;

/**
 * Sound effects. Paths go through BASE_URL so they resolve both on the dev
 * server (/) and on the Pages project site (/exiled-survivors/).
 */
/**
 * Hand-picked icons from the Raven Fantasy pack (see assets/icons/CREDITS.txt).
 * Sprites are 32x32 and drawn down to `size`; the rest of the art is still
 * generated at boot.
 */
export const ICONS = {
  gem: { file: 'assets/icons/xp-gem.png', size: 14 },
  projectile: { file: 'assets/icons/fireball.png', size: 16 },
  skillOrb: { file: 'assets/icons/skill-orb.png', size: 22 },
} as const;

export const AUDIO = {
  skillDrop: {
    key: 'sfx-skill-drop',
    file: 'assets/bulletcasing.wav',
    volume: 0.6,
    /** The clip opens with ~1s of silence; start just before the impact. */
    seek: 0.95,
  },
} as const;

export const DEBUG = {
  /** Enemies added per press of the stress-test key. */
  stressSpawnCount: 100,
  /** Frames averaged for the frame-time readout. */
  sampleFrames: 60,
} as const;

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/** The arena is larger than the viewport; the camera follows the player. */
export const WORLD = {
  width: 2400,
  height: 2400,
} as const;

export const COLORS = {
  background: "#0b0d12",
  text: "#f4f1e8",
  muted: "#8b93a7",
  accent: "#e0564a",
  /** Same accent as a number, for shapes (text takes the string form). */
  accentFill: 0xe0564a,
  grid: 0x1a1f2b,
  player: 0x8fd3ff,
  enemy: 0xe0564a,
  projectile: 0xffe9a3,
  gem: 0x7ef0b0,
  skillOrb: 0xffc14d,
  panel: 0x141924,
  panelActive: 0x1e2636,
  panelEdge: 0x2b3445,
  hpFill: 0xe0564a,
  xpFill: 0x7ef0b0,
  barTrack: 0x222a38,
  stick: 0xf4f1e8,
  meleeArc: 0xdfe7f5,
  damageText: '#ffe9a3',
  debugText: '#7ef0b0',
  fireball: 0xffa63d,
  /** Bright core of a lightning arc, over a wider soft glow. */
  lightning: 0xdff1ff,
  lightningGlow: 0x5ea8ff,
} as const;

export const DEPTH = {
  ground: 0,
  pickups: 10,
  enemies: 20,
  player: 30,
  projectiles: 40,
  vfx: 50,
  /** The player's health bar sits above the crowd it is fighting. */
  healthBar: 55,
  /** Ground item labels read above the crowd. */
  skillDrop: 60,
  ui: 100,
} as const;

/** Texture keys generated at boot — placeholder art until real sprites land. */
export const TEXTURES = {
  grid: "tex-grid",
  player: "tex-player",
  enemy: "tex-enemy",
  projectile: "tex-projectile",
  gem: "tex-gem",
  skillOrb: "tex-skill-orb",
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
  maxHp: 30,
  contactDamage: 1,
} as const;

export const SPAWN = {
  startIntervalMs: 900,
  minIntervalMs: 180,
  rampPerMinute: 0.55,
  maxAlive: 220,
  offscreenMargin: 80,
} as const;

export const HUD = {
  margin: 16,
  /** XP bar spans the full width along the very bottom edge. */
  xpBarHeight: 10,
  /** Health bar floats just above the player sprite. */
  healthBar: {
    width: 60,
    height: 6,
    /** Gap between the sprite's top edge and the bar. */
    gap: 6,
  },
} as const;

export const MELEE = {
  /** Full width of the swing arc, in radians. */
  arcRadians: Math.PI * 0.8,
  /** How long the swing flash stays on screen. */
  flashMs: 150,
} as const;

/** The instant arc 연쇄번개 draws as it walks through a crowd. */
export const LIGHTNING = {
  /** How far the arc may jump from one victim to the next. */
  chainRadius: 120,
  /** How long the bolt stays on screen. */
  flashMs: 170,
  /** Zig-zag resolution, and how far each kink strays from a straight line. */
  segments: 7,
  jitter: 14,
  coreWidth: 2,
  glowWidth: 6,
} as const;

export const SKILL_DROP = {
  /** Chance that killing an enemy drops a skill. */
  chance: 0.03,
  /** How long a dropped skill stays on the ground. XP gems never expire. */
  lifespanMs: 60_000,
  /** Final stretch, during which it blinks a warning before vanishing. */
  warningMs: 10_000,
  /** Blink period at the start of the warning, and at the very end. */
  blinkSlowMs: 700,
  blinkFastMs: 80,
  /** Radius of the halo that blinks behind the orb. */
  glowRadius: 12,
  glowAlpha: 0.65,
} as const;

/** Ground label for a dropped skill, baked into a texture at boot. */
export const SKILL_LABEL = {
  text: "#FE0000",
  background: 0xffffff,
  border: 0xfe0000,
  borderWidth: 1,
  paddingX: 5,
  paddingY: 3,
  fontSize: "24px",
  /** Gap between the orb on the ground and the plate above it. */
  gap: 5,
} as const;

export const WEAPON = {
  size: 8,
  /** Hard cap on a projectile's life, so strays never pile up. */
  lifespanMs: 1400,
  maxProjectiles: 240,
  /**
   * A shot may overfly its skill's range by this factor before it fizzles,
   * so a target that backs off at the edge of range is still caught.
   */
  rangeOvershoot: 1.2,
} as const;

/** A skill's stat line. Upgrades move these; BALANCE scales damage on top. */
export interface SkillBaseStats {
  readonly damage: number;
  /** Attacks per second. */
  readonly attackSpeed: number;
  /** How far the skill reaches to pick a target, in px. */
  readonly range: number;
  /** Projectile travel speed in px/s. Ignored by melee skills. */
  readonly projectileSpeed: number;
  /** Extra enemies an arc jumps to after the first. Ignored unless it chains. */
  readonly chainCount: number;
}

/** Where every skill starts before a single upgrade is picked. */
export const SKILL_BASE: Record<SkillId, SkillBaseStats> = {
  meleeStrike: { damage: 10, attackSpeed: 1.5, range: 44, projectileSpeed: 0, chainCount: 0 },
  fireball: { damage: 10, attackSpeed: 1.5, range: 100, projectileSpeed: 230, chainCount: 0 },
  // Slower than the other two, because one cast lands on three enemies.
  chainLightning: { damage: 10, attackSpeed: 1, range: 160, projectileSpeed: 0, chainCount: 2 },
};

/** How much one pick of each upgrade adds. Keys match SkillBaseStats. */
export const UPGRADE_STEP = {
  damage: 1,
  attackSpeed: 1,
  range: 10,
  projectileSpeed: 20,
  chainCount: 1,
} as const;

export const STATS = {
  /** Floor on the resulting cooldown, so attack speed cannot outrun the frame. */
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
  return Math.max(
    1,
    Math.round(A * Math.pow(level + K, B) * Math.pow(R, level) * SCALE),
  );
}
