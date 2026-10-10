/**
 * Skill registry. Tags are data, so later systems (damage scaling, supports,
 * resistances) can filter on them without each weapon hard-coding its kind.
 */
export type SkillTag = '물리' | '공격' | '근접' | '투사체' | '원거리' | '주문' | '화염';

export type SkillId = 'meleeStrike' | 'fireball';

export interface SkillDefinition {
  readonly id: SkillId;
  readonly name: string;
  readonly tags: readonly SkillTag[];
  /** Key of the ground-label texture baked in BootScene. */
  readonly labelTexture: string;
}

export const SKILLS: Record<SkillId, SkillDefinition> = {
  meleeStrike: {
    id: 'meleeStrike',
    name: '기본 공격',
    tags: ['물리', '공격', '근접'],
    labelTexture: 'tex-label-meleeStrike',
  },
  fireball: {
    id: 'fireball',
    name: '파이어볼',
    tags: ['투사체', '원거리', '주문', '화염'],
    labelTexture: 'tex-label-fireball',
  },
};

/** Skills the player starts a run with. */
export const STARTING_SKILLS: readonly SkillId[] = ['meleeStrike'];

/** Skills enemies can drop. */
export const DROPPABLE_SKILLS: readonly SkillDefinition[] = [SKILLS.fireball];

export const ALL_SKILLS: readonly SkillDefinition[] = Object.values(SKILLS);
