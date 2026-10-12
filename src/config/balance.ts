import type { SkillId } from '@/weapons/skills';

import { COLORS, TEXTURES } from '@/config/visuals';

/**
 * ★ 밸런스 — the file to open when tuning how the game plays.
 *
 * Everything here is a number you can change without reading any other
 * file: how tough the player and each enemy are, what every skill does and
 * what an upgrade adds to it, how often things drop, how fast the run
 * escalates. Nothing here decides how anything looks (see visuals.ts) or
 * how the engine is wired (see system.ts).
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
    voidOrb: 1,
  } as Record<SkillId, number>,
};

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

export type EnemyKind = "grunt" | "brute" | "runner" | "shooter" | "boss";

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
  },
  /**
   * 우두머리. Not in the spawn table: one arrives on the clock instead, and
   * killing it always leaves a skill behind.
   */
  boss: {
    id: "boss",
    name: "우두머리",
    texture: TEXTURES.enemyBoss,
    size: 44,
    color: COLORS.enemyBoss,
    maxHp: 900,
    speed: 40,
    contactDamage: 5,
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

/** What a rare enemy can be born with. */
export type AffixId = 'giant' | 'swift' | 'critical' | 'mighty';

export interface AffixSpec {
  readonly id: AffixId;
  readonly name: string;
  /** Shown under the name when the enemy is inspected. */
  readonly detail: string;
  /** Multiplies max HP. */
  readonly hpScale?: number;
  /** Multiplies move speed. */
  readonly speedScale?: number;
  /** Multiplies everything it deals. */
  readonly damageScale?: number;
  /** Chance each of its hits lands for RARE.critMultiplier instead. */
  readonly critChance?: number;
}

export const AFFIXES: Record<AffixId, AffixSpec> = {
  giant: { id: 'giant', name: '거대', detail: '체력 +50%', hpScale: 1.5 },
  swift: { id: 'swift', name: '신속', detail: '이동속도 +20%', speedScale: 1.2 },
  critical: { id: 'critical', name: '치명', detail: '치명타 확률 20%', critChance: 0.2 },
  mighty: { id: 'mighty', name: '강력', detail: '피해 +50%', damageScale: 1.5 },
};

export const RARE = {
  /** Share of spawns that come up rare. */
  chance: 0.1,
  /**
   * How many affixes one rare can be born with. Every rare gets at least
   * minAffixes; each further one is only `extraAffixChance` likely, so a
   * six-stack is rare among rares rather than one roll in six.
   */
  minAffixes: 1,
  maxAffixes: 6,
  extraAffixChance: 0.45,
  /** What a 치명 hit is worth. */
  critMultiplier: 2,
  /** Each affix it carries raises its skill drop chance by this much. */
  dropBonusPerAffix: 0.5,
  /** The yellow ring: how thick, and how far outside the sprite it sits. */
  outlineWidth: 2,
  outlinePadding: 5,
} as const;

/** 우두머리: one every so often, worth killing for what it drops. */
export const BOSS = {
  /** How often one turns up, from the start of the run. */
  intervalMs: 60_000,
  /** How far outside the usual spawn ring it enters. */
  extraDistance: 40,
} as const;

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

/** The orbs 공허구체 keeps in the air around the player. */
export const VOID_ORB = {
  /** Drawn radius of one orb. */
  radius: 9,
  /** Forgiveness on the contact check, so a graze still counts. */
  hitPadding: 2,
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

/** Shared by everything that lies on the ground. XP gems never expire. */
export const GROUND_ITEM = {
  /** How long a dropped item stays there. */
  lifespanMs: 60_000,
  /** Final stretch, during which it blinks a warning before vanishing. */
  warningMs: 10_000,
  /** Blink period at the start of the warning, and at the very end. */
  blinkSlowMs: 700,
  blinkFastMs: 80,
  /** Radius of the halo that blinks behind the item. */
  glowRadius: 12,
  glowAlpha: 0.65,
} as const;

export const SKILL_DROP = {
  /** Chance that killing an enemy drops a skill. */
  chance: 0.03,
} as const;

/** Health potions, rolled separately from the skill drop. */
export const POTION = {
  /** Chance that killing an enemy drops one. */
  chance: 0.01,
  /** Fraction of max HP it restores. */
  healFraction: 0.1,
  size: 16,
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
  /** Orbs kept in the air. Only the skills that orbit have any. */
  readonly orbCount: number;
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
    orbCount: 0,
  },
  fireball: {
    damage: 20,
    attackSpeed: 1,
    range: 100,
    projectileSpeed: 230,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 0,
  },
  // Slower than the other two, because one cast lands on three enemies.
  chainLightning: {
    damage: 10,
    attackSpeed: 0.8,
    range: 160,
    projectileSpeed: 0,
    chainCount: 1,
    pierceCount: 0,
    orbCount: 0,
  },
  // Longer reach than 화염구 and a faster shot, but it casts less often.
  iceSpear: {
    damage: 10,
    attackSpeed: 1,
    range: 180,
    projectileSpeed: 320,
    chainCount: 0,
    pierceCount: 2,
    orbCount: 0,
  },
  // An orbit rather than a shot: range is how far out the orbs ride,
  // projectileSpeed how fast they travel around, and attackSpeed how often
  // one orb may hit the same enemy again.
  voidOrb: {
    damage: 10,
    attackSpeed: 2,
    range: 90,
    projectileSpeed: 200,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 2,
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
  orbCount: 1,
} as const;

export const STATS = {
  /** Floor on the resulting cooldown, so attack speed cannot outrun the frame. */
  minCooldownMs: 50,
} as const;

/**
 * What a kill is worth. XP is not hand-set per kind: it comes from how much
 * enemy there was to get through, so a tougher enemy always pays better and
 * a rare pays for its affixes. Turn `scale` to change the pace of the whole
 * run; the weights say what a point of damage is worth in health.
 */
export const XP = {
  size: 8,
  /** Multiplies the whole thing. The dial to turn for levelling pace. */
  scale: 0.035,
  /** One point of contact damage, counted as this much health. */
  contactWeight: 12,
  /** And one point of ranged damage, which costs you more to avoid. */
  shotWeight: 16,
  /** Even the frailest thing is worth something. */
  minimum: 1,
} as const;

/**
 * What an enemy of this shape is worth. `hpScale` and `damageScale` are a
 * rare's affix multipliers, so a 거대 · 강력 rare pays for both.
 */
export function xpFor(spec: EnemyKindSpec, hpScale = 1, damageScale = 1): number {
  const power =
    spec.maxHp * hpScale +
    spec.contactDamage * XP.contactWeight * damageScale +
    (spec.shot ? spec.shot.damage * XP.shotWeight * damageScale : 0);

  return Math.max(XP.minimum, Math.round(power * XP.scale));
}

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
