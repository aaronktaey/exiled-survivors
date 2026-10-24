import { STORAGE, type BoneId } from '@/config';
import type { ShardStat } from '@/config';
import { gearTitle } from '@/i18n';
import { openRecord, sealRecord } from '@/systems/Seal';
import type { SkillStats } from '@/systems/Progression';
import type { SkillId } from '@/weapons/skills';
import type { GearItem } from '@/systems/Gear';
import type { EnemyKind } from '@/config';

/** A run, as it is written to localStorage. */
export interface SavedRun {
  readonly version: 1;
  readonly savedAt: number;
  readonly elapsedMs: number;
  /** The run's second clock (systems/RunLedger.ts). Absent before 0.71: taken as `elapsedMs`. */
  readonly wallMs?: number;
  readonly level: number;
  readonly xp: number;
  /** XP.unit when written (0.120); absent before, when XP came in tenths of today's. */
  readonly xpUnit?: number;
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
  /** The run's main skill — the one its level-ups go to. The first skill when absent. */
  readonly main?: SkillId;
  /** The developer tools changed this run, so it stays off both boards once resumed. */
  readonly devUsed?: boolean;
  /**
   * The weapon the run went out with, as it was then (null: none). A run
   * resumes with this, whatever the 인벤토리 holds by then — so the weapon
   * in hand can be swapped, or changed by a 구슬, while a run is saved.
   * Absent on a save written before this, which takes the one in hand.
   */
  readonly gear?: GearItem | null;
  /**
   * What the run had dealt and killed by then, so they still count at its
   * end. Absent on a save from before 2026-10-18, which starts them at zero.
   */
  readonly damage?: number;
  readonly kills?: Partial<Record<EnemyKind, number>>;
  /** The score by kind so far (SCORE, 0.116); absent before, and starts at zero then. */
  readonly scoreByKind?: Partial<Record<EnemyKind, number>>;
  /** The 지형지물 field's seed, so a resumed run finds its rocks where they were. */
  readonly terrainSeed?: number;
  /** The run's 재능의 파편, by stat (0.102). */
  readonly shards?: Partial<Record<ShardStat, number>>;
  /**
   * What the run had counted gaining (systems/RunTally.ts, 0.91). Absent
   * on an older save, which takes what it holds as counted.
   */
  readonly tally?: { readonly levelUps: number; readonly skillLevels: number };
}

/**
 * One autosave slot. 불러오기 picks it up; dying throws it away, so a save is
 * a way to stop and come back rather than a way to undo a death.
 */
export const saveGame = {
  write(run: Omit<SavedRun, 'version' | 'savedAt'>): void {
    const payload: SavedRun = { version: 1, savedAt: Date.now(), ...run };
    try {
      window.localStorage.setItem(STORAGE.save, sealRecord(STORAGE.save, payload));
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

      // A save changed outside the game is not offered, and is thrown away.
      const opened = openRecord<SavedRun>(STORAGE.save, raw);
      if (opened.state === 'tampered') {
        saveGame.clear();
        return null;
      }
      const parsed = opened.value;
      if (parsed.version !== 1 || typeof parsed.elapsedMs !== 'number') {
        return null;
      }
      // A run saved on 0.71–0.79 carries the run's own kit (gear worn in
      // three slots, 룬): a game that is no more since 0.80 went back to
      // 0.67's. It is thrown away.
      if ('kit' in parsed) {
        saveGame.clear();
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

  /**
   * "Lv 7 · 04:12 · 강철 검" for the 불러오기 row and the ask before a new run:
   * the weapon is the one the run goes on with, whatever is in hand now.
   */
  describe(run: SavedRun): string {
    const total = Math.floor(run.elapsedMs / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    const weapon = run.gear && typeof run.gear.id === 'string' ? ` · ${gearTitle(run.gear)}` : '';
    return `Lv ${run.level} · ${mm}:${ss}${weapon}`;
  },
};
