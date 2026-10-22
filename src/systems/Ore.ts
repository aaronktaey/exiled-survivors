import { STORAGE } from '@/config';

type Listener = (ore: number) => void;

/**
 * 철광석 (0.90): what 분해 gives back and 제작 spends. It took the purse's
 * place when gold went — kept beside the stash and outliving a run the same way.
 */
class OreStore {
  private current = 0;
  private readonly listeners = new Set<Listener>();
  private loaded = false;

  public get value(): number {
    if (!this.loaded) {
      this.load();
    }
    return this.current;
  }

  public add(amount: number): void {
    if (amount > 0) {
      this.commit(this.value + amount);
    }
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
      const raw = window.localStorage.getItem(STORAGE.ore);
      this.current = raw ? Math.max(0, Math.floor(Number(JSON.parse(raw)) || 0)) : 0;
    } catch {
      this.current = 0;
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE.ore, JSON.stringify(this.current));
    } catch {
      // It lasts as long as the tab, then.
    }
  }
}

export const ore = new OreStore();
