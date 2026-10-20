import { GEAR, ORBS, ROLLBACK_GIFT, STORAGE, type GearId, type OrbId } from '@/config';
import { bareItem, gear } from '@/systems/Gear';
import { orbs } from '@/systems/Orbs';

/** What the gift came to, for the title to say. */
export interface GiftGiven {
  readonly gear: readonly { readonly id: GearId; readonly count: number }[];
  readonly orbsEach: number;
}

/**
 * 0.80's gift (ROLLBACK_GIFT): handed over once — the stash gets the bare
 * pieces, the drawer every 구슬 — and marked given in STORAGE.rollbackGift.
 * Null when it was given before, is off, or storage cannot say either way
 * (a gift that cannot be marked would be given on every visit).
 */
export function giveRollbackGift(): GiftGiven | null {
  if (!ROLLBACK_GIFT.enabled) {
    return null;
  }
  try {
    if (localStorage.getItem(STORAGE.rollbackGift)) {
      return null;
    }
    localStorage.setItem(STORAGE.rollbackGift, String(Date.now()));
  } catch {
    return null;
  }

  const given: { id: GearId; count: number }[] = [];
  for (const [id, count] of Object.entries(ROLLBACK_GIFT.gear) as [GearId, number][]) {
    const base = GEAR[id];
    if (!base || count <= 0) {
      continue;
    }
    for (let i = 0; i < count; i++) {
      gear.add(bareItem(base));
    }
    given.push({ id, count });
  }
  for (const id of Object.keys(ORBS) as OrbId[]) {
    orbs.add(id, ROLLBACK_GIFT.orbsEach);
  }
  return { gear: given, orbsEach: ROLLBACK_GIFT.orbsEach };
}
