/**
 * 전술 교본 (0.147, the user's design): an order of preference for every
 * choice a run puts up — the skills (the first one, and a 무작위 스킬's
 * cards), the upgrades a level-up offers, and the 재능의 파편 — kept between
 * runs and synced with the rest of the records. Each list has its own switch
 * (0.152, the user's ask — one for all of them before): a run takes the first
 * of a switched-on list among what it is offered instead of asking
 * (GameScene, `autoPick`).
 */
import { STORAGE, TALENT_SHARD, type ShardStat } from '@/config';
import { DROPPABLE_SKILLS, SKILLS, type SkillId } from '@/weapons/skills';
import type { UpgradeId } from '@/systems/Progression';

export type AutoPickTab = 'skills' | 'upgrades' | 'shards';

export const AUTO_PICK_TABS: readonly AutoPickTab[] = ['skills', 'upgrades', 'shards'];

/** Which lists choose for the player, list by list (0.152). */
export type AutoPickSwitches = Readonly<Record<AutoPickTab, boolean>>;

/** Every list on, or every list off. */
export function allSwitches(on: boolean): AutoPickSwitches {
  return { skills: on, upgrades: on, shards: on };
}

/**
 * Switches as they were stored or saved: one boolean for every list before
 * 0.152, a record of them since. Anything else is all off.
 */
export function switchesFrom(value: unknown): AutoPickSwitches {
  if (typeof value === 'boolean') {
    return allSwitches(value);
  }
  const record = (value && typeof value === 'object' ? value : {}) as Partial<Record<AutoPickTab, unknown>>;
  return { skills: record.skills === true, upgrades: record.upgrades === true, shards: record.shards === true };
}

export interface AutoPlan {
  /** Which lists a fresh run chooses by. */
  readonly on: AutoPickSwitches;
  readonly skills: readonly SkillId[];
  readonly upgrades: readonly UpgradeId[];
  readonly shards: readonly ShardStat[];
}

/** Every upgrade some skill can take, in the order the skills list them. */
export function allUpgrades(): UpgradeId[] {
  const seen: UpgradeId[] = [];
  for (const skill of DROPPABLE_SKILLS) {
    for (const id of SKILLS[skill.id].upgrades) {
      if (!seen.includes(id)) {
        seen.push(id);
      }
    }
  }
  return seen;
}

/** The order a plan starts in: the tables' own, damage before everything else among the upgrades. */
export function defaultPlan(): AutoPlan {
  const upgrades = allUpgrades();
  return {
    on: allSwitches(false),
    skills: DROPPABLE_SKILLS.map((skill) => skill.id),
    upgrades: ['damage', 'attackSpeed', ...upgrades.filter((id) => id !== 'damage' && id !== 'attackSpeed')].filter((id) =>
      upgrades.includes(id as UpgradeId),
    ) as UpgradeId[],
    shards: [...TALENT_SHARD.stats],
  };
}

/** A stored list kept to what exists, anything new added at the end — a skill added later goes last. */
function settle<T>(stored: unknown, every: readonly T[]): T[] {
  const kept = Array.isArray(stored) ? (stored as T[]).filter((id, i, all) => every.includes(id) && all.indexOf(id) === i) : [];
  return [...kept, ...every.filter((id) => !kept.includes(id))];
}

class AutoPickStore {
  private cached: AutoPlan | null = null;

  public get value(): AutoPlan {
    if (!this.cached) {
      this.cached = this.read();
    }
    return this.cached;
  }

  /** Whether any list chooses for the player. */
  public get enabled(): boolean {
    return AUTO_PICK_TABS.some((tab) => this.value.on[tab]);
  }

  public isOn(tab: AutoPickTab): boolean {
    return this.value.on[tab];
  }

  /** One list's switch. */
  public setOn(tab: AutoPickTab, on: boolean): void {
    this.write({ ...this.value, on: { ...this.value.on, [tab]: on } });
  }

  /** Every list's switch at once (전투 준비's). */
  public setAll(on: boolean): void {
    this.write({ ...this.value, on: allSwitches(on) });
  }

  /** One list, in its new order. */
  public setOrder<K extends AutoPickTab>(tab: K, order: AutoPlan[K]): void {
    this.write({ ...this.value, [tab]: order });
  }

  /** Moves the entry at `index` of a list by `by` places; false when it cannot go further. */
  public move(tab: AutoPickTab, index: number, by: number): boolean {
    const list = [...this.value[tab]] as string[];
    const to = index + by;
    if (index < 0 || index >= list.length || to < 0 || to >= list.length) {
      return false;
    }
    const [item] = list.splice(index, 1);
    list.splice(to, 0, item!);
    this.write({ ...this.value, [tab]: list });
    return true;
  }

  /** A list back in the order it started in. */
  public reset(tab: AutoPickTab): void {
    this.write({ ...this.value, [tab]: defaultPlan()[tab] });
  }

  /** The first of `offered` the plan ranks highest; the first offered when none is ranked. */
  public choose<T extends string>(tab: AutoPickTab, offered: readonly T[]): T | undefined {
    const order = this.value[tab] as readonly string[];
    let best: T | undefined;
    let rank = Infinity;
    for (const id of offered) {
      const at = order.indexOf(id);
      const r = at < 0 ? order.length : at;
      if (r < rank) {
        rank = r;
        best = id;
      }
    }
    return best;
  }

  /** Forget what is held, so the next read comes from storage (a sync wrote it). */
  public reload(): void {
    this.cached = null;
  }

  private read(): AutoPlan {
    const base = defaultPlan();
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE.autoPick) ?? 'null') as (Partial<AutoPlan> & { enabled?: unknown }) | null;
      if (!raw || typeof raw !== 'object') {
        return base;
      }
      return {
        // A plan from before 0.152 had one switch for every list.
        on: raw.on ? switchesFrom(raw.on) : switchesFrom(raw.enabled === true),
        skills: settle(raw.skills, base.skills),
        upgrades: settle(raw.upgrades, base.upgrades),
        shards: settle(raw.shards, base.shards),
      };
    } catch {
      return base;
    }
  }

  private write(plan: AutoPlan): void {
    this.cached = plan;
    try {
      localStorage.setItem(STORAGE.autoPick, JSON.stringify(plan));
    } catch {
      // Private mode: the plan holds for this visit.
    }
  }
}

export const autoPicks = new AutoPickStore();
