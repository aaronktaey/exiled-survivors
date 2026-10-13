import { ECONOMY, STORAGE } from '@/config';

type Listener = (gold: number) => void;

/**
 * The purse. It is paid out of how much damage a run dealt and spent on
 * 신성한 조각, so a run that ended badly still moved the passive tree
 * forward — which is what makes a run you lose worth playing.
 *
 * Kept beside the stash and the tree: all three outlive a run on purpose.
 */
class GoldStore {
  private current = 0;
  private readonly listeners = new Set<Listener>();
  private loaded = false;

  public get value(): number {
    if (!this.loaded) {
      this.load();
    }
    return this.current;
  }

  /** What a run's damage is worth, rounded down. */
  public static earnedFor(damage: number): number {
    return Math.max(0, Math.floor(damage / ECONOMY.damagePerGold));
  }

  /** Pays a run out. Returns what it earned. */
  public earn(damage: number): number {
    const earned = GoldStore.earnedFor(damage);
    if (earned > 0) {
      this.commit(this.value + earned);
    }
    return earned;
  }

  /** True when there was enough, and it has been taken. */
  public spend(amount: number): boolean {
    if (amount <= 0 || this.value < amount) {
      return false;
    }

    this.commit(this.value - amount);
    return true;
  }

  public reset(): number {
    this.commit(0);
    return this.current;
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: number): void {
    this.current = Math.max(0, Math.floor(next));
    this.save();
    this.listeners.forEach((listener) => listener(this.current));
  }

  private load(): void {
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(STORAGE.gold);
      this.current = raw ? Math.max(0, Math.floor(Number(JSON.parse(raw)) || 0)) : 0;
    } catch {
      this.current = 0;
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE.gold, JSON.stringify(this.current));
    } catch {
      // The purse lasts as long as the tab, then.
    }
  }
}

export const gold = new GoldStore();
export const goldFor = GoldStore.earnedFor;
