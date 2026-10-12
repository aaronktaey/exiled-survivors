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
    iceSpear: 1,
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
  fontSize: "13px",
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
  gem: { file: "assets/icons/xp-gem.png", size: 14 },
  projectile: { file: "assets/icons/fireball.png", size: 16 },
  skillOrb: { file: "assets/icons/skill-orb.png", size: 22 },
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
  gameOver: "GameOverScene",
} as const;

/** Where the shell screens — title, settings, credits, pause — are tuned. */
export const MENU = {
  buttonWidth: 300,
  buttonHeight: 46,
  buttonGap: 12,
  /** Side of one logo pixel, in screen px. */
  logoPixel: 6,
  /** How far the logo drifts, and how long one full bob takes. */
  logoBobPx: 10,
  logoBobMs: 2600,
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

export const PAUSE_BUTTON = {
  size: 34,
  margin: 10,
} as const;

export const COLORS = {
  background: "#0b0d12",
  text: "#f4f1e8",
  /** Same ink as a number, for shapes. */
  textFill: 0xf4f1e8,
  muted: "#8b93a7",
  accent: "#e0564a",
  /** Same accent as a number, for shapes (text takes the string form). */
  accentFill: 0xe0564a,
  grid: 0x1a1f2b,
  player: 0x8fd3ff,
  enemy: 0xe0564a,
  enemyBrute: 0xb44bd1,
  enemyRunner: 0xf2b134,
  enemyShooter: 0x5fc27e,
  /** Enemy fire, kept well away from any colour the player's own shots use. */
  enemyShot: 0xff7a9c,
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
  /** The pixel logo: bone white over a red offset, like a stamped sign. */
  logo: 0xf4f1e8,
  logoShadow: 0xe0564a,
  damageText: "#ffe9a3",
  debugText: "#7ef0b0",
  fireball: 0xffa63d,
  /** Bright core of a lightning arc, over a wider soft glow. */
  lightning: 0xdff1ff,
  lightningGlow: 0x5ea8ff,
  iceSpear: 0x9fe8ff,
  iceSpearEdge: 0x3f8fd0,
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
  enemyBrute: "tex-enemy-brute",
  enemyRunner: "tex-enemy-runner",
  enemyShooter: "tex-enemy-shooter",
  enemyShot: "tex-enemy-shot",
  projectile: "tex-projectile",
  iceShard: "tex-ice-shard",
  gem: "tex-gem",
  skillOrb: "tex-skill-orb",
  logo: "tex-logo",
} as const;

/** How each projectile skill's shot is drawn. Width runs along its flight. */
export const SHOTS = {
  fireball: {
    texture: TEXTURES.projectile,
    width: ICONS.projectile.size,
    height: ICONS.projectile.size,
  },
  iceSpear: { texture: TEXTURES.iceShard, width: 22, height: 8 },
} as const;

/** The 냉각 debuff 얼음창 leaves on whatever it passes through. */
export const CHILL = {
  /** Fraction of move speed taken away while it lasts. */
  slowFactor: 0.15,
  /** How long it lasts after the hit that applied it, in ms. */
  durationMs: 2000,
  /** Tint worn while chilled, so a slowed enemy is readable at a glance. */
  // Teal rather than sky blue: the player square is already light blue.
  tint: 0x45cfc6,
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

/** Shared defaults; the plain chaser is built from these. */
export const ENEMY = {
  size: 16,
  speed: 70,
  speedVariance: 0.25,
  maxHp: 30,
  contactDamage: 1,
} as const;

export type EnemyKind = "grunt" | "brute" | "runner" | "shooter";

/** What a shooting enemy throws. */
export interface EnemyShotSpec {
  readonly damage: number;
  /** px per second. */
  readonly speed: number;
  readonly cooldownMs: number;
  /** It opens fire once the player is this close. */
  readonly range: number;
  /** And stops closing here, so it keeps its distance and shoots. */
  readonly standoff: number;
  readonly size: number;
  readonly lifespanMs: number;
}

export interface EnemyKindSpec {
  readonly id: EnemyKind;
  readonly name: string;
  readonly texture: string;
  readonly size: number;
  readonly color: number;
  readonly maxHp: number;
  readonly speed: number;
  readonly contactDamage: number;
  /** XP its gem is worth. */
  readonly xp: number;
  /** Only the kinds that shoot have one. */
  readonly shot?: EnemyShotSpec;
}

/**
 * The enemy roster. Every number an enemy behaves by lives here, so a new
 * kind is a new entry rather than a new class — they all chase, and the
 * only branch in Enemy is whether the kind shoots.
 */
export const ENEMY_KINDS: Record<EnemyKind, EnemyKindSpec> = {
  grunt: {
    id: "grunt",
    name: "일반",
    texture: TEXTURES.enemy,
    size: ENEMY.size,
    color: COLORS.enemy,
    maxHp: ENEMY.maxHp,
    speed: ENEMY.speed,
    contactDamage: ENEMY.contactDamage,
    xp: 1,
  },
  brute: {
    id: "brute",
    name: "거구",
    texture: TEXTURES.enemyBrute,
    size: 26,
    color: COLORS.enemyBrute,
    maxHp: 120,
    speed: 42,
    contactDamage: 3,
    xp: 4,
  },
  runner: {
    id: "runner",
    name: "질주",
    texture: TEXTURES.enemyRunner,
    size: 12,
    color: COLORS.enemyRunner,
    maxHp: 15,
    speed: 160,
    contactDamage: 1,
    xp: 2,
  },
  shooter: {
    id: "shooter",
    name: "사수",
    texture: TEXTURES.enemyShooter,
    size: 16,
    color: COLORS.enemyShooter,
    maxHp: 24,
    speed: 50,
    contactDamage: 1,
    xp: 3,
    shot: {
      damage: 2,
      speed: 230,
      cooldownMs: 2000,
      range: 300,
      // Outside 타격 and 화염구, inside 연쇄번개 and 얼음창: walk it down or
      // bring something with reach.
      standoff: 140,
      size: 8,
      lifespanMs: 2600,
    },
  },
};

/**
 * Weighted spawn table. A kind only joins the draw once the run is old
 * enough for it, so the first minute stays readable.
 */
export const SPAWN_TABLE: readonly {
  kind: EnemyKind;
  weight: number;
  unlockMs: number;
}[] = [
  { kind: "grunt", weight: 60, unlockMs: 0 },
  { kind: "runner", weight: 22, unlockMs: 25_000 },
  { kind: "shooter", weight: 16, unlockMs: 50_000 },
  { kind: "brute", weight: 12, unlockMs: 75_000 },
];

export const SPAWN = {
  startIntervalMs: 900,
  minIntervalMs: 180,
  rampPerMinute: 0.55,
  maxAlive: 220,
  offscreenMargin: 80,
} as const;

export const HUD = {
  margin: 16,
  /** Left edge of the run readout, clear of the pause button in the corner. */
  leftInset: 56,
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
  /** Extra enemies a shot passes through after the first. 0 stops on contact. */
  readonly pierceCount: number;
}

/** Where every skill starts before a single upgrade is picked. */
export const SKILL_BASE: Record<SkillId, SkillBaseStats> = {
  meleeStrike: {
    damage: 10,
    attackSpeed: 1,
    range: 66,
    projectileSpeed: 0,
    chainCount: 0,
    pierceCount: 0,
  },
  fireball: {
    damage: 20,
    attackSpeed: 1,
    range: 100,
    projectileSpeed: 230,
    chainCount: 0,
    pierceCount: 0,
  },
  // Slower than the other two, because one cast lands on three enemies.
  chainLightning: {
    damage: 10,
    attackSpeed: 0.8,
    range: 160,
    projectileSpeed: 0,
    chainCount: 1,
    pierceCount: 0,
  },
  // Longer reach than 화염구 and a faster shot, but it casts less often.
  iceSpear: {
    damage: 10,
    attackSpeed: 1,
    range: 180,
    projectileSpeed: 320,
    chainCount: 0,
    pierceCount: 2,
  },
};

/** How much one pick of each upgrade adds. Keys match SkillBaseStats. */
export const UPGRADE_STEP = {
  damage: 1,
  attackSpeed: 1,
  range: 10,
  projectileSpeed: 20,
  chainCount: 1,
  pierceCount: 1,
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
