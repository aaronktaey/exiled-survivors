import { ALL_PASSIVES, PASSIVE_POINTS, PASSIVE_SCHEME, PASSIVES, STORAGE, TALENT_SHARD, type PassiveId, type ShardStat } from '@/config';
import { openRecord, sealRecord } from '@/systems/Seal';

/** The stash of points, and where they have been spent. */
export interface PassiveState {
  /** The tree's shape it was written for; another (or none) starts over at PASSIVE_POINTS (0.102). */
  readonly scheme: number;
  /** Points held and not yet spent: PASSIVE_POINTS in all, spent or not. */
  readonly points: number;
  readonly ranks: Partial<Record<PassiveId, number>>;
}

/** What the tree is worth: since 0.102, only which 재능의 파편 a dropped one is likelier to be. */
export interface PassiveBonus {
  /** Each stat's weight when a shard lands: 1, plus each rank's share. */
  readonly shardWeights: Readonly<Record<ShardStat, number>>;
}

const evenWeights = (): Record<ShardStat, number> =>
  Object.fromEntries(TALENT_SHARD.stats.map((stat) => [stat, 1])) as Record<ShardStat, number>;

export const NO_PASSIVES: PassiveBonus = { shardWeights: evenWeights() };

const fresh = (): PassiveState => ({ scheme: PASSIVE_SCHEME, points: PASSIVE_POINTS, ranks: {} });

type Listener = (state: PassiveState) => void;

/**
 * What a set of ranks adds up to: each line's ranks add to its stat's
 * weight (ten ranks of +5% make it 1.5 against the others' 1).
 */
export function passiveBonusFor(ranks: PassiveState['ranks']): PassiveBonus {
  const shardWeights = evenWeights();
  for (const spec of Object.values(PASSIVES)) {
    const rank = ranks[spec.id] ?? 0;
    if (rank > 0) {
      shardWeights[spec.shardStat] += spec.shardWeight * rank;
    }
  }
  return { shardWeights };
}

/**
 * The passive tree's own state, kept beside the equipment stash: both
 * outlive a run on purpose, and both are spent on the title screen.
 */
class PassiveStore {
  private current: PassiveState = fresh();
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

  /** The points that fill every line to its maxRank. */
  public get maxPoints(): number {
    return ALL_PASSIVES.reduce((sum, spec) => sum + spec.maxRank, 0);
  }

  /**
   * Tops the points up so held and spent come to `maxPoints` (0.81's gift).
   * Returns the points given — none when there is nothing left to fill.
   */
  public topUpToMax(): number {
    const given = Math.max(0, this.maxPoints - this.spent - this.value.points);
    if (given > 0) {
      this.commit({ ...this.value, points: this.value.points + given });
    }
    return given;
  }

  /** Whether a line's branch is open: the line it hangs from holds enough ranks. */
  public isOpen(id: PassiveId): boolean {
    const needs = PASSIVES[id]?.requires;
    return !needs || this.rankOf(needs.id) >= needs.rank;
  }

  /** Spends a point on a line. False when there is none, it is full, or its branch is shut. */
  public spend(id: PassiveId): boolean {
    const spec = PASSIVES[id];
    const rank = this.rankOf(id);
    if (!spec || this.value.points <= 0 || rank >= spec.maxRank || !this.isOpen(id)) {
      return false;
    }

    this.commit({
      ...this.value,
      points: this.value.points - 1,
      ranks: { ...this.value.ranks, [id]: rank + 1 },
    });
    return true;
  }

  /** Takes a rank off a line, the point back in hand. False when it holds none. */
  public refund(id: PassiveId): boolean {
    const rank = this.rankOf(id);
    if (!PASSIVES[id] || rank <= 0) {
      return false;
    }
    const ranks = { ...this.value.ranks, [id]: rank - 1 };
    if (rank - 1 <= 0) {
      delete ranks[id];
    }
    this.commit({ ...this.value, points: this.value.points + 1, ranks });
    return true;
  }

  /** Every point back to spend again. */
  public reset(): PassiveState {
    this.commit(fresh());
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
      // A tree changed outside the game starts over; one from before the
      // seal is taken and written back sealed — and one from before 0.102's
      // tree (no `scheme`) starts over too, every point back to spend.
      const opened = raw ? openRecord<Partial<PassiveState>>(STORAGE.passives, raw) : null;
      const current = opened && opened.state !== 'tampered' && opened.value.scheme === PASSIVE_SCHEME;
      this.current = current ? this.sanitise({ ...fresh(), ...opened.value }) : fresh();
      // Nothing stored is a fresh tree in memory, and nothing is written for
      // it — a write here would read as a change to the records (CloudSave).
      // A tree that had points on a line since taken out is written back with them returned.
      if (opened && (opened.state !== 'sealed' || !current || this.returned > 0)) {
        this.save();
      }
    } catch {
      this.current = fresh();
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE.passives, sealRecord(STORAGE.passives, this.current));
    } catch {
      // The tree lasts as long as the tab, then.
    }
  }

  /** Points that sat on a line since taken out, given back by the last load (0.131: 체력회복). */
  private returned = 0;

  /**
   * A hand-edited payload cannot buy a rank that does not exist — and the
   * points on a line that no longer exists (shardRegen, 0.131) come back to
   * be spent again.
   */
  private sanitise(raw: PassiveState): PassiveState {
    const ranks: Partial<Record<PassiveId, number>> = {};
    for (const spec of Object.values(PASSIVES)) {
      const rank = Math.floor(Number(raw.ranks?.[spec.id] ?? 0));
      if (rank > 0) {
        ranks[spec.id] = Math.min(spec.maxRank, rank);
      }
    }
    this.returned = Object.entries(raw.ranks ?? {})
      .filter(([id]) => !(id in PASSIVES))
      .reduce((sum, [, rank]) => sum + Math.max(0, Math.floor(Number(rank) || 0)), 0);

    // Never more than PASSIVE_POINTS, spent and held together.
    const spent = Object.values(ranks).reduce((sum, rank) => sum + (rank ?? 0), 0);
    return {
      scheme: PASSIVE_SCHEME,
      points: Math.max(0, Math.min(PASSIVE_POINTS - spent, Math.floor(Number(raw.points) || 0) + this.returned)),
      ranks,
    };
  }
}

export const passives = new PassiveStore();
