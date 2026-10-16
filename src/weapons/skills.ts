import type { UpgradeId } from '@/systems/Progression';

/**
 * Skill registry. Tags are data, so later systems (damage scaling, supports,
 * resistances) can filter on them without each weapon hard-coding its kind.
 */
export type SkillTag =
  | '물리'
  | '공격'
  | '근접'
  | '투사체'
  | '원거리'
  | '주문'
  | '화염'
  | '번개'
  | '연쇄'
  | '냉기'
  | '관통'
  | '공허'
  | '오라';

export type SkillId =
  | 'meleeStrike'
  | 'fireball'
  | 'chainLightning'
  | 'iceSpear'
  | 'voidOrb'
  | 'thunderStrike';

export interface SkillDefinition {
  readonly id: SkillId;
  readonly name: string;
  readonly tags: readonly SkillTag[];
  /** The picks this skill's upgrade screen offers, in the order shown. */
  readonly upgrades: readonly UpgradeId[];
  /** One line on what it does, shown in 게임 가이드. */
  readonly summary: string;
}

export const SKILLS: Record<SkillId, SkillDefinition> = {
  meleeStrike: {
    id: 'meleeStrike',
    name: '타격',
    tags: ['물리', '공격', '근접'],
    upgrades: ['damage', 'attackSpeed'],
    summary: '가장 가까운 적을 향해 짧게 휘두릅니다. 범위 안의 적을 한꺼번에 때립니다.',
  },
  fireball: {
    id: 'fireball',
    name: '화염구',
    tags: ['투사체', '원거리', '주문', '화염'],
    // No 사거리 pick: a thrown skill reaches further by flying faster.
    upgrades: ['damage', 'attackSpeed', 'projectileSpeed'],
    summary: '가장 가까운 적에게 불덩이를 던집니다. 처음 맞은 적에게서 터지며, 주변의 적도 함께 불에 휩싸입니다.',
  },
  chainLightning: {
    id: 'chainLightning',
    name: '연쇄번개',
    tags: ['주문', '번개', '연쇄'],
    upgrades: ['damage', 'attackSpeed', 'chainCount'],
    summary: '즉발 번개가 적을 때리고, 가까운 다음 적으로 옮겨붙습니다. 같은 적을 두 번 때리지는 않습니다.',
  },
  iceSpear: {
    id: 'iceSpear',
    name: '얼음창',
    tags: ['주문', '냉기', '투사체'],
    upgrades: ['damage', 'attackSpeed', 'projectileSpeed', 'pierceCount'],
    summary: '적을 관통하며, 맞은 적에게 냉각(이동속도 -30%)을 겁니다.',
  },
  voidOrb: {
    id: 'voidOrb',
    name: '공허구체',
    tags: ['공허', '주문', '투사체'],
    upgrades: ['damage', 'orbitSpeed', 'orbCount'],
    summary: '구체가 주위를 시계방향으로 돌며 닿는 적을 때립니다. 겨냥이 필요 없습니다.',
  },
  thunderStrike: {
    id: 'thunderStrike',
    name: '낙뢰',
    tags: ['오라', '주문', '번개'],
    upgrades: ['damage', 'attackSpeed'],
    summary: '주위의 적 하나에게 하늘에서 벼락을 내립니다. 그 적이 죽으면 절반의 확률로 곧바로 한 번 더 떨어집니다.',
  },
};

/**
 * Skills enemies can drop, and what the 슬롯머신 at the start of a run picks
 * from. There is no basic attack any more: 타격 is one of them like the rest,
 * and a run starts holding only what the reel lands on.
 */
export const DROPPABLE_SKILLS: readonly SkillDefinition[] = [
  SKILLS.meleeStrike,
  SKILLS.fireball,
  SKILLS.chainLightning,
  SKILLS.iceSpear,
  SKILLS.voidOrb,
  SKILLS.thunderStrike,
];

export const ALL_SKILLS: readonly SkillDefinition[] = Object.values(SKILLS);

/**
 * What a fresh run holds when it starts without the reel — the dev server's
 * `#run` and the test harness turn the reel off so they land in play, and
 * they need something to fight with that is the same every time.
 */
export const UNSPUN_SKILL: SkillId = 'meleeStrike';
