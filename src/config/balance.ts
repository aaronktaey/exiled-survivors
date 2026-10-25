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
    chainLightning: 0.8,
    iceSpear: 0.8,
    // 1.2 until 2026-10-16.
    voidOrb: 1,
    thunderStrike: 0.8,
    drone: 1,
    poisonNova: 1,
  } as Record<SkillId, number>,
  /**
   * 무기 공격력 계수 (0.122, the user's ask): how much of the weapon's attack
   * a skill takes into its flat damage — SKILL_BASE damage + attack × this,
   * before 증가 and 증폭. All 1 shipped, which is the damage as it was.
   */
  attackCoeff: {
    meleeStrike: 1,
    fireball: 1,
    chainLightning: 1,
    iceSpear: 1,
    voidOrb: 1,
    thunderStrike: 1,
    drone: 1,
    poisonNova: 1,
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
  /**
   * Invulnerability after a thrown hit (a bolt, a ring), so a volley landing
   * at once is one hit. 600 until 0.131; the user cut it to 200.
   */
  invulnerableMs: 200,
  /**
   * Every survivor crits sometimes, with or without 치명 on the weapon. The
   * 치명 속성 adds to this rather than being the only way to have any, so a
   * crit read-out is worth watching from the first run.
   */
  // 0.03 until 2026-10-18. The weapon's 치명 and 잔혹 rungs are worked out
  // from this and critMultiplier (see AFFIXES): move either and they move.
  critChance: 0.2,
  /** What one of those is worth, before 잔혹 raises it. 1.3 until 2026-10-18. */
  critMultiplier: 2,
  /** XP gems within this range drift toward the player. */
  pickupRadius: 110,
  pickupSpeed: 420,
} as const;

/** Shared defaults; the plain chaser is built from these. */
/**
 * ★ Every enemy's base health and move speed, dampened (0.102, the user's
 * ask): the passive tree's damage and attack speed went with the 재능의
 * 파편 lines, and the enemies gave the same back. Folded in at spawn, after
 * the kind's own numbers — what an enemy is worth in XP still reads those.
 */
export const ENEMY_DAMPEN = {
  hp: 0.7,
  speed: 0.9,
} as const;

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
  | "fugitive"
  | "erratic"
  | "chimera";

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
  /**
   * What it is drawn as, pointing the way it flies, at the picture's own
   * size; its body for hits is still `size`. The plain square when unset.
   */
  readonly texture?: string;
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
  /** Its kill always leaves a 재능의 덩어리 (TALENT_LUMP, 0.111: the 도망자 and the 키메라). */
  readonly guaranteedLump?: boolean;
  /** Drawn to be seen: a colour that cycles, and a body that breathes. */
  readonly flashy?: boolean;
  /** Only a 기행종 has one: it does not walk, it hops (EnemyHopSpec). */
  readonly hop?: EnemyHopSpec;
  /** Drawn as a fat giant that strides and spins rather than as a square (EnemyGiantSpec). */
  readonly giant?: EnemyGiantSpec;
  /**
   * Drawn as a figure that walks (0.99, the user's ask; a square before):
   * BootScene paints its stride (`enemyWalk(texture, step)`, ENEMY_WALK_STEPS
   * pictures, the plain texture standing), and Enemy steps through it at its
   * own pace, faster or slower with how fast it is actually going.
   */
  readonly walk?: EnemyWalkSpec;
  /**
   * How big its picture is drawn, when not `size` (the body hit stays
   * `size`, centred under it) — the 키메라's, as big as a 우두머리's (0.87).
   */
  readonly drawn?: number;
  /**
   * Drawn in poses (0.87, the 키메라): `leap` while a hop carries it, `cast`
   * for `castMs` after it throws its ring, standing otherwise — the pictures
   * `enemyPose(texture, pose)` that BootScene draws for it. It faces the way
   * it is going.
   */
  readonly poses?: { readonly castMs: number };
  /** Nothing stops it where it stands: 얼음창's 각성 freeze does not take. */
  readonly unstoppable?: boolean;
}

/**
 * A kind drawn as a fat giant: three pictures (standing, left foot out,
 * right foot out) stepped through while it walks, and a whole turn on the
 * spot each time it throws its ring. Only how it looks — its body for hits
 * is still `size`.
 */
/** How a walking figure strides (EnemyKindSpec.walk). Only how it looks. */
export interface EnemyWalkSpec {
  /** How long each picture of the stride shows, at the kind's own speed. */
  readonly stepMs: number;
}

export interface EnemyGiantSpec {
  /** How big the picture is drawn, in px (wider than its body for hits). */
  readonly drawn: number;
  /** How long each step of the walk shows. */
  readonly stepMs: number;
  /** The turn round on the spot when it throws: how many, and how long they take. */
  readonly spinTurns: number;
  readonly spinMs: number;
}

/** The walk, picture by picture: a foot out, standing, the other foot, standing. */
export const GIANT_STRIDE = [1, 0, 2, 0] as const;

/**
 * The turn, a quarter at a time — side on, from behind, the other side (the
 * side picture mirrored), and facing front again: it turns round on the
 * spot rather than rolling over in the plane of the screen.
 */
export const GIANT_TURN: readonly { readonly frame: number; readonly mirrored: boolean }[] = [
  { frame: 3, mirrored: false },
  { frame: 4, mirrored: false },
  { frame: 3, mirrored: true },
  { frame: 0, mirrored: false },
];

/** A giant's picture `index` (0 standing, 1 and 2 a foot out, 3 side on, 4 from behind); 0 is the kind's own texture. */
export const giantFrame = (texture: string, index: number): string =>
  index === 0 ? texture : `${texture}-stride-${index}`;

/**
 * How something that hops about hops: a burst at its speed in one
 * direction, a stop, another burst. A survivor within one hop's reach is
 * hopped at every time; past it, a hop goes anywhere — except the share
 * aimed at the survivor all the same.
 */
