import { STORAGE, type BoneId } from '@/config';
import type { SkillStats } from '@/systems/Progression';
import type { SkillId } from '@/weapons/skills';

/** A run, as it is written to localStorage. */
export interface SavedRun {
  readonly version: 1;
  readonly savedAt: number;
  readonly elapsedMs: number;
  readonly level: number;
  readonly xp: number;
  readonly hp: number;
  /** Owned skills and where each one's stats stand. */
  readonly skills: Partial<Record<SkillId, SkillStats>>;
  /** The spawner's difficulty clock, which drives rate and the enemy mix. */
  readonly spawnerMs: number;
  /**
   * The 뼈다귀 this run was started with. Absent on a save written before
   * they existed, which just means a run with none.
   */
  readonly bones?: readonly BoneId[];
  /** The developer tools changed this run, so it stays off both boards once resumed. */
  readonly devUsed?: boolean;
}

/**
 * One autosave slot. 불러오기 picks it up; dying throws it away, so a save is
 * a way to stop and come back rather than a way to undo a death.
 */
export const saveGame = {
  write(run: Omit<SavedRun, 'version' | 'savedAt'>): void {
    const payload: SavedRun = { version: 1, savedAt: Date.now(), ...run };
    try {
      window.localStorage.setItem(STORAGE.save, JSON.stringify(payload));
    } catch {
      // Out of quota or storage blocked: the run just carries on unsaved.
    }
  },

  read(): SavedRun | null {
    try {
      const raw = window.localStorage.getItem(STORAGE.save);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as SavedRun;
      if (parsed.version !== 1 || typeof parsed.elapsedMs !== 'number') {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  clear(): void {
    try {
      window.localStorage.removeItem(STORAGE.save);
    } catch {
      // Nothing to do.
    }
  },

  /** "Lv 7 · 04:12" for the 불러오기 row. */
  describe(run: SavedRun): string {
    const total = Math.floor(run.elapsedMs / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `Lv ${run.level} · ${mm}:${ss}`;
  },
};
