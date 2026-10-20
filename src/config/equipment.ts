/**
 * ★ 장비 — what the survivor wears in a run: a 무기, a 방어구 and a 장신구.
 *
 * Gear lives and dies with the run (2026-10-19): every run starts on a bare
 * 녹슨 검, whatever drops is found in the run, worn or kept in the run's 보관함
 * there and then, and 구슬 picked up in the run are spent on it while
 * paused. Nothing of it outlives the run.
 *
 * A piece is a base plus its 속성. A weapon's base gives flat attack power,
 * added to every skill's damage; every base has one 고정 속성. The 속성 are
 * the ones a rare enemy wears, split into prefixes and suffixes the way Path
 * of Exile splits them, each allowed on the slots its `slots` names — see
 * AFFIXES in balance.ts.
 *
 * Adding a base means a line in GEAR and a name in the locales.
 */

import type { GearSlot } from '@/config/balance';
import type { SkillId } from '@/weapons/skills';

export type { GearSlot } from '@/config/balance';

export type GearId =
  | 'onigoroshi'
  | 'runedSword'
  | 'steelSword'
  | 'ironSword'
  | 'rustySword'
  | 'dragonArmor'
  | 'plateArmor'
  | 'chainArmor'
  | 'leatherArmor'
  | 'clothArmor'
  | 'sunAmulet'
  | 'rubyRing'
  | 'jadeAmulet'
  | 'silverRing'
  | 'copperRing';

/** The slots in the order they are shown. */
export const GEAR_SLOTS: readonly GearSlot[] = ['weapon', 'armor', 'accessory'];

/** The run's 보관함: what is found and not worn waits here, until the run ends. */
export const RUN_BAG = {
  capacity: 30,
} as const;

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
  /** Multiplies the survivor's full health. */
  readonly maxHpScale?: number;
  /** Multiplies the window after a hit. */
  readonly invulnerableScale?: number;
  /** Multiplies every hit the survivor takes (below 1 is less). */
  readonly damageTakenScale?: number;
  /** Multiplies how far things are picked up from. */
  readonly pickupScale?: number;
  /** Multiplies every gem's experience. */
  readonly xpGainScale?: number;
  /** Multiplies every item drop's chance. */
  readonly itemFindScale?: number;
  /** Raises the base crit chance by this share of itself. */
  readonly critChance?: number;
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
    fromKill: 0.0008,
    implicit: { detail: '피해 +{value}', damageScale: 1.1 },
  },
  ironSword: {
    id: 'ironSword',
    icon: 'assets/icons/gear-ironSword.png',
    slot: 'weapon',
    tier: 4,
    name: '무쇠 검',
    weight: 3,
    fromKill: 0.00125,
    implicit: { detail: '공격속도 +{value}', attackSpeedScale: 1.1 },
  },
  rustySword: {
    id: 'rustySword',
    icon: 'assets/icons/gear-rustySword.png',
    slot: 'weapon',
    tier: 5,
    name: '녹슨 검',
    weight: 4,
    fromKill: 0.0018,
    implicit: {
      detail: '{skill}의 공격속도 +{value}',
      skillAttackSpeed: { skill: 'meleeStrike', scale: 1.2 },
    },
  },
  // 방어구: what stands between the survivor and a hit. Each tier's 고정
  // 속성 is health or less damage taken; the kill chances match the swords'.
  dragonArmor: {
    id: 'dragonArmor',
    icon: 'assets/icons/gear-dragonArmor.png',
    slot: 'armor',
    tier: 1,
    name: '장식 갑옷',
    weight: 0.5,
    implicit: { detail: '받는 피해 -{value}', damageTakenScale: 0.88 },
  },
  plateArmor: {
    id: 'plateArmor',
    icon: 'assets/icons/gear-plateArmor.png',
    slot: 'armor',
    tier: 2,
    name: '황금 판금',
    weight: 1,
    implicit: { detail: '최대 체력 +{value}', maxHpScale: 1.25 },
  },
  chainArmor: {
    id: 'chainArmor',
    icon: 'assets/icons/gear-chainArmor.png',
    slot: 'armor',
    tier: 3,
    name: '사슬 갑옷',
    weight: 2,
    fromKill: 0.0008,
    implicit: { detail: '받는 피해 -{value}', damageTakenScale: 0.94 },
  },
  leatherArmor: {
    id: 'leatherArmor',
    icon: 'assets/icons/gear-leatherArmor.png',
    slot: 'armor',
    tier: 4,
    name: '가죽 외투',
    weight: 3,
    fromKill: 0.00125,
    implicit: { detail: '무적 시간 +{value}', invulnerableScale: 1.2 },
  },
  clothArmor: {
    id: 'clothArmor',
    icon: 'assets/icons/gear-clothArmor.png',
    slot: 'armor',
    tier: 5,
    name: '천옷',
    weight: 4,
    fromKill: 0.0018,
    implicit: { detail: '최대 체력 +{value}', maxHpScale: 1.1 },
  },
  // 장신구: a ring or an amulet, for what is neither attack nor defence.
  sunAmulet: {
    id: 'sunAmulet',
    icon: 'assets/icons/gear-sunAmulet.png',
    slot: 'accessory',
    tier: 1,
    name: '불꽃 부적',
    weight: 0.5,
    implicit: { detail: '공격속도 +{value}', attackSpeedScale: 1.1 },
  },
  rubyRing: {
    id: 'rubyRing',
    icon: 'assets/icons/gear-rubyRing.png',
    slot: 'accessory',
    tier: 2,
    name: '루비 반지',
    weight: 1,
    implicit: { detail: '기본 치명타 확률 +{value}', critChance: 0.3 },
  },
  jadeAmulet: {
    id: 'jadeAmulet',
    icon: 'assets/icons/gear-jadeAmulet.png',
    slot: 'accessory',
    tier: 3,
    name: '비취 목걸이',
    weight: 2,
    fromKill: 0.0008,
    implicit: { detail: '경험치 +{value}', xpGainScale: 1.1 },
  },
  silverRing: {
    id: 'silverRing',
    icon: 'assets/icons/gear-silverRing.png',
    slot: 'accessory',
    tier: 4,
    name: '은 반지',
    weight: 3,
    fromKill: 0.00125,
    implicit: { detail: '아이템 발견 +{value}', itemFindScale: 1.15 },
  },
  copperRing: {
    id: 'copperRing',
    icon: 'assets/icons/gear-copperRing.png',
    slot: 'accessory',
    tier: 5,
    name: '구리 반지',
    weight: 4,
    fromKill: 0.0018,
    implicit: { detail: '획득 범위 +{value}', pickupScale: 1.25 },
  },
};

