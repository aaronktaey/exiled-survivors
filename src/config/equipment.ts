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
import type { EnemyKind } from '@/config/balance';
import type { DropTier } from '@/config/system';
import type { PixelIconId } from '@/config/pixelIcons';

export type GearSlot = 'weapon';

export type GearId =
  | 'onigoroshi'
  | 'runedSword'
  | 'steelSword'
  | 'ironSword'
  | 'rustySword'
  | 'narsil'
  | 'spineSword'
  | 'starBreaker';

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
  /** Flat attack power on top of the base's own (나르실, 0.91). */
  readonly attack?: number;
  /**
   * 척추 검 (0.137): a kill sets off the 키메라's thorn ring from where it
   * fell, at `chance`; each thorn hits for `dpsShare` of the main skill's DPS.
   */
  readonly thornBurst?: { readonly chance: number; readonly dpsShare: number };
  /** 별 부수는 검 (0.137): multiplies the 재능의 파편's drop chance (an 증폭). */
  readonly shardChanceScale?: number;
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
  /**
   * Only one kind of enemy leaves it, at a flat `chance` a kill that nothing
   * raises (0.137: the 오니고로시 off a 우두머리 — before the sword a 우두머리
   * always leaves, in its place — the 척추 검 off a 키메라, the 별 부수는 검
   * off a 도망자).
   */
  readonly fromKind?: { readonly kind: EnemyKind; readonly chance: number };
  /** 고정 속성: on every one of this base, outside the affix slots. */
  readonly implicit?: GearImplicit;
  /** 분해: the 철광석 one gives back when taken apart (0.90). */
  readonly salvageOre: number;
  /** 제작: the 철광석 a bare one costs to make. Unset, it cannot be made. */
  readonly craftOre?: number;
  /**
   * False: no 합성 makes it (0.91) — the 오니고로시 only drops, the 나르실
   * is only made. A sword with no other base a tier up then has no 합성.
   */
  readonly combineInto?: boolean;
  /**
   * Its picture: a grid in PIXEL_ICONS, painted at boot under
   * `gearTexture(id)`. Each tier its own, so the 인벤토리 tells them apart
   * at a glance.
   */
  readonly icon: PixelIconId;
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
    combineInto: false,
    salvageOre: 50,
    icon: 'gear-onigoroshi',
    slot: 'weapon',
    tier: 1,
    name: '오니고로시',
    // Off a 우두머리 at its own 2% (0.137, the user's ask): no longer one of
    // the weighted swords a 우두머리 always leaves (0.5 of them, about 4.8%).
    weight: 0,
    fromKind: { kind: 'boss', chance: 0.02 },
    implicit: { detail: '{value} 확률로 적의 투사체를 막아냄', projectileBlock: 0.3 },
  },
  runedSword: {
    id: 'runedSword',
    salvageOre: 20,
    craftOre: 100,
    icon: 'gear-runedSword',
    slot: 'weapon',
    tier: 2,
    name: '룬 각인 검',
    weight: 1,
    implicit: { detail: '스킬의 투사체 +{value}개', extraProjectiles: 1 },
  },
  // From tier 3 down, any kill can leave one too — rarely.
  steelSword: {
    id: 'steelSword',
    salvageOre: 9,
    craftOre: 45,
    icon: 'gear-steelSword',
    slot: 'weapon',
    tier: 3,
    name: '강철 검',
    weight: 2,
    fromKill: 0.0007,
    implicit: { detail: '피해 증폭 +{value}', damageScale: 1.1 },
  },
  ironSword: {
    id: 'ironSword',
    salvageOre: 3,
    craftOre: 15,
    icon: 'gear-ironSword',
    slot: 'weapon',
    tier: 4,
    name: '무쇠 검',
    weight: 3,
    fromKill: 0.001,
    implicit: { detail: '공격속도 +{value}', attackSpeedScale: 1.1 },
  },
  rustySword: {
    id: 'rustySword',
    salvageOre: 1,
    craftOre: 5,
    icon: 'gear-rustySword',
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
  /**
   * 나르실 (0.91, the user's ask): only made, for 철광석 — no 우두머리 leaves
   * one (weight 0), no kill, no 합성. The 오니고로시's tier and attack, and
   * attack power on top as its 고정 속성.
   */
  narsil: {
    id: 'narsil',
    salvageOre: 50,
    craftOre: 1000,
    combineInto: false,
    icon: 'gear-narsil',
    slot: 'weapon',
    tier: 1,
    name: '나르실',
    weight: 0,
    implicit: { detail: '공격력 +{value}', attack: 15 },
  },
  /** 척추 검 (0.137, the user's design): only a 키메라 leaves one. */
  spineSword: {
    id: 'spineSword',
    salvageOre: 50,
    combineInto: false,
    icon: 'gear-spineSword',
    slot: 'weapon',
    tier: 1,
    name: '척추 검',
    weight: 0,
    fromKind: { kind: 'chimera', chance: 0.02 },
    implicit: {
      detail: '적 처치 시 {value} 확률로 가시 폭발 (가시 하나당 메인 스킬 DPS의 {share})',
      thornBurst: { chance: 0.1, dpsShare: 0.5 },
    },
  },
  /** 별 부수는 검 (0.137, the user's design): only a 도망자 leaves one. */
  starBreaker: {
    id: 'starBreaker',
    salvageOre: 50,
    combineInto: false,
    icon: 'gear-starBreaker',
    slot: 'weapon',
    tier: 1,
    name: '별 부수는 검',
    weight: 0,
    fromKind: { kind: 'fugitive', chance: 0.02 },
    implicit: { detail: '재능의 파편 드랍률 {value} 증폭', shardChanceScale: 1.3 },
  },
};

