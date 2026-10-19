import {
  AFFIXES,
  ALTAR_OFFERS,
  BONES,
  ENEMY_KINDS,
  GEAR,
  ORBS,
  affixTier,
  KEYSTONES,
  PASSIVE_NODES,
  STAT_SPECS,
  type AffixId,
  type AffixKind,
  type AltarOfferId,
  type EnemyKind,
  type BoneId,
  type GearId,
  type OrbId,
  type KeystoneId,
  type Modifier,
  type PassiveId,
  type StatId,
  SKILL_MASTERY,
} from '@/config';
import { en } from '@/i18n/en';
import { ja } from '@/i18n/ja';
import { ko } from '@/i18n/ko';
import { zh } from '@/i18n/zh';
import type { Language, Strings } from '@/i18n/types';
import { objectParticle, subjectParticle, towardParticle } from '@/systems/korean';
import { SKILLS, type SkillId, type SkillTag } from '@/weapons/skills';

export type { Language, Strings, GuideCardCopy } from '@/i18n/types';

const TABLES: Record<Language, Strings> = { ko, en, ja, zh };

/** In the order the 설정 row cycles through them. */
export const LANGUAGES: readonly Language[] = ['ko', 'en', 'ja', 'zh'];

let current: Language = 'ko';
const listeners = new Set<() => void>();

/** The active language's strings. */
export function t(): Strings {
  return TABLES[current];
}

export function language(): Language {
  return current;
}

/** What a language calls itself, for the settings row. */
export function languageName(code: Language): string {
  return TABLES[code].native;
}

export function setLanguage(next: Language): void {
  if (!TABLES[next] || next === current) {
    return;
  }

  current = next;
  listeners.forEach((listener) => listener());
}

/** Called after every change, for anything that has to redraw. */
export function onLanguageChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The browser's preference, if we speak it. */
export function detectLanguage(): Language {
  if (typeof navigator === 'undefined') {
    return 'ko';
  }

  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag.toLowerCase().split('-')[0];
    const match = LANGUAGES.find((known) => known === code);
    if (match) {
      return match;
    }
  }

  return 'ko';
}

/**
 * Fills {placeholders} in a line. Korean particles are placeholders too:
 * {이가}, {을를} and {으로} look at the value that came before them, so a
 * template never has to know which name will land in it.
 */
export function fill(template: string, values: Record<string, string | number> = {}): string {
  let last = '';

  return template.replace(/\{(\w+|이가|을를|으로)\}/g, (_match, key: string) => {
    if (key === '이가') {
      return subjectParticle(last);
    }
    if (key === '을를') {
      return objectParticle(last);
    }
    if (key === '으로') {
      return towardParticle(last);
    }

    const value = values[key];
    if (value === undefined) {
      return `{${key}}`;
    }

    last = String(value);
    return last;
  });
}

/**
 * Display names. The game data already names everything in Korean, so a
 * locale only lists what it renames and anything missing falls back to it.
 */
export function skillName(id: SkillId): string {
  return t().names?.skills?.[id] ?? SKILLS[id].name;
}

/** What a skill's 각성 does, its numbers read off SKILL_MASTERY. */
export function masteryText(id: SkillId): string {
  const effects = t().mastery.effects as Record<string, string>;
  const line = effects[id];
  if (!line) {
    return '';
  }
  const { fireZone, freezeMs, chainBonusPerJump } = SKILL_MASTERY;
  return fill(line, {
    bonus: `${Math.round(chainBonusPerJump * 100)}%`,
    seconds: fireZone.durationMs / 1000,
    share: `${Math.round(fireZone.damageShare * 100)}%`,
    freeze: freezeMs / 1000,
  });
}

export function skillSummary(id: SkillId): string {
  return t().names?.skillSummaries?.[id] ?? SKILLS[id].summary;
}

export function tagName(tag: SkillTag): string {
  return t().names?.tags?.[tag] ?? tag;
}

export function enemyName(kind: EnemyKind): string {
  return t().names?.enemies?.[kind] ?? ENEMY_KINDS[kind].name;
}

