import type { BoneId, OrbId } from '@/config';
import { bones } from '@/systems/Bones';
import { gear } from '@/systems/Gear';
import { orbs } from '@/systems/Orbs';
import type { RunLoot } from '@/systems/SaveGame';

export function noLoot(): RunLoot {
  return { gear: [], orbs: {}, bones: {} };
}

export function hasLoot(loot: RunLoot): boolean {
  return loot.gear.length > 0 || Object.keys(loot.orbs).length > 0 || Object.keys(loot.bones).length > 0;
}

/**
 * Takes back what a run put in the drawers (0.134): it went on no ranking —
 * the developer tools, a 밸런스 draft, levels that do not add up, or the
 * server turning it down. What was spent since stays spent.
 */
export function forfeitLoot(loot: RunLoot): void {
  for (const uid of loot.gear ?? []) {
    gear.discardAnyway(uid);
  }
  for (const [id, count] of Object.entries(loot.orbs ?? {})) {
    orbs.takeBack(id as OrbId, Number(count) || 0);
  }
  for (const [id, count] of Object.entries(loot.bones ?? {})) {
    bones.takeBack(id as BoneId, Number(count) || 0);
  }
}
