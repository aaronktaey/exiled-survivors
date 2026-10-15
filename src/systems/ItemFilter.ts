/**
 * 아이템 필터 — which drops the player has switched off (config/itemFilter.ts).
 * Kept in localStorage under the game's prefix, so a signed-in player's
 * filter travels with the rest of their records.
 */
import { ALL_FILTER_KEYS, STORAGE, type DropTier } from '@/config';
import type { GearItem } from '@/systems/Gear';
import { dropTierFor } from '@/systems/Gear';

type Listener = () => void;

class ItemFilterStore {
  private hidden = new Set<string>();
  private loaded = false;
  private readonly listeners = new Set<Listener>();

  /** Whether a drop under this key is put on the ground. */
  public shows(key: string): boolean {
    this.load();
    return !this.hidden.has(key);
  }

  /** A weapon shows when both its base and its rarity do. */
  public showsGear(item: GearItem): boolean {
    const tier: DropTier = dropTierFor(item);
    return this.shows(`gear:${item.id}`) && this.shows(`rarity:${tier}`);
  }

  /** How many switches are off. */
  public get hiddenCount(): number {
    this.load();
    return this.hidden.size;
  }

  public toggle(key: string): void {
    this.load();
    if (this.hidden.has(key)) {
      this.hidden.delete(key);
    } else if (ALL_FILTER_KEYS.includes(key)) {
      this.hidden.add(key);
    }
    this.save();
  }

  /** Everything shown again. */
  public reset(): void {
    this.load();
    this.hidden.clear();
    this.save();
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): void {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE.itemFilter) ?? '[]') as unknown;
      // Only what the table still has: a switch for something taken out is dropped.
      this.hidden = new Set(
        (Array.isArray(parsed) ? parsed : []).filter(
          (key): key is string => typeof key === 'string' && ALL_FILTER_KEYS.includes(key),
        ),
      );
    } catch {
      this.hidden = new Set();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE.itemFilter, JSON.stringify([...this.hidden]));
    } catch {
      // Kept for as long as the tab is open, then.
    }
    this.listeners.forEach((listener) => listener());
  }
}

export const itemFilter = new ItemFilterStore();
