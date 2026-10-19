import { GEAR, GEAR_DROP, type AffixLine, type OrbId } from '@/config';
import { affixGearDetail, affixName, fill, gearImplicitText, orbName, t } from '@/i18n';
import { gearBonusFor, slotOf, type GearItem, type OrbOutcome } from '@/systems/Gear';

/** An empty affix slot in a read-out. */
const EMPTY_SLOT = '—';

/**
 * One slot, filled or empty: "1티어  치명  치명타 확률 +50%", or a dash where
 * nothing has been rolled yet. The empty ones are drawn on purpose — what a
 * piece could still take is as much use to read as what it has.
 */
function slots(lines: readonly AffixLine[], count: number): string[] {
  const copy = t().gear;
  const rows = lines
    .slice(0, count)
    .map((line) => `${fill(copy.tier, { tier: line.tier })}  ${affixName(line.id)}   ${affixGearDetail(line.id, line.tier)}`);
  while (rows.length < count) {
    rows.push(EMPTY_SLOT);
  }
  return rows;
}

/**
 * What one piece is worth: what the base gives — a weapon's attack power,
 * and every base's 고정 속성, on one line — then every 접두어 slot, then
 * every 접미어 slot, each saying which rung it rolled.
 */
export function describeGear(item: GearItem): string {
  const copy = t().gear;
  const implicit = gearImplicitText(item.id);
  const parts = [
    ...(slotOf(item) === 'weapon' ? [fill(copy.attack, { attack: gearBonusFor(item).attack })] : []),
    ...(implicit ? [fill(copy.implicit, { text: implicit })] : []),
  ];
  return [
    ...(item.mango ? [copy.mangoState] : []),
    parts.join(' · '),
    copy.prefix,
    ...slots(item.prefixes, GEAR_DROP.maxPrefixes),
    copy.suffix,
    ...slots(item.suffixes, GEAR_DROP.maxSuffixes),
  ].join('\n');
}

/** "무기 · 3티어" — where a piece is worn and how good its base is. */
export function gearKind(item: GearItem): string {
  const copy = t();
  return `${copy.runGear.slots[slotOf(item)]} · ${fill(copy.gear.tier, { tier: GEAR[item.id]?.tier ?? 0 })}`;
}

/**
 * What a 구슬 just did, in one line. A reroll that came up short and a piece
 * that did not survive a 폭발의 구슬 are both things to be told rather than
 * left to work out from a read-out that changed.
 */
export function orbNote(id: OrbId, outcome: OrbOutcome): string {
  const copy = t().gear;
  const orb = orbName(id);
  if (outcome.kind === 'destroyed') {
    return fill(copy.orbDestroyed, { orb });
  }
  if (outcome.kind === 'ward') {
    return fill(copy.orbWarded, { orb });
  }
  if (outcome.kind === 'saved') {
    return fill(copy.orbSaved, { orb });
  }
  if ((outcome.kind === 'upgrade' || outcome.kind === 'swap') && outcome.line && outcome.from) {
    const upgraded = fill(copy.orbUpgraded, {
      orb,
      from: `${affixName(outcome.from.id)} ${fill(copy.tier, { tier: outcome.from.tier })}`,
      to: `${affixName(outcome.line.id)} ${fill(copy.tier, { tier: outcome.line.tier })}`,
    });
    return outcome.wardSpent ? `${upgraded}${copy.mangoSpent}` : upgraded;
  }
  if (outcome.kind === 'add' && outcome.line) {
    return fill(copy.orbAdded, {
      orb,
      affix: `${affixName(outcome.line.id)} ${fill(copy.tier, { tier: outcome.line.tier })}`,
    });
  }
  const lines = (outcome.item?.prefixes.length ?? 0) + (outcome.item?.suffixes.length ?? 0);
  return fill(copy.orbRerolled, { orb, count: lines });
}
