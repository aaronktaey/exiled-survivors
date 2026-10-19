import type { Modifier, StatId } from '@/config/stats';
import type { SkillTag } from '@/weapons/skills';

/**
 * ★ 패시브 트리 — what carries over between runs: Path of Exile's graph in
 * small. The start sits in the middle; six branches leave it, each its own
 * way to build, and a node can be taken once it touches one already taken.
 *
 *   북   전사 — 근접 · 물리 · 출혈          → 학살자
 *   북동 사냥꾼 — 투사체 · 관통 · 연쇄      → 일점사
 *   남동 원소술사 — 화염 · 냉기 · 번개      → 원소 과부하
 *   남   공허술사 — 공허 · 오라 · 지속      → 영원의 계약
 *   남서 수호자 — 체력 · 무적 · 포션        → 철인
 *   북서 암살자 — 치명타 · 공격속도 · 이동  → 암살자의 표식
 *
 * Each branch is a spine of seven rings (small, small, 핵심, small, small,
 * 핵심, 키스톤) with an arm off each side whose end is a 핵심 too; the end of
 * one branch's right arm reaches the next branch's left arm, so a build can
 * cross over. Between the branches by the start, a utility node.
 *
 * Further out is better: a small node is worth NODE_VALUES at its ring's
 * tier, and a 핵심 is two to three small nodes in one. A 키스톤 changes a
 * rule and asks something back (KEYSTONES). Numbers are first guesses, to be
 * balanced by play.
 *
 * Points come from the account level (ACCOUNT_LEVEL), which every run's
 * experience feeds. A node taken back costs PASSIVE_RESPEC.shardCost 신성한
 * 조각 — the shard is the tree's eraser now, not its currency.
 */

export type PassiveNodeKind = 'start' | 'small' | 'notable' | 'keystone';

export type PassiveBranchId = 'warrior' | 'hunter' | 'elementalist' | 'voidcaller' | 'guardian' | 'assassin';

export type KeystoneId = 'slaughter' | 'singleShot' | 'overload' | 'eternity' | 'ironWill' | 'assassinMark';

/** A node's id: `start`, `util.N`, or `branch.s3` / `branch.l4` / `branch.r5` (spine, left arm, right arm, by ring). */
export type PassiveId = string;

export interface PassiveNodeSpec {
  readonly id: PassiveId;
  readonly kind: PassiveNodeKind;
  /** Korean name of a 핵심 or 키스톤; a locale renames it through `names.passives`. Small nodes are named by what they give. */
  readonly name?: string;
  readonly branch?: PassiveBranchId;
  /** Where it is drawn, in the tree's own px, the start at 0, 0. */
  readonly x: number;
  readonly y: number;
  /** The nodes it touches, both ways. */
  readonly links: readonly PassiveId[];
  readonly mods: readonly Modifier[];
  readonly keystone?: KeystoneId;
}

/**
 * What one small node gives, by how far out it is: rings 1–2, 3–4, 5 and
 * beyond. Percent unless the stat counts something.
 */
export const NODE_VALUES: Record<StatId, readonly [number, number, number]> = {
  damage: [4, 6, 8],
  attackSpeed: [3, 4, 5],
  critChance: [10, 15, 20],
  critMultiplier: [6, 9, 12],
  projectileSpeed: [6, 9, 12],
  projectileCount: [1, 1, 1],
  pierceCount: [1, 1, 1],
  chainCount: [1, 1, 1],
  area: [5, 8, 10],
  duration: [6, 9, 12],
  maxHp: [4, 6, 8],
  moveSpeed: [2, 3, 4],
  pickup: [8, 12, 16],
  invulnerable: [5, 8, 10],
  damageTaken: [2, 3, 4],
  potionHeal: [6, 9, 12],
  xpGain: [3, 5, 6],
  itemFind: [3, 5, 6],
};

/** The tier a ring's small nodes are paid at. */
export const ringTier = (ring: number): 0 | 1 | 2 => (ring <= 2 ? 0 : ring <= 4 ? 1 : 2);

/**
 * ★ 키스톤 — each end of a branch: a rule changed, and a price for it.
 * `detail` is the Korean line, {placeholders} filled from the numbers here.
 */
