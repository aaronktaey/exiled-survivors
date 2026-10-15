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
    chainLightning: 0.7,
    iceSpear: 0.8,
    voidOrb: 1.2,
    thunderStrike: 0.8,
  } as Record<SkillId, number>,
};

export const PLAYER = {
  size: 20,
  speed: 220,
  /**
   * Every health and damage figure in the game is written ten times what it
   * was, so a tuning step of 1 is a tenth of what it used to be.
   */
  maxHp: 200,
  /** Invulnerability after taking a hit, so contact does not drain instantly. */
  invulnerableMs: 600,
  /**
   * Every survivor crits sometimes, with or without 치명 on the weapon. The
   * 치명 속성 adds to this rather than being the only way to have any, so a
   * crit read-out is worth watching from the first run.
   */
  critChance: 0.03,
  /** What one of those is worth, before 잔혹 raises it. */
  critMultiplier: 1.3,
  /** XP gems within this range drift toward the player. */
  pickupRadius: 110,
  pickupSpeed: 420,
} as const;

/** Shared defaults; the plain chaser is built from these. */
export const ENEMY = {
  /**
   * Angle between one bolt of a 연발 fan and the next. Wide enough that the
   * wedge has to be stepped out of rather than leaned away from, narrow
   * enough that it still reads as one shot.
   */
  fanRadians: 0.18,
  size: 16,
  speed: 70,
  speedVariance: 0.25,
  maxHp: 240,
  contactDamage: 12,
  /**
   * How often one enemy's body can hurt the survivor. Each enemy keeps its
   * own, so a crowd pressed against the survivor all hurt at once — slipping
   * between enemies is meant to cost. 회피 lengthens it.
   */
  contactCooldownMs: 600,
} as const;

export type EnemyKind =
  | "grunt"
  | "brute"
  | "runner"
  | "shooter"
  | "boss"
  | "fugitive";

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

/** A ring of bolts thrown outward, rather than aimed at anything. */
export interface EnemyVolleySpec extends EnemyShotSpec {
  readonly count: number;
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
  /** Only the kinds that throw a ring outward have one. */
  readonly volley?: EnemyVolleySpec;
  /**
   * Only a 도망자 has one: it does not chase. It stands where it is, and each
   * hit sends it running from the survivor until it has gone this far.
   */
  readonly flee?: EnemyFleeSpec;
  /** Gone after this long, kill or no kill, and leaving nothing behind. */
  readonly lifespanMs?: number;
  /** Killing it always leaves a skill, the way a 우두머리 does. */
  readonly guaranteedSkill?: boolean;
  /** Drawn to be seen: a colour that cycles, and a body that breathes. */
  readonly flashy?: boolean;
}