/**
 * ★ 분해 (0.90, the user's ask — it replaced selling, and gold went with it).
 * Taking a sword apart gives its base's `salvageOre` 철광석 and one 구슬 by
 * its rarity (0.91: the rarity its border shows): 마법 변화, 희귀 혼돈, 신화
 * 각성. An 일반 one gives only the ore.
 */
export const SALVAGE_ORBS: Partial<Record<DropTier, OrbId>> = {
  magic: 'transmute',
  rare: 'chaos',
  mythic: 'awaken',
};

/** What a 합성 of this base can make: the bases a tier up that a 합성 may make (0.91). */
export const combineTargets = (id: GearId): GearSpec[] =>
  Object.values(GEAR).filter((spec) => spec.tier === GEAR[id].tier - 1 && spec.combineInto !== false);

/** The weakest tier on the roster — the one worth GEAR_BASE.lowestAttack. */
export const LOWEST_GEAR_TIER = Math.max(...Object.values(GEAR).map((spec) => spec.tier));

/** Attack power for a tier, so the roster stays in step with the dial. */
export const attackForTier = (tier: number): number =>
  GEAR_BASE.lowestAttack + (LOWEST_GEAR_TIER - tier) * GEAR_BASE.attackPerTier;

export const ALL_GEAR: readonly GearSpec[] = Object.values(GEAR);

/** What every survivor starts out holding. */
export const STARTING_GEAR: GearId = 'rustySword';

/**
 * ★ 0.80's gift (the user's word, 2026-10-20). The game went back to 0.67's
 * play, but what 0.71 cleared on load — the stash, the 구슬 drawer, gold
 * and passives — was gone for good. So everyone is given this once, on the
 * title (STORAGE.rollbackGift, synced, so once an account): `gear` bare
 * pieces of each base named, and `orbsEach` of every 구슬. The harness turns
 * it off (it would fill every suite's stash) unless a page sets
 * `window.__giftOn`.
 */
