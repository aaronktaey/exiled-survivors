import { skillOffered } from '@/systems/SkillGate';
import {
  AFFIXES,
  ALL_BONES,
  ALL_ORBS,
  ALL_PASSIVES,
  ALTAR,
  ALTAR_OFFERS,
  BALANCE,
  BONE_RUN,
  BOSS,
  DIFFICULTY,
  ENEMY_KINDS,
  FUGITIVE,
  GEAR,
  GEAR_COMBINE,
  GEAR_DROP,
  GROUND_ITEM,
  INVENTORY,
  MANGO,
  PLAYER,
  POTION,
  RANKING,
  rankingResetHour,
  RARE,
  SAVE,
  SKILL_BASE,
  SKILL_DROP,
  SKILL_MASTERY,
  SKILL_PICK,
  SPAWN,
  SPAWN_TABLE,
  CHIMERA,
  STATS,
  UPGRADE_CAP,
  UPGRADE_MAX_PICKS,
  attackForTier,
  xpFor,
  type AffixId,
  type AltarOfferId,
  type EnemyKind,
  type GuideTone,
  MAGNET,
  PASSIVE_POINTS,
  TALENT_SHARD,
  TALENT_LUMP,
  SCORE,
  SUB_SKILLS,
} from '@/config';
import {
  affixDetail,
  affixGearDetail,
  affixKindName,
  affixName,
  altarOfferText,
  boneDetail,
  boneName,
  enemyName,
  fill,
  gearImplicitText,
  gearName,
  orbDetail,
  orbName,
  passiveDetail,
  passiveName,
  skillName,
  heldBonusText,
  masteryText,
  skillSummary,
  t,
  tagName,
} from '@/i18n';
import type { GuideChapterId, GuideTabId } from '@/i18n/types';
import { dpsFromStats, upgradeOptionsFor } from '@/systems/Progression';
import { ALL_SKILLS } from '@/weapons/skills';

/**
 * One card on a guide page: a title in its tone's colour, a few short facts
 * under it, and the lines that explain. Drawn with a border in that colour,
 * so a page reads as a set of things rather than one wall of text.
 */
export interface GuideCard {
  readonly title: string;
  readonly tone: GuideTone;
  readonly facts: readonly string[];
  readonly lines: readonly string[];
}

/** One tab across the top of a chapter's page. */
export interface GuideTab {
  readonly id: string;
  readonly title: string;
  readonly cards: readonly GuideCard[];
}

/** A chapter of the guide, as the contents list offers it. */
export interface GuideChapter {
  readonly id: string;
  readonly title: string;
  readonly tabs: readonly GuideTab[];
}

const seconds = (ms: number): string => round(ms / 1000);

/** "10%", or "1.5%" when a whole number would lie about it. */
const percent = (fraction: number): string => {
  const hundredths = Math.round(fraction * 10000) / 100;
  return `${Number(hundredths.toFixed(2))}%`;
};

/** "+10%" for a multiplier of 1.1. */
const raise = (scale: number): string => `+${percent(scale - 1)}`;

/** Percentage points, for a share that is added rather than multiplied. */
const points = (fraction: number): string => `+${Number((fraction * 100).toFixed(2))}%p`;

const round = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));

/** A set of tiers as the guide writes it: "3" or "3~5". */
const tierSpan = (tiers: readonly number[]): string => {
  if (tiers.length === 0) {
    return '';
  }
  const low = Math.min(...tiers);
  const high = Math.max(...tiers);
  return low === high ? `${low}` : `${low}~${high}`;
};

/** When a kind joins the spawn table, in seconds. */
const unlockOf = (kind: EnemyKind): string =>
  seconds(SPAWN_TABLE.find((row) => row.kind === kind)?.unlockMs ?? 0);

/**
 * Every number a prose card can ask for, read off the live config. One
 * table for all of them, so a locale can use any number on any card.
 */
