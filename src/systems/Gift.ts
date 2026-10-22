import { GEAR, ORBS, ROLLBACK_GIFT, STORAGE, type GearId, type OrbId } from '@/config';
import { bareItem, gear } from '@/systems/Gear';
import { orbs } from '@/systems/Orbs';
import { passives } from '@/systems/Passives';

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
  if (ROLLBACK_GIFT.orbsEach > 0) {
    for (const id of Object.keys(ORBS) as OrbId[]) {
      orbs.add(id, ROLLBACK_GIFT.orbsEach);
    }
  }
  // Nothing in it (since 0.94 the sword and the 구슬 are gone): marked, unsaid.
  if (given.length === 0 && ROLLBACK_GIFT.orbsEach <= 0) {
    return null;
  }
  return { gear: given, orbsEach: ROLLBACK_GIFT.orbsEach };
}

/**
 * 0.81's gift (ROLLBACK_GIFT.passivesToMax): passive points topped up to
 * what fills every line, once, under STORAGE.passiveGift — apart from 0.80's
 * mark, so a player who had that gift gets this one too. The points given,
 * or null when it was given before, is off, or there was nothing to fill.
 */
export function givePassivePoints(): number | null {
  if (!ROLLBACK_GIFT.enabled || !ROLLBACK_GIFT.passivesToMax) {
    return null;
  }
  try {
    if (localStorage.getItem(STORAGE.passiveGift)) {
      return null;
    }
    localStorage.setItem(STORAGE.passiveGift, String(Date.now()));
  } catch {
    return null;
  }
  const given = passives.topUpToMax();
  return given > 0 ? given : null;
}