export function affixName(id: AffixId): string {
  return t().names?.affixes?.[id] ?? AFFIXES[id].name;
}

export function affixDetail(id: AffixId): string {
  return t().names?.affixDetails?.[id] ?? AFFIXES[id].detail;
}

/**
 * The same line as it reads on a weapon at one rung. A locale may rename the
 * 속성 itself; the numbers come off the tier ladder, which is the same in
 * every language.
 */
export function affixGearDetail(id: AffixId, tier: number): string {
  const rung = affixTier(id, tier);
  if (!rung) {
    return affixDetail(id);
  }

  const template = t().names?.affixGearDetails?.[id];
  return template ? fill(template, { value: rung.value }) : rung.detail;
}

/**
 * What a 제단 will call up — "우두머리 3마리", "희귀 사수 10마리" — built
 * from the enemy's own name, so a new offer needs no line in the locales.
 */
export function altarOfferText(id: AltarOfferId): string {
  const offer = ALTAR_OFFERS[id];
  if (!offer) {
    return '';
  }

  const copy = t().game;
  return fill(offer.rare ? copy.altarCrowdRare : copy.altarCrowd, {
    kind: enemyName(offer.kind),
    count: offer.count,
  });
}

/** The 뼈다귀's full name, its short form, and what it does to a run. */
export function boneName(id: BoneId): string {
  return t().names?.bones?.[id] ?? BONES[id].name;
}

export function boneShort(id: BoneId): string {
  return t().names?.boneShorts?.[id] ?? BONES[id].short;
}

export function boneDetail(id: BoneId): string {
  return t().names?.boneDetails?.[id] ?? BONES[id].detail;
}

/** The 구슬's full name, its one-word form, and what it does. */
export function orbName(id: OrbId): string {
  return t().names?.orbs?.[id] ?? ORBS[id].name;
}

export function orbShort(id: OrbId): string {
  return t().names?.orbShorts?.[id] ?? ORBS[id].short;
}

export function orbDetail(id: OrbId): string {
  return t().names?.orbDetails?.[id] ?? ORBS[id].detail;
}

export function gearName(id: GearId): string {
  return t().names?.gear?.[id] ?? GEAR[id].name;
}

/**
 * A base's 고정 속성 as it reads: "가한 피해의 0.1%만큼 흡혈". Empty for a
 * base that has none. The number is read off the table, so a retune shows.
 */
export function gearImplicitText(id: GearId): string {
  const implicit = GEAR[id].implicit;
  if (!implicit) {
    return '';
  }

  const pct = (fraction: number): string => `${Number((fraction * 100).toFixed(2))}%`;
  // The one effect a base has, as the player reads it: a share, or a count.
  const raised = (scale?: number) => (scale === undefined ? undefined : pct(scale - 1));
  const value =
    (implicit.projectileBlock !== undefined ? pct(implicit.projectileBlock) : undefined) ??
    (implicit.extraProjectiles !== undefined ? String(implicit.extraProjectiles) : undefined) ??
    raised(implicit.damageScale) ??
    raised(implicit.attackSpeedScale) ??
    (implicit.skillAttackSpeed ? pct(implicit.skillAttackSpeed.scale - 1) : undefined) ??
    raised(implicit.maxHpScale) ??
    raised(implicit.invulnerableScale) ??
    (implicit.damageTakenScale !== undefined ? pct(1 - implicit.damageTakenScale) : undefined) ??
    raised(implicit.pickupScale) ??
    raised(implicit.xpGainScale) ??
    raised(implicit.itemFindScale) ??
    (implicit.critChance !== undefined ? pct(implicit.critChance) : undefined) ??
    '';
  const skill = implicit.skillAttackSpeed ? skillName(implicit.skillAttackSpeed.skill) : '';
  const template = t().names?.gearImplicits?.[id] ?? implicit.detail;
  return fill(template, { value, skill });
}

