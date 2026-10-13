import { ECONOMY, PASSIVES, SHARD, STORAGE, type PassiveId } from '@/config';
import { gold } from '@/systems/Gold';

/** The stash of points, and where they have been spent. */
export interface PassiveState {
  /** 신성한 조각 held, short of the next 구슬. */
  readonly shards: number;
  /** Points earned and not yet spent. */
  readonly points: number;
  readonly ranks: Partial<Record<PassiveId, number>>;
}

/** What the tree is worth, before the weapon and before the run. */
export interface PassiveBonus {
  readonly damageScale: number;
  readonly attackSpeedScale: number;
  /** Health returned every REGEN.periodMs. */
}

export const NO_PASSIVES: PassiveBonus = {
  damageScale: 1,
  attackSpeedScale: 1,
};

const DEFAULTS: PassiveState = { shards: 0, points: 0, ranks: {} };

type Listener = (state: PassiveState) => void;

/**
 * What a set of ranks adds up to.
 *
 * Ranks of one line add together rather than compounding — three ranks of
 * +10% is +30%, not 1.1³ — so the tenth point in a line is worth what the
 * first was. The layers multiply with each other; that is Modifiers' job.
 */
export function passiveBonusFor(ranks: PassiveState['ranks']): PassiveBonus {
  let damageScale = 1;
  let attackSpeedScale = 1;

  for (const spec of Object.values(PASSIVES)) {
    const rank = ranks[spec.id] ?? 0;
    if (rank <= 0) {
      continue;
    }

    damageScale += ((spec.damageScale ?? 1) - 1) * rank;
    attackSpeedScale += ((spec.attackSpeedScale ?? 1) - 1) * rank;
  }

  return { damageScale, attackSpeedScale };
}

/**
 * The passive tree's own state, kept beside the equipment stash: both
 * outlive a run on purpose, and both are spent on the title screen.
 *
 * Shards turn into points as they arrive — holding ten of them and a
 * separate "make the orb" button would be a step with no decision in it.
 */
class PassiveStore {
  private current: PassiveState = { ...DEFAULTS, ranks: {} };
  private readonly listeners = new Set<Listener>();
  private loaded = false;

  public get value(): PassiveState {
    if (!this.loaded) {
      this.load();
    }
    return this.current;
  }

  public get bonus(): PassiveBonus {
    return passiveBonusFor(this.value.ranks);
  }

  public rankOf(id: PassiveId): number {
    return this.value.ranks[id] ?? 0;
  }

  /** Total points ever earned, for the line that reads them out. */
  public get spent(): number {
    return Object.values(this.value.ranks).reduce((sum, rank) => sum + (rank ?? 0), 0);
  }

  /**
   * One 신성한 조각, as a 우두머리 left it. Every SHARD.perOrb of them
   * completes a 신성한 구슬, which is a point. Returns true when this shard
   * was the one that completed one.
   */
  public addShard(): boolean {
    const shards = this.value.shards + 1;
    if (shards < SHARD.perOrb) {
      this.commit({ ...this.value, shards });
      return false;
    }

    this.commit({
      ...this.value,
      shards: shards - SHARD.perOrb,
      points: this.value.points + SHARD.pointsPerOrb,
    });
    return true;
  }

  /**
   * Buys one 신성한 조각 with gold. It goes in as if a 우두머리 had left it,
   * so ten bought shards finish a 구슬 the same way ten found ones do.
   */
  public buyShard(): boolean {
    if (!gold.spend(ECONOMY.shardPrice)) {
      return false;
    }

    this.addShard();
    return true;
  }

  /** Spends a point on a line. False when there is none, or it is full. */
  public spend(id: PassiveId): boolean {
    const spec = PASSIVES[id];
    const rank = this.rankOf(id);
    if (!spec || this.value.points <= 0 || rank >= spec.maxRank) {
      return false;
    }

    this.commit({
      ...this.value,
      points: this.value.points - 1,
      ranks: { ...this.value.ranks, [id]: rank + 1 },
    });
    return true;
  }

  public reset(): PassiveState {
    this.commit({ ...DEFAULTS, ranks: {} });
    return this.current;
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: PassiveState): void {
    this.current = this.sanitise(next);
    this.save();
    this.listeners.forEach((listener) => listener(this.current));
  }

  private load(): void {
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(STORAGE.passives);
      this.current = raw
        ? this.sanitise({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<PassiveState>) })
        : { ...DEFAULTS, ranks: {} };
    } catch {
      this.current = { ...DEFAULTS, ranks: {} };
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE.passives, JSON.stringify(this.current));
    } catch {
      // The tree lasts as long as the tab, then.
    }
  }

  /** A hand-edited payload cannot buy a rank that does not exist. */
  private sanitise(raw: PassiveState): PassiveState {
    const ranks: Partial<Record<PassiveId, number>> = {};
    for (const spec of Object.values(PASSIVES)) {
      const rank = Math.floor(Number(raw.ranks?.[spec.id] ?? 0));
      if (rank > 0) {
        ranks[spec.id] = Math.min(spec.maxRank, rank);
      }
    }

    return {
      shards: Math.max(0, Math.min(SHARD.perOrb - 1, Math.floor(Number(raw.shards) || 0))),
      points: Math.max(0, Math.floor(Number(raw.points) || 0)),
      ranks,
    };
  }
}

export const passives = new PassiveStore();
