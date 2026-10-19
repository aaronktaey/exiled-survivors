import {
  AFFIXES,
  AUDIO,
  GEAR,
  GEAR_DROP,
  STARTING_GEAR,
  LEGACY_AFFIX_TIER,
  ORBS,
  affixPool,
  affixTier,
  attackForTier,
  rollAffixTier,
  type AffixId,
  type AffixLine,
  type GearAffixEffect,
  type AffixSpec,
  type GearId,
  type GearSlot,
  type DropTier,
  type GearSpec,
  type OrbSpec,
} from '@/config';
import type { SkillId } from '@/weapons/skills';

/**
 * One piece of gear, as it was rolled. Two 강철 검 can both be found and be
 * worth different things, so an item carries its own id rather than being
 * its base.
 */
export interface GearItem {
  readonly uid: string;
  readonly id: GearId;
  readonly prefixes: readonly AffixLine[];
  readonly suffixes: readonly AffixLine[];
  /** 망고 상태 (망고의 구슬): the next 구슬 that would destroy it does not. */
  readonly mango?: boolean;
}

/** Everything what is worn is worth to whoever is wearing it. */
export interface GearBonus {
  /** Flat damage added to every skill's hit (the weapon's). */
  readonly attack: number;
  readonly attackSpeedScale: number;
  readonly maxHpScale: number;
  readonly moveSpeedScale: number;
  readonly pickupScale: number;
  readonly invulnerableScale: number;
  /**
   * The 치명 lines and 고정 속성, summed: they raise the base chance by that
   * share of itself (two of +50% double it), rather than adding to it.
   */
  readonly critChanceIncrease: number;
  /** Added to RARE.critMultiplier when one lands. */
  readonly critMultiplierBonus: number;
  /**
   * Multiplies every skill's damage, after the flat attack is added: the
   * base's 피해 고정 속성 and every 강력, added together.
   */
  readonly damageScale: number;
  /** One skill's own attack-speed multiplier, on top of attackSpeedScale. */
  readonly skillAttackSpeed: Partial<Record<SkillId, number>>;
  /** Chance an enemy's shot is stopped before it hurts. */
  readonly projectileBlock: number;
  /** More shots from a skill that throws, more orbs on one that orbits. */
  readonly extraProjectiles: number;
  /** Every hit the survivor takes, multiplied (below 1 is less). */
  readonly damageTakenScale: number;
  readonly xpGainScale: number;
  readonly itemFindScale: number;
}

export const NO_BONUS: GearBonus = {
  attack: 0,
  attackSpeedScale: 1,
  maxHpScale: 1,
  moveSpeedScale: 1,
  pickupScale: 1,
  invulnerableScale: 1,
  critChanceIncrease: 0,
  critMultiplierBonus: 0,
  damageScale: 1,
  skillAttackSpeed: {},
  projectileBlock: 0,
  extraProjectiles: 0,
  damageTakenScale: 1,
  xpGainScale: 1,
  itemFindScale: 1,
};

let nextUid = 1;

/** A fresh uid for an item made now. */
const newUid = (): string => {
  nextUid += 1;
  return `g${Date.now().toString(36)}${nextUid}`;
};

/** A piece straight off its base: no 속성. Every run starts on the 녹슨 검 this way. */
export function bareItem(id: GearId = STARTING_GEAR): GearItem {
  return { uid: newUid(), id, prefixes: [], suffixes: [] };
}

/** The slot a piece is worn in. */
export const slotOf = (item: { readonly id: GearId }): GearSlot => GEAR[item.id]?.slot ?? 'weapon';

/** One 속성 on a piece: which it is, which rung, and what that rung does. */
export interface RolledAffix {
  readonly line: AffixLine;
  readonly spec: AffixSpec;
  readonly effect: GearAffixEffect;
  /** What this rung reads as on gear. */
  readonly detail: string;
}

/** Every 속성 on an item, prefixes first, each at the rung it rolled. */
export function affixesOf(item: GearItem): readonly RolledAffix[] {
  const out: RolledAffix[] = [];
  for (const line of [...item.prefixes, ...item.suffixes]) {
    const spec = AFFIXES[line.id];
    const rung = affixTier(line.id, line.tier);
    if (spec && rung) {
      out.push({ line, spec, effect: rung.gear, detail: rung.detail });
    }
  }
  return out;
}