export const KEYSTONES = {
  /** 학살자: a 근접 kill bursts and hurts what stands round it. */
  slaughter: {
    /** Share of the dead enemy's full health dealt to each enemy in the burst. */
    burstShare: 0.15,
    burstRadius: 110,
    /** 투사체 skills' damage is multiplied by this. */
    projectileMore: 0.7,
    detail: '근접 스킬로 처치한 적이 터지며, 주변 적에게 그 적 최대 체력의 {share} 피해. 투사체 스킬 피해 {less} 감소',
  },
  /** 일점사: one shot, made to count. */
  singleShot: {
    /** 투사체 skills' damage is multiplied by this, and they throw no extra shots. */
    projectileMore: 1.6,
    detail: '투사체 스킬이 추가 투사체를 쏘지 않는 대신, 투사체 스킬 피해 {more} 증가',
  },
  /** 원소 과부하: a crit charges the elements for a while; crits themselves hit no harder. */
  overload: {
    buffMs: 8000,
    /** 원소 skills' damage is multiplied by this while it lasts. */
    elementalMore: 1.4,
    detail: '치명타가 나면 {seconds}초 동안 원소 스킬 피해 {more} 증가. 치명타가 추가 피해를 주지 않음',
  },
  /** 영원의 계약: what a skill leaves lasts far longer; the skills come slower. */
  eternity: {
    durationMore: 2,
    attackSpeedMore: 0.85,
    detail: '지속시간 {more} 증가, 공격속도 {less} 감소',
  },
  /** 철인: no window after a hit, but every hit is smaller. */
  ironWill: {
    damageTakenMore: 0.6,
    detail: '피격 후 무적 시간이 없어지는 대신, 받는 모든 피해 {less} 감소',
  },
  /** 암살자의 표식: twice the crits, and the hits that do not crit are weaker. */
  assassinMark: {
    critChanceMore: 2,
    nonCritMore: 0.7,
    detail: '치명타 확률 {more}배, 치명타가 아닌 피해 {less} 감소',
  },
} as const;

// Every 키스톤 has its numbers and its line (a missing one fails to compile here).
const KEYSTONE_CHECK: Record<KeystoneId, { readonly detail: string }> = KEYSTONES;
void KEYSTONE_CHECK;

/** How far apart the rings are drawn, and how far an arm leans off its spine. */
export const TREE_SHAPE = {
  ringGap: 92,
  armDegrees: 14,
  /** Where the utility nodes sit between two branches, in rings. */
  utilityRing: 1.75,
} as const;

/**
 * ★ 계정 레벨 — every run's experience (the gems it picked up) goes into one
 * pot that outlives runs; each level is one point for the tree. Leaving
 * level n costs `base × n^power`: a first good run is a handful of levels,
 * the twentieth level about twenty good runs.
 */
export const ACCOUNT_LEVEL = {
  base: 300,
  power: 1.5,
  maxLevel: 100,
} as const;

/** What it costs to take one node back: it must not cut anything off the start. */
export const PASSIVE_RESPEC = {
  shardCost: 1,
} as const;

export const SHARD = {
  /** Share of 우두머리 kills that leave one. */
  chance: 0.5,
  /** How big it is drawn on the ground. */
  size: 16,
} as const;

// --- The tree, as data -------------------------------------------------------

/** A small node: what it gives is read off NODE_VALUES at its ring. */
interface SmallNode {
  readonly kind: 'small';
  readonly stat: StatId;
  readonly tag?: SkillTag;
}
interface NotableNode {
  readonly kind: 'notable';
  readonly name: string;
  readonly mods: readonly Modifier[];
}
interface KeystoneNode {
  readonly kind: 'keystone';
  readonly name: string;
  readonly keystone: KeystoneId;
}
type NodeDraft = SmallNode | NotableNode | KeystoneNode;

const small = (stat: StatId, tag?: SkillTag): SmallNode => ({ kind: 'small', stat, ...(tag ? { tag } : {}) });
const notable = (name: string, mods: readonly Modifier[]): NotableNode => ({ kind: 'notable', name, mods });
const keystone = (name: string, id: KeystoneId): KeystoneNode => ({ kind: 'keystone', name, keystone: id });
const mod = (stat: StatId, value: number, tag?: SkillTag): Modifier => ({ stat, value, ...(tag ? { tag } : {}) });

interface BranchDraft {
  readonly id: PassiveBranchId;
  /** Which way it leaves the start, in degrees (0 is right, -90 up). */
  readonly angle: number;
  /** Rings 1 to 7. */
  readonly spine: readonly NodeDraft[];
  /** Off the spine's ring 2, rings 3 to 5, leaning one way… */
  readonly left: readonly NodeDraft[];
  /** …and off ring 3, rings 4 and 5, leaning the other. */
  readonly right: readonly NodeDraft[];
}

