import {
  BOSS,
  FUGITIVE,
  ENEMY_KINDS,
  GEAR,
  GROUND_ITEM,
  PLAYER,
  POTION,
  RARE,
  SAVE,
  SKILL_BASE,
  SKILL_DROP,
  SPAWN_TABLE,
  xpFor,
  type EnemyKind,
} from '@/config';
import { enemyName, fill, skillName, skillSummary, t, tagName } from '@/i18n';
import { dpsFromStats, upgradeOptionsFor } from '@/systems/Progression';
import { ALL_SKILLS, DROPPABLE_SKILLS } from '@/weapons/skills';

/** One block of the guide: a heading and the lines under it. */
export interface GuideSection {
  readonly heading: string;
  readonly lines: readonly string[];
}

/** A chapter of the guide, as the contents list offers it. */
export interface GuideChapter {
  readonly id: string;
  readonly title: string;
  readonly sections: readonly GuideSection[];
}

const seconds = (ms: number): number => Math.round(ms / 1000);

/** A set of tiers as the guide writes it: "3" or "3~5". */
const tierSpan = (tiers: readonly number[]): string => {
  const low = Math.min(...tiers);
  const high = Math.max(...tiers);
  return low === high ? `${low}` : `${low}~${high}`;
};
/** "10%", or "1.5%" when a whole number would lie about it. */
const percent = (fraction: number): string => {
  const tenths = Math.round(fraction * 1000) / 10;
  return `${Number.isInteger(tenths) ? tenths : tenths.toFixed(1)}%`;
};
const round = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/**
 * The guide, in the current language, split into the chapters the contents
 * list offers. Every number is read from the live config, so the text
 * cannot drift away from the game it describes.
 */
export function guideChapters(): readonly GuideChapter[] {
  const g = t().guide;
  const titles = t().guideChapters;

  return [
    {
      id: 'goal',
      title: titles.goal,
      sections: [
        {
          heading: g.goal.heading,
          lines: g.goal.lines.map((line) => fill(line, { hp: PLAYER.maxHp })),
        },
      ],
    },
    {
      id: 'controls',
      title: titles.controls,
      sections: [
        { heading: g.controls.heading, lines: [...g.controls.lines] },
        { heading: g.mobile.heading, lines: [...g.mobile.lines] },
      ],
    },
    {
      id: 'growth',
      title: titles.growth,
      sections: [
        {
          heading: g.growth.heading,
          lines: [...g.growth.lines],
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
              tiers: tierSpan(
                Object.values(GEAR)
                  .filter((spec) => spec.fromKill !== undefined)
                  .map((spec) => spec.tier),
              ),
            }),
          ),
        },
        {
          heading: g.saving.heading,
          lines: g.saving.lines.map((line) => fill(line, { autosave: seconds(SAVE.autosaveMs) })),
        },
      ],
    },
    {
      id: 'skills',
      title: titles.skills,
      sections: [{ heading: g.skills.heading, lines: skillLines() }],
    },
    {
      id: 'enemies',
      title: titles.enemies,
      sections: [
        { heading: g.enemies.heading, lines: enemyLines() },
        {
          heading: g.rares.heading,
          lines: g.rares.lines.map((line) =>
            fill(line, {
              chance: percent(RARE.chance),
              min: RARE.minAffixes,
              max: RARE.maxAffixes,
              dropBonus: percent(RARE.dropBonusPerAffix),
              bossBonus: percent(BOSS.dropBonus),
            }),
          ),
        },
      ],
    },
  ];
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
      fill(g.stats, {
        damage: round(base.damage),
        rate: round(base.attackSpeed),
        dps: round(dpsFromStats(base)),
        range: base.range,
      }),
      fill(g.upgrades, { picks: picks.join(' / ') }),
    ];
  });
}

/** Every enemy, in the order the run meets it, with the boss last. */
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
        xp: xpFor(spec),
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
      xp: xpFor(boss),
    }),
    `   ${fill(g.notes.boss, {
      first: seconds(BOSS.firstMs),
      every: seconds(BOSS.intervalMs),
    })}`,
  );

  const fugitive = ENEMY_KINDS.fugitive;
  lines.push(
    fill(g.stats, {
      name: enemyName('fugitive'),
      hp: fugitive.maxHp,
      contact: fugitive.contactDamage,
      xp: xpFor(fugitive),
    }),
    `   ${fill(g.notes.fugitive, {
      first: seconds(FUGITIVE.firstMs),
      every: seconds(FUGITIVE.intervalMs),
      life: seconds(fugitive.lifespanMs ?? 0),
    })}`,
  );

  return lines;
}
