import type { Modifier } from '@/config/stats';
import type { SkillId } from '@/weapons/skills';

/**
 * ★ 룬 — what a skill is made into for one run (0.74, the user's ask): Path
 * of Exile's support gems in their plainest form. A skill has 강화 슬롯; a
 * 룬 set in one adds its modifiers to that skill alone, folded the way the
 * passive tree's were (Modifiers.ts: increases add up within the 룬, the
 * layers multiply).
 *
 * The run's main skill comes with RUNE_SLOTS.main slots, a skill found later
 * with none; a 룬 끌 adds one to a skill the survivor picks, up to
 * RUNE_SLOTS.max. 룬 and 룬 끌 drop in the run and go with it, like 구슬.
 *
 * Adding one means a line in RUNES, a name in the locales, and nothing else:
 * the drop, the label, the 룬 screen, the guide and the filter read this table.
 */
export type RuneId = 'repeat' | 'split' | 'pierce' | 'chain' | 'expanse' | 'linger' | 'velocity' | 'bombard';

export interface RuneSpec {
  readonly id: RuneId;
  /** Korean name; a locale renames it through `names.runes`. */
  readonly name: string;
  /** What it does to the skill it is set in. */
  readonly mods: readonly Modifier[];
  /**
   * A line said before the modifiers, for what they do not say by
   * themselves — Korean, {placeholders} filled from the numbers (runeLines);
   * a locale renames it through `names.runeDetails`.
   */
  readonly detail?: string;
  /**
   * The skills it does anything for, when not every one: a 룬 of 관통 on a
   * skill whose hits never fly does nothing, and the 룬 screen says so.
   */
  readonly skills?: readonly SkillId[];
  /**
   * At most one in a skill (0.79, the user's ask: 포격 and the like). Every
   * other 룬 stacks — two of 분열 are two more projectiles, their prices
   * added too. A skill already holding one is not offered it again.
   */
  readonly unique?: boolean;
  /** Relative chance of being the 룬 a drop is. */
  readonly weight: number;
  readonly color: number;
  /** Its mark, cut in the stone: strokes from (x1, y1) to (x2, y2) on a 0–1 square. */
  readonly glyph: readonly (readonly [number, number, number, number])[];
}

/** The skills that throw what they hit with: what 관통, 지속 and 가속 change the flight of. */
const THROWN: readonly SkillId[] = ['fireball', 'iceSpear'];

/**
 * 0.75 (the user's ask): 위력 · 신속 · 정밀 · 잔혹 went, 반복 and 포격 came,
 * and each 룬 that adds something now asks something back.
 */