const BRANCHES: readonly BranchDraft[] = [
  {
    id: 'warrior',
    angle: -90,
    spine: [
      small('damage', '근접'),
      small('damage', '물리'),
      notable('무쇠 주먹', [mod('damage', 12, '근접'), mod('attackSpeed', 4, '근접')]),
      small('damage', '근접'),
      small('area', '근접'),
      notable('도살자의 손길', [mod('damage', 18, '근접'), mod('area', 10, '근접')]),
      keystone('학살자', 'slaughter'),
    ],
    left: [
      small('damage', '물리'),
      small('damage', '출혈'),
      notable('피의 갈증', [mod('damage', 14, '물리'), mod('damage', 14, '출혈')]),
    ],
    right: [small('attackSpeed', '근접'), notable('검풍', [mod('attackSpeed', 8, '근접'), mod('moveSpeed', 3)])],
  },
  {
    id: 'hunter',
    angle: -30,
    spine: [
      small('damage', '투사체'),
      small('projectileSpeed', '투사체'),
      notable('명사수', [mod('damage', 12, '투사체'), mod('projectileSpeed', 9, '투사체')]),
      small('damage', '원거리'),
      small('damage', '투사체'),
      notable('화살비', [mod('projectileCount', 1, '투사체')]),
      keystone('일점사', 'singleShot'),
    ],
    left: [
      small('damage', '관통'),
      small('projectileSpeed', '투사체'),
      notable('꿰뚫는 일격', [mod('pierceCount', 1, '투사체'), mod('damage', 10, '관통')]),
    ],
    right: [small('damage', '연쇄'), notable('도약하는 번개', [mod('chainCount', 1, '연쇄'), mod('damage', 10, '연쇄')])],
  },
  {
    id: 'elementalist',
    angle: 30,
    spine: [
      small('damage', '원소'),
      small('damage', '주문'),
      notable('원소의 조화', [mod('damage', 12, '원소'), mod('attackSpeed', 3, '주문')]),
      small('damage', '번개'),
      small('damage', '원소'),
      notable('원소 지배', [mod('damage', 18, '원소'), mod('damage', 10, '감전')]),
      keystone('원소 과부하', 'overload'),
    ],
    left: [
      small('damage', '화염'),
      small('area', '화염'),
      notable('불꽃 심장', [mod('damage', 14, '화염'), mod('area', 10, '화염'), mod('damage', 10, '점화')]),
    ],
    right: [
      small('damage', '냉기'),
      notable('서리 손길', [mod('damage', 12, '냉기'), mod('duration', 15, '냉기'), mod('damage', 10, '동결')]),
    ],
  },
  {
    id: 'voidcaller',
    angle: 90,
    spine: [
      small('damage', '공허'),
      small('duration'),
      notable('심연의 속삭임', [mod('damage', 12, '공허'), mod('attackSpeed', 4, '공허')]),
      small('damage', '오라'),
      small('damage', '공허'),
      notable('공허의 문', [mod('damage', 14, '공허'), mod('projectileCount', 1, '공허')]),
      keystone('영원의 계약', 'eternity'),
    ],
    left: [
      small('damage', '소환'),
      small('damage', '독'),
      notable('시간 왜곡', [mod('duration', 15), mod('damage', 10, '소환'), mod('damage', 10, '독')]),
    ],
    right: [small('attackSpeed', '오라'), notable('폭풍 부름', [mod('damage', 14, '오라'), mod('attackSpeed', 5, '오라')])],
  },
  {
    id: 'guardian',
    angle: 150,
    spine: [
      small('maxHp'),
      small('invulnerable'),
      notable('강인함', [mod('maxHp', 10), mod('damageTaken', 3)]),
      small('maxHp'),
      small('potionHeal'),
      notable('불굴', [mod('maxHp', 16), mod('damageTaken', 5)]),
      keystone('철인', 'ironWill'),
    ],
    left: [small('invulnerable'), small('moveSpeed'), notable('회피술', [mod('invulnerable', 15), mod('moveSpeed', 4)])],
    right: [small('potionHeal'), notable('약초학', [mod('potionHeal', 20), mod('itemFind', 6)])],
  },
  {
    id: 'assassin',
    angle: 210,
    spine: [
      small('attackSpeed'),
      small('critChance'),
      notable('날카로운 눈', [mod('critChance', 25), mod('critMultiplier', 10)]),
      small('attackSpeed'),
      small('critMultiplier'),
      notable('급소 찌르기', [mod('critChance', 30), mod('critMultiplier', 20)]),
      keystone('암살자의 표식', 'assassinMark'),
    ],
    left: [small('critMultiplier'), small('attackSpeed'), notable('광란', [mod('attackSpeed', 8), mod('moveSpeed', 3)])],
    right: [small('moveSpeed'), notable('바람걸음', [mod('moveSpeed', 6), mod('pickup', 16)])],
  },
];

