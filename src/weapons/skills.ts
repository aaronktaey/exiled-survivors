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
  | '공허';

export type SkillId = 'meleeStrike' | 'fireball' | 'chainLightning' | 'iceSpear' | 'voidOrb';

export interface SkillDefinition {
  readonly id: SkillId;
  readonly name: string;
  readonly tags: readonly SkillTag[];
  /** Key of the ground-label texture baked in BootScene. */
  readonly labelTexture: string;
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
    labelTexture: 'tex-label-meleeStrike',
    upgrades: ['damage', 'attackSpeed'],
    summary: '가장 가까운 적을 향해 짧게 휘두릅니다. 범위 안의 적을 한꺼번에 때립니다.',
  },
  fireball: {
    id: 'fireball',
    name: '화염구',
    tags: ['투사체', '원거리', '주문', '화염'],
    labelTexture: 'tex-label-fireball',
    upgrades: ['damage', 'attackSpeed', 'range', 'projectileSpeed'],
    summary: '가장 가까운 적에게 불덩이를 던집니다. 처음 맞은 적에게서 터집니다.',
  },
  chainLightning: {
    id: 'chainLightning',
    name: '연쇄번개',
    tags: ['주문', '번개', '연쇄'],
    labelTexture: 'tex-label-chainLightning',
    upgrades: ['damage', 'attackSpeed', 'chainCount'],
    summary: '즉발 번개가 적을 때리고, 가까운 다음 적으로 옮겨붙습니다. 같은 적을 두 번 때리지는 않습니다.',
  },
  iceSpear: {
    id: 'iceSpear',
    name: '얼음창',
    tags: ['주문', '냉기', '투사체'],
    labelTexture: 'tex-label-iceSpear',
    upgrades: ['damage', 'attackSpeed', 'range'],
    summary: '맞은 적에게 냉각(이동속도 -15%)을 겁니다.',
  },
  voidOrb: {
    id: 'voidOrb',
    name: '공허구체',
    tags: ['공허', '주문', '투사체'],
    labelTexture: 'tex-label-voidOrb',
    upgrades: ['damage', 'orbitSpeed', 'orbCount'],
    summary: '구체가 주위를 시계방향으로 돌며 닿는 적을 때립니다. 겨냥이 필요 없습니다.',
  },
};

/** Skills the player starts a run with. */
export const STARTING_SKILLS: readonly SkillId[] = ['meleeStrike'];

/** Which skill a level-up point is spent on. */
export const LEVEL_UP_SKILL: SkillId = 'meleeStrike';

/** Skills enemies can drop. One roll, then an even pick from this list. */
export const DROPPABLE_SKILLS: readonly SkillDefinition[] = [
  SKILLS.fireball,
  SKILLS.chainLightning,
  SKILLS.iceSpear,
  SKILLS.voidOrb,
];

export const ALL_SKILLS: readonly SkillDefinition[] = Object.values(SKILLS);