/** How something that runs from the survivor runs. */
export interface EnemyFleeSpec {
  /** How far one scare carries it, in px, before it stops. */
  readonly distance: number;
  /**
   * The spread around straight-away-from-the-survivor that its direction is
   * picked from, in radians. Wide enough that where it goes cannot be
   * guessed; never so wide that it runs at you.
   */
  readonly arc: number;
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
    maxHp: 1200,
    speed: 42,
    contactDamage: 36,
  },
  runner: {
    id: "runner",
    name: "질주",
    texture: TEXTURES.enemyRunner,
    size: 12,
    color: COLORS.enemyRunner,
    maxHp: 150,
    speed: 160,
    contactDamage: 12,
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
    maxHp: 5000,
    speed: 40,
    contactDamage: 60,
    /**
     * Every so often it throws a ring of bolts outward, which is what makes
     * standing still beside a 우두머리 a losing idea. It aims at nothing:
     * the ring goes everywhere, and the gap between bolts is the way out.
     */
    volley: {
      damage: 60,
      speed: 150,
      /** Seconds between rings, not between bolts. */
      cooldownMs: 5_000,
      /** How many go out, spread evenly around the circle. */
      count: 18,
      range: 0,
      standoff: 0,
      size: 10,
      lifespanMs: 4000,
    },
  },
  /**
   * 도망자. Not in the spawn table: one turns up on its own clock (FUGITIVE)
   * and is worth chasing down — it never fights back, it is tough and fast,
   * and it always leaves a skill. A minute later it is gone either way.
   */
  fugitive: {
    id: "fugitive",
    name: "도망자",
    texture: TEXTURES.enemyFugitive,
    size: 24,
    color: COLORS.enemyFugitive,
    maxHp: 2400,
    speed: 300,
    contactDamage: 0,
    flee: { distance: 240, arc: Math.PI * 0.9 },
    lifespanMs: 60_000,
    guaranteedSkill: true,
    flashy: true,
  },
  shooter: {
    id: "shooter",
    name: "사수",
    texture: TEXTURES.enemyShooter,
    size: 16,
    color: COLORS.enemyShooter,
    maxHp: 240,
    speed: 50,
    contactDamage: 12,
    shot: {
      damage: 36,
      speed: 230,
      /** One every four seconds: a 사수 is a nuisance, not a turret. */
      cooldownMs: 4000,
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
  | "evasive"
  | "magnetic"
  | "volleying"
  | "spider";

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
  /**
   * Extra bolts per shot, thrown in a fan around the aimed one. Only the
   * kinds that shoot have anywhere to put these, which is what `rangedOnly`
   * on the 속성 is for.
   */
  readonly extraShots?: number;
  /**
   * Leaves a 거미줄 where it dies (WEB). Each copy of the 속성 it carries
   * makes the web wider.
   */
  readonly web?: boolean;
}

/** What the same 속성 does for whoever is holding the weapon it is on. */
export interface GearAffixEffect {
  /** Multiplies the weapon's attack power. */
  readonly attackScale?: number;
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
  /** Multiplies the invulnerable window after taking a hit. */
  readonly invulnerableScale?: number;
  /** Multiplies how far a gem has to be before it drifts over. */
  readonly pickupScale?: number;
}

/**
 * One rung of an 속성 on a weapon. Tier 1 is the best of them, the way it is
 * in Path of Exile, and the weakest tiers are the ones that keep turning up:
 * `weight` is how often this rung comes out of a roll against the others on
 * the same 속성.
 */
export interface AffixTierSpec {
  /** 1 is the best. */
  readonly tier: number;
  readonly weight: number;
  /** What it says on a weapon at this rung, in Korean. */
  readonly detail: string;
  /**
   * The rung's number, for a locale's own wording of the line — `{value}`
   * in `names.affixGearDetails` — so the ladder is tuned once, here.
   */
  readonly value: number;
  readonly gear: GearAffixEffect;
}

export interface AffixSpec {
  readonly id: AffixId;
  readonly kind: AffixKind;
  readonly name: string;
  /** Shown under the name when a rare enemy is inspected. */
  readonly detail: string;
  /**
   * What it does on an enemy. An 속성 rolls there only where it has
   * something to do: 자력 would mean nothing to an enemy, so it is
   * weapon-only. An enemy's
   * 속성 has no tier — it is one number, and a rare is read by its ring and
   * its tooltip rather than by a tier list.
   */
  readonly enemy?: EnemyAffixEffect;
  /**
   * Only rolls on an enemy that shoots. An 속성 that adds bolts means
   * nothing on something that walks up and hits you.
   */
  readonly rangedOnly?: boolean;
  /** What it does on a weapon, rung by rung. Tier 1 first. */
  readonly gearTiers?: readonly AffixTierSpec[];
}

/**
 * How often each rung turns up, from tier 1 down. The best is roughly one
 * roll in thirty, which is what makes a 구슬 worth spending on a weapon that
 * already has the right 속성 on it at the wrong rung.
 */
export const AFFIX_TIER_WEIGHTS: readonly number[] = [1, 3, 6, 10, 15];

/** The rung an 속성 saved before tiers existed comes back at. */
export const LEGACY_AFFIX_TIER = 3;

/** Builds a tier ladder from one value per rung, best first. */
function tiers(
  detail: (value: number) => string,
  effect: (value: number) => GearAffixEffect,
  values: readonly [number, number, number, number, number],
): readonly AffixTierSpec[] {
  return values.map((value, index) => ({
    tier: index + 1,
    weight: AFFIX_TIER_WEIGHTS[index] ?? 1,
    detail: detail(value),
    value,
    gear: effect(value),
  }));
}

/**
 * The roster, picked from the categories Path of Exile puts on an item and
 * narrowed to what this game can actually express. A damage percentage,
 * critical chance and critical damage, attack speed, maximum life and
 * movement speed all have somewhere to go.
 * Resistances, accuracy and attributes do not — there are no damage types,
 * no miss chance and no attributes — so they are left out rather than
 * invented. 자력 is the one that is not a PoE line: the pickup radius is
 * this genre's own utility stat, and it is the only place a utility suffix
 * had to go.
 *
 * 예리 (flat attack power) and 재생 (life over time) used to be here too.
 * Flat attack now comes only from the sword's own tier, and life comes back
 * only from potions. A weapon saved with either line loses that line the
 * next time the stash is read.
 */
export const AFFIXES: Record<AffixId, AffixSpec> = {
  // --- 접두어: what it does to whatever it is pointed at ---
  mighty: {
    id: "mighty",
    kind: "prefix",
    name: "강력",
    detail: "피해 +50%",
    enemy: { damageScale: 1.5 },
    gearTiers: tiers(
      (v) => `피해 +${v}%`,
      (v) => ({ attackScale: 1 + v / 100 }),
      [75, 60, 50, 35, 25],
    ),
  },
  critical: {
    id: "critical",
    kind: "prefix",
    name: "치명",
    detail: "치명타 확률 20%",
    enemy: { critChance: 0.2 },
    gearTiers: tiers(
      (v) => `치명타 확률 +${v}%`,
      (v) => ({ critChance: v / 100 }),
      [50, 40, 30, 20, 10],
    ),
  },
  cruel: {
    id: "cruel",
    kind: "prefix",
    name: "잔혹",
    detail: "치명타 피해 +50%",
    gearTiers: tiers(
      (v) => `치명타 피해 +${v}%`,
      (v) => ({ critMultiplierBonus: v / 100 }),
      [100, 80, 60, 40, 20],
    ),
  },
  frenzied: {
    id: "frenzied",
    kind: "prefix",
    name: "광포",
    detail: "공격속도 +15%",
    gearTiers: tiers(
      (v) => `공격속도 +${v}%`,
      (v) => ({ attackSpeedScale: 1 + v / 100 }),
      [30, 25, 20, 15, 10],
    ),
  },
  volleying: {
    id: "volleying",
    kind: "prefix",
    name: "연발",
    detail: "투사체 +2",
    enemy: { extraShots: 2 },
    rangedOnly: true,
  },
  spider: {
    id: "spider",
    kind: "suffix",
    name: "거미",
    detail: "죽은 자리에 거미줄 — 1분간 이동속도 -30%",
    enemy: { web: true },
  },

  // --- 접미어: what it does for whoever is carrying it ---
  giant: {
    id: "giant",
    kind: "suffix",
    name: "거대",
    detail: "체력 +50%",
    enemy: { hpScale: 1.5 },
    gearTiers: tiers(
      (v) => `최대 체력 +${v}%`,
      (v) => ({ maxHpScale: 1 + v / 100 }),
      [45, 38, 30, 22, 15],
    ),
  },
  swift: {
    id: "swift",
    kind: "suffix",
    name: "신속",
    detail: "이동속도 +20%",
    enemy: { speedScale: 1.2 },
    gearTiers: tiers(
      (v) => `이동속도 +${v}%`,
      (v) => ({ moveSpeedScale: 1 + v / 100 }),
      [36, 30, 24, 18, 12],
    ),
  },
  evasive: {
    id: "evasive",
    kind: "suffix",
    name: "회피",
    detail: "피격 후 무적 시간 +30%",
    gearTiers: tiers(
      (v) => `무적 시간 +${v}%`,
      (v) => ({ invulnerableScale: 1 + v / 100 }),
      [50, 42, 34, 26, 18],
    ),
  },
  magnetic: {
    id: "magnetic",
    kind: "suffix",
    name: "자력",
    detail: "획득 범위 +40%",
    gearTiers: tiers(
      (v) => `획득 범위 +${v}%`,
      (v) => ({ pickupScale: 1 + v / 100 }),
      [80, 68, 56, 44, 32],
    ),
  },
};

/** One 속성's rung, as it sits on a weapon. */
export interface AffixLine {
  readonly id: AffixId;
  readonly tier: number;
}

/** The rung an 속성 is at, falling back to the weakest if it is unknown. */
export function affixTier(
  id: AffixId,
  tier: number,
): AffixTierSpec | undefined {
  const ladder = AFFIXES[id]?.gearTiers;
  if (!ladder || ladder.length === 0) {
    return undefined;
  }

  return ladder.find((rung) => rung.tier === tier) ?? ladder[ladder.length - 1];
}

/** Rolls a rung for one 속성: the weak ones often, the best one rarely. */
export function rollAffixTier(id: AffixId): number {
  const ladder = AFFIXES[id]?.gearTiers ?? [];
  const total = ladder.reduce((sum, rung) => sum + rung.weight, 0);
  let roll = Math.random() * total;
  for (const rung of ladder) {
    roll -= rung.weight;
    if (roll <= 0) {
      return rung.tier;
    }
  }

  return ladder[ladder.length - 1]?.tier ?? LEGACY_AFFIX_TIER;
}

/** The ones a rare enemy can be born with. */
export const ENEMY_AFFIXES: readonly AffixSpec[] = Object.values(
  AFFIXES,
).filter((affix) => affix.enemy !== undefined);

export const PREFIXES: readonly AffixSpec[] = Object.values(AFFIXES).filter(
  (affix) => affix.kind === "prefix" && affix.gearTiers !== undefined,
);

export const SUFFIXES: readonly AffixSpec[] = Object.values(AFFIXES).filter(
  (affix) => affix.kind === "suffix" && affix.gearTiers !== undefined,
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
  /**
   * Each affix it carries raises every drop chance by this much — skills,
   * potions, 구슬, 뼈다귀, 제단, everything — except what only a 우두머리
   * leaves and what is certain anyway.
   */
  dropBonusPerAffix: 0.1,
  /** The yellow ring: how thick, and how far outside the sprite it sits. */
  outlineWidth: 2,
  outlinePadding: 5,
} as const;

/**
 * How the run gets harder simply by lasting.
 *
 * Every whole minute an enemy spawns with is worth another `hpScalePerMinute`
 * of health, compounding — the tenth minute is worth far more than the first,
 * which is what stops a built-up survivor from mowing the field forever — and
 * another `rareChancePerMinute` of the spawns come up rare.
 *
 * It steps on the minute rather than creeping, so a run has a shape: the
 * 우두머리 walks in and everything behind it is tougher than it was.
 */
export const DIFFICULTY = {
  hpScalePerMinute: 1.1,
  rareChancePerMinute: 0.01,
  /**
   * From this minute on, each minute's step is `lateMultiplier` times what
   * it was: +10% health a minute becomes +50%, compounding the same way,
   * and +1%p of rares becomes +5%p. The first ten minutes are the run; past
   * them the field is meant to close in fast.
   */
  lateFromMinute: 10,
  lateMultiplier: 5,
} as const;

/** Whole minutes the run has lasted. */
export function runMinutes(elapsedMs: number): number {
  return Math.max(0, Math.floor(elapsedMs / 60_000));
}

/** Minutes before the late ramp, and minutes into it. */
function rampMinutes(elapsedMs: number): { early: number; late: number } {
  const minutes = runMinutes(elapsedMs);
  const early = Math.min(minutes, DIFFICULTY.lateFromMinute);
  return { early, late: minutes - early };
}

/**
 * What an enemy spawning now is worth in health, for the clock alone: each
 * early minute multiplies it by hpScalePerMinute, each late one by a step
 * `lateMultiplier` times as big (1.1 a minute, then 1.5).
 */
export function enemyHpScaleAt(elapsedMs: number): number {
  const { early, late } = rampMinutes(elapsedMs);
  const lateStep =
    1 + (DIFFICULTY.hpScalePerMinute - 1) * DIFFICULTY.lateMultiplier;
  return DIFFICULTY.hpScalePerMinute ** early * lateStep ** late;
}

/** The share of spawns that come up rare, after the same clock. */
export function rareChanceAt(elapsedMs: number): number {
  const { early, late } = rampMinutes(elapsedMs);
  return Math.min(
    1,
    RARE.chance +
      DIFFICULTY.rareChancePerMinute *
        (early + late * DIFFICULTY.lateMultiplier),
  );
}

/** 도망자: when one turns up. Only one is ever on the field at a time. */
export const FUGITIVE = {
  /** The first one, from the start of the run. */
  firstMs: 40_000,
  /** And another this long after the last one turned up. */
  intervalMs: 75_000,
  maxAlive: 1,
} as const;

/** 우두머리: one every so often, worth killing for what it drops. */
export const BOSS = {
  /**
   * What a 우두머리 adds to every drop chance an ordinary kill rolls (+200%
   * is three times the chance). Not to what only a 우두머리 leaves, and not
   * to what it leaves for certain.
   */
  dropBonus: 2,
  /** The first one, from the start of the run. */
  firstMs: 120_000,
  /** And another this long after the last one turned up. */
  intervalMs: 120_000,
  /** How far outside the usual spawn ring it enters. */
  extraDistance: 40,
} as const;

/**
 * ★ 제단 — what a 우두머리 always leaves behind besides its loot.
 *
 * It is an offer, not a reward: each one is written with what it will call
 * up, and nothing happens until the survivor walks up to it. Then the crowd
 * it promised arrives in a ring around it, and whatever they drop is the
 * pay. Walking past one is always allowed.
 *
 * Adding an offer is a line in ALTAR_OFFERS — the label, the summon and the
 * weighting all read the table. Its words are built from the enemy's own
 * name and the count, so it needs no line in the locales.
 */
export interface AltarOfferSpec {
  readonly kind: EnemyKind;
  readonly count: number;
  /** Every one of them comes up rare, with rolled 속성. */
  readonly rare: boolean;
  /** How often this one is what the altar offers, against the others. */
  readonly weight: number;
}

export type AltarOfferId =
  | "bosses"
  | "rareShooters"
  | "rareBrutes"
  | "rareGrunts"
  | "runnerSwarm";

export const ALTAR_OFFERS: Record<AltarOfferId, AltarOfferSpec> = {
  bosses: { kind: "boss", count: 3, rare: false, weight: 1 },
  rareShooters: { kind: "shooter", count: 10, rare: true, weight: 2 },
  rareBrutes: { kind: "brute", count: 6, rare: true, weight: 2 },
  rareGrunts: { kind: "grunt", count: 15, rare: true, weight: 3 },
  runnerSwarm: { kind: "runner", count: 40, rare: false, weight: 3 },
};

export const ALTAR = {
  /** Share of 우두머리 kills that leave one. 1 is every one of them. */
  fromBoss: 1,
  /**
   * Share of every other kill that leaves one, rares included. A 갈비뼈
   * raises it the way it raises every other drop.
   */
  fromKill: 0.01,
  /**
   * How far from the kill it lands. Far enough that picking up what the
   * 우두머리 dropped does not set it off by accident.
   */
  dropOffset: 90,
  /** How close the survivor has to come for it to wake. */
  activateRadius: 34,
  /** How far from the altar the summoned crowd stands when it arrives. */
  summonRadius: 200,
  /** How big it is drawn. */
  size: 28,
} as const;

/** One offer, drawn by weight. */
export function rollAltarOffer(): AltarOfferId {
  const rows = Object.entries(ALTAR_OFFERS) as [AltarOfferId, AltarOfferSpec][];
  const total = rows.reduce((sum, [, offer]) => sum + offer.weight, 0);
  let roll = Math.random() * total;
  for (const [id, offer] of rows) {
    roll -= offer.weight;
    if (roll < 0) {
      return id;
    }
  }

  return rows[rows.length - 1]![0];
}

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
  { kind: "shooter", weight: 16, unlockMs: 90_000 },
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

/** 화염구 bursts where it lands, hurting everything around the first hit. */
export const FIREBALL = {
  /** Everything this close to the first hit takes the shot's damage too. */
  blastRadius: 30,
  /** How long the burst stays on screen. */
  flashMs: 220,
} as const;

/** 낙뢰: a bolt out of the sky onto something near the survivor. */
export const THUNDER = {
  /**
   * When a strike kills, the chance it strikes again at once. Each recast
   * rolls its own, so a crowd of the nearly dead can take several in a row.
   */
  recastChance: 0.5,
  /** A ceiling on recasts from one cast, so a lucky streak ends. */
  maxRecasts: 20,
  /** How far above its target the bolt starts, in px. */
  height: 220,
  flashMs: 200,
} as const;

/** The instant arc 연쇄번개 draws as it walks through a crowd. */
export const LIGHTNING = {
  /**
   * How far the arc may jump from one victim to the next. Its reach to the
   * first victim is the skill's own range; this is only the jumps.
   */
  chainRadius: 84,
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

/**
 * 거미줄 — what a rare with the 거미 속성 leaves where it dies: a patch of
 * ground that slows the survivor while they stand in it. Webs do not stack:
 * standing in two is as slow as standing in one.
 */
export const WEB = {
  /** Fraction of the survivor's move speed taken away inside one. */
  slow: 0.3,
  /** How long one lies there. */
  durationMs: 60_000,
  /** Its radius with one 거미, and what each further 거미 on the rare adds. */
  radius: 60,
  radiusPerExtra: 30,
  /** The oldest goes when there would be more than this. */
  maxActive: 40,
} as const;

/** The 냉각 debuff 얼음창 leaves on whatever it passes through. */
export const CHILL = {
  /** Fraction of move speed taken away while it lasts. */
  slowFactor: 0.3,
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
  /**
   * Chance that killing an enemy drops a skill. Halved when every run began
   * handing one out on the 슬롯머신, so the field is not where most of them
   * come from any more.
   */
  chance: 0.015,
} as const;

/**
 * ★ 무작위 스킬 — three skills on cards, one to take. A run's first skill is
 * chosen this way, and a 무작위 스킬 lying on the ground opens the same
 * choice when it is walked over.
 */
export const SKILL_PICK = {
  /** How many cards are offered. */
  choices: 3,
  /** Share of kills that leave a 무작위 스킬. A 갈비뼈 raises it. */
  dropChance: 0.01,
  /**
   * Whether a fresh run opens on the choice at all. On the dev server the
   * test harness and `#run` turn it off, so they land in play holding
   * UNSPUN_SKILL; test-skillpick turns it back on.
   */
  atRunStart: true as boolean,
} as const;

/**
 * ★ 슬롯머신 — a reel that lands on one of a list, kept for anything that
 * wants a spin (a weapon, later). A run's first skill used to come off it;
 * that is SKILL_PICK's job now.
 */
export const SLOT = {
  /**
   * How fast the reel turns before it is stopped, in rows per second. It
   * cannot go below (rows in the window + 1) ÷ the stop in seconds — 6 for a
   * five-row window and a one-second stop — because the row it lands on has
   * to be out of sight when 확정 is pressed. Slower than that needs a
   * longer `stopMs`.
   */
  spinRowsPerSec: 6,
  /** How long it keeps turning after 확정, slowing all the way down. */
  stopMs: 1000,
  /** How long the stopped row is held up before the result is handed back. */
  holdMs: 700,
} as const;

/**
 * 하얀 망고 — a few seconds of being untouchable and twice as quick. Rare on
 * purpose: a rare's 속성 and a 우두머리 raise it like any other drop.
 */
export const MANGO = {
  /** Share of kills that leave one. */
  chance: 0.003,
  /** How long it lasts once eaten. */
  durationMs: 5000,
  /** Multiplies every skill's attacks per second while it lasts (+100%). */
  attackSpeedScale: 2,
  /** And the survivor's move speed (+100%). */
  moveSpeedScale: 2,
  /** How big it is drawn on the ground. */
  size: 22,
} as const;

/** Health potions, rolled separately from the skill drop. */
export const POTION = {
  /** Chance that killing an enemy drops one. */
  chance: 0.02,
  /** Fraction of max HP it restores. */
  healFraction: 0.2,
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
 * third. DPS_TARGET records that intent.
 *
 * Every skill's damage was then raised by a fifth across the board
 * (2026-10-14), so the stat lines below sit about 20% above these targets on
 * purpose; nothing reads DPS_TARGET at run time.
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
  // 180 damage once a second: three-quarters of a plain enemy per second
  // (it was 150, half of one, before the across-the-board +20%).
  meleeStrike: {
    damage: 180,
    attackSpeed: 1,
    range: 66,
    projectileSpeed: 0,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
  },
  fireball: {
    damage: 180,
    attackSpeed: 1,
    range: 100,
    projectileSpeed: 230,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
  },
  // Two enemies a cast. It was 0.8 casts a second — a third of an enemy per
  // second — and is a fifth faster than that now.
  chainLightning: {
    damage: 72,
    attackSpeed: 0.96,
    range: 160,
    projectileSpeed: 0,
    chainCount: 1,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
  },
  // It stops at the first body now; what it leaves behind is the 냉각.
  iceSpear: {
    damage: 120,
    attackSpeed: 1,
    range: 180,
    projectileSpeed: 320,
    chainCount: 0,
    /** Runs through two bodies before it is spent, and upgrades from there. */
    pierceCount: 2,
    orbCount: 0,
    orbitSpeed: 0,
  },
  // A bolt out of the sky once a second onto something nearby.
  thunderStrike: {
    damage: 96,
    attackSpeed: 1.2,
    range: 200,
    projectileSpeed: 0,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
  },
  // An orbit rather than a shot: range is how far out the orbs ride,
  // orbitSpeed how fast they travel around, and attackSpeed how often one
  // orb may hit the same enemy again.
  voidOrb: {
    damage: 60,
    attackSpeed: 1.5,
    range: 90,
    projectileSpeed: 0,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 3,
    orbitSpeed: 200,
  },
};

/**
 * What one pick of each upgrade is worth.
 *
 * The stats that are a quantity — damage, how fast it goes off, how far it
 * reaches — go up by a **share of where that skill started**, and the card
 * says so: "공격력 +20%" raises a 15-damage skill by 3 and a 6-damage one by
 * 1.2. A flat step had to be hand-tuned per skill to mean the same thing to
 * each of them, and still drifted every time the skills were rebalanced.
 *
 * The increase is on the base rather than on the running total, the way
 * Path of Exile's "increased" works: three picks is +60% of where it
 * started, not 1.2 cubed, so the tenth card is worth what the first was.
 */
export const UPGRADE_PERCENT = {
  damage: 0.2,
  attackSpeed: 0.2,
  range: 0.15,
  projectileSpeed: 0.15,
  orbitSpeed: 0.2,
} as const;

/**
 * The upgrades that add a thing rather than a quantity. A percentage of one
 * chain is not a chain, so these stay whole numbers.
 */
export const UPGRADE_STEP = {
  chainCount: 1,
  pierceCount: 1,
  orbCount: 1,
} as const;

export type UpgradeKey =
  | keyof typeof UPGRADE_PERCENT
  | keyof typeof UPGRADE_STEP;

/** True when this upgrade is written as a percentage on its card. */
export function isPercentUpgrade(
  upgrade: UpgradeKey,
): upgrade is keyof typeof UPGRADE_PERCENT {
  return upgrade in UPGRADE_PERCENT;
}

/** What one pick of this upgrade adds to this skill, in the stat's units. */
export function upgradeStep(skill: SkillId, upgrade: UpgradeKey): number {
  if (isPercentUpgrade(upgrade)) {
    return SKILL_BASE[skill][upgrade] * UPGRADE_PERCENT[upgrade];
  }

  return UPGRADE_STEP[upgrade];
}

/** The number the card shows: a percentage, or a count. */
export function upgradeShown(skill: SkillId, upgrade: UpgradeKey): number {
  return isPercentUpgrade(upgrade)
    ? Math.round(UPGRADE_PERCENT[upgrade] * 100)
    : upgradeStep(skill, upgrade);
}

/** Ceilings on the upgrades that add structure rather than numbers. */
export const UPGRADE_CAP: Partial<Record<UpgradeKey, number>> = {
  chainCount: 7,
};

/**
 * How many times one skill can take each of these upgrades. Past it the
 * card is no longer offered — the run's other picks are where to go next.
 */
export const UPGRADE_MAX_PICKS: Partial<Record<UpgradeKey, number>> = {
  damage: 20,
  attackSpeed: 20,
};

/**
 * ★ 골드 — what a run pays out, and what that buys.
 *
 * A run is paid for the damage it dealt rather than for how long it lasted,
 * so pushing into a crowd you cannot survive is still worth something. The
 * one thing to spend it on is a 신성한 조각, which is the slow, certain way
 * to a passive point when the 우두머리 rolls have not been kind.
 */
export const ECONOMY = {
  /**
   * Damage dealt per gold earned. Raised with the x10 damage scale, so a
   * run pays what it paid before.
   */
  damagePerGold: 1000,
  /** What one 신성한 조각 costs. */
  shardPrice: 100,
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
  /**
   * Multiplies the whole thing. The dial to turn for levelling pace. A
   * tenth of what it was when health was written ten times smaller, so
   * levelling keeps its pace.
   */
  scale: 0.0035,
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
