import { ALL_PASSIVES, PASSIVES, STORAGE, type PassiveId } from '@/config';
import { openRecord, sealRecord } from '@/systems/Seal';

/** The stash of points, and where they have been spent. */
export interface PassiveState {
  /** Points held and not yet spent (신성한 조각 went in 0.83; points come as gifts). */
  readonly points: number;
  readonly ranks: Partial<Record<PassiveId, number>>;
}

/** What the tree is worth, before the weapon and before the run. */
export interface PassiveBonus {
  readonly damageScale: number;
  readonly attackSpeedScale: number;
  readonly moveSpeedScale: number;
  /** 행운, as a share: what drops an enemy's 속성 raise are multiplied by, plus one (0.83). */
  readonly luck: number;
}

export const NO_PASSIVES: PassiveBonus = {
  damageScale: 1,
  attackSpeedScale: 1,
  moveSpeedScale: 1,
  luck: 0,
};

const DEFAULTS: PassiveState = { points: 0, ranks: {} };

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
  let moveSpeedScale = 1;
  let luck = 0;

  for (const spec of Object.values(PASSIVES)) {
    const rank = ranks[spec.id] ?? 0;
    if (rank <= 0) {
      continue;
    }

    damageScale += ((spec.damageScale ?? 1) - 1) * rank;
    attackSpeedScale += ((spec.attackSpeedScale ?? 1) - 1) * rank;
    moveSpeedScale += ((spec.moveSpeedScale ?? 1) - 1) * rank;
    luck += (spec.luck ?? 0) * rank;
  }

  return { damageScale, attackSpeedScale, moveSpeedScale, luck };
}

/**
 * The passive tree's own state, kept beside the equipment stash: both
 * outlive a run on purpose, and both are spent on the title screen.
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
      // A tree changed outside the game starts over; one from before the
      // seal is taken and written back sealed.
      const opened = raw ? openRecord<Partial<PassiveState>>(STORAGE.passives, raw) : null;
      this.current =
        opened && opened.state !== 'tampered'
          ? this.sanitise({ ...DEFAULTS, ...opened.value })
          : { ...DEFAULTS, ranks: {} };
      if (opened && opened.state !== 'sealed') {
        this.save();
      }
    } catch {
      this.current = { ...DEFAULTS, ranks: {} };
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE.passives, sealRecord(STORAGE.passives, this.current));
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
      points: Math.max(0, Math.floor(Number(raw.points) || 0)),
      ranks,
    };
  }
}

export const passives = new PassiveStore();
