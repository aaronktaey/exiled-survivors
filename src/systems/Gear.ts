import {
  AFFIXES,
  AUDIO,
  GEAR,
  GEAR_COMBINE,
  GEAR_DROP,
  PREFIXES,
  STARTING_GEAR,
  STORAGE,
  SUFFIXES,
  LEGACY_AFFIX_TIER,
  ORBS,
  affixTier,
  attackForTier,
  rollAffixTier,
  type AffixId,
  type AffixLine,
  type GearAffixEffect,
  type AffixSpec,
  type GearId,
  type DropTier,
  type GearSpec,
  type OrbSpec,
} from '@/config';
import type { SkillId } from '@/weapons/skills';

/**
 * One weapon, as it was rolled. Two 강철 검 can both be held and be worth
 * different things, so an item carries its own id rather than being its
 * base.
 */
export interface GearItem {
  readonly uid: string;
  readonly id: GearId;
  readonly prefixes: readonly AffixLine[];
  readonly suffixes: readonly AffixLine[];
  /** 망고 상태 (망고의 구슬): the next 구슬 that would destroy it does not. */
  readonly mango?: boolean;
}

/** What the stash holds, as it is written to localStorage. */
export interface GearState {
  readonly items: readonly GearItem[];
  /** The uid of the weapon in hand. */
  readonly equipped: string;
}

/** Everything a weapon is worth to whoever is holding it. */
export interface GearBonus {
  /** Flat damage added to every skill's hit. */
  readonly attack: number;
  readonly attackSpeedScale: number;
  readonly maxHpScale: number;
  readonly moveSpeedScale: number;
  readonly pickupScale: number;
  readonly invulnerableScale: number;
  /**
   * The weapon's 치명 lines, summed: they raise the base chance by that
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
};

const STARTER_UID = 'starter';

const DEFAULTS: GearState = {
  items: [{ uid: STARTER_UID, id: STARTING_GEAR, prefixes: [], suffixes: [] }],
  equipped: STARTER_UID,
};

type Listener = (state: GearState) => void;

let nextUid = 1;

/** One 속성 on a weapon: which it is, which rung, and what that rung does. */
export interface RolledAffix {
  readonly line: AffixLine;
  readonly spec: AffixSpec;
  readonly effect: GearAffixEffect;
  /** What this rung reads as on a weapon. */
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
 * What an item is worth. Its lines add up (two 강력 of +15% are +30%), and
 * the crit chance they raise stops at certain.
 */
export function gearBonusFor(item: GearItem | null): GearBonus {
  if (!item || !GEAR[item.id]) {
    return NO_BONUS;
  }

  // Within one weapon its lines add up: two 거대 of +50% are +100% of the
  // survivor's health, not ×1.5 twice. The base's own 고정 속성 is one more
  // line in the same sum.
  let attackSpeed = 0;
  let maxHp = 0;
  let moveSpeed = 0;
  let pickup = 0;
  let invulnerable = 0;
  let critChanceIncrease = 0;
  let critMultiplierBonus = 0;

  const implicit = GEAR[item.id].implicit;
  attackSpeed += (implicit?.attackSpeedScale ?? 1) - 1;
  let damage = (implicit?.damageScale ?? 1) - 1;
  const skillAttackSpeed: Partial<Record<SkillId, number>> = implicit?.skillAttackSpeed
    ? { [implicit.skillAttackSpeed.skill]: implicit.skillAttackSpeed.scale }
    : {};

  for (const { effect } of affixesOf(item)) {
    damage += (effect.damageScale ?? 1) - 1;
    attackSpeed += (effect.attackSpeedScale ?? 1) - 1;
    maxHp += (effect.maxHpScale ?? 1) - 1;
    moveSpeed += (effect.moveSpeedScale ?? 1) - 1;
    pickup += (effect.pickupScale ?? 1) - 1;
    invulnerable += (effect.invulnerableScale ?? 1) - 1;
    critChanceIncrease += effect.critChance ?? 0;
    critMultiplierBonus += effect.critMultiplierBonus ?? 0;
  }

  return {
    attack: attackForTier(GEAR[item.id].tier),
    attackSpeedScale: 1 + attackSpeed,
    maxHpScale: 1 + maxHp,
    moveSpeedScale: 1 + moveSpeed,
    pickupScale: 1 + pickup,
    invulnerableScale: Math.max(0, 1 + invulnerable),
    critChanceIncrease,
    critMultiplierBonus,
    damageScale: 1 + damage,
    skillAttackSpeed,
    projectileBlock: implicit?.projectileBlock ?? 0,
    extraProjectiles: implicit?.extraProjectiles ?? 0,
  };
}

/**
 * How rare a weapon came out, which is both how it is labelled on the
 * ground and what it sounds like when it lands. Up to two 속성 is ordinary,
 * three or four is magic, five or six is rare.
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

/**
 * `count` affix lines, drawn with room on both sides. Prefixes and suffixes
 * are picked at random between whichever side still has space, so asking for
 * four does not quietly become three prefixes and a dead roll.
 */
export function rollAffixLines(count: number): {
  prefixes: AffixLine[];
  suffixes: AffixLine[];
} {
  const prefixes: AffixLine[] = [];
  const suffixes: AffixLine[] = [];

  for (let i = 0; i < count; i++) {
    const canPrefix = prefixes.length < GEAR_DROP.maxPrefixes && PREFIXES.length > 0;
    const canSuffix = suffixes.length < GEAR_DROP.maxSuffixes && SUFFIXES.length > 0;
    if (!canPrefix && !canSuffix) {
      break;
    }

    const takePrefix = canPrefix && (!canSuffix || Math.random() < 0.5);
    const pool = takePrefix ? PREFIXES : SUFFIXES;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked) {
      break;
    }

    (takePrefix ? prefixes : suffixes).push({ id: picked.id, tier: rollAffixTier(picked.id) });
  }