/** Every number the guide (and 0.116's end-of-run tips) fills in, read off the config. */
export function guideValues(): Record<string, string | number> {
  const affixTierCount = Math.max(
    ...Object.values(AFFIXES).map((affix) => affix.gearTiers?.length ?? 0),
  );

  return {
    hp: PLAYER.maxHp,
    // 재능 (0.110): the points everyone holds, and what a 재능의 파편 is.
    passivePoints: PASSIVE_POINTS,
    shardChance: percent(TALENT_SHARD.chance),
    shardAmplify: percent(TALENT_SHARD.amplify),
    shardPotionHeal: String(TALENT_SHARD.potionHeal),
    lumpShards: TALENT_LUMP.shards,
    // 랭킹 점수 (0.116): each kind and its share, in the roster's order.
    scoreKinds: (Object.keys(SCORE.byKind) as EnemyKind[]).map((kind) => `${enemyName(kind)} ×${SCORE.byKind[kind]}`).join(' · '),
    subSkillsMax: SUB_SKILLS.max,
    choices: SKILL_PICK.choices,
    bossFirst: seconds(BOSS.firstMs),
    bossEvery: seconds(BOSS.intervalMs),
    fugFirst: seconds(FUGITIVE.firstMs),
    fugEvery: seconds(FUGITIVE.intervalMs),
    autosave: seconds(SAVE.autosaveMs),
    pickup: PLAYER.pickupRadius,
    maxPicks: Math.max(UPGRADE_MAX_PICKS.damage ?? 0, UPGRADE_MAX_PICKS.attackSpeed ?? 0),
    chainCap: UPGRADE_CAP.chainCount ?? 0,
    skillChance: percent(SKILL_DROP.chance),
    randomSkillChance: percent(SKILL_PICK.dropChance),
    critChance: percent(PLAYER.critChance),
    critMulti: round(PLAYER.critMultiplier),
    critAffix: affixName('critical'),
    cruelAffix: affixName('cruel'),
    mangoRate: round(MANGO.attackSpeedScale),
    minCooldown: STATS.minCooldownMs,
    spawnStart: seconds(SPAWN.startIntervalMs),
    spawnMin: seconds(SPAWN.minIntervalMs),
    maxAlive: SPAWN.maxAlive,
    bossBonus: `+${percent(BOSS.dropBonus)}`,
    dropBonus: `+${percent(RARE.dropBonusPerAffix)}`,
    rareChance: percent(RARE.chance),
    rareMin: RARE.minAffixes,
    rareMax: RARE.maxAffixes,
    hpStep: raise(DIFFICULTY.hpScalePerMinute),
    rareStep: points(DIFFICULTY.rareChancePerMinute),
    lateFrom: DIFFICULTY.lateFromMinute,
    lateMult: DIFFICULTY.lateMultiplier,
    hpTier1From: DIFFICULTY.hpStepTiers[0]?.afterMinute ?? 0,
    hpTier1: `+${percent((DIFFICULTY.hpScalePerMinute - 1) * (DIFFICULTY.hpStepTiers[0]?.multiplier ?? 1))}`,
    hpTier2From: DIFFICULTY.hpStepTiers[1]?.afterMinute ?? 0,
    hpTier2: `+${percent((DIFFICULTY.hpScalePerMinute - 1) * (DIFFICULTY.hpStepTiers[1]?.multiplier ?? 1))}`,
    rareLate: points(DIFFICULTY.rareChancePerMinute * DIFFICULTY.lateMultiplier),
    runnerAt: unlockOf('runner'),
    shooterAt: unlockOf('shooter'),
    bruteAt: unlockOf('brute'),
    life: seconds(GROUND_ITEM.lifespanMs),
    warning: seconds(GROUND_ITEM.warningMs),
    potionChance: percent(POTION.chance),
    heal: String(POTION.heal),
    mangoChance: percent(MANGO.chance),
    mangoSecs: seconds(MANGO.durationMs),
    mangoBoost: raise(MANGO.attackSpeedScale),
    magnetChance: percent(MAGNET.chance),
    altarChance: percent(ALTAR.fromKill),
    altarBoss: percent(ALTAR.fromBoss),
    altarOffers: (Object.keys(ALTAR_OFFERS) as AltarOfferId[])
      .map((id) => altarOfferText(id))
      .join(', '),
    fromKillTiers: tierSpan(
      Object.values(GEAR)
        .filter((spec) => spec.fromKill !== undefined)
        .map((spec) => spec.tier),
    ),
    combineCount: GEAR_COMBINE.count,
    combineChance: percent(GEAR_COMBINE.successChance),
    maxPrefix: GEAR_DROP.maxPrefixes,
    affixChance: percent(GEAR_DROP.affixChance),
    tierCount: affixTierCount,
    maxBones: BONE_RUN.maxApplied,
    maxBosses: BONE_RUN.maxBosses,
    cols: INVENTORY.cols,
    rows: INVENTORY.rows,
    nameLength: RANKING.nameLength,
    rankSize: RANKING.size,
    rankResetHour: rankingResetHour(Date.now()),
    masteryLevel: SKILL_MASTERY.level,
    masteryLevel2: SKILL_MASTERY.second.level,
  };
}