export const RUNES: Record<RuneId, RuneSpec> = {
  repeat: {
    id: 'repeat',
    name: '반복의 룬',
    // Two casts more than the one that went off: three in all.
    mods: [{ stat: 'repeatCount', value: 2 }, { stat: 'damage', value: -60 }],
    detail: '스킬을 {casts}번 시전합니다',
    skills: ['meleeStrike', 'fireball', 'chainLightning', 'iceSpear', 'thunderStrike'],
    // Two would be −120% damage: nothing at all.
    unique: true,
    weight: 10,
    color: 0xf0d050,
    glyph: [[0.2, 0.3, 0.8, 0.3], [0.2, 0.5, 0.8, 0.5], [0.2, 0.7, 0.8, 0.7]],
  },
  split: {
    id: 'split',
    name: '분열의 룬',
    mods: [{ stat: 'projectileCount', value: 1 }, { stat: 'damage', value: -40 }],
    skills: ['fireball', 'iceSpear', 'voidOrb'],
    weight: 12,
    color: 0x5cb85c,
    glyph: [[0.5, 0.85, 0.5, 0.5], [0.5, 0.5, 0.2, 0.15], [0.5, 0.5, 0.8, 0.15]],
  },
  pierce: {
    id: 'pierce',
    name: '관통의 룬',
    mods: [{ stat: 'pierceCount', value: 2 }, { stat: 'pierceDecay', value: 30 }],
    detail: '관통할 때마다 피해 {decay} 감소 (곱연산)',
    skills: THROWN,
    weight: 12,
    color: 0x7fb8e8,
    glyph: [[0.15, 0.5, 0.85, 0.5], [0.6, 0.3, 0.85, 0.5], [0.6, 0.7, 0.85, 0.5], [0.35, 0.25, 0.35, 0.75]],
  },
  chain: {
    id: 'chain',
    name: '연쇄의 룬',
    // On a thrown skill, a shot that has hit turns to the next enemy near it.
    mods: [{ stat: 'chainCount', value: 1 }],
    skills: ['chainLightning', 'fireball', 'iceSpear'],
    weight: 10,
    color: 0x9bd3ff,
    glyph: [[0.2, 0.2, 0.45, 0.45], [0.45, 0.45, 0.3, 0.6], [0.3, 0.6, 0.8, 0.8], [0.55, 0.2, 0.8, 0.45]],
  },
  expanse: {
    id: 'expanse',
    name: '확장의 룬',
    // 공허구체: the orbs themselves grow.
    mods: [{ stat: 'area', value: 30 }],
    skills: ['meleeStrike', 'fireball', 'voidOrb'],
    weight: 12,
    color: 0xf0ad4e,
    glyph: [[0.5, 0.15, 0.5, 0.85], [0.15, 0.5, 0.85, 0.5], [0.25, 0.25, 0.75, 0.75], [0.75, 0.25, 0.25, 0.75]],
  },
  linger: {
    id: 'linger',
    name: '지속의 룬',
    // A thrown shot stays in the air that much longer: it reaches further.
    mods: [{ stat: 'duration', value: 40 }],
    skills: THROWN,
    weight: 10,
    color: 0x9b6bff,
    glyph: [[0.25, 0.2, 0.75, 0.2], [0.25, 0.8, 0.75, 0.8], [0.3, 0.2, 0.7, 0.8], [0.7, 0.2, 0.3, 0.8]],
  },
  velocity: {
    id: 'velocity',
    name: '가속의 룬',
    // Faster in the same time in the air: it reaches further too.
    mods: [{ stat: 'projectileSpeed', value: 30 }],
    skills: THROWN,
    weight: 10,
    color: 0x6aa9ff,
    glyph: [[0.15, 0.35, 0.6, 0.35], [0.15, 0.65, 0.6, 0.65], [0.6, 0.2, 0.85, 0.5], [0.85, 0.5, 0.6, 0.8]],
  },
  bombard: {
    id: 'bombard',
    name: '포격의 룬',
    mods: [{ stat: 'turret', value: 1 }, { stat: 'damage', value: -40 }],
    detail: '플레이어 대신 포탑이 시전합니다 — {every}초마다 설치, {life}초 지속',
    // A second turns nothing more into a turret, and costs another −40%.
    unique: true,
    weight: 8,
    color: 0xd45f3a,
    glyph: [[0.3, 0.85, 0.7, 0.85], [0.35, 0.85, 0.35, 0.45], [0.65, 0.85, 0.65, 0.45], [0.35, 0.45, 0.65, 0.45], [0.5, 0.45, 0.8, 0.15]],
  },
};

export const ALL_RUNES: readonly RuneSpec[] = Object.values(RUNES);

/** A 룬's own picture: a stone with its mark, drawn in BootScene. */
export const runeTexture = (id: RuneId): string => `tex-rune-${id}`;

/** A skill's 강화 슬롯: the main skill starts with `main`, every skill can reach `max`. 1 until 0.79. */
export const RUNE_SLOTS = {
  main: 2,
  max: 4,
} as const;

export const RUNE_DROP = {
  /**
   * Share of kills that leave a 룬 — the 무작위 스킬's chance, which it
   * replaced (0.74); a 갈비뼈 and a rare raise it the same way. A 우두머리
   * and a 도망자 leave one for certain (they left a skill before).
   */
  chance: 0.008,
  /** How big one is drawn on the ground. */
  size: 22,
} as const;

/** 반복의 룬: how long after one cast the next of its repeats goes off. */
export const RUNE_REPEAT = { gapMs: 160 } as const;

/**
 * 포격의 룬: the skill is cast by turrets instead of the survivor. One is set
 * down where the survivor stands every `everyMs`, and each lasts `lifeMs`.
 */
export const TURRET = { everyMs: 2000, lifeMs: 5000, size: 30 } as const;

/** 연쇄 on a thrown skill: how far from the enemy it hit a shot looks for the next. */
export const SHOT_CHAIN = { reach: 260 } as const;

/** ★ 룬 끌 — picked up, it adds a 강화 슬롯 to a skill the survivor picks. */
export const RUNE_CHISEL = {
  /**
   * Share of kills that leave one, raised like any drop — about three in a
   * run of ORB_DROP.runKills. None falls once every skill held is full.
   */
  chance: 0.0015,
  size: 24,
  color: 0xc9a46b,
} as const;
