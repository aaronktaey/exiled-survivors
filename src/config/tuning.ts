/**
 * ★ 밸런스 다이얼 — the numbers the admin's in-game panel can turn, by path
 * into the config tables (balance.ts, equipment.ts, bones.ts, passives.ts).
 *
 * Pure data, no imports: the Worker reads this too, to accept only these
 * paths when the panel's values are made everyone's (server/tuning.ts).
 * Adding a dial is a line here and its label in the locales' `tuning.labels`.
 *
 * A dial's range runs from 0 (or `min`) to `max`, or to `maxFactor` × the
 * value balance.ts gives it (3 when unset); `kind` says how it reads.
 */
export type DialKind =
  /** A share, read as a percentage: 0.015 → 1.5%. */
  | 'chance'
  /** A multiplier: 1.2 → ×1.20. */
  | 'scale'
  /** Milliseconds, read as seconds. */
  | 'ms'
  /** A whole number. */
  | 'count'
  /** Anything else, as it is. */
  | 'number';

export type DialTab = 'skills' | 'enemies' | 'drops';

export interface DialSpec {
  /** Where the value lives: `SKILL_BASE.fireball.damage`. */
  readonly path: string;
  readonly kind: DialKind;
  readonly tab: DialTab;
  /** Within the 스킬 tab, whose page it is on ('common' for every skill). */
  readonly skill?: string;
  readonly min?: number;
  readonly max?: number;
  readonly maxFactor?: number;
}

const SKILL_IDS = ['meleeStrike', 'fireball', 'chainLightning', 'iceSpear', 'voidOrb', 'thunderStrike'] as const;

/** What each skill's page holds, beyond damage, speed and reach. */
const SKILL_EXTRAS: Record<(typeof SKILL_IDS)[number], readonly string[]> = {
  meleeStrike: [],
  fireball: ['projectileSpeed'],
  chainLightning: ['chainCount'],
  iceSpear: ['projectileSpeed', 'pierceCount'],
  voidOrb: ['orbCount', 'orbitSpeed'],
  thunderStrike: [],
};

const skillDials: DialSpec[] = SKILL_IDS.flatMap((skill) => [
  { path: `SKILL_BASE.${skill}.damage`, kind: 'number' as const, tab: 'skills' as const, skill },
  { path: `SKILL_BASE.${skill}.attackSpeed`, kind: 'number' as const, tab: 'skills' as const, skill },
  { path: `SKILL_BASE.${skill}.range`, kind: 'number' as const, tab: 'skills' as const, skill },
  ...SKILL_EXTRAS[skill].map((field) => ({
    path: `SKILL_BASE.${skill}.${field}`,
    kind: (field.endsWith('Count') ? 'count' : 'number') as DialKind,
    tab: 'skills' as const,
    skill,
    ...(field.endsWith('Count') ? { max: 10 } : {}),
  })),
  { path: `BALANCE.damageScale.${skill}`, kind: 'scale' as const, tab: 'skills' as const, skill },
]);

export const DIALS: readonly DialSpec[] = [
  ...skillDials,
  // Every skill at once.
  { path: 'UPGRADE_PERCENT.damage', kind: 'chance', tab: 'skills', skill: 'common', max: 1 },
  { path: 'UPGRADE_PERCENT.attackSpeed', kind: 'chance', tab: 'skills', skill: 'common', max: 1 },
  { path: 'PLAYER.critChance', kind: 'chance', tab: 'skills', skill: 'common', max: 1 },
  { path: 'PLAYER.critMultiplier', kind: 'scale', tab: 'skills', skill: 'common', min: 1, max: 5 },

  // How many, how tough, how fast it closes in.
  { path: 'SPAWN.startIntervalMs', kind: 'ms', tab: 'enemies', min: 50 },
  { path: 'SPAWN.minIntervalMs', kind: 'ms', tab: 'enemies', min: 20 },
  { path: 'SPAWN.rampPerMinute', kind: 'chance', tab: 'enemies', max: 0.95 },
  { path: 'SPAWN.maxAlive', kind: 'count', tab: 'enemies', min: 10, max: 600 },
  { path: 'BALANCE.enemyHpScale', kind: 'scale', tab: 'enemies', min: 0.1, max: 5 },
  { path: 'DIFFICULTY.hpScalePerMinute', kind: 'scale', tab: 'enemies', min: 1, max: 2 },
  { path: 'DIFFICULTY.hpStepTiers.0.afterMinute', kind: 'count', tab: 'enemies', min: 0, max: 60 },
  { path: 'DIFFICULTY.hpStepTiers.0.multiplier', kind: 'scale', tab: 'enemies', min: 0, max: 20 },
  { path: 'DIFFICULTY.hpStepTiers.1.afterMinute', kind: 'count', tab: 'enemies', min: 0, max: 60 },
  { path: 'DIFFICULTY.hpStepTiers.1.multiplier', kind: 'scale', tab: 'enemies', min: 0, max: 20 },
  { path: 'RARE.chance', kind: 'chance', tab: 'enemies', max: 1 },
  { path: 'BOSS.intervalMs', kind: 'ms', tab: 'enemies', min: 10_000 },
  { path: 'ENEMY_KINDS.erratic.speed', kind: 'number', tab: 'enemies', min: 20 },
  { path: 'ENEMY_KINDS.erratic.hop.distance', kind: 'number', tab: 'enemies', min: 20 },
  { path: 'ENEMY_KINDS.erratic.hop.restMs', kind: 'ms', tab: 'enemies' },
  { path: 'ENEMY_KINDS.erratic.hop.lungeChance', kind: 'chance', tab: 'enemies', max: 1 },

  // What falls.
  { path: 'SKILL_DROP.chance', kind: 'chance', tab: 'drops', max: 0.2 },
  { path: 'SKILL_PICK.dropChance', kind: 'chance', tab: 'drops', max: 0.2 },
  { path: 'POTION.chance', kind: 'chance', tab: 'drops', max: 0.3 },
  { path: 'MANGO.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'MAGNET.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'ORBS.transmute.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'ORBS.chaos.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'ORBS.awaken.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'ORBS.explode.chance', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'ORBS.mango.chance', kind: 'chance', tab: 'drops', max: 0.01 },
  { path: 'BONES.skull.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'BONES.rib.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'BONES.spine.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.rustySword.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.ironSword.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'GEAR.steelSword.fromKill', kind: 'chance', tab: 'drops', max: 0.05 },
  { path: 'SHARD.chance', kind: 'chance', tab: 'drops', max: 1 },
  { path: 'ALTAR.fromKill', kind: 'chance', tab: 'drops', max: 0.2 },
  { path: 'RARE.dropBonusPerAffix', kind: 'chance', tab: 'drops', max: 2 },
  { path: 'BOSS.dropBonus', kind: 'scale', tab: 'drops', max: 20 },
];

/** Every path the panel may set — what the Worker accepts and nothing else. */
export const DIAL_PATHS: ReadonlySet<string> = new Set(DIALS.map((dial) => dial.path));

export const TUNING = {
  /** Where the panel's own, not-yet-shared values wait (this browser only — not synced). */
  draftKey: 'exiled-survivors:tuning-draft:v1',
  /** How long the edge keeps everyone's values before asking the database again. */
  cacheSeconds: 60,
  /** Anything bigger than this is not a value a dial can reach. */
  maxValue: 1_000_000,
} as const;
