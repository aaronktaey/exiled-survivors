import type { DropTier } from '@/config/system';
import { TEXTURES } from '@/config/visuals';

/**
 * ★ 뼈다귀 — what is spent before a run rather than during one.
 *
 * Everything else the survivor carries is permanent: a weapon, a passive, a
 * 구슬 that changes a weapon for good. A 뼈다귀 is the opposite. It is spent
 * on one run, it changes the terms of that run, and when the run ends it is
 * gone whether the run went well or badly.
 *
 * They are not upgrades. A 갈비뼈 doubles what every enemy can take and pays
 * for it in drops; a 두개골 (고대 두개골 until 0.114) turns every rare that would have walked in
 * into a 우두머리. Taking three is a decision about what kind of run this is
 * going to be, which is the point of picking them on a screen of their own.
 *
 * Adding one means a line in BONES, a name in the locales and a sprite in
 * BootScene — the drawer, the drop, the label and the pick screen all read
 * this table.
 */
export type BoneId = 'skull' | 'rib' | 'spine' | 'tailbone';

/** What one 뼈다귀 does to the run it is spent on. */
export interface BoneEffect {
  /** Multiplies every enemy's health, on top of the clock's own ramp. */
  readonly enemyHpScale?: number;
  /** Multiplies every rolled drop chance. */
  readonly dropScale?: number;
  /** A spawn that would have come up rare walks in as a 우두머리 instead. */
  readonly raresBecomeBosses?: boolean;
  /** Multiplies the share of spawns that come up rare. */
  readonly rareChanceScale?: number;
  /**
   * Every 우두머리 the run would have — its clock, a 두개골's, a 제단's —
   * walks in as a 키메라 instead (꼬리뼈, 0.136).
   */
  readonly bossesBecomeChimeras?: boolean;
}

export interface BoneSpec {
  readonly id: BoneId;
  /** Korean name; a locale renames it through `names.bones`. */
  readonly name: string;
  /** The short form, for a slot too narrow for the whole name. */
  readonly short: string;
  /** What it does to a run, written out. */
  readonly detail: string;
  readonly texture: string;
  readonly color: number;
  /** How loudly it lands: its nameplate and its drop sound both read this. */
  readonly tier: DropTier;
  /** Whether more than one can go into the same run. */
  readonly stackable: boolean;
  /**
   * Share of ordinary kills that leave one. A rare's 속성 and a 우두머리 raise
   * it the way they raise every drop (RARE.dropBonusPerAffix, BOSS.dropBonus).
   */
  readonly fromKill: number;
  /**
   * Only for a 뼈다귀 no ordinary kill leaves (fromKill 0): the share of
   * 우두머리 kills that do, raised by nothing.
   */
  readonly fromBoss: number;
  readonly run: BoneEffect;
}

export const BONES: Record<BoneId, BoneSpec> = {
  skull: {
    id: 'skull',
    name: '두개골',
    short: '두개골',
    detail: '희귀 적 대신 우두머리가 나옵니다',
    texture: TEXTURES.boneSkull,
    color: 0xe9e3d2,
    tier: 'rare',
    // Two of them would do nothing a third time: rares are already all
    // 우두머리 with one.
    stackable: false,
    fromKill: 0.0005,
    fromBoss: 0,
    run: { raresBecomeBosses: true },
  },
  rib: {
    id: 'rib',
    name: '갈비뼈',
    short: '갈비',
    detail: '모든 적의 체력 +100%, 드랍률 +50%',
    texture: TEXTURES.boneRib,
    color: 0xd8c79f,
    tier: 'rare',
    /** Three of them is a real decision: x8 health for x3.4 the drops. */
    stackable: true,
    // The same as a 혼돈의 구슬: off any kill, raised like any other drop.
    fromKill: 0.0005,
    fromBoss: 0,
    run: { enemyHpScale: 2, dropScale: 1.5 },
  },
  spine: {
    id: 'spine',
    name: '척추',
    short: '척추',
    detail: '희귀 적 등장 확률 2배',
    texture: TEXTURES.boneSpine,
    color: 0xe2d6b8,
    tier: 'rare',
    // One is twice the rares; a second would be four times, and a third
    // eight — a run of nothing but rares. One a run.
    stackable: false,
    // Off any kill, as rare as a 갈비뼈.
    fromKill: 0.0005,
    fromBoss: 0,
    run: { rareChanceScale: 2 },
  },
  tailbone: {
    id: 'tailbone',
    name: '꼬리뼈',
    short: '꼬리',
    detail: '모든 우두머리가 키메라로 나옵니다',
    texture: TEXTURES.boneTailbone,
    color: 0xdccfb0,
    tier: 'rare',
    // Every 우두머리 is already a 키메라 with one (the user's: one a run).
    stackable: false,
    // As rare as a 두개골 (the user's ask, 0.136).
    fromKill: 0.0005,
    fromBoss: 0,
    run: { bossesBecomeChimeras: true },
  },
};

export const ALL_BONES: readonly BoneSpec[] = Object.values(BONES);

export const BONE_RUN = {
  /** How many go into one run. */
  maxApplied: 3,
  /**
   * How many 우두머리 a 두개골 will have on the field at once. Without
   * a ceiling, one rare spawn in ten becoming a 우두머리 is six of them a
   * minute and a run that ends inside thirty seconds — the 뼈다귀 would be
   * unplayable rather than dangerous. Past this the spawn comes up rare in
   * the ordinary way.
   */
  maxBosses: 3,
  /** How big one is drawn on the ground. */
  size: 18,
} as const;

/**
 * What one kill is worth in 뼈다귀. `bonus` is the kill's own drop
 * multiplier — a rare's 속성, a 우두머리's — which a 뼈다귀 only a 우두머리
 * leaves does not get.
 */
export function boneChanceFor(
  spec: BoneSpec,
  kind: { readonly isBoss: boolean; readonly bonus: number },
): number {
  if (spec.fromKill <= 0) {
    return kind.isBoss ? spec.fromBoss : 0;
  }

  return spec.fromKill * kind.bonus;
}

/** Everything a run's 뼈다귀 add up to. */
export interface BoneBonus {
  readonly enemyHpScale: number;
  readonly dropScale: number;
  readonly raresBecomeBosses: boolean;
  readonly rareChanceScale: number;
  readonly bossesBecomeChimeras: boolean;
}

export const NO_BONES: BoneBonus = {
  enemyHpScale: 1,
  dropScale: 1,
  raresBecomeBosses: false,
  rareChanceScale: 1,
  bossesBecomeChimeras: false,
};

/** Folds a run's 뼈다귀 together. Two 갈비뼈 compound rather than adding. */
export function boneBonusFor(applied: readonly BoneId[]): BoneBonus {
  let enemyHpScale = 1;
  let dropScale = 1;
  let raresBecomeBosses = false;
  let rareChanceScale = 1;
  let bossesBecomeChimeras = false;

  for (const id of applied) {
    const effect = BONES[id]?.run;
    if (!effect) {
      continue;
    }

    enemyHpScale *= effect.enemyHpScale ?? 1;
    dropScale *= effect.dropScale ?? 1;
    raresBecomeBosses = raresBecomeBosses || effect.raresBecomeBosses === true;
    rareChanceScale *= effect.rareChanceScale ?? 1;
    bossesBecomeChimeras = bossesBecomeChimeras || effect.bossesBecomeChimeras === true;
  }

  return { enemyHpScale, dropScale, raresBecomeBosses, rareChanceScale, bossesBecomeChimeras };
}