/** Between each branch and the next round, by the start: a little of everything. */
const UTILITIES: readonly Modifier[] = [
  mod('xpGain', 4),
  mod('itemFind', 4),
  mod('damage', 3),
  mod('pickup', 10),
  mod('moveSpeed', 2),
  mod('attackSpeed', 2),
];

/** Where the arms leave their spine, and the rings they reach. */
const LEFT_FROM = 2;
const RIGHT_FROM = 3;

function buildTree(): Record<PassiveId, PassiveNodeSpec> {
  const nodes: Record<PassiveId, { -readonly [K in keyof PassiveNodeSpec]: PassiveNodeSpec[K] } & { links: PassiveId[] }> = {};
  const at = (ring: number, degrees: number) => {
    const r = ring * TREE_SHAPE.ringGap;
    const a = (degrees * Math.PI) / 180;
    return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) };
  };
  const link = (a: PassiveId, b: PassiveId) => {
    nodes[a]!.links.push(b);
    nodes[b]!.links.push(a);
  };
  const place = (id: PassiveId, draft: NodeDraft, ring: number, degrees: number, branch: PassiveBranchId) => {
    const where = at(ring, degrees);
    const mods =
      draft.kind === 'small'
        ? [mod(draft.stat, NODE_VALUES[draft.stat][ringTier(ring)], draft.tag)]
        : draft.kind === 'notable'
          ? draft.mods
          : [];
    nodes[id] = {
      id,
      kind: draft.kind,
      ...(draft.kind === 'small' ? {} : { name: draft.name }),
      ...(draft.kind === 'keystone' ? { keystone: draft.keystone } : {}),
      branch,
      ...where,
      links: [],
      mods,
    };
  };

  nodes.start = { id: 'start', kind: 'start', x: 0, y: 0, links: [], mods: [] };

  for (const branch of BRANCHES) {
    branch.spine.forEach((draft, i) => {
      const id = `${branch.id}.s${i + 1}`;
      place(id, draft, i + 1, branch.angle, branch.id);
      link(id, i === 0 ? 'start' : `${branch.id}.s${i}`);
    });
    branch.left.forEach((draft, i) => {
      const ring = LEFT_FROM + 1 + i;
      const id = `${branch.id}.l${ring}`;
      place(id, draft, ring, branch.angle - TREE_SHAPE.armDegrees, branch.id);
      link(id, i === 0 ? `${branch.id}.s${LEFT_FROM}` : `${branch.id}.l${ring - 1}`);
    });
    branch.right.forEach((draft, i) => {
      const ring = RIGHT_FROM + 1 + i;
      const id = `${branch.id}.r${ring}`;
      place(id, draft, ring, branch.angle + TREE_SHAPE.armDegrees, branch.id);
      link(id, i === 0 ? `${branch.id}.s${RIGHT_FROM}` : `${branch.id}.r${ring - 1}`);
    });
  }

  BRANCHES.forEach((branch, i) => {
    const next = BRANCHES[(i + 1) % BRANCHES.length]!;
    // The far ends of two neighbouring arms meet.
    link(`${branch.id}.r${RIGHT_FROM + branch.right.length}`, `${next.id}.l${LEFT_FROM + next.left.length}`);
    // And a utility node sits between their first rings.
    const id = `util.${i + 1}`;
    const between = (branch.angle + next.angle + (next.angle < branch.angle ? 360 : 0)) / 2;
    nodes[id] = { id, kind: 'small', ...at(TREE_SHAPE.utilityRing, between), links: [], mods: [UTILITIES[i]!] };
    link(id, `${branch.id}.s1`);
    link(id, `${next.id}.s1`);
  });

  return nodes;
}

export const PASSIVE_NODES: Record<PassiveId, PassiveNodeSpec> = buildTree();

export const ALL_PASSIVE_NODES: readonly PassiveNodeSpec[] = Object.values(PASSIVE_NODES);

/** Where every tree begins: taken from the first, and never given back. */
export const PASSIVE_START: PassiveId = 'start';
