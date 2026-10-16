/**
 * ★ 장비 — the weapon the survivor carries, and what one can come out of a
 * 우두머리 carrying.
 *
 * A weapon is a base plus its 속성. The base gives flat attack power,
 * which is added to every skill's damage, and the roster is swords a
 * step apart. The affixes are the same ones a rare enemy wears, split into
 * prefixes and suffixes the way Path of Exile splits them — see AFFIXES in
 * balance.ts.
 *
 * Adding a sword means a line in GEAR and a name in the locales.
 */

import type { SkillId } from '@/weapons/skills';

export type GearSlot = 'weapon';

export type GearId = 'onigoroshi' | 'runedSword' | 'steelSword' | 'ironSword' | 'rustySword';

/**
 * 고정 속성 — what every sword of a base does, whatever it rolled. It sits
 * outside the 접두어 / 접미어 slots and does not count against them. Set
 * exactly one of the effects.
 */
export interface GearImplicit {
  /**
   * How it reads, in Korean: `{value}` is the number below as the player
   * reads it, `{skill}` the skill it is about. A locale rewrites it through
   * `names.gearImplicits`.
   */
  readonly detail: string;
  /** Chance an enemy's shot that reaches the survivor is stopped, doing nothing. */
  readonly projectileBlock?: number;
  /** More shots from every skill that throws, and more orbs on one that orbits. */
  readonly extraProjectiles?: number;
  /** Multiplies every skill's damage. */
  readonly damageScale?: number;
  /** Multiplies every skill's attack speed. */
  readonly attackSpeedScale?: number;
  /** Multiplies one skill's attack speed. */
  readonly skillAttackSpeed?: { readonly skill: SkillId; readonly scale: number };
}

export interface GearSpec {
  readonly id: GearId;
  readonly slot: GearSlot;
  /**
   * 1 is the best, the way an affix's tier 1 is. Each step down the ladder
   * is GEAR_BASE.attackPerTier less attack power.
   */
  readonly tier: number;
  /** Korean name; a locale renames it through `names.gear`. */
  readonly name: string;
  /**
   * Relative chance of being the sword a 우두머리 leaves. The weaker swords
   * are commoner, so the better ones stay worth waiting for.
   */
  readonly weight: number;
  /**
   * Share of ordinary kills that leave this one, raised by the kill's drop
   * bonus like any other drop. Unset, only a 우두머리 leaves it.
   */
  readonly fromKill?: number;
  /** 고정 속성: on every one of this base, outside the affix slots. */
  readonly implicit?: GearImplicit;
  /**
   * Its picture (public/, from the Raven Fantasy pack — see
   * assets/icons/CREDITS.txt), loaded under `gearTexture(id)`. Each tier its
   * own, so the 인벤토리 tells them apart at a glance.
   */
  readonly icon: string;
}

/** The texture a sword of this base is drawn with. */
export const gearTexture = (id: GearId): string => `tex-gear-${id}`;

export const GEAR_BASE = {
  /**
   * Attack power of the weakest tier, and what one step up the ladder adds.
   *
   * These are flat damage on every skill, and a skill starts at 150, so they
   * are deliberately small: at 30 and 30 the top sword was worth +80% damage
   * on its own and nothing else in the run could compete with it. Halved
   * again from 10 and 10 on 2026-10-15.
   */
  lowestAttack: 5,
  attackPerTier: 5,
} as const;