  return { prefixes, suffixes };
}

/** The most lines any one weapon can carry. */
export const MAX_AFFIX_LINES = GEAR_DROP.maxPrefixes + GEAR_DROP.maxSuffixes;

/**
 * What one 구슬 did. The screen reads this back out afterwards: a reroll that
 * came up short and a weapon that did not survive a 폭발의 구슬 are both
 * things the player has to be told rather than left to work out.
 */
export interface OrbOutcome {
  /** The weapon after it, or null when the 구슬 destroyed it. */
  readonly item: GearItem | null;
  /**
   * `ward`: put in 망고 상태. `saved`: would have been destroyed, and the 망고
   * took it instead. `swap`: a 폭발의 구슬 on a weapon all of tier 1 — one
   * line traded for a different tier-1 one.
   */
  readonly kind: 'reroll' | 'add' | 'upgrade' | 'swap' | 'destroyed' | 'ward' | 'saved';
  /** The line that came out of it, for an add or an upgrade. */
  readonly line?: AffixLine;
  /** And the one it replaced, for an upgrade. */
  readonly from?: AffixLine;
  /** The weapon's 망고 상태 went with it: a 폭발의 구슬 spends it whatever it rolls. */
  readonly wardSpent?: boolean;
}

/**
 * What a 구슬 does to a weapon, or null when it would do nothing — a
 * 각성의 구슬 on a weapon already carrying six, which must not be spent.
 *
 * A reroll throws away everything that was on it, which is the whole bargain:
 * a 혼돈의 구슬 can turn a four-line weapon into two, and that is why it is
 * worth hesitating over.
 */
export function orbApplied(item: GearItem, orb: OrbSpec): OrbOutcome | null {
  if (orb.ward) {
    // One 망고 at a time: a second would be a 구슬 spent on nothing.
    return item.mango ? null : { item: { ...item, mango: true }, kind: 'ward' };
  }

  if (orb.reroll) {
    const span = orb.reroll.max - orb.reroll.min + 1;
    const count = orb.reroll.min + Math.floor(Math.random() * span);
    const rolled = rollAffixLines(Math.min(count, MAX_AFFIX_LINES));
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
    const canPrefix = prefixes.length < GEAR_DROP.maxPrefixes && PREFIXES.length > 0;
    const canSuffix = suffixes.length < GEAR_DROP.maxSuffixes && SUFFIXES.length > 0;
    if (!canPrefix && !canSuffix) {
      break;
    }

    const takePrefix = canPrefix && (!canSuffix || Math.random() < 0.5);
    const pool = takePrefix ? PREFIXES : SUFFIXES;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked) {
      break;
    }

    const line = { id: picked.id, tier: rollAffixTier(picked.id) };
    (takePrefix ? prefixes : suffixes).push(line);
    added = line;
  }

