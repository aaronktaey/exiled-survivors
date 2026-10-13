import type { SkillId } from "@/weapons/skills";

import { COLORS, TEXTURES } from "@/config/visuals";

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
  maxHp: 30,
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
  maxHp: 24,
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
    maxHp: 600,
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

/**
 * ★ 속성 — what a rare enemy is born with, and what a dropped weapon
 * comes out of a 우두머리 carrying.
 *
 * Split the way Path of Exile splits an item's modifiers: a **prefix** sits
 * in front of the name and is the offensive line (added damage, crit), a
 * **suffix** follows it and is the defensive or utility line (life, speed).
 * An item there holds at most three of each, which is the ceiling used here.
 *
 * The same affix means the same thing to whoever carries it: 강력 makes an
 * enemy hit half again as hard, and makes a weapon hit half again as hard.
 * The two sides are separate fields so they can be tuned apart.
 */
export type AffixId =
  | "giant"
  | "swift"
  | "critical"
  | "mighty"
  | "cruel"
  | "frenzied"
  | "honed"
  | "regrowth"
  | "evasive"
  | "magnetic";

export type AffixKind = "prefix" | "suffix";

/** What an 속성 does to the enemy it was born on. */
export interface EnemyAffixEffect {
  /** Multiplies max HP. */
  readonly hpScale?: number;
  /** Multiplies move speed. */
  readonly speedScale?: number;
  /** Multiplies everything it deals. */
  readonly damageScale?: number;
  /** Chance each of its hits lands for RARE.critMultiplier instead. */
  readonly critChance?: number;
}

/** What the same 속성 does for whoever is holding the weapon it is on. */
export interface GearAffixEffect {
  /** Multiplies the weapon's attack power. */
  readonly attackScale?: number;
  /** Flat attack power, added before any scale. */
  readonly attackBonus?: number;
  /** Multiplies every skill's attacks per second. */
  readonly attackSpeedScale?: number;
  /** Multiplies the survivor's maximum health. */
  readonly maxHpScale?: number;
  /** Multiplies the survivor's move speed. */
  readonly moveSpeedScale?: number;
  /** Chance each hit lands for the crit multiplier instead. */
  readonly critChance?: number;
  /** Adds to what a critical hit is worth, over RARE.critMultiplier. */
  readonly critMultiplierBonus?: number;
  /** Health returned every REGEN.periodMs. */
  readonly regen?: number;
  /** Multiplies the invulnerable window after taking a hit. */
  readonly invulnerableScale?: number;
  /** Multiplies how far a gem has to be before it drifts over. */
  readonly pickupScale?: number;
}

export interface AffixSpec {
  readonly id: AffixId;
  readonly kind: AffixKind;
  readonly name: string;
  /** Shown under the name when the enemy, or the weapon, is inspected. */
  readonly detail: string;
  /**
   * What it does on an enemy, and what it does on a weapon. An 속성 rolls
   * only where it has something to do: 자력 would mean nothing to an enemy,
   * and the run has no enemy regeneration to hang 재생 on, so those are
   * weapon-only. The four that read both ways roll on both.
   */
  readonly enemy?: EnemyAffixEffect;
  readonly gear?: GearAffixEffect;
}

/**
 * The roster, picked from the categories Path of Exile puts on an item and
 * narrowed to what this game can actually express. Added flat damage, a
 * damage percentage, critical chance and critical damage, attack speed,
 * maximum life, movement speed and regeneration all have somewhere to go.
 * Resistances, accuracy and attributes do not — there are no damage types,
 * no miss chance and no attributes — so they are left out rather than
 * invented. 자력 is the one that is not a PoE line: the pickup radius is
 * this genre's own utility stat, and it is the only place a utility suffix
 * had to go.
 */
export const AFFIXES: Record<AffixId, AffixSpec> = {
  // --- 접두어: what it does to whatever it is pointed at ---
  mighty: {
    id: "mighty",
    kind: "prefix",
    name: "강력",
    detail: "피해 +50%",
    enemy: { damageScale: 1.5 },
    gear: { attackScale: 1.5 },
  },
  critical: {
    id: "critical",
    kind: "prefix",
    name: "치명",
    detail: "치명타 확률 20%",
    enemy: { critChance: 0.2 },
    gear: { critChance: 0.2 },
  },
  cruel: {
    id: "cruel",
    kind: "prefix",
    name: "잔혹",
    detail: "치명타 피해 +50%",
    gear: { critMultiplierBonus: 0.5 },
  },
  frenzied: {
    id: "frenzied",
    kind: "prefix",
    name: "광포",
    detail: "공격속도 +15%",
    gear: { attackSpeedScale: 1.15 },
  },
  honed: {
    id: "honed",
    kind: "prefix",
    name: "예리",
    detail: "공격력 +1",
    gear: { attackBonus: 1 },
  },

  // --- 접미어: what it does for whoever is carrying it ---
  giant: {
    id: "giant",
    kind: "suffix",
    name: "거대",
    detail: "체력 +50%",
    enemy: { hpScale: 1.5 },
    gear: { maxHpScale: 1.5 },
  },
  swift: {
    id: "swift",
    kind: "suffix",
    name: "신속",
    detail: "이동속도 +20%",
    enemy: { speedScale: 1.2 },
    gear: { moveSpeedScale: 1.2 },
  },
  regrowth: {
    id: "regrowth",
    kind: "suffix",
    name: "재생",
    detail: "5초당 체력 +2",
    gear: { regen: 2 },
  },
  evasive: {
    id: "evasive",
    kind: "suffix",
    name: "회피",
    detail: "피격 후 무적 시간 +30%",
    gear: { invulnerableScale: 1.3 },
  },
  magnetic: {
    id: "magnetic",
    kind: "suffix",
    name: "자력",
    detail: "획득 범위 +40%",
    gear: { pickupScale: 1.4 },
  },
};