export const GEAR: Record<GearId, GearSpec> = {
  onigoroshi: {
    id: 'onigoroshi',
    icon: 'assets/icons/gear-onigoroshi.png',
    slot: 'weapon',
    tier: 1,
    name: '오니고로시',
    weight: 0.5,
    implicit: { detail: '{value} 확률로 적의 투사체를 막아냄', projectileBlock: 0.3 },
  },
  runedSword: {
    id: 'runedSword',
    icon: 'assets/icons/gear-runedSword.png',
    slot: 'weapon',
    tier: 2,
    name: '룬 각인 검',
    weight: 1,
    implicit: { detail: '스킬의 투사체 +{value}개', extraProjectiles: 1 },
  },
  // From tier 3 down, any kill can leave one too — rarely.
  steelSword: {
    id: 'steelSword',
    icon: 'assets/icons/gear-steelSword.png',
    slot: 'weapon',
    tier: 3,
    name: '강철 검',
    weight: 2,
    fromKill: 0.001,
    implicit: { detail: '피해 +{value}', damageScale: 1.1 },
  },
  ironSword: {
    id: 'ironSword',
    icon: 'assets/icons/gear-ironSword.png',
    slot: 'weapon',
    tier: 4,
    name: '무쇠 검',
    weight: 3,
    fromKill: 0.0015,
    implicit: { detail: '공격속도 +{value}', attackSpeedScale: 1.1 },
  },
  rustySword: {
    id: 'rustySword',
    icon: 'assets/icons/gear-rustySword.png',
    slot: 'weapon',
    tier: 5,
    name: '녹슨 검',
    weight: 4,
    fromKill: 0.002,
    implicit: {
      detail: '{skill}의 공격속도 +{value}',
      skillAttackSpeed: { skill: 'meleeStrike', scale: 1.2 },
    },
  },
};

/**
 * ★ 장비 판매 — what a sword fetches in 골드 in place of throwing it away.
 * The weakest tier is worth `perRank`, and each tier up one more `perRank`
 * (1티어 오니고로시 500, 5티어 녹슨 검 100 with five tiers); every 속성 it
 * carries adds `perAffix` of that, added rather than compounded.
 */
export const GEAR_SELL = {
  perRank: 100,
  perAffix: 0.1,
} as const;

/** The weakest tier on the roster — the one worth GEAR_BASE.lowestAttack. */
export const LOWEST_GEAR_TIER = Math.max(...Object.values(GEAR).map((spec) => spec.tier));

/** Attack power for a tier, so the roster stays in step with the dial. */
export const attackForTier = (tier: number): number =>
  GEAR_BASE.lowestAttack + (LOWEST_GEAR_TIER - tier) * GEAR_BASE.attackPerTier;

export const ALL_GEAR: readonly GearSpec[] = Object.values(GEAR);

/** What every survivor starts out holding. */
export const STARTING_GEAR: GearId = 'rustySword';

/**
 * ★ 장비 합성 — three of the same sword, offered together, for a chance at
 * the sword one tier better. What comes out has no 속성 at all: it is the
 * base that is being reached for, not the lines the three happened to have.
 * The three are spent whether it takes or not.
 */
export const GEAR_COMBINE = {
  /** How many of the same sword go in. */
  count: 3,
  /** Share of combines that make the sword one tier up. */
  successChance: 0.2,
} as const;

export const GEAR_DROP = {
  /**
   * Each affix line has to win its own roll, and the roll repeats until one
   * fails: a fifth of drops carry a line, a twenty-fifth carry two, and a
   * full six-line weapon is something you would tell someone about.
   */
  affixChance: 0.2,
  /** Path of Exile's ceiling for a rare: three of each. */
  maxPrefixes: 3,
  maxSuffixes: 3,
  /** How big it is drawn on the ground. */
  size: 20,
} as const;

import { TEXTURES } from '@/config/visuals';

/**
 * ★ 구슬 — the consumables a weapon is rerolled with.
 *
 * Path of Exile's currency, in the smallest form this game needs: one orb
 * rerolls a weapon's 속성 to a small count, one rerolls it to a wide one,
 * and one adds a line to what is already there. They drop off any kill at
 * the rates below, so a weapon is no longer only what the 우두머리 happened
 * to leave — it is something to work on.
 *
 * Adding one means a line in ORBS, a name in the locales, and nothing else:
 * the stash, the drop, the label and the button all read this table.
 */
export type OrbId = 'transmute' | 'chaos' | 'awaken' | 'explode' | 'mango';

