import type { SkillTag } from '@/weapons/skills';

/**
 * ★ 능력치 — the one vocabulary every lasting bonus is written in: a node of
 * the passive tree today, a weapon line and a support gem as the overhaul
 * reaches them. A bonus is a `Modifier`: a stat, how much, and optionally the
 * one skill tag it is limited to ("화염 스킬 피해 +6%").
 *
 * Percent stats are "increased", Path of Exile's rule: within one source
 * they add (two +6% are +12%), and only a keystone multiplies (`more`).
 */
export type StatId =
  | 'damage'
  | 'attackSpeed'
  /** A share of the base chance (PLAYER.critChance): +50% is half as many crits again. */
  | 'critChance'
  /** Added to what a crit is worth: +20% turns ×2 into ×2.2. */
  | 'critMultiplier'
  | 'projectileSpeed'
  /** Count: shots beyond the first from a skill that throws, orbs beyond its own on one that orbits. */
  | 'projectileCount'
  /** Count: bodies a shot passes through. */
  | 'pierceCount'
  /** Count: enemies an arc jumps on to. */
  | 'chainCount'
  /** The size of what a skill covers: a swing's reach, a blast, an orb. */
  | 'area'
  /** How long what a skill leaves behind lasts: 냉각, 동결, burning ground. */
  | 'duration'
  | 'maxHp'
  | 'moveSpeed'
  /** How far away gems and items are picked up from. */
  | 'pickup'
  /** The window after a hit, and how long one body waits to hurt again. */
  | 'invulnerable'
  /** Reduced: less of every hit lands. */
  | 'damageTaken'
  | 'potionHeal'
  /** Experience from every gem. */
  | 'xpGain'
  /** Every item drop's chance (not the 망고 or the 자석, which nothing raises). */
  | 'itemFind'
  /** Count: casts after the one that went off (반복의 룬). */
  | 'repeatCount'
  /** Percent of its damage a shot loses each time it passes through an enemy (관통의 룬), compounding. */
  | 'pierceDecay'
  /** Count: the skill is cast by turrets instead (포격의 룬); more than one is still one. */
  | 'turret';

export interface Modifier {
  readonly stat: StatId;
  /** Percent for most stats (6 is 6%), a whole count for the *Count ones. */
  readonly value: number;
  /** Only skills carrying this tag; without one, every skill (or the survivor). */
  readonly tag?: SkillTag;
}

export interface StatSpec {
  /** Korean name; a locale renames it through `names.stats`. */
  readonly name: string;
  /** '%' for a percent, '' for a count. */
  readonly unit: '%' | '';
  /** '-' for a stat that is better lower (받는 피해). */
  readonly sign: '+' | '-';
  /** Not written out as a line: a 룬's own `detail` says it better. */
  readonly hidden?: boolean;
}

export const STAT_SPECS: Record<StatId, StatSpec> = {
  damage: { name: '피해', unit: '%', sign: '+' },
  attackSpeed: { name: '공격속도', unit: '%', sign: '+' },
  critChance: { name: '치명타 확률', unit: '%', sign: '+' },
  critMultiplier: { name: '치명타 피해', unit: '%', sign: '+' },
  projectileSpeed: { name: '투사체 속도', unit: '%', sign: '+' },
  projectileCount: { name: '투사체', unit: '', sign: '+' },
  pierceCount: { name: '관통', unit: '', sign: '+' },
  chainCount: { name: '연쇄', unit: '', sign: '+' },
  area: { name: '범위', unit: '%', sign: '+' },
  duration: { name: '지속시간', unit: '%', sign: '+' },
  maxHp: { name: '최대 체력', unit: '%', sign: '+' },
  moveSpeed: { name: '이동속도', unit: '%', sign: '+' },
  pickup: { name: '획득 범위', unit: '%', sign: '+' },
  invulnerable: { name: '무적 시간', unit: '%', sign: '+' },
  damageTaken: { name: '받는 피해', unit: '%', sign: '-' },
  potionHeal: { name: '포션 회복량', unit: '%', sign: '+' },
  xpGain: { name: '경험치', unit: '%', sign: '+' },
  itemFind: { name: '아이템 발견', unit: '%', sign: '+' },
  repeatCount: { name: '반복 시전', unit: '', sign: '+', hidden: true },
  pierceDecay: { name: '관통당 피해 감소', unit: '%', sign: '+', hidden: true },
  turret: { name: '포탑', unit: '', sign: '+', hidden: true },
};