/** How often regeneration pays out, for 재생 and for the passive tree. */
export const REGEN = {
  periodMs: 5000,
} as const;

/** The ones a rare enemy can be born with. */
export const ENEMY_AFFIXES: readonly AffixSpec[] = Object.values(AFFIXES).filter(
  (affix) => affix.enemy !== undefined,
);

export const PREFIXES: readonly AffixSpec[] = Object.values(AFFIXES).filter(
  (affix) => affix.kind === "prefix" && affix.gear !== undefined,
);

export const SUFFIXES: readonly AffixSpec[] = Object.values(AFFIXES).filter(
  (affix) => affix.kind === "suffix" && affix.gear !== undefined,
);

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
  /** How fast an orbit travels, in px per second. Only the skills that orbit. */
  readonly orbitSpeed: number;
}

/** Where every skill starts before a single upgrade is picked. */
/**
 * Where every skill starts.
 *
 * The damage numbers are chosen backwards from damage per second, measured
 * against a plain enemy's health (ENEMY.maxHp): a single-target skill does
 * about half of one per second, and the two that hit a crowd do about a
 * third. DPS_TARGET records that intent, and the tests check the stat lines
 * still land on it.
 */
export const DPS_TARGET = {
  /** Fraction of a plain enemy's health per second, for a single-target skill. */
  single: 0.5,
  /** And for one that sweeps several at once. */
  crowd: 1 / 3,
  /** What one upgrade is worth, as a fraction of the skill's starting DPS. */
  upgradeShare: 0.2,
} as const;

export const SKILL_BASE: Record<SkillId, SkillBaseStats> = {
  // 15 damage once a second: half a plain enemy per second.
  meleeStrike: {
    damage: 15,
    attackSpeed: 1,
    range: 66,
    projectileSpeed: 0,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
  },
  fireball: {
    damage: 15,
    attackSpeed: 1,
    range: 100,
    projectileSpeed: 230,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
  },
  // Two enemies a cast at 0.8 casts a second: a third of an enemy per second.
  chainLightning: {
    damage: 6,
    attackSpeed: 0.8,
    range: 160,
    projectileSpeed: 0,
    chainCount: 1,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
  },
  // It stops at the first body now; what it leaves behind is the 냉각.
  iceSpear: {
    damage: 10,
    attackSpeed: 1,
    range: 180,
    projectileSpeed: 320,
    chainCount: 0,
    /** Runs through two bodies before it is spent, and upgrades from there. */
    pierceCount: 2,
    orbCount: 0,
    orbitSpeed: 0,
  },
  // An orbit rather than a shot: range is how far out the orbs ride,
  // orbitSpeed how fast they travel around, and attackSpeed how often one
  // orb may hit the same enemy again.
  voidOrb: {
    damage: 5,
    attackSpeed: 1.5,
    range: 90,
    projectileSpeed: 0,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 2,
    orbitSpeed: 200,
  },
};

/** How much one pick of each upgrade adds. Keys match SkillBaseStats. */
/**
 * What one pick of each upgrade adds, by default.
 *
 * The two that move damage per second — damage and attack speed — are set
 * per skill in UPGRADE_STEP_BY_SKILL, so each pick is worth about
 * DPS_TARGET.upgradeShare of where that skill started. The others are
 * utility or structure and are the same for everyone; adding a chain or an
 * orb is worth more than a fifth by its nature.
 */
export const UPGRADE_STEP = {
  damage: 1,
  attackSpeed: 0.2,
  range: 10,
  projectileSpeed: 20,
  orbitSpeed: 40,
  chainCount: 1,
  pierceCount: 1,
  orbCount: 1,
} as const;

/** Per-skill overrides, where the DPS maths asks for a different step. */
export const UPGRADE_STEP_BY_SKILL: Partial<
  Record<SkillId, Partial<Record<keyof typeof UPGRADE_STEP, number>>>
> = {
  meleeStrike: { damage: 3 },
  fireball: { damage: 3 },
  chainLightning: { damage: 1, attackSpeed: 0.15 },
  iceSpear: { damage: 2 },
  voidOrb: { damage: 1 },
};

/** How much one pick of `upgrade` adds to `skill`. */
export function upgradeStep(
  skill: SkillId,
  upgrade: keyof typeof UPGRADE_STEP,
): number {
  return UPGRADE_STEP_BY_SKILL[skill]?.[upgrade] ?? UPGRADE_STEP[upgrade];
}

/** Ceilings on the upgrades that add structure rather than numbers. */
export const UPGRADE_CAP: Partial<Record<keyof typeof UPGRADE_STEP, number>> = {
  chainCount: 7,
};

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
export function xpFor(
  spec: EnemyKindSpec,
  hpScale = 1,
  damageScale = 1,
): number {
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
