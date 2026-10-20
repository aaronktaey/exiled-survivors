import type { Modifier, StatId } from '@/config/stats';
import type { SkillTag } from '@/weapons/skills';

/**
 * ★ 패시브 트리 — what carries over between runs: Path of Exile's graph in
 * small. The start sits in the middle; six branches leave it, each its own
 * way to build, and a node can be taken once it touches one already taken.
 *
 * Every node sits on a grid and every link runs straight across or straight
 * up and down (0.72, the user's ask), so the arrow keys walk the tree link
 * by link. Three branches climb, three go down, from three columns: the
 * middle one off the start itself, the side ones off a junction the start
 * reaches in one long step either way.
 *
 *         암살자        전사        사냥꾼
 *            │           │            │
 *   ─ 유틸 ─ 갈림길 ─── 시작 ─── 갈림길 ─ 유틸
 *            │           │            │
 *         수호자      공허술사     원소술사
 *
 *   전사 — 근접 · 물리 · 출혈          → 학살자
 *   사냥꾼 — 투사체 · 관통 · 연쇄      → 일점사
 *   원소술사 — 화염 · 냉기 · 번개      → 원소 과부하
 *   공허술사 — 공허 · 오라 · 지속      → 영원의 계약
 *   수호자 — 체력 · 무적 · 포션        → 철인
 *   암살자 — 치명타 · 공격속도 · 이동  → 암살자의 표식
 *
 * Each branch is a spine of seven rings (small, small, 핵심, small, small,
 * 핵심, 키스톤) with an arm off each side — one step across, then on the
 * spine's way — whose end is a 핵심 too; neighbouring arm ends on the same
 * side of the start meet, so a build can cross over.
 *
 * Further out is better: a small node is worth NODE_VALUES at its ring's
 * tier, and a 핵심 is two to three small nodes in one. A 키스톤 changes a
 * rule and asks something back (KEYSTONES). Numbers are first guesses, to be
 * balanced by play.
 *
 * Every player has PASSIVE_POINTS to spend, and takes a node back for
 * nothing (0.72: no account level, 신성한 조각 or gold any more).
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
  /** Where it is drawn, in the tree's own px, the start at 0, 0 — always on the grid (TREE_SHAPE.cell). */
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

/** The grid: one cell's side in the tree's px, and how far either side of the start the side columns stand, in cells. */
export const TREE_SHAPE = {
  cell: 92,
  sideColumn: 4,
} as const;

/** ★ 패시브 포인트: what every player has to spend on the tree, the same for all. */
export const PASSIVE_POINTS = 15;

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

/**
 * Where each branch stands: its column (in cells, the start's at 0) and
 * which way it runs (-1 up, 1 down). Left to right the climbing ones are
 * 암살자, 전사, 사냥꾼; under them 수호자, 공허술사, 원소술사 — the order
 * the neighbouring arm ends meet in.
 */
const PLACES: Record<PassiveBranchId, { readonly column: number; readonly way: -1 | 1 }> = {
  assassin: { column: -1, way: -1 },
  warrior: { column: 0, way: -1 },
  hunter: { column: 1, way: -1 },
  guardian: { column: -1, way: 1 },
  voidcaller: { column: 0, way: 1 },
  elementalist: { column: 1, way: 1 },
};

/**
 * The junctions the side branches leave from (left and right of the start),
 * and a utility node further out past each: a little of everything.
 */
const UTILITIES: readonly { readonly id: PassiveId; readonly cells: number; readonly mod: Modifier }[] = [
  { id: 'util.1', cells: 1, mod: mod('damage', 3) },
  { id: 'util.2', cells: 2, mod: mod('pickup', 10) },
  { id: 'util.3', cells: -1, mod: mod('attackSpeed', 2) },
  { id: 'util.4', cells: -2, mod: mod('itemFind', 4) },
];

/** Where the arms leave their spine, and the rings they reach. */
const LEFT_FROM = 2;
const RIGHT_FROM = 3;

