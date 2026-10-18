import Phaser from 'phaser';

import { DEPTH, TEXTURES, TIMING, type EnemyShotSpec } from '@/config';

/**
 * A bolt thrown by an enemy. Pooled by CombatSystem, which also owns the
 * overlap that lands it on the player.
 */
export class EnemyShot extends Phaser.Physics.Arcade.Image {
  public damage = 0;

  private remainingMs = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.enemyShot);
    this.setDepth(DEPTH.projectiles);
  }

  public fire(x: number, y: number, angle: number, spec: EnemyShotSpec): void {
    this.damage = spec.damage;
    this.remainingMs = spec.lifespanMs;

    this.enableBody(true, x, y, true, true);
    // Pooled: a shot that was a 키메라's thorn last time is a plain bolt now.
    // A picture of its own is drawn at its own size; the plain square is
    // stretched to the shot's (and its body with it, as it always was).
    if (spec.texture) {
      this.setTexture(spec.texture);
      this.setScale(1);
    } else {
      this.setTexture(TEXTURES.enemyShot);
      this.setDisplaySize(spec.size, spec.size);
    }
    this.body?.setSize(spec.size, spec.size, true);
    this.setRotation(angle);
    this.scene.physics.velocityFromRotation(
      angle,
      spec.speed,
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
