import { STAT_SPECS, type KeystoneId, type Modifier, type StatId } from '@/config';
import type { SkillTag } from '@/weapons/skills';

/**
 * A set of modifiers, read back by stat: what one source (the passive tree,
 * and in time a weapon or a gem) adds up to. A modifier with a tag counts
 * only for a skill that carries it; one without counts for everything.
 */
export class StatSheet {
  public static readonly EMPTY = new StatSheet([], []);

  public readonly mods: readonly Modifier[];
  private readonly keystones: ReadonlySet<KeystoneId>;

  public constructor(mods: readonly Modifier[], keystones: readonly KeystoneId[]) {
    this.mods = mods;
    this.keystones = new Set(keystones);
  }

  /** The raw sum: percent points (12 is 12%) or a count. `tags` are the skill's; none means the survivor's own. */
  public total(stat: StatId, tags?: readonly SkillTag[]): number {
    let sum = 0;
    for (const mod of this.mods) {
      if (mod.stat === stat && (!mod.tag || (tags?.includes(mod.tag) ?? false))) {
        sum += mod.value;
      }
    }
    return sum;
  }

  /** A percent stat as a share: +12% is 0.12, a reduction (받는 피해) negative. */
  public share(stat: StatId, tags?: readonly SkillTag[]): number {
    const sign = STAT_SPECS[stat].sign === '-' ? -1 : 1;
    return (sign * this.total(stat, tags)) / 100;
  }

  /** 1 + the share: what a percent stat multiplies by. Never below zero. */
  public scale(stat: StatId, tags?: readonly SkillTag[]): number {
    return Math.max(0, 1 + this.share(stat, tags));
  }

  public has(keystone: KeystoneId): boolean {
    return this.keystones.has(keystone);
  }
}
