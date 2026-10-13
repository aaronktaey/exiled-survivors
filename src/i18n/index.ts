import {
  AFFIXES,
  ENEMY_KINDS,
  GEAR,
  type AffixId,
  type AffixKind,
  type EnemyKind,
  type GearId,
} from '@/config';
import { en } from '@/i18n/en';
import { ja } from '@/i18n/ja';
import { ko } from '@/i18n/ko';
import { zh } from '@/i18n/zh';
import type { Language, Strings } from '@/i18n/types';
import { objectParticle, subjectParticle } from '@/systems/korean';
import { SKILLS, type SkillId, type SkillTag } from '@/weapons/skills';

export type { Language, Strings, GuideBlock } from '@/i18n/types';

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
 * {이가} and {을를} look at the value that came before them, so a template
 * never has to know which name will land in it.
 */
export function fill(template: string, values: Record<string, string | number> = {}): string {
  let last = '';

  return template.replace(/\{(\w+|이가|을를)\}/g, (_match, key: string) => {
    if (key === '이가') {
      return subjectParticle(last);
    }
    if (key === '을를') {
      return objectParticle(last);
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

export function gearName(id: GearId): string {
  return t().names?.gear?.[id] ?? GEAR[id].name;
}

/**
 * A weapon's rolled name, the way Path of Exile builds one: the first
 * prefix in front of the base, the first suffix behind it. The rest of the
 * lines are read in the 장비창 rather than crammed into the name.
 */
export function gearTitle(item: {
  readonly id: GearId;
  readonly prefixes: readonly AffixId[];
  readonly suffixes: readonly AffixId[];
}): string {
  const copy = t().gear;
  const head = item.prefixes[0];
  const tail = item.suffixes[0];
  const parts = [
    head ? fill(copy.prefixWord, { affix: affixName(head) }) : '',
    gearName(item.id),
    tail ? fill(copy.suffixWord, { affix: affixName(tail) }) : '',
  ];

  return parts.filter(Boolean).join(' ');
}

/** "접두어" or "접미어", for the line that lists one. */
export function affixKindName(kind: AffixKind): string {
  return kind === 'prefix' ? t().gear.prefix : t().gear.suffix;
}