/**
 * What everything worn is worth together. Lines add up across all of it
 * (two 강력 of +15% are +30%, a 거대 on the sword and one on the armour
 * likewise), each base's 고정 속성 one more line in the same sum; only the
 * weapon carries attack.
 */
export function gearBonusFor(worn: GearItem | null | readonly (GearItem | null)[]): GearBonus {
  const list: readonly (GearItem | null)[] = Array.isArray(worn) ? worn : [worn as GearItem | null];
  const items = list.filter(
    (item): item is GearItem => item !== null && item !== undefined && GEAR[item.id] !== undefined,
  );
  if (items.length === 0) {
    return NO_BONUS;
  }

  const sum = {
    damage: 0,
    attackSpeed: 0,
    maxHp: 0,
    moveSpeed: 0,
    pickup: 0,
    invulnerable: 0,
    critChance: 0,
    critMultiplier: 0,
    damageTaken: 0,
    xpGain: 0,
    itemFind: 0,
  };
  let attack = 0;
  let projectileBlock = 0;
  let extraProjectiles = 0;
  const skillAttackSpeed: Partial<Record<SkillId, number>> = {};
  const add = (effect: GearAffixEffect | GearSpec['implicit']): void => {
    if (!effect) {
      return;
    }
    sum.damage += (effect.damageScale ?? 1) - 1;
    sum.attackSpeed += (effect.attackSpeedScale ?? 1) - 1;
    sum.maxHp += (effect.maxHpScale ?? 1) - 1;
    sum.moveSpeed += ('moveSpeedScale' in effect ? (effect.moveSpeedScale ?? 1) : 1) - 1;
    sum.pickup += (effect.pickupScale ?? 1) - 1;
    sum.invulnerable += (effect.invulnerableScale ?? 1) - 1;
    sum.critChance += effect.critChance ?? 0;
    sum.critMultiplier += 'critMultiplierBonus' in effect ? (effect.critMultiplierBonus ?? 0) : 0;
    sum.damageTaken += (effect.damageTakenScale ?? 1) - 1;
    sum.xpGain += (effect.xpGainScale ?? 1) - 1;
    sum.itemFind += (effect.itemFindScale ?? 1) - 1;
  };

  for (const item of items) {
    const spec = GEAR[item.id];
    if (spec.slot === 'weapon') {
      attack += attackForTier(spec.tier);
    }
    const implicit = spec.implicit;
    add(implicit);
    projectileBlock += implicit?.projectileBlock ?? 0;
    extraProjectiles += implicit?.extraProjectiles ?? 0;
    if (implicit?.skillAttackSpeed) {
      const { skill, scale } = implicit.skillAttackSpeed;
      skillAttackSpeed[skill] = (skillAttackSpeed[skill] ?? 1) * scale;
    }
    for (const { effect } of affixesOf(item)) {
      add(effect);
    }
  }

  return {
    attack,
    attackSpeedScale: 1 + sum.attackSpeed,
    maxHpScale: 1 + sum.maxHp,
    moveSpeedScale: 1 + sum.moveSpeed,
    pickupScale: 1 + sum.pickup,
    invulnerableScale: Math.max(0, 1 + sum.invulnerable),
    critChanceIncrease: sum.critChance,
    critMultiplierBonus: sum.critMultiplier,
    damageScale: 1 + sum.damage,
    skillAttackSpeed,
    projectileBlock: Math.min(1, projectileBlock),
    extraProjectiles,
    damageTakenScale: Math.max(0.1, 1 + sum.damageTaken),
    xpGainScale: 1 + sum.xpGain,
    itemFindScale: 1 + sum.itemFind,
  };
}

/**
 * How rare a piece came out, which is both how it is labelled on the ground
 * and what it sounds like when it lands. Up to two 속성 is ordinary, three or
 * four is magic, five or six is rare.
 */
export function dropTierFor(item: GearItem): DropTier {
  return tierForLines(item.prefixes.length + item.suffixes.length);
}

/** The same ladder, for anything that knows its own count. */
export function tierForLines(lines: number): DropTier {
  if (lines >= AUDIO.dropTiers.rareFrom) {
    return 'rare';
  }

  return lines >= AUDIO.dropTiers.magicFrom ? 'magic' : 'normal';
}

