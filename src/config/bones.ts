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
 * for it in drops; a 고대 두개골 turns every rare that would have walked in
 * into a 우두머리. Taking three is a decision about what kind of run this is
 * going to be, which is the point of picking them on a screen of their own.
 *
 * Adding one means a line in BONES, a name in the locales and a sprite in
 * BootScene — the drawer, the drop, the label and the pick screen all read
 * this table.
 */
export type BoneId = 'skull' | 'rib';

/** What one 뼈다귀 does to the run it is spent on. */
export interface BoneEffect {
  /** Multiplies every enemy's health, on top of the clock's own ramp. */
  readonly enemyHpScale?: number;
  /** Multiplies every rolled drop chance. */
  readonly dropScale?: number;
  /** A spawn that would have come up rare walks in as a 우두머리 instead. */
  readonly raresBecomeBosses?: boolean;
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
  readonly tier: 'normal' | 'magic' | 'rare';
  /** Whether more than one can go into the same run. */
  readonly stackable: boolean;
  /** Share of ordinary kills that leave one. */
  readonly fromKill: number;
  /**
   * What each 속성 on a rare adds, as a multiple of `fromKill`. A rare is
   * worth more than an ordinary enemy and a six-line rare worth more again,
   * so what it leaves behind follows what it was.
   */
  readonly perAffix: number;
  /** Share of 우두머리 kills that leave one. */
  readonly fromBoss: number;
  readonly run: BoneEffect;
}

export const BONES: Record<BoneId, BoneSpec> = {
  skull: {
    id: 'skull',
    name: '고대 두개골',
    short: '두개골',
    detail: '희귀 적 대신 우두머리가 나옵니다',
    texture: TEXTURES.boneSkull,
    color: 0xe9e3d2,
    tier: 'rare',
    // Two of them would do nothing a third time: rares are already all
    // 우두머리 with one.
    stackable: false,
    fromKill: 0.001,
    perAffix: 1,
    /** A 우두머리 never leaves one — it is what the skull makes more of. */
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
    tier: 'magic',
    /** Three of them is a real decision: x8 health for x3.4 the drops. */
    stackable: true,
    fromKill: 0,
    perAffix: 0,
    fromBoss: 0.05,
    run: { enemyHpScale: 2, dropScale: 1.5 },
  },
};

export const ALL_BONES: readonly BoneSpec[] = Object.values(BONES);

export const BONE_RUN = {
  /** How many go into one run. */
  maxApplied: 3,
  /**
   * How many 우두머리 a 고대 두개골 will have on the field at once. Without
   * a ceiling, one rare spawn in ten becoming a 우두머리 is six of them a
   * minute and a run that ends inside thirty seconds — the 뼈다귀 would be
   * unplayable rather than dangerous. Past this the spawn comes up rare in
   * the ordinary way.
   */
  maxBosses: 3,
  /** How big one is drawn on the ground. */
  size: 18,
} as const;

/** What one kill is worth in 뼈다귀, by what it was. */
export function boneChanceFor(
  spec: BoneSpec,
  kind: { readonly isBoss: boolean; readonly affixes: number },
): number {
  if (kind.isBoss) {
    return spec.fromBoss;
  }

  return spec.fromKill * (1 + spec.perAffix * kind.affixes);
}

/** Everything a run's 뼈다귀 add up to. */
export interface BoneBonus {
  readonly enemyHpScale: number;
  readonly dropScale: number;
  readonly raresBecomeBosses: boolean;
}

export const NO_BONES: BoneBonus = {
  enemyHpScale: 1,
  dropScale: 1,
  raresBecomeBosses: false,
};

/** Folds a run's 뼈다귀 together. Two 갈비뼈 compound rather than adding. */
export function boneBonusFor(applied: readonly BoneId[]): BoneBonus {
  let enemyHpScale = 1;
  let dropScale = 1;
  let raresBecomeBosses = false;

  for (const id of applied) {
    const effect = BONES[id]?.run;
    if (!effect) {
      continue;
    }

    enemyHpScale *= effect.enemyHpScale ?? 1;
    dropScale *= effect.dropScale ?? 1;
    raresBecomeBosses = raresBecomeBosses || effect.raresBecomeBosses === true;
  }

  return { enemyHpScale, dropScale, raresBecomeBosses };
}
