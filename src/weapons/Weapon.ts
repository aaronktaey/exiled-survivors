import Phaser from 'phaser';

import { RUNE_REPEAT } from '@/config';
import type { Enemy } from '@/entities/Enemy';
import type { SkillDefinition } from '@/weapons/skills';

/**
 * Contract every weapon follows: it owns its own cooldown and whatever
 * hitboxes it spawns, and the scene just ticks it once per frame.
 */
export interface Weapon {
  readonly definition: SkillDefinition;
  /** Present on weapons that spawn projectiles, so collisions can be wired. */
  readonly projectiles?: Phaser.Physics.Arcade.Group;
  /** Advance the cooldown and fire if it is ready. */
  update(delta: number, context: WeaponContext): void;
  /** Put away whatever it keeps on screen between casts (공허구체's orbs) while it is not being updated. */
  rest?(): void;
}

export interface WeaponContext {
  /** Where attacks originate — normally the player. */
  readonly origin: Phaser.GameObjects.Components.Transform;
  /** Candidate targets. */
  readonly enemies: Phaser.Physics.Arcade.Group;
  /** Damage per hit, from Progression. */
  readonly damage: number;
  /** Milliseconds between attacks, from Progression. */
  readonly cooldownMs: number;
  /** How far the skill reaches, in px, from Progression. */
  readonly range: number;
  /** Projectile travel speed in px/s, from Progression. Melee ignores it. */
  readonly projectileSpeed: number;
  /** Extra enemies an arc jumps to, from Progression. Ignored if it cannot chain. */
  readonly chainCount: number;
  /** Extra enemies a shot passes through, from Progression. 0 stops on contact. */
  readonly pierceCount: number;
  /** Orbs kept in the air, from Progression. Ignored unless the skill orbits. */
  readonly orbCount: number;
  /** How fast those orbs travel, in px per second. */
  readonly orbitSpeed: number;
  /**
   * Shots beyond the first from a skill that throws, and orbs beyond its own
   * from one that orbits — the weapon's (룬 각인 검). Others ignore it.
   */
  readonly extraProjectiles: number;
  /**
   * What the skill's area is multiplied by, as a radius: a swing's reach, a
   * blast, an orb. From the passive tree; 1 (or unset) untouched.
   */
  readonly areaScale?: number;
  /** How long what it leaves behind lasts (냉각, 동결, burning ground), against its own. */
  readonly durationScale?: number;
  /** 반복의 룬: casts after each one that goes off, RUNE_REPEAT.gapMs apart. */
  readonly repeats?: number;
  /** 관통의 룬: what a shot keeps of its damage each time it passes through an enemy. */
  readonly pierceKeep?: number;
  /** Applies damage and resolves the kill (gem and skill drops), booked to this skill. */
  readonly hit: (enemy: Enemy, amount: number) => void;
  /** The skill is at SKILL_MASTERY.level: its 각성 effect is on. */
  readonly mastered: boolean;
  /** The enemies' shots in the air, for a skill that can strike them down (타격). */
  readonly enemyShots: Phaser.Physics.Arcade.Group;
}

/**
 * 반복의 룬's casts still owed after the one that went off, each
 * RUNE_REPEAT.gapMs after the last. Ticked by the weapon's own update, so a
 * held run (a card open, the pause) holds them too. A repeat that finds
 * nothing in reach goes off as nothing.
 */
export class RepeatQueue {
  private owed = 0;
  private untilNextMs = 0;

  /** After a cast: `count` more to come. */
  public schedule(count: number): void {
    if (count > 0) {
      this.owed = count;
      this.untilNextMs = RUNE_REPEAT.gapMs;
    }
  }

  public tick(delta: number, cast: () => void): void {
    if (this.owed <= 0) {
      return;
    }
    this.untilNextMs -= delta;
    while (this.owed > 0 && this.untilNextMs <= 0) {
      this.owed -= 1;
      this.untilNextMs += RUNE_REPEAT.gapMs;
      cast();
    }
  }
}

/**
 * Nearest active enemy within range of a point, or undefined if none is.
 * `exclude` lets a chaining skill skip the enemies it has already hit.
 */
export function findNearestEnemy(
  x: number,
  y: number,
  enemies: Phaser.Physics.Arcade.Group,
  rangePx: number,
  exclude?: ReadonlySet<Enemy>,
): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDistance = rangePx;

  for (const child of enemies.getChildren()) {
    const enemy = child as Enemy;
    if (!enemy.active || exclude?.has(enemy)) {
      continue;
    }

    const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }

  return best;
}

/** Nearest active enemy within range of a game object. */
export function findNearest(
  from: Phaser.GameObjects.Components.Transform,
  enemies: Phaser.Physics.Arcade.Group,
  rangePx: number,
): Enemy | undefined {
  return findNearestEnemy(from.x, from.y, enemies, rangePx);
}
