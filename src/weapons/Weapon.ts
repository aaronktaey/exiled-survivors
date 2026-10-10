import Phaser from 'phaser';

/**
 * Contract every weapon follows: it owns its own cooldown and whatever
 * hitboxes it spawns, and the scene just ticks it once per frame.
 */
export interface Weapon {
  /** Advance the cooldown and fire if it is ready. */
  update(delta: number, context: WeaponContext): void;
}

export interface WeaponContext {
  /** Where shots originate — normally the player. */
  readonly origin: Phaser.GameObjects.Components.Transform;
  /** Candidate targets to aim at. */
  readonly enemies: Phaser.Physics.Arcade.Group;
  /** Damage per hit, from Progression. */
  readonly damage: number;
  /** Milliseconds between shots, from Progression. */
  readonly cooldownMs: number;
}

/** Nearest active enemy within range, or undefined if the field is clear. */
export function findNearest(
  from: Phaser.GameObjects.Components.Transform,
  enemies: Phaser.Physics.Arcade.Group,
  rangePx: number,
): Phaser.GameObjects.Components.Transform | undefined {
  let best: Phaser.GameObjects.Components.Transform | undefined;
  let bestDistance = rangePx;

  for (const child of enemies.getChildren()) {
    const enemy = child as Phaser.Physics.Arcade.Sprite;
    if (!enemy.active) {
      continue;
    }

    const distance = Phaser.Math.Distance.Between(from.x, from.y, enemy.x, enemy.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }

  return best;
}