/** One 속성 for `slot`, from whichever side still has room, or null when both are full. */
function rollLine(slot: GearSlot, prefixes: readonly AffixLine[], suffixes: readonly AffixLine[]): {
  readonly line: AffixLine;
  readonly prefix: boolean;
} | null {
  const prefixPool = affixPool('prefix', slot);
  const suffixPool = affixPool('suffix', slot);
  const canPrefix = prefixes.length < GEAR_DROP.maxPrefixes && prefixPool.length > 0;
  const canSuffix = suffixes.length < GEAR_DROP.maxSuffixes && suffixPool.length > 0;
  if (!canPrefix && !canSuffix) {
    return null;
  }
  const prefix = canPrefix && (!canSuffix || Math.random() < 0.5);
  const pool = prefix ? prefixPool : suffixPool;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return picked ? { line: { id: picked.id, tier: rollAffixTier(picked.id) }, prefix } : null;
}

/**
 * `count` affix lines for `slot`, drawn with room on both sides. Prefixes and
 * suffixes are picked at random between whichever side still has space, so
 * asking for four does not quietly become three prefixes and a dead roll.
 */
export function rollAffixLines(count: number, slot: GearSlot = 'weapon'): {
  prefixes: AffixLine[];
  suffixes: AffixLine[];
} {
  const prefixes: AffixLine[] = [];
  const suffixes: AffixLine[] = [];
  for (let i = 0; i < count; i++) {
    const rolled = rollLine(slot, prefixes, suffixes);
    if (!rolled) {
      break;
    }
    (rolled.prefix ? prefixes : suffixes).push(rolled.line);
  }
  return { prefixes, suffixes };
}

/** The most lines any one piece can carry. */
export const MAX_AFFIX_LINES = GEAR_DROP.maxPrefixes + GEAR_DROP.maxSuffixes;

/**
 * What one 구슬 did. The screen reads this back out afterwards: a reroll that
 * came up short and a piece that did not survive a 폭발의 구슬 are both
 * things the player has to be told rather than left to work out.
 */
export interface OrbOutcome {
  /** The piece after it, or null when the 구슬 destroyed it. */
  readonly item: GearItem | null;
  /**
   * `ward`: put in 망고 상태. `saved`: would have been destroyed, and the 망고
   * took it instead. `swap`: a 폭발의 구슬 on a piece all of tier 1 — one
   * line traded for a different tier-1 one.
   */
  readonly kind: 'reroll' | 'add' | 'upgrade' | 'swap' | 'destroyed' | 'ward' | 'saved';
  /** The line that came out of it, for an add or an upgrade. */
  readonly line?: AffixLine;
  /** And the one it replaced, for an upgrade. */
  readonly from?: AffixLine;
  /** The piece's 망고 상태 went with it: a 폭발의 구슬 spends it whatever it rolls. */
  readonly wardSpent?: boolean;
}

/**
 * What a 구슬 does to a piece, or null when it would do nothing — a
 * 각성의 구슬 on one already carrying six, which must not be spent.
 *
 * A reroll throws away everything that was on it, which is the whole bargain:
 * a 혼돈의 구슬 can turn a four-line piece into two, and that is why it is
 * worth hesitating over.
 */
export function orbApplied(item: GearItem, orb: OrbSpec): OrbOutcome | null {
  const slot = slotOf(item);
  if (orb.ward) {
    // One 망고 at a time: a second would be a 구슬 spent on nothing.
    return item.mango ? null : { item: { ...item, mango: true }, kind: 'ward' };
  }

  if (orb.reroll) {
    const span = orb.reroll.max - orb.reroll.min + 1;
    const count = orb.reroll.min + Math.floor(Math.random() * span);
    const rolled = rollAffixLines(Math.min(count, MAX_AFFIX_LINES), slot);
    return {
      item: { ...item, prefixes: rolled.prefixes, suffixes: rolled.suffixes },
      kind: 'reroll',
    };
  }

  if (orb.upgrade) {
    return explode(item, orb.upgrade);
  }

  const held = item.prefixes.length + item.suffixes.length;
  if (!orb.add || held >= MAX_AFFIX_LINES) {
    return null;
  }

  const prefixes: AffixLine[] = [...item.prefixes];
  const suffixes: AffixLine[] = [...item.suffixes];
  let added: AffixLine | undefined;
  for (let i = 0; i < orb.add; i++) {
    const rolled = rollLine(slot, prefixes, suffixes);
    if (!rolled) {
      break;
    }
    (rolled.prefix ? prefixes : suffixes).push(rolled.line);
    added = rolled.line;
  }

  return { item: { ...item, prefixes, suffixes }, kind: 'add', line: added };
}