function buildTree(): Record<PassiveId, PassiveNodeSpec> {
  const nodes: Record<PassiveId, { -readonly [K in keyof PassiveNodeSpec]: PassiveNodeSpec[K] } & { links: PassiveId[] }> = {};
  const { cell, sideColumn } = TREE_SHAPE;
  // A side column's own x, in cells: a junction's, and the side branches' spines.
  const columnX = (column: number) => column * sideColumn;
  const at = (cx: number, cy: number) => ({ x: cx * cell, y: cy * cell });
  const link = (a: PassiveId, b: PassiveId) => {
    nodes[a]!.links.push(b);
    nodes[b]!.links.push(a);
  };
  const place = (id: PassiveId, draft: NodeDraft, ring: number, cx: number, cy: number, branch: PassiveBranchId) => {
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
      ...at(cx, cy),
      links: [],
      mods,
    };
  };

  nodes.start = { id: 'start', kind: 'start', x: 0, y: 0, links: [], mods: [] };

  // The junctions either side, one long step from the start, and a utility past each.
  for (const util of UTILITIES) {
    const side = Math.sign(util.cells);
    const cx = columnX(side) + (Math.abs(util.cells) - 1) * side;
    nodes[util.id] = { id: util.id, kind: 'small', ...at(cx, 0), links: [], mods: [util.mod] };
  }
  link('start', 'util.1');
  link('util.1', 'util.2');
  link('start', 'util.3');
  link('util.3', 'util.4');
  const rootOf = (column: number): PassiveId => (column === 0 ? 'start' : column > 0 ? 'util.1' : 'util.3');

  for (const branch of BRANCHES) {
    const { column, way } = PLACES[branch.id];
    const cx = columnX(column);
    branch.spine.forEach((draft, i) => {
      const id = `${branch.id}.s${i + 1}`;
      place(id, draft, i + 1, cx, way * (i + 1), branch.id);
      link(id, i === 0 ? rootOf(column) : `${branch.id}.s${i}`);
    });
    // An arm: one cell across from its spine ring, then on the spine's way.
    branch.left.forEach((draft, i) => {
      const ring = LEFT_FROM + 1 + i;
      const id = `${branch.id}.l${ring}`;
      place(id, draft, ring, cx - 1, way * (LEFT_FROM + i), branch.id);
      link(id, i === 0 ? `${branch.id}.s${LEFT_FROM}` : `${branch.id}.l${ring - 1}`);
    });
    branch.right.forEach((draft, i) => {
      const ring = RIGHT_FROM + 1 + i;
      const id = `${branch.id}.r${ring}`;
      place(id, draft, ring, cx + 1, way * (RIGHT_FROM + i), branch.id);
      link(id, i === 0 ? `${branch.id}.s${RIGHT_FROM}` : `${branch.id}.r${ring - 1}`);
    });
  }

  // Neighbouring arm ends meet across the gap between their columns — on
  // the same row, so the link runs straight across.
  const rows: readonly (readonly PassiveBranchId[])[] = [
    ['assassin', 'warrior', 'hunter'],
    ['guardian', 'voidcaller', 'elementalist'],
  ];
  for (const row of rows) {
    for (let i = 0; i + 1 < row.length; i++) {
      const a = BRANCHES.find((b) => b.id === row[i])!;
      const b = BRANCHES.find((d) => d.id === row[i + 1])!;
      link(`${a.id}.r${RIGHT_FROM + a.right.length}`, `${b.id}.l${LEFT_FROM + b.left.length}`);
    }
  }

  return nodes;
}

export const PASSIVE_NODES: Record<PassiveId, PassiveNodeSpec> = buildTree();

export const ALL_PASSIVE_NODES: readonly PassiveNodeSpec[] = Object.values(PASSIVE_NODES);

/** Where every tree begins: taken from the first, and never given back. */
export const PASSIVE_START: PassiveId = 'start';