/** The tone a tab's prose is drawn in, when it is not plain information. */
const PROSE_TONE: Partial<Record<GuideTabId, GuideTone>> = {
  common: 'enemy',
  boss: 'boss',
  fugitive: 'enemy',
  rares: 'rare',
  field: 'item',
  gear: 'gear',
  affixes: 'rare',
  orbs: 'orb',
  bones: 'bone',
  passives: 'passive',
};

/** A tab's prose, filled. */
function prose(tab: GuideTabId, numbers: Record<string, string | number>): GuideCard[] {
  return t().guide.cards[tab].map((card) => ({
    title: fill(card.title, numbers),
    tone: PROSE_TONE[tab] ?? 'info',
    facts: [],
    lines: card.lines.map((line) => fill(line, numbers)),
  }));
}

/**
 * The guide, in the current language: chapters down the side, tabs across
 * each one, cards on each tab. Every number is read from the live config,
 * and every list — skills, enemies, 속성, 구슬, 뼈다귀, swords, 패시브 —
 * is read from its table, so a new entry turns up here without a line of
 * copy being written for it.
 */
export function guideChapters(): readonly GuideChapter[] {
  const numbers = guideValues();
  const chapters = t().guideChapters;
  const tabTitles = t().guideTabs;
  const tab = (id: GuideTabId, cards: readonly GuideCard[]): GuideTab => ({
    id,
    title: tabTitles[id],
    cards,
  });
  const chapter = (id: GuideChapterId, tabs: readonly GuideTab[]): GuideChapter => ({
    id,
    title: chapters[id],
    tabs,
  });

  return [
    chapter('basics', [
      tab('goal', prose('goal', numbers)),
      tab('controls', prose('controls', numbers)),
      tab('mobile', prose('mobile', numbers)),
      tab('saving', prose('saving', numbers)),
    ]),
    chapter('combat', [
      tab('levels', prose('levels', numbers)),
      tab('getSkills', prose('getSkills', numbers)),
      tab('damage', prose('damage', numbers)),
    ]),
    chapter(
      'skills',
      // A trial skill (SKILL_TRIAL) shows only to the accounts trying it.
      ALL_SKILLS.filter((skill) => skillOffered(skill.id)).map((skill) => ({
        id: skill.id,
        title: skillName(skill.id),
        cards: [skillCard(skill.id)],
      })),
    ),
    chapter('enemies', [
      tab('common', [...prose('common', numbers), ...commonEnemyCards()]),
      tab('boss', [bossCard(), chimeraCard(), ...prose('boss', numbers)]),
      tab('fugitive', [fugitiveCard(), ...prose('fugitive', numbers)]),
      tab('rares', [...prose('rares', numbers), ...rareAffixCards()]),
      tab('difficulty', prose('difficulty', numbers)),
    ]),
    chapter('items', [
      tab('dropRules', prose('dropRules', numbers)),
      tab('field', prose('field', numbers)),
      tab('gear', [...prose('gear', numbers), ...gearCards()]),
      tab('affixes', [...prose('affixes', numbers), ...affixCards()]),
      tab('orbs', [...prose('orbs', numbers), ...orbCards()]),
      tab('bones', [...prose('bones', numbers), ...boneCards()]),
    ]),
    chapter('progress', [
      tab('passives', [...prose('passives', numbers), ...passiveCards()]),
      tab('inventory', prose('inventory', numbers)),
      tab('ranking', prose('ranking', numbers)),
    ]),
  ];
}

