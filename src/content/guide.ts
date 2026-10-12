import {
  BOSS,
  ENEMY_KINDS,
  GROUND_ITEM,
  PLAYER,
  POTION,
  RARE,
  SAVE,
  SKILL_BASE,
  SKILL_DROP,
  SPAWN_TABLE,
  type EnemyKind,
} from '@/config';
import { enemyName, fill, skillName, skillSummary, t, tagName } from '@/i18n';
import { upgradeOptionsFor } from '@/systems/Progression';
import { ALL_SKILLS, DROPPABLE_SKILLS, STARTING_SKILLS } from '@/weapons/skills';

/** One block of the guide: a heading and the lines under it. */
export interface GuideSection {
  readonly heading: string;
  readonly lines: readonly string[];
}

const seconds = (ms: number): number => Math.round(ms / 1000);
const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

/**
 * The whole guide, in the current language, with every number read from the
 * live config — so the text cannot drift away from the game it describes.
 */
export function guideSections(): readonly GuideSection[] {
  const g = t().guide;

  return [
    {
      heading: g.goal.heading,
      lines: g.goal.lines.map((line) => fill(line, { hp: PLAYER.maxHp })),
    },
    { heading: g.controls.heading, lines: [...g.controls.lines] },
    { heading: g.mobile.heading, lines: [...g.mobile.lines] },
    {
      heading: g.growth.heading,
      lines: g.growth.lines.map((line) => fill(line, { starters: starterNames() })),
    },
    { heading: g.skills.heading, lines: skillLines() },
    { heading: g.enemies.heading, lines: enemyLines() },
    {
      heading: g.rares.heading,
      lines: g.rares.lines.map((line) =>
        fill(line, {
          chance: percent(RARE.chance),
          min: RARE.minAffixes,
          max: RARE.maxAffixes,
          dropBonus: percent(RARE.dropBonusPerAffix),
        }),
      ),
    },
    {
      heading: g.drops.heading,
      lines: g.drops.lines.map((line) =>
        fill(line, {
          skillChance: percent(SKILL_DROP.chance),
          potionChance: percent(POTION.chance),
          heal: percent(POTION.healFraction),
          life: seconds(GROUND_ITEM.lifespanMs),
          warning: seconds(GROUND_ITEM.warningMs),
        }),
      ),
    },
    {
      heading: g.saving.heading,
      lines: g.saving.lines.map((line) => fill(line, { autosave: seconds(SAVE.autosaveMs) })),
    },
  ];
}

function starterNames(): string {
  return STARTING_SKILLS.map((id) => skillName(id)).join(' · ');
}

/** Every skill: what it is, what it does, and what it upgrades into. */
function skillLines(): readonly string[] {
  const g = t().guide.skills;

  return ALL_SKILLS.flatMap((skill) => {
    const base = SKILL_BASE[skill.id];
    const picks = upgradeOptionsFor(skill).map((option) => option.label.replace(/\s*\+.*$/, ''));
    const dropped = DROPPABLE_SKILLS.some((candidate) => candidate.id === skill.id);
    const tags = skill.tags.map((tag) => tagName(tag)).join(' · ');

    return [
      `${skillName(skill.id)}  [${tags}]${dropped ? '' : `  (${g.starter})`}`,
      `   ${skillSummary(skill.id)}`,
      fill(g.stats, { damage: base.damage, rate: base.attackSpeed, range: base.range }),
      fill(g.upgrades, { picks: picks.join(' / ') }),
    ];
  });
}

/** Every enemy, in the order the run meets it. */
function enemyLines(): readonly string[] {
  const g = t().guide.enemies;
  const order = [...SPAWN_TABLE].sort((a, b) => a.unlockMs - b.unlockMs);

  const lines = order.flatMap(({ kind, unlockMs }) => {
    const spec = ENEMY_KINDS[kind as EnemyKind];
    const when = unlockMs > 0 ? fill(g.unlocksAt, { time: seconds(unlockMs) }) : g.fromStart;

    return [
      fill(g.stats, {
        name: enemyName(kind),
        hp: spec.maxHp,
        contact: spec.contactDamage,
        xp: spec.xp,
      }),
      `   ${g.notes[kind]} (${when})`,
    ];
  });

  const boss = ENEMY_KINDS.boss;
  lines.push(
    fill(g.stats, {
      name: enemyName('boss'),
      hp: boss.maxHp,
      contact: boss.contactDamage,
      xp: boss.xp,
    }),
    `   ${fill(g.notes.boss, { bossEvery: Math.round(BOSS.intervalMs / 1000) })}`,
  );

  return lines;
}
