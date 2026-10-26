import { ALL_BONES } from '@/config/bones';
import { ALL_ORBS, GEAR, gearTexture } from '@/config/equipment';
import type { DropTier } from '@/config/system';
import { TEXTURES, unknownRuneTexture } from '@/config/visuals';

/**
 * ★ 아이템 필터 — what the player has asked not to see. A drop whose entry is
 * switched off is never put on the ground at all: it does not show, it does
 * not ring, and it cannot be walked over.
 *
 * The entries are read off the tables they stand for, so a new 구슬, 뼈다귀
 * or sword gets its switch without a line here. A weapon is shown only when
 * both its base and its rarity are.
 */
export type FilterSectionId = 'supplies' | 'orbs' | 'bones' | 'rarity' | 'bases';

export interface FilterEntry {
  /** What the switch is stored under: `potion`, `orb:chaos`, `rarity:magic`, `gear:steelSword`… */
  readonly key: string;
  readonly texture: string;
  /** The colour of its border, the way the 인벤토리 draws the same thing. */
  readonly tier: DropTier;
}

export interface FilterSection {
  readonly id: FilterSectionId;
  readonly entries: readonly FilterEntry[];
}

/** The keys of the entries that are not read off a table. */
export type FilterSupply = 'potion' | 'mango' | 'magnet' | 'skill' | 'randomSkill' | 'unknownRune' | 'talentShard' | 'talentLump';

const TIERS: readonly DropTier[] = ['normal', 'magic', 'rare', 'mythic'];

export const ITEM_FILTER: readonly FilterSection[] = [
  {
    id: 'supplies',
    entries: [
      { key: 'potion', texture: TEXTURES.potion, tier: 'normal' },
      { key: 'skill', texture: TEXTURES.skillOrb, tier: 'normal' },
      { key: 'randomSkill', texture: TEXTURES.skillOrb, tier: 'normal' },
      { key: 'mango', texture: TEXTURES.mango, tier: 'mythic' },
      { key: 'magnet', texture: TEXTURES.magnet, tier: 'magic' },
      { key: 'unknownRune', texture: unknownRuneTexture(0), tier: 'mythic' },
      { key: 'talentShard', texture: TEXTURES.talentShard, tier: 'normal' },
      { key: 'talentLump', texture: TEXTURES.talentLump, tier: 'mythic' },
    ],
  },
  { id: 'orbs', entries: ALL_ORBS.map((orb) => ({ key: `orb:${orb.id}`, texture: orb.texture, tier: orb.tier })) },
  { id: 'bones', entries: ALL_BONES.map((bone) => ({ key: `bone:${bone.id}`, texture: bone.texture, tier: bone.tier })) },
  { id: 'rarity', entries: TIERS.map((tier) => ({ key: `rarity:${tier}`, texture: TEXTURES.gear, tier })) },
  {
    id: 'bases',
    // Weakest first, the way the eye reads up a ladder.
    entries: Object.values(GEAR)
      .filter((spec) => spec.weight > 0 || spec.fromKill !== undefined || spec.fromKind !== undefined)
      .sort((a, b) => b.tier - a.tier)
      .map((spec) => ({ key: `gear:${spec.id}`, texture: gearTexture(spec.id), tier: 'normal' as DropTier })),
  },
];

export const ALL_FILTER_KEYS: readonly string[] = ITEM_FILTER.flatMap((section) =>
  section.entries.map((entry) => entry.key),
);