/** One skill: what it is, what it does, its numbers and its upgrades. */
function skillCard(id: (typeof ALL_SKILLS)[number]['id']): GuideCard {
  const g = t().guide.labels;
  const skill = ALL_SKILLS.find((candidate) => candidate.id === id) ?? ALL_SKILLS[0];
  const base = SKILL_BASE[skill.id];
  const scale = BALANCE.damageScale[skill.id] ?? 1;
  const coeff = BALANCE.attackCoeff[skill.id] ?? 1;
  const picks = upgradeOptionsFor(skill).map((option) => option.label.replace(/\s*\+.*$/, ''));

  return {
    title: skillName(skill.id),
    tone: 'skill',
    facts: [
      skill.tags.map((tag) => tagName(tag)).join(' · '),
      fill(g.skillStats, {
        damage: round(base.damage),
        rate: round(base.attackSpeed),
        dps: round(dpsFromStats(base)),
      }),
      base.projectileSpeed > 0
        ? `${fill(g.skillRange, { range: base.range })} · ${fill(g.skillProjectile, { speed: base.projectileSpeed })}`
        : fill(g.skillRange, { range: base.range }),
      fill(g.skillCoeff, { coeff: round(coeff) }),
      ...(scale === 1 ? [] : [fill(g.skillScale, { scale: round(scale) })]),
    ],
    lines: [
      skillSummary(skill.id),
      fill(g.skillUpgrades, { picks: picks.join(' / ') }),
      // What its two awakenings add, as the HUD's card says it (main skill only).
      // What holding it gives every skill (0.84).
      heldBonusText(skill.id),
      fill(t().mastery.card, { effect: masteryText(skill.id) }),
      fill(t().mastery.card2, { effect: masteryText(skill.id, 2) }),
    ],
  };
}

/** The line of numbers every enemy card opens on. */
function enemyStats(kind: EnemyKind): string {
  const spec = ENEMY_KINDS[kind];
  return fill(t().guide.labels.enemyStats, {
    hp: spec.maxHp,
    contact: spec.contactDamage,
    xp: xpFor(spec),
    speed: spec.speed,
  });
}

/** Every kind the spawn table sends, in the order a run meets them. */
function commonEnemyCards(): GuideCard[] {
  const g = t().guide.labels;
  return [...SPAWN_TABLE]
    .sort((a, b) => a.unlockMs - b.unlockMs)
    .map(({ kind, unlockMs }) => {
      const spec = ENEMY_KINDS[kind];
      const shot = spec.shot;
      return {
        title: enemyName(kind),
        tone: 'enemy' as const,
        facts: [
          enemyStats(kind),
          unlockMs > 0 ? fill(g.unlocksAt, { time: seconds(unlockMs) }) : g.fromStart,
          ...(shot
            ? [fill(g.shot, { damage: shot.damage, every: seconds(shot.cooldownMs), range: shot.range })]
            : []),
        ],
        lines: [g.enemyNotes[kind] ?? ''],
      };
    });
}

function bossCard(): GuideCard {
  const g = t().guide.labels;
  const volley = ENEMY_KINDS.boss.volley;
  return {
    title: enemyName('boss'),
    tone: 'boss',
    facts: [
      enemyStats('boss'),
      ...(volley
        ? [fill(g.volley, { every: seconds(volley.cooldownMs), count: volley.count, damage: volley.damage })]
        : []),
    ],
    lines: [
      fill(g.enemyNotes.boss ?? '', { first: seconds(BOSS.firstMs), every: seconds(BOSS.intervalMs) }),
    ],
  };
}

/** 키메라: what 키메라 러시 sends, and when it starts. */
function chimeraCard(): GuideCard {
  const g = t().guide.labels;
  const volley = ENEMY_KINDS.chimera.volley;
  return {
    title: enemyName('chimera'),
    tone: 'boss',
    facts: [
      enemyStats('chimera'),
      ...(volley
        ? [fill(g.volley, { every: seconds(volley.cooldownMs), count: volley.count, damage: volley.damage })]
        : []),
    ],
    lines: [
      fill(g.enemyNotes.chimera ?? '', {
        minute: round(CHIMERA.firstMs / 60_000),
        every: round(CHIMERA.intervalMs / 60_000),
      }),
    ],
  };
}

function fugitiveCard(): GuideCard {
  const g = t().guide.labels;
  return {
    title: enemyName('fugitive'),
    tone: 'enemy',
    facts: [enemyStats('fugitive')],
    lines: [
      fill(g.enemyNotes.fugitive ?? '', {
        first: seconds(FUGITIVE.firstMs),
        every: seconds(FUGITIVE.intervalMs),
        life: seconds(ENEMY_KINDS.fugitive.lifespanMs ?? 0),
      }),
    ],
  };
}

