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
  | '연쇄';

export type SkillId = 'meleeStrike' | 'fireball' | 'chainLightning';

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
    name: '타격',
    tags: ['물리', '공격', '근접'],
    labelTexture: 'tex-label-meleeStrike',
  },
  fireball: {
    id: 'fireball',
    name: '화염구',
    tags: ['투사체', '원거리', '주문', '화염'],
    labelTexture: 'tex-label-fireball',
  },
  chainLightning: {
    id: 'chainLightning',
    name: '연쇄번개',
    tags: ['주문', '번개', '연쇄'],
    labelTexture: 'tex-label-chainLightning',
  },
};

/** Skills the player starts a run with. */
export const STARTING_SKILLS: readonly SkillId[] = ['meleeStrike'];

/** Which skill a level-up point is spent on. */
export const LEVEL_UP_SKILL: SkillId = 'meleeStrike';

/** Skills enemies can drop. One roll, then an even pick from this list. */
export const DROPPABLE_SKILLS: readonly SkillDefinition[] = [SKILLS.fireball, SKILLS.chainLightning];

export const ALL_SKILLS: readonly SkillDefinition[] = Object.values(SKILLS);
