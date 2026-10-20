import Phaser from 'phaser';

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
  /** How far a burst reaches round where it lands, in px (화염구). */
  readonly blastRadius: number;
  /** The chance a strike that kills strikes again (낙뢰). */
  readonly recastChance: number;
  /**
   * Shots beyond the first from a skill that throws, and orbs beyond its own
   * from one that orbits — the weapon's (룬 각인 검). Others ignore it.
   */
  readonly extraProjectiles: number;
  /** Applies damage and resolves the kill (gem and skill drops). */
  readonly hit: (enemy: Enemy, amount: number) => void;
  /** The main skill at SKILL_MASTERY.level: its 각성 effect is on. */
  readonly mastered: boolean;
  /** The main skill at SKILL_MASTERY.second.level: its 2차 각성 is on too. */
  readonly masteredTwice?: boolean;
  /** The enemies' shots in the air, for a skill that can strike them down (타격). */
  readonly enemyShots: Phaser.Physics.Arcade.Group;
  /**
   * The skill went off, toward `targetX` when it has a target — the survivor
   * plays its cast (0.82). Handed only to the main skill.
   */
  readonly onCast?: (targetX?: number) => void;
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
