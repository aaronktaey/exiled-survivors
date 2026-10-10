import Phaser from 'phaser';

import { DEPTH, TEXTURES, TIMING, WEAPON } from '@/config';

/**
 * A single shot. Pooled by the weapon's group, so instances are reused
 * rather than allocated every cooldown.
 */
export class Projectile extends Phaser.Physics.Arcade.Image {
  public damage = 0;
  private remainingMs = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.projectile);
    this.setDepth(DEPTH.projectiles);
  }

  public launch(x: number, y: number, angle: number, damage: number): void {
    this.damage = damage;
    this.remainingMs = WEAPON.lifespanMs;

    this.enableBody(true, x, y, true, true);
    this.scene.physics.velocityFromRotation(
      angle,
      WEAPON.projectileSpeed,
      (this.body as Phaser.Physics.Arcade.Body).velocity,
    );
  }

  public despawn(): void {
    this.disableBody(true, true);
  }

  public override update(_time: number, delta: number): void {
    this.remainingMs -= Math.min(delta, TIMING.maxDeltaMs);
    if (this.remainingMs <= 0) {
      this.despawn();
    }
  }
}