/**
 * A 폭발의 구슬 on a piece whose every line is a 1티어: one line, picked at
 * random, becomes a different 속성 of its kind (that the slot allows) at
 * 1티어 — one the piece does not already carry. The destroy roll and the
 * 망고 work as they do for a climb. Null when no other 속성 has a 1티어 rung
 * to trade for.
 */
function swapTopLine(item: GearItem, destroyChance: number): OrbOutcome | null {
  const lines = [...item.prefixes, ...item.suffixes];
  const held = new Set(lines.map((line) => line.id));
  const index = Math.floor(Math.random() * lines.length);
  const from = lines[index]!;
  const fromPrefix = index < item.prefixes.length;
  const pool = affixPool(fromPrefix ? 'prefix' : 'suffix', slotOf(item)).filter(
    (affix) => !held.has(affix.id) && affix.gearTiers?.some((rung) => rung.tier === 1),
  );
  if (pool.length === 0) {
    return null;
  }

  const { mango: warded, ...unwarded } = item;
  if (Math.random() < destroyChance) {
    return warded ? { item: unwarded, kind: 'saved' } : { item: null, kind: 'destroyed' };
  }

  const picked = pool[Math.floor(Math.random() * pool.length)]!;
  const line = { id: picked.id, tier: 1 };
  const prefixes = [...item.prefixes];
  const suffixes = [...item.suffixes];
  if (fromPrefix) {
    prefixes[index] = line;
  } else {
    suffixes[index - item.prefixes.length] = line;
  }
  return {
    item: { ...unwarded, prefixes, suffixes },
    kind: 'swap',
    line,
    from,
    ...(warded ? { wardSpent: true } : {}),
  };
}

/**
 * 폭발의 구슬: one 속성 already on the piece is thrown away, a different one
 * of the same kind rolled in its place, and that one comes out a rung better
 * than the one it replaced. Some of the time the piece does not survive it —
 * which is the whole reason it is worth hesitating over, and why the screen
 * asks before spending one.
 */
function explode(
  item: GearItem,
  upgrade: { readonly steps: number; readonly destroyChance: number },
): OrbOutcome | null {
  // A line with somewhere to climb. When every line is a 1티어 already, one
  // of them is traded for a different 1티어 instead; a piece with no line at
  // all has nothing for it to work on.
  const lines = [...item.prefixes, ...item.suffixes];
  if (lines.length === 0) {
    return null;
  }
  const climbable = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.tier > 1);
  if (climbable.length === 0) {
    return swapTopLine(item, upgrade.destroyChance);
  }

  // 망고 상태 lasts one 폭발의 구슬, whatever it rolls: it is spent here either way.
  const { mango: warded, ...unwarded } = item;
  if (Math.random() < upgrade.destroyChance) {
    // The 망고 takes the blow: the piece is left as it was, without its 망고.
    if (warded) {
      return { item: unwarded, kind: 'saved' };
    }
    return { item: null, kind: 'destroyed' };
  }

  const { line: from, index } = climbable[Math.floor(Math.random() * climbable.length)]!;
  const fromPrefix = index < item.prefixes.length;
  // Tier 1 is the best there is, so a rung better is a smaller number. The
  // replacement is drawn only from 속성 that have that rung, so it always
  // comes out above the line it replaced.
  const target = Math.max(1, from.tier - upgrade.steps);
  const pool = affixPool(fromPrefix ? 'prefix' : 'suffix', slotOf(item)).filter((affix) =>
    affix.gearTiers?.some((rung) => rung.tier === target),
  );
  const picked = pool[Math.floor(Math.random() * pool.length)];
  if (!picked) {
    return null;
  }
  const line = { id: picked.id, tier: target };

  const prefixes = [...item.prefixes];
  const suffixes = [...item.suffixes];
  if (fromPrefix) {
    prefixes[index] = line;
  } else {
    suffixes[index - item.prefixes.length] = line;
  }

  return {
    item: { ...unwarded, prefixes, suffixes },
    kind: 'upgrade',
    line,
    from,
    ...(warded ? { wardSpent: true } : {}),
  };
}

