import { ALL_BONES, BONES, BONE_RUN, STORAGE, type BoneId } from '@/config';

/** How many of each 뼈다귀 the survivor is holding. */
export type BoneCounts = Record<BoneId, number>;

type Listener = (counts: BoneCounts) => void;

const empty = (): BoneCounts =>
  Object.fromEntries(ALL_BONES.map((bone) => [bone.id, 0])) as BoneCounts;

/**
 * The 뼈다귀 drawer: what has been found and not yet spent on a run.
 *
 * It outlives a run like the stash and the 구슬 drawer do, but what comes out
 * of it does not: a 뼈다귀 is handed to one run and is gone when that run
 * ends, won or lost. Spending is therefore the moment the run starts, not
 * the moment it is picked on the screen — backing out of the pick screen
 * costs nothing.
 */
class BoneStore {
  private current: BoneCounts = empty();
  private readonly listeners = new Set<Listener>();
  private loaded = false;

  public get value(): BoneCounts {
    if (!this.loaded) {
      this.load();
    }
    return this.current;
  }

  public count(id: BoneId): number {
    return this.value[id] ?? 0;
  }

  /** How many are held in all, for the dot on the 게임 시작 row. */
  public get total(): number {
    return ALL_BONES.reduce((sum, bone) => sum + this.count(bone.id), 0);
  }

  public add(id: BoneId, amount = 1): number {
    if (!BONES[id] || amount <= 0) {
      return this.count(id);
    }

    this.commit({ ...this.value, [id]: this.count(id) + amount });
    return this.count(id);
  }

  /**
   * Hands a set of 뼈다귀 to a run, taking them out of the drawer. Returns
   * what was actually spent — a list asking for more than is held, or for
   * more than one run can take, is trimmed rather than refused.
   */
  public spend(applied: readonly BoneId[]): BoneId[] {
    const spent: BoneId[] = [];
    const left: BoneCounts = { ...this.value };

    for (const id of applied) {
      if (spent.length >= BONE_RUN.maxApplied || !BONES[id] || (left[id] ?? 0) <= 0) {
        continue;
      }
      if (!BONES[id].stackable && spent.includes(id)) {
        continue;
      }

      left[id] -= 1;
      spent.push(id);
    }

    if (spent.length > 0) {
      this.commit(left);
    }

    return spent;
  }

  /** True when this run could still take one more of `id`. */
  public canApply(id: BoneId, applied: readonly BoneId[]): boolean {
    const spec = BONES[id];
    if (!spec || applied.length >= BONE_RUN.maxApplied) {
      return false;
    }

    const used = applied.filter((one) => one === id).length;
    if (used >= this.count(id)) {
      return false;
    }

    return spec.stackable || used === 0;
  }

  public reset(): BoneCounts {
    this.commit(empty());
    return this.current;
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: BoneCounts): void {
    this.current = this.sanitise(next);
    this.save();
    this.listeners.forEach((listener) => listener(this.current));
  }

  private load(): void {
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(STORAGE.bones);
      this.current = raw ? this.sanitise(JSON.parse(raw) as Partial<BoneCounts>) : empty();
    } catch {
      this.current = empty();
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE.bones, JSON.stringify(this.current));
    } catch {
      // The drawer lasts as long as the tab, then.
    }
  }

  /** A hand-edited payload cannot invent a 뼈다귀 or a negative count. */
  private sanitise(raw: Partial<BoneCounts>): BoneCounts {
    const out = empty();
    for (const bone of ALL_BONES) {
      const held = Number(raw?.[bone.id] ?? 0);
      out[bone.id] = Number.isFinite(held) ? Math.max(0, Math.floor(held)) : 0;
    }
    return out;
  }
}

export const bones = new BoneStore();