/** What can be on a rare: every 속성 with an enemy side. */
function rareAffixCards(): GuideCard[] {
  const g = t().guide.labels;
  return (Object.keys(AFFIXES) as AffixId[])
    .filter((id) => AFFIXES[id].enemy !== undefined)
    .map((id) => ({
      title: affixName(id),
      tone: 'rare' as const,
      facts: AFFIXES[id].rangedOnly ? [g.affixRangedOnly] : [],
      lines: [affixDetail(id)],
    }));
}

/** Every 속성, both sides of it: on a rare, and rung by rung on a weapon. */
function affixCards(): GuideCard[] {
  const g = t().guide.labels;
  return (Object.keys(AFFIXES) as AffixId[]).map((id) => {
    const spec = AFFIXES[id];
    const where = !spec.enemy ? g.affixWeaponOnly : !spec.gearTiers ? g.affixEnemyOnly : '';
    const ladder = (spec.gearTiers ?? [])
      .map((rung) => fill(g.affixRung, { tier: rung.tier, value: affixGearDetail(id, rung.tier) }))
      .join(' · ');

    return {
      title: affixName(id),
      tone: 'rare' as const,
      facts: [
        affixKindName(spec.kind),
        ...(where ? [where] : []),
        ...(spec.rangedOnly ? [g.affixRangedOnly] : []),
        ...(spec.retired ? [g.affixRetired] : []),
      ],
      lines: [
        ...(spec.enemy ? [fill(g.affixEnemy, { detail: affixDetail(id) })] : []),
        ...(ladder ? [fill(g.affixWeapon, { ladder })] : []),
      ],
    };
  });
}

/** Every sword, best first: its tier, its 고정 속성, and where it comes from. */
function gearCards(): GuideCard[] {
  const g = t().guide.labels;
  const roster = Object.values(GEAR).sort((a, b) => a.tier - b.tier);
  const total = roster.reduce((sum, spec) => sum + spec.weight, 0);

  return roster.map((spec) => ({
    title: gearName(spec.id),
    tone: 'gear' as const,
    facts: [fill(g.gearTier, { tier: spec.tier, attack: attackForTier(spec.tier) })],
    lines: [
      ...(spec.implicit ? [fill(g.gearImplicit, { text: gearImplicitText(spec.id) })] : []),
      ...(spec.fromKind
        ? [fill(g.gearFromKind, { kind: enemyName(spec.fromKind.kind), chance: percent(spec.fromKind.chance) })]
        : spec.weight > 0 || spec.fromKill !== undefined
        ? [
            fill(g.gearBossShare, { share: percent(total > 0 ? spec.weight / total : 0) }),
            spec.fromKill !== undefined ? fill(g.gearFromKill, { chance: percent(spec.fromKill) }) : g.gearBossOnly,
          ]
        : [g.gearCraftOnly]),
      // 분해 and 제작 (0.90).
      fill(g.gearSalvage, { ore: spec.salvageOre }),
      spec.craftOre !== undefined ? fill(g.gearCraft, { cost: spec.craftOre }) : g.gearNoCraft,
    ],
  }));
}

function orbCards(): GuideCard[] {
  const g = t().guide.labels;
  return ALL_ORBS.map((orb) => ({
    title: orbName(orb.id),
    tone: 'orb' as const,
    facts: [fill(orb.fromBossOnly ? g.chanceBoss : g.chanceKill, { chance: percent(orb.chance) })],
    lines: [orbDetail(orb.id)],
  }));
}

function boneCards(): GuideCard[] {
  const g = t().guide.labels;
  return ALL_BONES.map((bone) => ({
    title: boneName(bone.id),
    tone: 'bone' as const,
    facts: [
      bone.fromKill > 0
        ? fill(g.chanceKill, { chance: percent(bone.fromKill) })
        : fill(g.chanceBoss, { chance: percent(bone.fromBoss) }),
      bone.stackable ? g.boneStack : g.boneSingle,
    ],
    lines: [boneDetail(bone.id)],
  }));
}

function passiveCards(): GuideCard[] {
  const g = t().guide.labels;
  return ALL_PASSIVES.map((passive) => ({
    title: passiveName(passive.id),
    tone: 'passive' as const,
    facts: [
      fill(g.passiveRank, { detail: passiveDetail(passive.id), max: passive.maxRank }),
      ...(passive.requires
        ? [fill(g.passiveNeeds, { name: passiveName(passive.requires.id), rank: passive.requires.rank })]
        : []),
    ],
    lines: [],
  }));
}