/** "무쇠 검+3" — the base, and how many 속성 it rolled. */
export function gearLabel(item: {
  readonly id: GearId;
  readonly prefixes: readonly { readonly id: AffixId }[];
  readonly suffixes: readonly { readonly id: AffixId }[];
}): string {
  const count = item.prefixes.length + item.suffixes.length;
  return count > 0 ? `${gearName(item.id)}+${count}` : gearName(item.id);
}

export function statName(stat: StatId): string {
  return t().names?.stats?.[stat] ?? STAT_SPECS[stat].name;
}

/** "화염 스킬 피해" — what a modifier raises, without how much. */
export function modifierSubject(mod: Modifier): string {
  const stat = statName(mod.stat);
  return mod.tag ? fill(t().passives.taggedStat, { tag: tagName(mod.tag), stat }) : stat;
}

/** "화염 스킬 피해 +6%" — a modifier written out, its first letter raised for the languages that have one. */
export function modifierLine(mod: Modifier): string {
  const spec = STAT_SPECS[mod.stat];
  const line = fill(t().passives.statLine, {
    stat: modifierSubject(mod),
    sign: spec.sign,
    value: Number(mod.value.toFixed(2)),
    unit: spec.unit,
  });
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** A 키스톤's rule, its numbers filled from KEYSTONES. */
export function keystoneDetail(id: KeystoneId): string {
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const spec = KEYSTONES[id];
  const numbers: Record<KeystoneId, Record<string, string | number>> = {
    slaughter: { share: pct(KEYSTONES.slaughter.burstShare), less: pct(1 - KEYSTONES.slaughter.projectileMore) },
    singleShot: { more: pct(KEYSTONES.singleShot.projectileMore - 1) },
    overload: { seconds: KEYSTONES.overload.buffMs / 1000, more: pct(KEYSTONES.overload.elementalMore - 1) },
    eternity: { more: pct(KEYSTONES.eternity.durationMore - 1), less: pct(1 - KEYSTONES.eternity.attackSpeedMore) },
    ironWill: { less: pct(1 - KEYSTONES.ironWill.damageTakenMore) },
    assassinMark: { more: KEYSTONES.assassinMark.critChanceMore, less: pct(1 - KEYSTONES.assassinMark.nonCritMore) },
  };
  return fill(t().names?.keystoneDetails?.[id] ?? spec.detail, numbers[id]);
}

/** A node's name: a 핵심's or 키스톤's own, or what a small node raises. */
export function passiveName(id: PassiveId): string {
  const node = PASSIVE_NODES[id];
  if (!node) {
    return id;
  }
  if (node.kind === 'start') {
    return t().passives.kinds.start;
  }
  if (node.name) {
    return t().names?.passives?.[id] ?? node.name;
  }
  return node.mods[0] ? modifierSubject(node.mods[0]) : id;
}

/** What a node gives, a line each. */
export function passiveLines(id: PassiveId): string[] {
  const node = PASSIVE_NODES[id];
  if (!node) {
    return [];
  }
  return [...node.mods.map(modifierLine), ...(node.keystone ? [keystoneDetail(node.keystone)] : [])];
}

/**
 * A weapon's rolled name, the way Path of Exile builds one: the first
 * prefix in front of the base, the first suffix behind it. The rest of the
 * lines are read in the 장비창 rather than crammed into the name.
 */
export function gearTitle(item: {
  readonly id: GearId;
  readonly prefixes: readonly { readonly id: AffixId }[];
  readonly suffixes: readonly { readonly id: AffixId }[];
}): string {
  const copy = t().gear;
  const head = item.prefixes[0];
  const tail = item.suffixes[0];
  const parts = [
    head ? fill(copy.prefixWord, { affix: affixName(head.id) }) : '',
    gearName(item.id),
    tail ? fill(copy.suffixWord, { affix: affixName(tail.id) }) : '',
  ];

  return parts.filter(Boolean).join(' ');
}

/** "접두어" or "접미어", for the line that lists one. */
export function affixKindName(kind: AffixKind): string {
  return kind === 'prefix' ? t().gear.prefix : t().gear.suffix;
}