/** The weakest tier on the roster — the one worth GEAR_BASE.lowestAttack. */
export const LOWEST_GEAR_TIER = Math.max(
  ...Object.values(GEAR).filter((spec) => spec.slot === 'weapon').map((spec) => spec.tier),
);

/** Attack power for a tier, so the roster stays in step with the dial. */
export const attackForTier = (tier: number): number =>
  GEAR_BASE.lowestAttack + (LOWEST_GEAR_TIER - tier) * GEAR_BASE.attackPerTier;

export const ALL_GEAR: readonly GearSpec[] = Object.values(GEAR);

/** What every survivor starts a run wearing, bare: a 녹슨 검 and, since 0.72, a 천옷. */
export const STARTING_KIT: Partial<Record<GearSlot, GearId>> = { weapon: 'rustySword', armor: 'clothArmor' };

/** The weapon of it: what a run with no weapon to read back falls back on. */
export const STARTING_GEAR: GearId = 'rustySword';

/**
 * 장비 합성, in the run's 장비 screen: `count` of the same base out of the
 * 보관함 make one piece a tier better, of the same slot, as an 일반 drop
 * would roll it. It always works (0.71; it failed four times in five on the
 * title's old 인벤토리). Tier 1 comes only off a 우두머리, so nothing makes
 * it: `bestTier` is the best a 합성 reaches, and a piece already there
 * cannot go in.
 */
export const GEAR_COMBINE = {
  count: 3,
  bestTier: 2,
} as const;

export const GEAR_DROP = {
  /**
   * A piece's 등급 decides how many 속성 it drops with: 일반 2, 마법 4, 희귀 6
   * (the user's ask, 0.71). Which 등급 is by weight, out of 100: 마법 and
   * 희귀 a tenth rarer in 0.72 (they were 14 and 8, the share each had under
   * the old roll of a line at a time).
   * The 구슬 can still leave a piece at any count; the 등급 it shows is then
   * read off that count (AUDIO.dropTiers).
   */
  grades: {
    normal: { lines: 2, weight: 80.2 },
    magic: { lines: 4, weight: 12.6 },
    rare: { lines: 6, weight: 7.2 },
  },
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
}

export const ORB_DROP = {
  /** How big one is drawn on the ground. */
  size: 16,
  /**
   * The run the 구슬's rates are reckoned for, in kills. A day's best on the
   * live board averaged about 2,300 (2026-10-20) and most runs are shorter;
   * since 0.71 the 구슬 are found and spent in the run, so each one's chance
   * is the count a run this long should find (the user's ask, to try out:
   * 변화 30, 혼돈 10, 각성 10, 폭발 5, 망고 3), over this.
   */
  runKills: 2000,
} as const;

/** A kill's chance at one 구슬, for `count` of them over a run of ORB_DROP.runKills. */
const perRun = (count: number): number => count / ORB_DROP.runKills;

export const ORBS: Record<OrbId, OrbSpec> = {
  transmute: {
    id: 'transmute',
    name: '변화의 구슬',
    short: '변화',
    detail: '속성을 1~2개로 다시 굴립니다',
    chance: perRun(30),
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
    chance: perRun(10),
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
    chance: perRun(10),
    tier: 'rare',
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
    chance: perRun(5),
    tier: 'rare',
    color: 0xff7a3d,
    texture: TEXTURES.orbExplode,
    upgrade: { steps: 1, destroyChance: 0.2 },
  },
  mango: {
    id: 'mango',
    name: '망고의 구슬',
    short: '망고',
    detail: '장비를 망고 상태로 — 다음 폭발의 구슬 한 번은 장비를 파괴하지 못하고, 그 구슬에 망고 상태가 사라집니다',
    chance: perRun(3),
    tier: 'rare',
    color: 0xffe9a8,
    texture: TEXTURES.orbMango,
    ward: true,
  },
};

export const ALL_ORBS: readonly OrbSpec[] = Object.values(ORBS);


/** What selling this sword pays: its rank from the bottom × GEAR_SELL.perRank, + perAffix a 속성. */