export const ROLLBACK_GIFT = {
  enabled: true as boolean,
  // No 오니고로시 since 0.93 (the user's word): it only drops. A browser that
  // has not had the gift yet gets the 구슬 and the passive points alone.
  gear: {} as Partial<Record<GearId, number>>,
  // No 구슬 either since 0.94 (the user's word): what is left is the passive points.
  orbsEach: 0,
  /**
   * 0.81 (the user's word): passive points topped up, once, to what fills
   * every line to its maxRank — what is held and what is spent counted —
   * under its own mark (STORAGE.passiveGift).
   */
  // Off since 0.102: every player holds PASSIVE_POINTS, the tree started over.
  passivesToMax: false as boolean,
};

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
   * fails (or the weapon is full at six). At 0.6 (0.2 until 2026-10-17, 0.7
   * for a day) six in ten drops carry at least one line. Above 0.5 a full
   * six is commoner than five, the rolls past five all landing on it.
   */
  affixChance: 0.6,
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
export type OrbId = 'transmute' | 'chaos' | 'awaken' | 'explode' | 'mango' | 'engrave';

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
  readonly tier: DropTier;
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
   * Or puts the weapon in 망고 상태, which lasts one 폭발의 구슬: that one
   * cannot destroy it, and spends the 망고 whatever it rolls. One at a time.
   */
  readonly ward?: boolean;
  /**
   * Or takes one 속성 already on it, rolls a different one in its place and
   * puts that one rung higher — or, when every line is a 1티어, a different
   * 1티어 — at the risk of the weapon not surviving it.
   */
  readonly upgrade?: {
    /** How many rungs better the replacement comes out. */
    readonly steps: number;
    /** Share of uses that destroy the weapon instead. */
    readonly destroyChance: number;
  };
  /**
   * Or engraves one of the weapon's 속성, at random, for good (0.132): no
   * 구슬 changes it again — a reroll keeps it, a 폭발의 구슬 passes it by.
   * Only on a weapon with at least `minLines`, and once a weapon.
   */
  readonly engrave?: { readonly minLines: number };
}

export const ORBS: Record<OrbId, OrbSpec> = {
  transmute: {
    id: 'transmute',
    name: '변화의 구슬',
    short: '변화',
    detail: '속성을 1~2개로 다시 굴립니다',
    chance: 0.005,
    tier: 'normal',
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
    tier: 'magic',
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
    tier: 'magic',
    color: 0xffd34d,
    texture: TEXTURES.orbAwaken,
    add: 1,
  },
  explode: {
    id: 'explode',
    name: '폭발의 구슬',
    short: '폭발',
    detail: '1티어가 아닌 속성 1개를 한 단계 높은 것으로, 모두 1티어면 속성 1개를 다른 1티어 속성으로 — 20% 확률로 장비 파괴',
    // Off any kill now, raised like the rest — it was a 우두머리's only.
    chance: 0.0005,
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
    detail: '장비를 망고 상태로 — 다음 폭발의 구슬 한 번은 장비를 파괴하지 못하고, 그 구슬에 망고 상태가 사라집니다',
    chance: 0.0002,
    tier: 'mythic',
    color: 0xffe9a8,
    texture: TEXTURES.orbMango,
    ward: true,
  },
  // 0.132 (the user's design): as rare as the 망고의 구슬.
  engrave: {
    id: 'engrave',
    name: '각인의 구슬',
    short: '각인',
    detail: '속성이 4개 이상인 장비의 속성 1개를 무작위로 각인합니다 — 각인된 속성은 영구히 바뀌지 않습니다 (장비당 1번)',
    chance: 0.0002,
    tier: 'mythic',
    color: 0xb48cff,
    texture: TEXTURES.orbEngrave,
    engrave: { minLines: 4 },
  },
};

export const ALL_ORBS: readonly OrbSpec[] = Object.values(ORBS);

export const ORB_DROP = {
  /** How big one is drawn on the ground. */
  size: 16,
} as const;

