import {
  AFFIXES,
  AFFIX_TIMING,
  ALTAR_OFFERS,
  BONES,
  ENEMY_KINDS,
  GEAR,
  ORBS,
  affixTier,
  PASSIVES,
  type AffixId,
  type AffixKind,
  type AltarOfferId,
  type EnemyKind,
  type BoneId,
  type GearId,
  type OrbId,
  type PassiveId,
  SKILL_MASTERY,
  SKILL_HELD_BONUS,
  POISON_NOVA,
  RANKING,
  type DailyEnemyBuff,
  type DailyRuleSet,
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

/** What a skill's 각성 (or, `tier` 2, its 2차 각성) does, its numbers read off SKILL_MASTERY. */
export function masteryText(id: SkillId, tier: 1 | 2 = 1): string {
  const pct = (share: number): string => `${Math.round(share * 100)}%`;
  if (tier === 2) {
    const line = (t().mastery.effects2 as Record<string, string>)[id];
    const { meleeArcDegrees, fireBlastScale, chainForks, iceShatter, voidInner, thunderSplash, droneBomb } = SKILL_MASTERY.second;
    return line
      ? fill(line, {
          arc: meleeArcDegrees,
          blastScale: fireBlastScale,
          forks: chainForks,
          shatter: iceShatter.radius,
          innerShare: pct(voidInner.damageShare),
          splashShare: pct(thunderSplash.damageShare),
          bombEvery: droneBomb.every,
          bombShare: pct(droneBomb.damageShare),
          max: POISON_NOVA.maxStacks,
        })
      : '';
  }
  const line = (t().mastery.effects as Record<string, string>)[id];
  if (!line) {
    return '';
  }
  const { fireBlastScale, freezeMs, chainBonusPerJump, thunderShock, voidVortex, droneTimes } = SKILL_MASTERY;
  return fill(line, {
    bonus: pct(chainBonusPerJump),
    blastScale: fireBlastScale,
    freeze: freezeMs / 1000,
    shockSecs: thunderShock.durationMs / 1000,
    shockAmp: pct(thunderShock.amplify),
    heal: voidVortex.healPerEnemy,
    healSecs: voidVortex.healEveryMs / 1000,
    droneTimes,
    stacks: POISON_NOVA.stacksPerHitAwakened,
  });
}

/** A ranking day as the board writes it: "10/26(월)", in its own time zone (RANKING.dailyReset). */
export function dailyDate(day: number): string {
  const local = new Date(day + RANKING.dailyReset.utcOffsetHours * 3_600_000);
  const weekday = t().daily.weekdays[local.getUTCDay()] ?? '';
  return fill(t().daily.date, { month: local.getUTCMonth() + 1, day: local.getUTCDate(), weekday });
}

/** Today's strengthened enemy, in words: "질주 접촉 피해 +50%". */
export function dailyEnemyText(buff: DailyEnemyBuff): string {
  return fill(t().daily.buffs[buff.stat], {
    kind: buff.kind === 'all' ? '' : enemyName(buff.kind),
    n: Math.round((buff.scale - 1) * 100),
  });
}

/** 오늘의 규칙 written out: a heading with the date, and a line each. */
export function dailyRuleText(rules: DailyRuleSet): { title: string; lines: string[]; short: string } {
  const copy = t().daily;
  const skill = skillName(rules.bannedSkill);
  const talent = t().shard.stats[rules.bannedTalent];
  const enemy = dailyEnemyText(rules.enemyBuff);
  return {
    title: fill(copy.title, { date: dailyDate(rules.day) }),
    lines: [fill(copy.bannedSkill, { skill }), fill(copy.bannedTalent, { talent }), fill(copy.enemy, { enemy })],
    short: fill(copy.titleLine, { date: dailyDate(rules.day), skill, talent, enemy }),
  };
}

/** What holding a skill gives every skill and the survivor (SKILL_HELD_BONUS), as one line. */
export function heldBonusText(id: SkillId): string {
  const bonus = SKILL_HELD_BONUS[id];
  const copy = t().heldBonus;
  const lines: string[] = [];
  const raise = (scale: number): number => Math.round((scale - 1) * 100);
  if (bonus?.critChance) {
    lines.push(fill(copy.critChance, { n: Math.round(bonus.critChance * 100) }));
  }
  if (bonus?.areaScale) {
    lines.push(fill(copy.areaScale, { n: raise(bonus.areaScale) }));
  }
  if (bonus?.damageScale) {
    lines.push(fill(copy.damageScale, { n: Number(bonus.damageScale.toFixed(2)) }));
  }
  if (bonus?.attackSpeedScale) {
    lines.push(fill(copy.attackSpeedScale, { n: raise(bonus.attackSpeedScale) }));
  }
  if (bonus?.moveSpeedScale) {
    lines.push(fill(copy.moveSpeedScale, { n: raise(bonus.moveSpeedScale) }));
  }
  if (bonus?.maxHpScale) {
    lines.push(fill(copy.maxHpScale, { n: raise(bonus.maxHpScale) }));
  }
  if (bonus?.contactDamageScale) {
    lines.push(fill(copy.contactDamageScale, { n: Math.round((1 - bonus.contactDamageScale) * 100) }));
  }
  if (bonus?.potionChanceScale) {
    lines.push(fill(copy.potionChanceScale, { n: raise(bonus.potionChanceScale) }));
  }
  return lines.length > 0 ? fill(copy.line, { effects: lines.join(' · ') }) : '';
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
  return template ? fill(template, { value: rung.value, every: AFFIX_TIMING.regenEveryMs / 1000 }) : rung.detail;
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
  const value =
    implicit.projectileBlock !== undefined
      ? pct(implicit.projectileBlock)
      : implicit.extraProjectiles !== undefined
        ? String(implicit.extraProjectiles)
        : implicit.damageScale !== undefined
          ? pct(implicit.damageScale - 1)
          : implicit.attackSpeedScale !== undefined
            ? pct(implicit.attackSpeedScale - 1)
            : implicit.skillAttackSpeed
              ? pct(implicit.skillAttackSpeed.scale - 1)
              : implicit.attack !== undefined
                ? String(implicit.attack)
                : '';
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

export function passiveName(id: PassiveId): string {
  return t().names?.passives?.[id] ?? PASSIVES[id].name;
}

export function passiveDetail(id: PassiveId): string {
  return t().names?.passiveDetails?.[id] ?? PASSIVES[id].detail;
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