  return { item: { ...item, prefixes, suffixes }, kind: 'add', line: added };
}

/**
 * 폭발의 구슬: one 속성 already on the weapon is thrown away, a different one
 * of the same kind rolled in its place, and that one comes out a rung better
 * than the one it replaced. A fifth of the time the weapon does not survive
 * it — which is the whole reason it is worth hesitating over, and why the
 * screen asks before spending one.
 */
/**
 * A 폭발의 구슬 on a weapon whose every line is a 1티어: one line, picked at
 * random, becomes a different 속성 of its kind at 1티어 — one the weapon
 * does not already carry. The destroy roll and the 망고 work as they do for
 * a climb. Null when no other 속성 has a 1티어 rung to trade for.
 */
function swapTopLine(item: GearItem, destroyChance: number): OrbOutcome | null {
  const lines = [...item.prefixes, ...item.suffixes];
  const held = new Set(lines.map((line) => line.id));
  const index = Math.floor(Math.random() * lines.length);
  const from = lines[index]!;
  const fromPrefix = index < item.prefixes.length;
  const pool = (fromPrefix ? PREFIXES : SUFFIXES).filter(
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

function explode(
  item: GearItem,
  upgrade: { readonly steps: number; readonly destroyChance: number },
): OrbOutcome | null {
  // A line with somewhere to climb. When every line is a 1티어 already, one
  // of them is traded for a different 1티어 instead; a weapon with no line
  // at all has nothing for it to work on.
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
    // The 망고 takes the blow: the weapon is left as it was, without its 망고.
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
  const pool = (fromPrefix ? PREFIXES : SUFFIXES).filter((affix) =>
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
 * Rolls for a 구슬 off one kill. `scale` is what the run's 뼈다귀 do to every
 * drop chance. Returns the one that dropped, if any.
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

/** A base from the whole roster by weight, the way a 우두머리 picks one. */
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
 * The weapon an ordinary kill leaves, if any: only a base with `fromKill`
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
 * A weapon as it drops: a base — `base`, or one from the roster by weight —
 * then affix lines that each have to win their own roll. Repeats are allowed,
 * the way a rare enemy can be born doubly 거대 — there are fewer affixes than
 * the ceiling, and a second 강력 is a fine way to say "much harder".
 */
export function rollGearItem(base: GearSpec = rollGearBase()): GearItem {

  const prefixes: AffixLine[] = [];
  const suffixes: AffixLine[] = [];
  const room = () =>
    (prefixes.length < GEAR_DROP.maxPrefixes ? PREFIXES.length : 0) +
    (suffixes.length < GEAR_DROP.maxSuffixes ? SUFFIXES.length : 0);

  while (room() > 0 && Math.random() < GEAR_DROP.affixChance) {
    // Pick among whichever side still has room, so a full set of prefixes
    // does not stop the suffixes from rolling.
    const canPrefix = prefixes.length < GEAR_DROP.maxPrefixes && PREFIXES.length > 0;
    const canSuffix = suffixes.length < GEAR_DROP.maxSuffixes && SUFFIXES.length > 0;
    const takePrefix = canPrefix && (!canSuffix || Math.random() < 0.5);
    const pool = takePrefix ? PREFIXES : SUFFIXES;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked) {
      break;
    }

    (takePrefix ? prefixes : suffixes).push({ id: picked.id, tier: rollAffixTier(picked.id) });
  }

  nextUid += 1;
  return { uid: `g${Date.now().toString(36)}${nextUid}`, id: base.id, prefixes, suffixes };
}

/**
 * The sword one tier better than `id`, or null for the best there is. With
 * more than one sword on that tier, the same weights a 우두머리 uses pick it.
 */
export function combineTargetFor(id: GearId): GearSpec | null {
  const from = GEAR[id];
  if (!from) {
    return null;
  }

  const above = Object.values(GEAR).filter((spec) => spec.tier === from.tier - 1);
  if (above.length === 0) {
    return null;
  }

  const total = above.reduce((sum, spec) => sum + spec.weight, 0);
  let roll = Math.random() * total;
  for (const spec of above) {
    roll -= spec.weight;
    if (roll <= 0) {
      return spec;
    }
  }
  return above[above.length - 1] ?? null;
}

/** What a 합성 came to: whether it took, and the sword it made if it did. */
export interface CombineOutcome {
  readonly success: boolean;
  readonly item: GearItem | null;
}

/** A sword straight off its base: no 속성, a fresh uid. */
export function bareItem(base: GearSpec): GearItem {
  nextUid += 1;
  return { uid: `g${Date.now().toString(36)}${nextUid}`, id: base.id, prefixes: [], suffixes: [] };
}

/**
 * The equipment stash: what has been found, and what is being carried.
 *
 * It sits beside the settings rather than inside a save, because it outlives
 * a run on purpose — a weapon a 우두머리 left in a run that ended badly is
 * still yours, and the title screen is where it goes on. Storage is allowed
 * to fail: a blocked localStorage just means the stash lasts as long as the
 * tab does.
 */
class GearStore {
  private current: GearState = { ...DEFAULTS };
  private readonly listeners = new Set<Listener>();
  private loaded = false;

  public get value(): GearState {
    if (!this.loaded) {
      this.load();
    }
    return this.current;
  }

  /** Everything held, best first, so the list reads as a ladder. */
  public get items(): readonly GearItem[] {
    return [...this.value.items].sort((a, b) => {
      // Tier 1 is the best, so the lower number goes first.
      const tier = (GEAR[a.id]?.tier ?? Infinity) - (GEAR[b.id]?.tier ?? Infinity);
      return tier !== 0 ? tier : affixesOf(b).length - affixesOf(a).length;
    });
  }

  public get equipped(): GearItem {
    return this.value.items.find((item) => item.uid === this.value.equipped) ?? DEFAULTS.items[0];
  }

  public get equippedSpec(): GearSpec {
    return GEAR[this.equipped.id] ?? GEAR[STARTING_GEAR];
  }

  /** What the survivor is getting out of what they are holding. */
  public get bonus(): GearBonus {
    return gearBonusFor(this.equipped);
  }

  /** Adds a weapon to the stash. It is not put on; that is done on the title. */
  public add(item: GearItem): GearItem {
    this.commit({ ...this.value, items: [...this.value.items, item] });
    return item;
  }

  /**
   * Throws one away for good. Whatever is being carried stays: put something
   * else on first, which is also what keeps the stash from ever emptying.
   */
  public discard(uid: string): boolean {
    if (uid === this.value.equipped || !this.value.items.some((item) => item.uid === uid)) {
      return false;
    }

    this.commit({ ...this.value, items: this.value.items.filter((item) => item.uid !== uid) });
    return true;
  }

  /**
   * Swaps one weapon for a changed copy of itself, keeping its place in the
   * stash and whether it is being carried. This is what a 구슬 does: the
   * same weapon, different lines.
   */
  public replace(item: GearItem): boolean {
    if (!this.value.items.some((held) => held.uid === item.uid)) {
      return false;
    }

    this.commit({
      ...this.value,
      items: this.value.items.map((held) => (held.uid === item.uid ? item : held)),
    });
    return true;
  }

  /**
   * Takes one out whether or not it is being carried. Only a 폭발의 구슬
   * does this: what was in hand is gone, and `sanitise` hands back a
   * 녹슨 검 rather than leaving the survivor with nothing.
   */
  public discardAnyway(uid: string): boolean {
    if (!this.value.items.some((item) => item.uid === uid)) {
      return false;
    }

    this.commit({ ...this.value, items: this.value.items.filter((item) => item.uid !== uid) });
    return true;
  }

  /**
   * Why these swords cannot be combined, or null when they can: exactly
   * GEAR_COMBINE.count different ones of the same sword, none of them the
   * one in hand, and a better tier above them to reach for.
   */
  public combineProblem(uids: readonly string[]): 'count' | 'mixed' | 'equipped' | 'top' | null {
    const picked = [...new Set(uids)]
      .map((uid) => this.value.items.find((item) => item.uid === uid))
      .filter((item): item is GearItem => item !== undefined);
    if (picked.length !== GEAR_COMBINE.count) {
      return 'count';
    }
    if (picked.some((item) => item.id !== picked[0]?.id)) {
      return 'mixed';
    }
    if (picked.some((item) => item.uid === this.value.equipped)) {
      return 'equipped';
    }
    const id = picked[0]?.id;
    if (!id || !Object.values(GEAR).some((spec) => spec.tier === GEAR[id].tier - 1)) {
      return 'top';
    }
    return null;
  }

  /**
   * 합성: spends the swords and, GEAR_COMBINE.successChance of the time,
   * puts a bare sword one tier up in their place. Decided and written down
   * in one go, before any of it is shown — so leaving the screen half way
   * through the light cannot take a failure back.
   */
  public combine(uids: readonly string[]): CombineOutcome | null {
    if (this.combineProblem(uids) !== null) {
      return null;
    }

    const spent = new Set(uids);
    const id = this.value.items.find((item) => spent.has(item.uid))?.id;
    const target = id ? combineTargetFor(id) : null;
    if (!target) {
      return null;
    }

    const success = Math.random() < GEAR_COMBINE.successChance;
    const made = success ? bareItem(target) : null;
    const items = this.value.items.filter((item) => !spent.has(item.uid));
    this.commit({ ...this.value, items: made ? [...items, made] : items });
    return { success, item: made };
  }

  /** Puts a weapon on. Only something already in the stash can be carried. */
  public equip(uid: string): boolean {
    if (!this.value.items.some((item) => item.uid === uid) || this.value.equipped === uid) {
      return false;
    }

    this.commit({ ...this.value, equipped: uid });
    return true;
  }

  public reset(): GearState {
    this.commit({ items: [...DEFAULTS.items], equipped: DEFAULTS.equipped });
    return this.current;
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: GearState): void {
    this.current = this.sanitise(next);
    this.save();
    this.listeners.forEach((listener) => listener(this.current));
  }

  private load(): void {
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(STORAGE.gear);
      this.current = raw
        ? this.sanitise({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<GearState>) })
        : { ...DEFAULTS };
    } catch {
      this.current = { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE.gear, JSON.stringify(this.current));
    } catch {
      // The stash lasts as long as the tab, then.
    }
  }

  /**
   * Reads a stored list of 속성, in either shape. Before tiers a line was
   * just an id; those come back at the middle rung, which is about what they
   * were worth when they were written.
   */
  private static lines(
    raw: readonly (AffixLine | AffixId)[] | undefined,
    kind: 'prefix' | 'suffix',
  ): AffixLine[] {
    const out: AffixLine[] = [];
    for (const entry of raw ?? []) {
      const id = (typeof entry === 'string' ? entry : entry?.id) as AffixId;
      if (AFFIXES[id]?.kind !== kind || AFFIXES[id]?.gearTiers === undefined) {
        continue;
      }

      const tier = typeof entry === 'string' ? LEGACY_AFFIX_TIER : Number(entry?.tier);
      out.push({ id, tier: affixTier(id, tier)?.tier ?? LEGACY_AFFIX_TIER });
    }
    return out;
  }

  /** A hand-edited or stale payload cannot leave the survivor empty-handed. */
  private sanitise(raw: GearState): GearState {
    const items: GearItem[] = (Array.isArray(raw.items) ? raw.items : [])
      .filter(
        (item: GearItem) =>
          item && GEAR[item.id] !== undefined && typeof item.uid === 'string',
      )
      .map((item: GearItem) => ({
        uid: item.uid,
        id: item.id,
        prefixes: GearStore.lines(item.prefixes, 'prefix'),
        suffixes: GearStore.lines(item.suffixes, 'suffix'),
        ...(item.mango === true ? { mango: true } : {}),
      }));

    // Empty-handed is the one state that cannot stand, so the 녹슨 검 comes
    // back then and only then. Throwing it away once there is something
    // better is allowed, and it stays thrown away.
    if (items.length === 0) {
      items.push({ ...DEFAULTS.items[0]! });
    }

    const equipped = items.some((item) => item.uid === raw.equipped)
      ? raw.equipped
      : items[0]!.uid;
    return { items, equipped };
  }
}

export const gear = new GearStore();