export interface EnemyHopSpec {
  /** How far one hop carries it, in px, at the kind's speed. */
  readonly distance: number;
  /** How long it stands between hops. */
  readonly restMs: number;
  /** Out of reach, the share of hops aimed at the survivor rather than anywhere. */
  readonly lungeChance: number;
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
    // A hunched red ghoul, claws out (0.99).
    drawn: 26,
    walk: { stepMs: 150 },
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
    // A purple troll, all shoulders and fists (0.99).
    drawn: 42,
    walk: { stepMs: 220 },
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
    // A lean gold jackal at the gallop (0.99).
    drawn: 24,
    walk: { stepMs: 80 },
    color: COLORS.enemyRunner,
    maxHp: 150,
    speed: 160,
    contactDamage: 12,
  },
  /**
   * 기행종. A plain enemy's health, but it does not walk at you: it hops —
   * far and fast. Within one hop of the survivor it always hops at them;
   * further off it hops about at random, now and then at them anyway.
   * Five times as far and three times as fast as it first shipped
   * (2026-10-16): at 53px a hop it was no threat at all.
   */
  erratic: {
    id: "erratic",
    name: "기행종",
    texture: TEXTURES.enemyErratic,
    size: 16,
    // A lanky, lopsided thing that crouches and springs (0.101): standing,
    // and its leap while a hop carries it (the 키메라's `poses`, never cast).
    drawn: 28,
    poses: { castMs: 0 },
    color: COLORS.enemyErratic,
    maxHp: ENEMY.maxHp,
    speed: 355,
    contactDamage: ENEMY.contactDamage,
    hop: { distance: 182, restMs: 260, lungeChance: 0.25 },
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
    giant: { drawn: 72, stepMs: 170, spinTurns: 1, spinMs: 520 },
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
    // Twice as hard to bring down in 0.115 (the user's ask; 2400 before).
    maxHp: 4800,
    // 1.5× in 0.114 (the user's ask): 300 and 240 before.
    speed: 450,
    contactDamage: 0,
    flee: { distance: 360, arc: Math.PI * 0.9 },
    lifespanMs: 60_000,
    // A 재능의 덩어리 every time (0.111; a 파편 from 0.102, a skill before).
    guaranteedLump: true,
    flashy: true,
  },
  /**
   * 키메라. Hops like a 기행종 (the 기행종's live hop, 2026-10-19), throws the
   * 우두머리's ring as white thorns, has the 우두머리's health, and nothing
   * freezes it. Not in the spawn table: it comes on CHIMERA's clock (and off a 제단).
   */
  chimera: {
    id: "chimera",
    name: "키메라",
    texture: TEXTURES.enemyChimera,
    // A 우두머리's body and picture (0.87, the user's ask; 30 and 30 before).
    size: 44,
    drawn: 72,
    poses: { castMs: 450 },
    color: COLORS.enemyChimera,
    maxHp: 5000,
    speed: 355,
    contactDamage: 60,
    hop: { distance: 182, restMs: 260, lungeChance: 0.25 },
    volley: {
      damage: 60,
      speed: 150,
      cooldownMs: 5_000,
      count: 18,
      range: 0,
      standoff: 0,
      size: 10,
      lifespanMs: 4000,
      texture: TEXTURES.thorn,
    },
    unstoppable: true,
    // Always leaves a skill (0.85), as a 도망자 does.
    // A 재능의 파편 every time, in place of the skill it left until 0.102 (the user's ask).
    guaranteedLump: true,
  },
  shooter: {
    id: "shooter",
    name: "사수",
    texture: TEXTURES.enemyShooter,
    size: 16,
    // A green goblin with a bow, drawn to its cheek as it looses (0.99).
    drawn: 26,
    walk: { stepMs: 160 },
    poses: { castMs: 280 },
    color: COLORS.enemyShooter,
    maxHp: 180,
    speed: 50,
    contactDamage: 12,
    shot: {
      damage: 36,
      speed: 230,
      /** One every four seconds: a 사수 is a nuisance, not a turret. */
      cooldownMs: 4000,
      // How near it has to be to start shooting. 300 until 2026-10-18,
      // 450 until 2026-10-19.
      range: 900,
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
  | "echoing"
  | "vital"
  | "deft"
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
  /**
   * Multiplies every skill's damage, the weapon's attack included — added
   * to the base's own 피해 고정 속성 and any other such line.
   */
  readonly damageScale?: number;
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
  /** 반복: the chance a skill's cast goes off once more (AFFIX_TIMING.repeatDelayMs later). */
  readonly repeatChance?: number;
  /** 활력: health given back every AFFIX_TIMING.regenEveryMs. */
  readonly regen?: number;
  /** 기교: the chance an enemy's shot that reaches the survivor is stopped — added to the base's own. */
  readonly projectileBlock?: number;
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
 * How often each rung turns up, from tier 1 down. Seven rungs since 0.88
 * (the user's ask): what were tiers 1–5 are 3–7 and keep the odds they
 * had, and the two new rungs on top are rarer still — tier 3 is still
 * about one roll in thirty-five, tier 1 one in a hundred and fifty. A 구슬
 * is how a weapon climbs there.
 */
export const AFFIX_TIER_WEIGHTS: readonly number[] = [0.25, 0.5, 1, 3, 6, 10, 15];

/** How many rungs every ladder has. */
export const AFFIX_RUNGS = AFFIX_TIER_WEIGHTS.length;

/**
 * The rungs a weapon written before 0.88 was rolled on. Such a weapon (no
 * `rungs` on it, in the stash or in a saved run) has each line moved down
 * by the difference — its tier 1 is today's tier 3, the same number.
 */
export const AFFIX_RUNGS_BEFORE = 5;

/** The rung an 속성 saved before tiers existed comes back at. */
export const LEGACY_AFFIX_TIER = 5;

/** The clocks behind two weapon 속성 (0.88). */
export const AFFIX_TIMING = {
  /** 활력 gives its health back this often. */
  regenEveryMs: 5000,
  /**
   * A 반복 goes off this long after the cast it repeats (or half the
   * skill's cooldown, if that is sooner), at the nearest enemy then.
   */
  repeatDelayMs: 150,
} as const;

/** Builds a tier ladder from one value per rung, best first. */
function tiers(
  detail: (value: number) => string,
  effect: (value: number) => GearAffixEffect,
  values: readonly [number, number, number, number, number, number, number],
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
 * Flat attack now comes only from the sword's own tier. A weapon saved with
 * either line loses that line the next time the stash is read. 활력 (0.88,
 * the user's ask) brings life over time back as a line of its own.
 *
 * Seven rungs (0.88): the old tier 5 is tier 7, the old tier 1 tier 3, and
 * each ladder bends — every step up is worth a little less than the one
 * below it, so the two new rungs on top are a reach, not a wall.
 */
//
// 강력, 광포, 치명 and 잔혹 are balanced as a weapon's three 접두어 together,
// not line by line: 치명 and 잔혹 multiply each other (chance × worth), so a
// pair of them is worth far more than either alone. With c =
// PLAYER.critChance and m = PLAYER.critMultiplier − 1 the average hit is
// 1 + c × m; 치명 +s% makes it 1 + c(1 + s)(m + b) with 잔혹 +b%.
//   - 치명 and 잔혹 alone: each rung adds a sixth of its number (at 0.2 and
//     ×2, where m = 1 makes the two the same) — +18% at tier 1, +4% at 7.
//   - 강력 and 광포 are set so their best three (two of one, one of the
//     other) come to what 치명 ×2 + 잔혹 does at the same rung: about +95%
//     at tier 1, +72% at tier 3. A single 강력 is then worth more than a
//     single 치명 (27 to 18 at tier 1), and a 치명 build pays only once it
//     has both halves.
// Retune the four together (test-balance checks the three-line parity).
// Until 2026-10-18 it was 강력 [75..25] of the weapon's attack only,
// 광포 [30..10], 치명 [50..10], 잔혹 [100..20], crits 3% for ×1.3 —
// three 광포 beat everything else by far.
export const AFFIXES: Record<AffixId, AffixSpec> = {
  // --- 접두어: what it does to whatever it is pointed at ---
  mighty: {
    id: "mighty",
    kind: "prefix",
    name: "강력",
    detail: "피해 +50%",
    enemy: { damageScale: 1.5 },
    gearTiers: tiers(
      // Every skill's damage, not the weapon's attack alone.
      (v) => `피해 증폭 +${v}%`,
      (v) => ({ damageScale: 1 + v / 100 }),
      [27, 24, 21, 17, 13, 9, 5],
    ),
  },
  critical: {
    id: "critical",
    kind: "prefix",
    name: "치명",
    detail: "치명타 확률 20%",
    enemy: { critChance: 0.2 },
    gearTiers: tiers(
      // A share of the base chance (PLAYER.critChance), not points on top of
      // it: two of +50% double it. What a rung is worth is set by the base.
      (v) => `기본 치명타 확률 +${v}%`,
      (v) => ({ critChance: v / 100 }),
      [110, 101, 90, 77, 62, 45, 24],
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
      [110, 101, 90, 77, 62, 45, 24],
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
      [27, 24, 21, 17, 13, 9, 5],
    ),
  },
  echoing: {
    id: "echoing",
    kind: "prefix",
    name: "반복",
    detail: "공격이 한 번 더 나갈 확률",
    gearTiers: tiers(
      // Every skill's cast; 공허구체's orbs strike an enemy again instead.
      // 0.114 (the user's ask): better than 광포 on a slow skill, worse on a
      // fast one. A repeat comes AFFIX_TIMING.repeatDelayMs after its cast
      // and the cooldown starts again from it, so it is worth less the
      // shorter the cooldown: each rung matches 광포's at a 0.6s cooldown
      // ((1 + p) / (1 + p × 150/600) − 1 = 광포), above it beats it, below
      // it falls short (T1: +34% at 1.6s, +16% at 0.2s, against +27%).
      // It was [11.5 … 5] — a third of 광포 at the top. test-balance holds it.
      (v) => `${v}% 확률로 공격 반복`,
      (v) => ({ repeatChance: v / 100 }),
      [39, 34, 29, 23.5, 18, 12.5, 7],
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
      // Half of what it was until 0.88, the user's ask.
      (v) => ({ maxHpScale: 1 + v / 100 }),
      [27, 25, 22.5, 19.5, 16, 12, 7.5],
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
      // Half of what it was until 0.88, the user's ask.
      (v) => ({ moveSpeedScale: 1 + v / 100 }),
      [21.5, 20, 18, 15.5, 13, 10, 6],
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
      [60, 55, 50, 44, 37, 28, 18],
    ),
  },
  magnetic: {
    id: "magnetic",
    kind: "suffix",
    name: "자력",
    detail: "획득 범위 +40%",
    gearTiers: tiers(
      (v) => `획득 범위 +${v}%`,
      // Half of what it was until 0.88, the user's ask.
      (v) => ({ pickupScale: 1 + v / 100 }),
      [47, 44, 40, 35.5, 30, 23.5, 16],
    ),
  },
  vital: {
    id: "vital",
    kind: "suffix",
    name: "활력",
    detail: "일정 시간마다 체력 회복",
    gearTiers: tiers(
      (v) => `${AFFIX_TIMING.regenEveryMs / 1000}초마다 체력 +${v} 회복`,
      (v) => ({ regen: v }),
      [18, 17, 15, 13, 11, 8, 5],
    ),
  },
  deft: {
    id: "deft",
    kind: "suffix",
    name: "기교",
    detail: "적의 투사체를 막아냄",
    gearTiers: tiers(
      // Added to the base's own 고정 속성 (오니고로시's), as every line adds.
      (v) => `${v}% 확률로 적의 투사체를 막아냄`,
      (v) => ({ projectileBlock: v / 100 }),
      [18, 17, 15, 13, 11, 8, 5],
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
  hpScalePerMinute: 1.154,
  /**
   * Past `afterMinute` minutes, each minute's health step is `multiplier`
   * times the base one (hpScalePerMinute − 1): with ×1.1, +10% a minute,
   * then +20% from the fourth minute and +30% from the seventh, compounding
   * the same way. The last tier passed is the one that counts. Until
   * 2026-10-18 health instead leapt to five times the step at minute ten;
   * the middle of a run was too easy and the end a wall.
   */
  hpStepTiers: [
    { afterMinute: 3, multiplier: 2 },
    { afterMinute: 6, multiplier: 3 },
  ],
  rareChancePerMinute: 0.01,
  /**
   * From this minute on, each minute's rare step is `lateMultiplier` times
   * what it was: +1%p of rares becomes +5%p. (Health no longer follows it.)
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

/** How many times the base health step the `minute`th minute's is (DIFFICULTY.hpStepTiers). */
export function hpStepMultiplierFor(minute: number): number {
  let multiplier = 1;
  let passed = -Infinity;
  for (const tier of DIFFICULTY.hpStepTiers) {
    if (minute > tier.afterMinute && tier.afterMinute >= passed) {
      passed = tier.afterMinute;
      multiplier = tier.multiplier;
    }
  }
  return multiplier;
}

/**
 * What an enemy spawning now is worth in health, for the clock alone: each
 * whole minute multiplies it by 1 + its step, the base step
 * (hpScalePerMinute − 1) times that minute's tier (hpStepTiers).
 */
export function enemyHpScaleAt(elapsedMs: number): number {
  const step = DIFFICULTY.hpScalePerMinute - 1;
  let scale = 1;
  for (let minute = 1; minute <= runMinutes(elapsedMs); minute++) {
    scale *= 1 + step * hpStepMultiplierFor(minute);
  }
  return scale;
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
  /** They arrive throwing their ring (Enemy.castVolleyNow) — 0.86, the user's ask for the 키메라. */
  readonly castOnArrival?: boolean;
}

export type AltarOfferId =
  | "bosses"
  | "rareShooters"
  | "rareBrutes"
  | "rareGrunts"
  | "runnerSwarm"
  | "erraticSwarm"
  | "fugitives"
  | "chimera";

export const ALTAR_OFFERS: Record<AltarOfferId, AltarOfferSpec> = {
  bosses: { kind: "boss", count: 3, rare: false, weight: 1 },
  rareShooters: { kind: "shooter", count: 10, rare: true, weight: 2 },
  rareBrutes: { kind: "brute", count: 6, rare: true, weight: 2 },
  rareGrunts: { kind: "grunt", count: 15, rare: true, weight: 3 },
  runnerSwarm: { kind: "runner", count: 40, rare: false, weight: 3 },
  // Added 2026-10-17 on the user's ask; the counts and weights are a first guess.
  erraticSwarm: { kind: "erratic", count: 20, rare: false, weight: 2 },
  // Each one always leaves a skill, as a 도망자 does — a prize worth the chase.
  // One 도망자 since 0.111 (the user's ask; three before).
  fugitives: { kind: "fugitive", count: 1, rare: false, weight: 1 },
  // One 키메라 (0.85, the user's ask); its weight is a first guess.
  chimera: { kind: "chimera", count: 1, rare: false, weight: 1, castOnArrival: true },
};

export const ALTAR = {
  /** Share of 우두머리 kills that leave one. 1 is every one of them. */
  // Every one of them until 2026-10-18; a 고대 두개골 run, all 우두머리, drowned in them.
  fromBoss: 0.1,
  /**
   * Share of every other kill that leaves one, rares included. A 갈비뼈
   * raises it the way it raises every other drop.
   */
  fromKill: 0.02,
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
  /**
   * A 제단 is not dropped but summoned (0.85, the user's ask): a red pillar
   * comes down where it will stand, and it is there this long after.
   */
  summonDelayMs: 1000,
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
  { kind: "runner", weight: 22, unlockMs: 30_000 },
  { kind: "shooter", weight: 16, unlockMs: 60_000 },
  { kind: "brute", weight: 12, unlockMs: 60_000 },
  { kind: "erratic", weight: 12, unlockMs: 90_000 },
];

/**
 * ★ 키메라 (0.85, the user's ask; 0.67–0.84 had a 키메라 러시 at 14 minutes
 * that cleared the field and sent only 키메라 after). From `firstMs` one
 * 키메라 comes every `intervalMs`, off screen like a 우두머리 and outside the
 * usual cap, while everything else goes on spawning as before.
 */
export const CHIMERA = {
  firstMs: 10 * 60_000,
  intervalMs: 60_000,
} as const;

export const SPAWN = {
  startIntervalMs: 900,
  minIntervalMs: 180,
  rampPerMinute: 0.55,
  /**
   * The cap on ordinary spawns. At it, the weakest enemy on the field — the
   * least health left, not a 우두머리, 키메라 or 도망자 (anything that always
   * leaves a skill) — is taken off without a kill and the new one comes in
   * (0.86, the user's ask; until then the field just stopped filling).
   */
  maxAlive: 350,
  offscreenMargin: 80,
} as const;

/**
 * 지형지물: rocks nobody walks through — not the survivor, not an enemy.
 * Thrown things fly over them, and nothing is dropped on one. Each run lays out its own
 * (a seed kept in the save, so 불러오기 finds the same field), each rock a
 * smooth random outline round its centre, stretched one way or not.
 */
export const TERRAIN = {
  enabled: true,
  /** True keeps it to the dev server, for trying a change before it ships. */
  devOnly: false,
  /** How many it tries to lay; a crowded world takes fewer. */
  count: 26,
  /** A rock's size before it is stretched, from–to (px). */
  minRadius: 34,
  maxRadius: 120,
  /** Longest side over shortest, at most: 1 is round, 3 a wall. */
  maxStretch: 3.2,
  /** How lumpy the outline is: 0 a smooth oval, 0.3 craggy. */
  roughness: 0.22,
  /** Open ground between two rocks and from a rock to the edge, at least. */
  gap: 110,
  /** Open ground round where the survivor starts. */
  startClear: 320,
  /**
   * An enemy meeting a rock steps along it, toward the side the survivor
   * is on, by this share of the step the rock stopped — so a crowd walks
   * round rather than piling up against it.
   */
  slide: 1,
} as const;

export const MELEE = {
  /** Full width of the swing arc, in radians. */
  arcRadians: Math.PI * 0.8,
  /** How long the swing flash stays on screen. */
  flashMs: 150,
} as const;

/** 화염구 bursts where it lands, hurting everything around the first hit. */
export const FIREBALL = {
  /** How long the burst stays on screen. */
  flashMs: 220,
} as const;

/**
 * ★ 스킬 각성 — what the main skill does on top of itself once it reaches
 * `level` (only the main skill since 0.83, the user's ask), and again at
 * `second.level`. Reaching either is announced with a burst of its own
 * (GameScene.celebrateMastery).
 */
export const SKILL_MASTERY = {
  // 20 until 2026-10-16.
  level: 10,
  /** 타격: an enemy's shot inside the swing is struck out of the air. */
  /** 화염구: its burst is this many times as wide (0.84; it left burning ground before; 2 in 0.84). */
  fireBlastScale: 1.5,
  /**
   * 연쇄번개: each strike is amplified by this share for every jump still to
   * come after it — the first of a seven-jump arc by 7×, the last not at all.
   */
  chainBonusPerJump: 0.1,
  /** 얼음창: an enemy already under 냉각 is frozen solid this long when struck. 100 until 0.84. */
  freezeMs: 200,
  /**
   * 공허구체 (0.98, the user's ask: 0.84's 공허 back, in place of 0.95's heal
   * a hit): every `everyMs` a 공허 opens where the enemies stand thickest —
   * on the enemy, within `searchShare` × the orbit's radius of the survivor,
   * with the most others within its `reach` — and for `lifeMs` draws every
   * enemy within `reach` toward its middle at `pullSpeed` px/s. Every
   * `healEveryMs` it gives `healPerEnemy` health for each enemy inside it.
   */
  voidVortex: { everyMs: 5000, lifeMs: 2000, searchShare: 2, reach: 100, pullSpeed: 140, healEveryMs: 1000, healPerEnemy: 1 },
  /** 드론 (0.98, the 2차 각성's until then): this many times the drones. */
  droneTimes: 2,
  /**
   * 낙뢰 (0.84): what it hits is 감전 for `durationMs` (each hit starts it
   * over), taking `amplify` more from every hit while it lasts.
   */
  thunderShock: { durationMs: 2000, amplify: 0.3 },
  /** ★ 2차 각성 (0.83, the user's ask): the main skill's second effect, at `level`. */
  second: {
    level: 20,
    /** 타격: the swing's full width, in degrees (MELEE.arcRadians before it). */
    meleeArcDegrees: 180,
    /** 화염구: its burst this many times wider again — 2.25× in all with the first (0.85; 2 in 0.84). */
    fireBlastScale: 1.5,
    /** 연쇄번개: arcs each cast starts, each from its own nearest enemy. */
    chainForks: 2,
    /**
     * 얼음창: an enemy that dies under 냉각 leaves every enemy within
     * `radius` of it under 냉각 too (CHILL.durationMs) — and one of those
     * dying does the same. 0.87, the user's ask (0.84: dying frozen froze them).
     */
    iceShatter: { radius: 60 },
    /**
     * 공허구체: a second ring as many orbs inside the first, `radiusShare` of
     * its radius, turning the other way and hitting for `damageShare`.
     */
    voidInner: { radiusShare: 0.6, damageShare: 0.5 },
    /**
     * 드론 (0.98, the 1차 각성's until then): every `every`th shot of a drone
     * drops a bomb — `damageShare` of a shot on all within `radius`.
     */
    droneBomb: { every: 5, radius: 50, damageShare: 1.5 },
    /** 낙뢰: every strike also hurts what stands within `radius` of it, for `damageShare`. */
    thunderSplash: { radius: 60, damageShare: 0.5 },
  },
} as const;

/**
 * ★ 보유 효과 (0.84, the user's ask): holding a skill — main or found —
 * gives every skill and the survivor this, the skill itself included.
 * `critChance` is points on the base chance (0.2 → 0.25); every other key
 * multiplies: `areaScale` every radius an effect reaches (a burst, a swing,
 * an orb, a 공허, a splash, a shatter), `damageScale` every hit,
 * `attackSpeedScale` every skill's pace, `moveSpeedScale` and `maxHpScale`
 * the survivor. Two held skills with the same key multiply.
 */
export interface HeldSkillBonus {
  readonly critChance?: number;
  readonly areaScale?: number;
  readonly damageScale?: number;
  readonly attackSpeedScale?: number;
  readonly moveSpeedScale?: number;
  readonly maxHpScale?: number;
  /** What an enemy's body does to the survivor, multiplied (0.94: 공허구체's 접촉 피해 감폭). */
  readonly contactDamageScale?: number;
  /** The 체력 포션's drop chance, multiplied (0.122: 독성폭발's 포션 드랍률 증폭). */
  readonly potionChanceScale?: number;
}

export const SKILL_HELD_BONUS: Record<SkillId, HeldSkillBonus> = {
  thunderStrike: { critChance: 0.05 },
  fireball: { areaScale: 1.2 },
  iceSpear: { damageScale: 1.2 },
  chainLightning: { attackSpeedScale: 1.2 },
  // 0.94 (the user's ask): 공허구체 takes some off what bodies do (20%, 10%
  // since 0.131); its move speed went to the 드론.
  voidOrb: { contactDamageScale: 0.9 },
  // +20% until 0.131.
  meleeStrike: { maxHpScale: 1.1 },
  drone: { moveSpeedScale: 1.15 },
  // ×1.2 until 0.131.
  poisonNova: { potionChanceScale: 1.1 },
};

/** Every 보유 효과 of the skills held, folded: points added, scales multiplied. */
export function heldBonusFor(skills: Iterable<SkillId>): Required<HeldSkillBonus> {
  const out = { critChance: 0, areaScale: 1, damageScale: 1, attackSpeedScale: 1, moveSpeedScale: 1, maxHpScale: 1, contactDamageScale: 1, potionChanceScale: 1 };
  for (const id of skills) {
    const bonus = SKILL_HELD_BONUS[id];
    if (!bonus) {
      continue;
    }
    out.critChance += bonus.critChance ?? 0;
    out.areaScale *= bonus.areaScale ?? 1;
    out.damageScale *= bonus.damageScale ?? 1;
    out.attackSpeedScale *= bonus.attackSpeedScale ?? 1;
    out.moveSpeedScale *= bonus.moveSpeedScale ?? 1;
    out.maxHpScale *= bonus.maxHpScale ?? 1;
    out.contactDamageScale *= bonus.contactDamageScale ?? 1;
    out.potionChanceScale *= bonus.potionChanceScale ?? 1;
  }
  return out;
}

/** Nothing held: what a fresh run folds before its first skill. */
export const NO_HELD_BONUS: Required<HeldSkillBonus> = heldBonusFor([]);

/**
 * ★ 보조 스킬 (0.84, the user's ask): skills held besides the main one stop
 * at `max`. Past it no other skill drops or comes up on a 무작위 스킬's
 * cards, and one that dropped before is a 체력 포션's worth when picked up.
 */
export const SUB_SKILLS = { max: 3 } as const;

/**
 * ★ Skills offered only to these accounts for now (0.96, the user's word:
 * 드론 was off for everyone but the user's own account while it was tried;
 * open to all again in 0.97). A run that already holds one keeps it.
 * systems/SkillGate.ts applies it.
 */
export const SKILL_TRIAL: Partial<Record<SkillId, readonly string[]>> = {};

/**
 * ★ Skills offered only on the dev server, for the user to tune there first
 * (0.122, the user's word: 독성폭발 was kept here until it went live in
 * 0.123). The deployed game and the harness never offer one; taking it out
 * of this list is the whole of shipping it.
 */
export const SKILL_DEV_ONLY: readonly SkillId[] = [];

/** 낙뢰: a bolt out of the sky onto something near the survivor. */
export const THUNDER = {
  // The chance a kill strikes again is the skill's own stat since 0.83
  // (SKILL_BASE.thunderStrike.recastChance), a pick that raises it.
  /** A ceiling on recasts from one cast, so a lucky streak ends. */
  maxRecasts: 20,
  /** How far above its target the bolt starts, in px. */
  height: 220,
  flashMs: 200,
} as const;

/**
 * 독성폭발 (0.122, the user's design): the ring takes `ringMs` to reach its
 * edge. Each enemy it reaches takes the hit and a stack of 중독 —
 * `poisonShare` of the hit a second a stack, in ticks of `tickMs` — and the
 * whole poison's `durationMs` starts over. At most `maxStacks`. 각성:
 * `stacksPerHitAwakened` a hit. 2차 각성: reaching the top, it bursts
 * (weapons/PoisonNova.ts).
 */
export const POISON_NOVA = {
  ringMs: 350,
  poisonShare: 0.1,
  durationMs: 3000,
  tickMs: 500,
  maxStacks: 10,
  stacksPerHitAwakened: 2,
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
/** 드론 (0.94 trial): how one flies and shoots. */
export const DRONE = {
  /** How fast one flies to its enemy or back, px/s. +30% on the user's word (380 at first). */
  flySpeed: 494,
  /** Its place round the survivor while it has nothing to shoot. */
  idleRadius: 34,
  /** How far off its enemy's edge it hovers. */
  hover: 26,
  /** How big it is drawn. 18 until 0.100 — the user found a swarm of them too big. */
  size: 12,
  /** How long a shot's tracer lingers, ms. */
  tracerMs: 90,
  /**
   * The most drones on one enemy (the user's ask): past it a drone takes
   * another, or circles the survivor — so a lone 우두머리 is not all of them.
   * 2 since 0.97 (3 while tried): what one enemy takes is two drones' worth.
   */
  perEnemy: 2,
} as const;

export const VOID_ORB = {
  /** Drawn radius of one orb. */
  radius: 15,
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
  durationMs: 10_000,
  /** How long it takes to fade out at the end of that. */
  fadeMs: 3_000,
  /** How faint it is: the fill, and the strands drawn over it. */
  fillAlpha: 0.05,
  strandAlpha: 0.22,
  strandWidth: 1,
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
  /**
   * An extra shot (룬 각인 검) goes to the next-nearest enemy in range; with
   * nobody else there it fans out this far from the first, in radians.
   */
  extraShotSpread: 0.25,
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
  chance: 0.013,
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
  dropChance: 0.008,
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
 * purpose, and the same off every kill: no rare's 속성, 우두머리 or 갈비뼈
 * raises it.
 */
export const MANGO = {
  /** Share of kills that leave one, whatever was killed. */
  chance: 0.0009,
  /** How long it lasts once eaten. */
  durationMs: 5000,
  /** Multiplies every skill's attacks per second while it lasts (+100%). */
  attackSpeedScale: 2,
  /** And the survivor's move speed (+100%). */
  moveSpeedScale: 2,
  /** How big it is drawn on the ground. */
  size: 22,
} as const;

/**
 * 자석 — picked up, it collects every XP gem and item on the map at that
 * instant, except what the survivor might be saving for later (하얀 망고,
 * 자석, 포션, 제단). Off every kill at the same flat chance as the 하얀 망고
 * (the user's ask), and like it raised by nothing.
 */
export const MAGNET = {
  /** Share of kills that leave one, whatever was killed. */
  chance: 0.0015,
  /** How long what it took is seen flying in. Only a picture: it is already taken. */
  flyMs: 350,
  /** At most this many of those pictures at once; past it the rest are taken unseen. */
  ghosts: 80,
  /** How big it is drawn on the ground. */
  size: 22,
} as const;

/**
 * ★ 알수없는 룬 (0.89, the user's ask): a kill of `from` leaves one at
 * `chance` — flat, no rare's 속성 or 우두머리 bonus raises it. Picked up it
 * only says that a great power is felt; what it will do (strengthen the
 * main skill) is still to come. It wears one of the 룬 stones of 0.71–0.79
 * at random (UNKNOWN_RUNE_LOOKS in visuals.ts).
 */
export const UNKNOWN_RUNE: { readonly from: EnemyKind; readonly chance: number; readonly size: number } = {
  from: 'chimera',
  chance: 0.05,
  /** How big it is drawn on the ground. */
  size: 22,
};

/**
 * ★ 랭킹 점수 (0.116, the user's ask): what a run is ranked by — the health of
 * every enemy it killed, as that enemy spawned (the clock, a rare's 속성,
 * all of it), times its kind's share here. Overkill, and damage to what got
 * away, count for nothing. The board's number is this; on the wire and in D1
 * the field is still `damage`, and runs from before 0.116 there are the
 * damage they dealt (the user chose to let the two stand side by side).
 */
export const SCORE: { readonly byKind: Readonly<Record<EnemyKind, number>> } = {
  byKind: {
    grunt: 1,
    runner: 1.1,
    shooter: 1.2,
    brute: 1,
    erratic: 1.2,
    boss: 1.5,
    chimera: 2,
    fugitive: 1.5,
  },
};

/** What a 재능의 파편 can give, one of them a shard (TALENT_SHARD). */
/** 체력회복 (`regen`) was one too, 0.102–0.130; the user took it out in 0.131. */
export type ShardStat = 'damage' | 'attackSpeed' | 'moveSpeed' | 'maxHp' | 'area';

/**
 * ★ 재능의 파편 (0.102, the user's ask): one roll off every kill at `chance`
 * (0.104: shared by every stat again, and 0.5%) — nothing raises it — and
 * when it lands, which stat's shard it is (피해량 파편, 공격속도 파편 …) is
 * weighed by the passive tree's lines (passives.ts: each rank +5% of that
 * stat's weight, so the others come up less). A 도망자 or a 키메라 leaves a
 * 재능의 덩어리 instead (TALENT_LUMP). Each gives the run `amplify` more damage, attack speed,
 * move speed, max health or area (each an 증폭, its shards added), or
 * `regen` health every `regenEveryMs`. Once the main skill (a level-up) or
 * every skill on offer (a 무작위 스킬) is maxed, `choices` cards of the
 * stats are offered instead, evenly, the tree not counted. Like any item on
 * the ground it is never pulled in — only the 자석 takes it — and goes after
 * GROUND_ITEM.lifespanMs.
 */
export const TALENT_SHARD = {
  chance: 0.005,
  stats: ['damage', 'attackSpeed', 'moveSpeed', 'maxHp', 'area'] as readonly ShardStat[],
  amplify: 0.01,
  choices: 3,
  /** How big it is drawn on the ground. */
  size: 22,
} as const;

/**
 * ★ 재능의 덩어리 (0.111, the user's ask): what a 도망자 or a 키메라 leaves
 * (`guaranteedLump`) — one stat, weighed the way a 재능의 파편's is, and
 * `shards` of that stat's shard at once. A 신화 drop; a 파편 is 일반.
 */
export const TALENT_LUMP = {
  // 3 since 0.115 (the user's ask; 5 before).
  shards: 3,
  /** How big it is drawn on the ground. */
  size: 30,
} as const;

/** What a run's shards add up to: an 증폭 per stat (1 + shards × amplify). */
export function shardBonusFor(counts: Partial<Record<ShardStat, number>>): Record<ShardStat, number> {
  const n = (stat: ShardStat): number => Math.max(0, Math.floor(counts[stat] ?? 0));
  return {
    damage: 1 + n('damage') * TALENT_SHARD.amplify,
    attackSpeed: 1 + n('attackSpeed') * TALENT_SHARD.amplify,
    moveSpeed: 1 + n('moveSpeed') * TALENT_SHARD.amplify,
    maxHp: 1 + n('maxHp') * TALENT_SHARD.amplify,
    area: 1 + n('area') * TALENT_SHARD.amplify,
  };
}

/** Health potions, rolled separately from the skill drop. */
export const POTION = {
  /** Chance that killing an enemy drops one. */
  chance: 0.02,
  /** Fraction of max HP it restores. */
  healFraction: 0.2,
  /** Drawn size, and the size it is picked up at (24 since 0.111, the user's ask). */
  size: 24,
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
  /** 드론 in the air (0.94). Only the 드론 has any. */
  readonly droneCount: number;
  /** How fast an orbit travels, in px per second. Only the skills that orbit. */
  readonly orbitSpeed: number;
  /** How far a burst reaches round where it lands, in px. Only 화염구 bursts. */
  readonly blastRadius: number;
  /** The chance a strike that kills strikes again at once. Only 낙뢰 recasts. */
  readonly recastChance: number;
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
    damage: 201,
    attackSpeed: 1,
    range: 71.2,
    projectileSpeed: 0,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
    blastRadius: 0,
    recastChance: 0,
    droneCount: 0,
  },
  fireball: {
    damage: 180,
    attackSpeed: 0.7,
    // Speed and range are where eight picks of +15% 투사체 속도 took them
    // (0.83, the user's ask: the pick was taken out) — 120 and 250 before.
    range: 120 * 2.2,
    projectileSpeed: 250 * 2.2,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
    // FIREBALL.blastRadius until 0.83, when it became a pick.
    blastRadius: 30,
    recastChance: 0,
    droneCount: 0,
  },
  // Four enemies a cast since 0.83 (two before).
  chainLightning: {
    damage: 90,
    // 0.5 since 0.101 (the user's nerf; the live dial stood at 0.62).
    attackSpeed: 0.5,
    range: 160,
    projectileSpeed: 0,
    chainCount: 3,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
    blastRadius: 0,
    recastChance: 0,
    droneCount: 0,
  },
  // It stops at the first body now; what it leaves behind is the 냉각.
  iceSpear: {
    damage: 120,
    attackSpeed: 0.6,
    // Eight picks of +15% 투사체 속도 in (0.83), as for 화염구 — 144 and 290 before.
    range: 144 * 2.2,
    projectileSpeed: 290 * 2.2,
    chainCount: 0,
    /** Runs through two bodies before it is spent, and upgrades from there. */
    pierceCount: 2,
    orbCount: 0,
    orbitSpeed: 0,
    blastRadius: 0,
    recastChance: 0,
    droneCount: 0,
  },
  // A bolt out of the sky once a second onto something nearby.
  thunderStrike: {
    damage: 105,
    attackSpeed: 1.2,
    range: 200,
    projectileSpeed: 0,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
    blastRadius: 0,
    // THUNDER.recastChance until 0.83 (0.5), when it became a pick.
    recastChance: 0.3,
    droneCount: 0,
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
    blastRadius: 0,
    recastChance: 0,
    droneCount: 0,
  },
  // 드론 (0.94 trial): `range` is how far from the survivor a drone takes an
  // enemy (and lets go of it); `droneCount` how many fly; attackSpeed how
  // often each one fires. One shot, one enemy — no sweep.
  drone: {
    // 125 · 0.25 · 5 (the user's pick, 0.97, with DRONE.perEnemy 2): under
    // 연쇄번개 against a crowd, a little over 화염구 on a lone enemy. 80 · 0.47
    // while it was tried; 0.2 a second since 0.101 (the user's nerf).
    damage: 125,
    attackSpeed: 0.2,
    // +20% on the user's word (225 at first).
    range: 270,
    projectileSpeed: 0,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
    blastRadius: 0,
    recastChance: 0,
    droneCount: 5,
  },
  // 독성폭발 (0.122): `range` is how far the ring goes out, attackSpeed how
  // often one goes out; the hit is `damage`, the poison POISON_NOVA's share of it.
  poisonNova: {
    // The user's pick for its release (0.123); 144 · 0.7 while it was tried.
    damage: 150,
    attackSpeed: 0.5,
    range: 110,
    projectileSpeed: 0,
    chainCount: 0,
    pierceCount: 0,
    orbCount: 0,
    orbitSpeed: 0,
    blastRadius: 0,
    recastChance: 0,
    droneCount: 0,
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
  // 타격's 공격 범위 (0.83); no other skill offers it.
  range: 0.1,
  projectileSpeed: 0.15,
  orbitSpeed: 0.2,
  // 화염구's 폭발 범위 (0.83).
  blastRadius: 0.15,
} as const;

/**
 * The upgrades that add a thing rather than a quantity. A percentage of one
 * chain is not a chain, so these stay whole numbers.
 */
export const UPGRADE_STEP = {
  chainCount: 1,
  pierceCount: 1,
  orbCount: 1,
  droneCount: 1,
  // 낙뢰's 처치 시 재시전 확률: ten points a pick (0.83).
  recastChance: 0.1,
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

/** The steps that are a chance, and read as points out of a hundred (재시전 확률). */
export const UPGRADE_SHOWN_AS_CHANCE: readonly UpgradeKey[] = ['recastChance'];

/** The number the card shows: a percentage, a chance in points, or a count. */
export function upgradeShown(skill: SkillId, upgrade: UpgradeKey): number {
  if (isPercentUpgrade(upgrade)) {
    return Math.round(UPGRADE_PERCENT[upgrade] * 100);
  }
  const step = upgradeStep(skill, upgrade);
  return UPGRADE_SHOWN_AS_CHANCE.includes(upgrade) ? Math.round(step * 100) : step;
}

/**
 * Ceilings on what an upgrade can take a stat to. None since 0.83: every
 * upgrade stops at its pick count (UPGRADE_MAX_PICKS), and what gear adds
 * comes on top of it rather than counting against it (the user's ask).
 */
export const UPGRADE_CAP: Partial<Record<UpgradeKey, number>> = {};

/** The orbs 공허구체 actually has up: its count and a weapon's extra one, never past the cap. */
/** Orbs in the air: the skill's own and what the gear adds, which no ceiling cuts (0.83). */
export function orbsHeld(orbCount: number, extra = 0): number {
  return Math.max(1, Math.round(orbCount + extra));
}

/**
 * How many times one skill can take each of these upgrades. Past it the
 * card is no longer offered — the run's other picks are where to go next.
 */
export const UPGRADE_MAX_PICKS: Partial<Record<UpgradeKey, number>> = {
  damage: 20,
  attackSpeed: 20,
  projectileSpeed: 20,
  orbitSpeed: 20,
  // The ones that add structure, and the ones 0.83 added: five picks each.
  chainCount: 5,
  pierceCount: 5,
  orbCount: 5,
  droneCount: 5,
  range: 5,
  blastRadius: 5,
  recastChance: 5,
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
  /**
   * Multiplies the whole thing. The dial to turn for levelling pace. Ten
   * times 0.119's since 0.120 (the user's ask), with XP_CURVE.A ten times
   * too: the same curve in finer units, so a kind is no longer rounded
   * from 1.34 down to 1 — only those in `roundTo` are.
   */
  scale: 0.035,
  /** One point of contact damage, counted as this much health. */
  contactWeight: 12,
  /** And one point of ranged damage, which costs you more to avoid. */
  shotWeight: 16,
  /** Even the frailest thing is worth something. */
  minimum: 10,
  /**
   * Kinds whose XP is rounded to a multiple of this, not to one. The
   * 일반 stays at 10 — the 1 it gave before the units grew, kept on the
   * user's word — where finer units would have made it 13 (0.120).
   */
  roundTo: { grunt: 10 } as Partial<Record<EnemyKind, number>>,
  /**
   * What one point of XP saved before 0.120 is worth now. A saved run
   * carries `xpUnit`; one without it has its XP multiplied by this.
   */
  unit: 10,
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

  const step = XP.roundTo[spec.id] ?? 1;
  return Math.max(XP.minimum, Math.round((power * XP.scale) / step) * step);
}

/** PoE 경험치 곡선 근사식 (모양 유지, 크기는 SCALE로 조절) */
export const XP_CURVE = {
  A: 415, // 0.120: ×10 with XP.scale — the same curve in finer units
  K: 1.75,
  B: 2.41,
  R: 1.015, // 0.119: 1.0483 (PoE) → 1.015, 후반 레벨업을 완만하게 (사용자 선택)
  SCALE: 0.01, // 1.0 = PoE 원본 수치
} as const;

/** XP needed to leave `level`: 48, 103, 185, 298, 446, ... */
export function xpToNextLevel(level: number): number {
  const { A, K, B, R, SCALE } = XP_CURVE;
  return Math.max(
    1,
    Math.round(A * Math.pow(level + K, B) * Math.pow(R, level) * SCALE),
  );
}
