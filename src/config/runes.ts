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
export type RuneId =
  | 'power'
  | 'haste'
  | 'split'
  | 'pierce'
  | 'chain'
  | 'expanse'
  | 'linger'
  | 'precision'
  | 'brutality'
  | 'velocity';

export interface RuneSpec {
  readonly id: RuneId;
  /** Korean name; a locale renames it through `names.runes`. */
  readonly name: string;
  /** What it does to the skill it is set in. */
  readonly mods: readonly Modifier[];
  /**
   * The skills it does anything for, when not every one: a 룬 of 관통 on a
   * skill whose hits never fly does nothing, and the 룬 screen says so.
   */
  readonly skills?: readonly SkillId[];
  /** Relative chance of being the 룬 a drop is. */
  readonly weight: number;
  readonly color: number;
  /** Its mark, cut in the stone: strokes from (x1, y1) to (x2, y2) on a 0–1 square. */
  readonly glyph: readonly (readonly [number, number, number, number])[];
}

/** The skills whose hits fly: what a 룬 of 분열, 관통 or 가속 works on. */
const THROWN: readonly SkillId[] = ['fireball', 'iceSpear', 'voidOrb'];

export const RUNES: Record<RuneId, RuneSpec> = {
  power: {
    id: 'power',
    name: '위력의 룬',
    mods: [{ stat: 'damage', value: 30 }],
    weight: 14,
    color: 0xe0564a,
    glyph: [[0.5, 0.15, 0.5, 0.85], [0.25, 0.4, 0.5, 0.15], [0.75, 0.4, 0.5, 0.15]],
  },
  haste: {
    id: 'haste',
    name: '신속의 룬',
    mods: [{ stat: 'attackSpeed', value: 20 }],
    weight: 14,
    color: 0xf0d050,
    glyph: [[0.3, 0.2, 0.6, 0.5], [0.6, 0.5, 0.3, 0.8], [0.5, 0.2, 0.8, 0.5], [0.8, 0.5, 0.5, 0.8]],
  },
  split: {
    id: 'split',
    name: '분열의 룬',
    mods: [{ stat: 'projectileCount', value: 1 }],
    skills: THROWN,
    weight: 8,
    color: 0x5cb85c,
    glyph: [[0.5, 0.85, 0.5, 0.5], [0.5, 0.5, 0.2, 0.15], [0.5, 0.5, 0.8, 0.15]],
  },
  pierce: {
    id: 'pierce',
    name: '관통의 룬',
    mods: [{ stat: 'pierceCount', value: 2 }],
    skills: ['fireball', 'iceSpear'],
    weight: 10,
    color: 0x7fb8e8,
    glyph: [[0.15, 0.5, 0.85, 0.5], [0.6, 0.3, 0.85, 0.5], [0.6, 0.7, 0.85, 0.5], [0.35, 0.25, 0.35, 0.75]],
  },
  chain: {
    id: 'chain',
    name: '연쇄의 룬',
    mods: [{ stat: 'chainCount', value: 1 }],
    skills: ['chainLightning'],
    weight: 8,
    color: 0x9bd3ff,
    glyph: [[0.2, 0.2, 0.45, 0.45], [0.45, 0.45, 0.3, 0.6], [0.3, 0.6, 0.8, 0.8], [0.55, 0.2, 0.8, 0.45]],
  },
  expanse: {
    id: 'expanse',
    name: '확장의 룬',
    mods: [{ stat: 'area', value: 30 }],
    skills: ['meleeStrike', 'fireball', 'voidOrb'],
    weight: 10,
    color: 0xf0ad4e,
    glyph: [[0.5, 0.15, 0.5, 0.85], [0.15, 0.5, 0.85, 0.5], [0.25, 0.25, 0.75, 0.75], [0.75, 0.25, 0.25, 0.75]],
  },
  linger: {
    id: 'linger',
    name: '지속의 룬',
    mods: [{ stat: 'duration', value: 40 }],
    skills: ['fireball', 'iceSpear'],
    weight: 8,
    color: 0x9b6bff,
    glyph: [[0.25, 0.2, 0.75, 0.2], [0.25, 0.8, 0.75, 0.8], [0.3, 0.2, 0.7, 0.8], [0.7, 0.2, 0.3, 0.8]],
  },
  precision: {
    id: 'precision',
    name: '정밀의 룬',
    mods: [{ stat: 'critChance', value: 50 }],
    weight: 10,
    color: 0xffffff,
    glyph: [[0.5, 0.15, 0.5, 0.4], [0.5, 0.6, 0.5, 0.85], [0.15, 0.5, 0.4, 0.5], [0.6, 0.5, 0.85, 0.5]],
  },
  brutality: {
    id: 'brutality',
    name: '잔혹의 룬',
    mods: [{ stat: 'critMultiplier', value: 30 }],
    weight: 10,
    color: 0xd45fd0,
    glyph: [[0.2, 0.8, 0.5, 0.2], [0.5, 0.2, 0.8, 0.8], [0.3, 0.55, 0.7, 0.55]],
  },
  velocity: {
    id: 'velocity',
    name: '가속의 룬',
    mods: [{ stat: 'projectileSpeed', value: 30 }],
    skills: ['fireball', 'iceSpear'],
    weight: 8,
    color: 0x6aa9ff,
    glyph: [[0.15, 0.35, 0.6, 0.35], [0.15, 0.65, 0.6, 0.65], [0.6, 0.2, 0.85, 0.5], [0.85, 0.5, 0.6, 0.8]],
  },
};

export const ALL_RUNES: readonly RuneSpec[] = Object.values(RUNES);

/** A 룬's own picture: a stone with its mark, drawn in BootScene. */
export const runeTexture = (id: RuneId): string => `tex-rune-${id}`;

/** A skill's 강화 슬롯: the main skill starts with `main`, every skill can reach `max`. */
export const RUNE_SLOTS = {
  main: 1,
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