/**
 * Rolls for a 구슬 off one kill. `scale` is what the run's 뼈다귀 (and its
 * 아이템 발견) do to every drop chance. Returns the one that dropped, if any.
 */
export function rollOrbDrop(scale = 1, fromBoss = false, bonus = 1): OrbSpec | null {
  for (const orb of Object.values(ORBS)) {
    if (orb.fromBossOnly && !fromBoss) {
      continue;
    }

    // A 구슬 only a 우두머리 leaves is not raised by the kill's own bonus.
    const chance = orb.chance * scale * (orb.fromBossOnly ? 1 : bonus);
    if (Math.random() < chance) {
      return orb;
    }
  }

  return null;
}

/** A base from the whole roster, every slot, by weight — the way a 우두머리 picks one. */
function rollGearBase(): GearSpec {
  const total = Object.values(GEAR).reduce((sum, spec) => sum + spec.weight, 0);
  let roll = Math.random() * total;
  for (const spec of Object.values(GEAR)) {
    roll -= spec.weight;
    if (roll <= 0) {
      return spec;
    }
  }

  return GEAR[STARTING_GEAR];
}

/**
 * The piece an ordinary kill leaves, if any: only a base with `fromKill`
 * set can, each on its own roll raised by the kill's `bonus`.
 */
export function rollGearFromKill(bonus = 1): GearItem | null {
  for (const spec of Object.values(GEAR)) {
    if (spec.fromKill !== undefined && Math.random() < spec.fromKill * bonus) {
      return rollGearItem(spec);
    }
  }

  return null;
}

/**
 * A piece as it drops: a base — `base`, or one from the roster by weight —
 * then affix lines its slot allows, each having to win its own roll. Repeats
 * are allowed, the way a rare enemy can be born doubly 거대.
 */
export function rollGearItem(base: GearSpec = rollGearBase()): GearItem {
  const prefixes: AffixLine[] = [];
  const suffixes: AffixLine[] = [];
  while (Math.random() < GEAR_DROP.affixChance) {
    const rolled = rollLine(base.slot, prefixes, suffixes);
    if (!rolled) {
      break;
    }
    (rolled.prefix ? prefixes : suffixes).push(rolled.line);
  }

  return { uid: newUid(), id: base.id, prefixes, suffixes };
}

/**
 * Reads a stored list of 속성, in either shape (a saved run's gear). Before
 * tiers a line was just an id; those come back at the middle rung. A line
 * the slot no longer allows falls off.
 */
export function readLines(
  raw: readonly (AffixLine | AffixId)[] | undefined,
  kind: 'prefix' | 'suffix',
  slot: GearSlot,
): AffixLine[] {
  const out: AffixLine[] = [];
  for (const entry of raw ?? []) {
    const id = (typeof entry === 'string' ? entry : entry?.id) as AffixId;
    const spec = AFFIXES[id];
    if (spec?.kind !== kind || spec.gearTiers === undefined || !(spec.slots ?? ['weapon']).includes(slot)) {
      continue;
    }
    const tier = typeof entry === 'string' ? LEGACY_AFFIX_TIER : Number(entry?.tier);
    out.push({ id, tier: affixTier(id, tier)?.tier ?? LEGACY_AFFIX_TIER });
  }
  return out;
}

/** A stored item read back, or null when it is not one any more. */
export function readItem(raw: unknown): GearItem | null {
  const item = raw as Partial<GearItem> | null;
  if (!item || typeof item.uid !== 'string' || !item.id || !GEAR[item.id]) {
    return null;
  }
  const slot = GEAR[item.id].slot;
  return {
    uid: item.uid,
    id: item.id,
    prefixes: readLines(item.prefixes, 'prefix', slot),
    suffixes: readLines(item.suffixes, 'suffix', slot),
    ...(item.mango === true ? { mango: true } : {}),
  };
}