export interface OrbSpec {
  readonly id: OrbId;
  /** Korean name; a locale renames it through `names.orbs`. */
  readonly name: string;
  /** The one word that fits on a button beside a count. */
  readonly short: string;
  /** What it does, written out. */
  readonly detail: string;
  /** Share of kills that leave one. */
  readonly chance: number;
  /** When set, only a 우두머리 leaves it, at `chance`. */
  readonly fromBossOnly?: boolean;
  /** How loudly it lands: its nameplate and its drop sound both read this. */
  readonly tier: 'normal' | 'magic' | 'rare';
  readonly color: number;
  /** Its own sprite: the three read apart at a glance, not only by colour. */
  readonly texture: string;
  /**
   * Rerolls the weapon to somewhere in this many 속성, counting prefixes and
   * suffixes together. Exactly one of `reroll` and `add` is set.
   */
  readonly reroll?: { readonly min: number; readonly max: number };
  /** Or adds this many lines to whatever is already on it. */
  readonly add?: number;
  /**
   * Or puts the weapon in 망고 상태: the next 구슬 that would destroy it
   * does not, and the 망고 is spent instead. One at a time.
   */
  readonly ward?: boolean;
  /**
   * Or takes one 속성 already on it, rolls a different one in its place and
   * puts that one rung higher — at the risk of the weapon not surviving it.
   */
  readonly upgrade?: {
    /** How many rungs better the replacement comes out. */
    readonly steps: number;
    /** Share of uses that destroy the weapon instead. */
    readonly destroyChance: number;
  };
}

export const ORBS: Record<OrbId, OrbSpec> = {
  transmute: {
    id: 'transmute',
    name: '변화의 구슬',
    short: '변화',
    detail: '속성을 1~2개로 다시 굴립니다',
    chance: 0.005,
    tier: 'magic',
    color: 0x6aa9ff,
    texture: TEXTURES.orbTransmute,
    reroll: { min: 1, max: 2 },
  },
  chaos: {
    id: 'chaos',
    name: '혼돈의 구슬',
    short: '혼돈',
    detail: '속성을 2~4개로 다시 굴립니다',
    chance: 0.001,
    tier: 'rare',
    color: 0xd45fd0,
    texture: TEXTURES.orbChaos,
    reroll: { min: 2, max: 4 },
  },
  awaken: {
    id: 'awaken',
    name: '각성의 구슬',
    short: '각성',
    detail: '속성 1개를 더합니다 (최대 6)',
    chance: 0.001,
    tier: 'rare',
    color: 0xffd34d,
    texture: TEXTURES.orbAwaken,
    add: 1,
  },
  explode: {
    id: 'explode',
    name: '폭발의 구슬',
    short: '폭발',
    detail: '1티어가 아닌 속성 1개를 한 단계 높은 것으로 — 20% 확률로 장비 파괴',
    // Off any kill now, raised like the rest — it was a 우두머리's only.
    chance: 0.001,
    tier: 'rare',
    color: 0xff7a3d,
    texture: TEXTURES.orbExplode,
    upgrade: { steps: 1, destroyChance: 0.2 },
  },
  // A tenth as common as the 폭발의 구슬 it guards against.
  mango: {
    id: 'mango',
    name: '망고의 구슬',
    short: '망고',
    detail: '장비를 망고 상태로 — 구슬로 인한 파괴를 한 번 막고 사라집니다',
    chance: 0.0001,
    tier: 'rare',
    color: 0xffe9a8,
    texture: TEXTURES.orbMango,
    ward: true,
  },
};

export const ALL_ORBS: readonly OrbSpec[] = Object.values(ORBS);

export const ORB_DROP = {
  /** How big one is drawn on the ground. */
  size: 16,
} as const;

/** What selling this sword pays: its rank from the bottom × GEAR_SELL.perRank, + perAffix a 속성. */
export function sellPriceFor(item: { readonly id: GearId; readonly prefixes: readonly unknown[]; readonly suffixes: readonly unknown[] }): number {
  const rank = LOWEST_GEAR_TIER + 1 - GEAR[item.id].tier;
  const lines = item.prefixes.length + item.suffixes.length;
  return Math.round(rank * GEAR_SELL.perRank * (1 + GEAR_SELL.perAffix * lines));
}
