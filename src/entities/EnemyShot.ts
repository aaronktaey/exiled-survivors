import Phaser from 'phaser';

import { DEPTH, ENEMY_SHOT_FX, TEXTURES, TIMING, type EnemyShotSpec } from '@/config';

/**
 * A bolt thrown by an enemy. Pooled by CombatSystem, which also owns the
 * overlap that lands it on the player.
 */
export class EnemyShot extends Phaser.Physics.Arcade.Image {
  public damage = 0;

  private remainingMs = 0;
  /** The plain bolt spins as it flies; a picture of its own (a thorn) points its way. */
  private spins = false;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.enemyShot);
    this.setDepth(DEPTH.projectiles);
  }

  public fire(x: number, y: number, angle: number, spec: EnemyShotSpec): void {
    this.damage = spec.damage;
    this.remainingMs = spec.lifespanMs;

    this.enableBody(true, x, y, true, true);
    // Pooled: a shot that was a 키메라's thorn last time is a plain bolt now.
    // A picture of its own is drawn at its own size; the plain bolt is shown
    // ENEMY_SHOT_FX.drawnScale × the shot's size (0.99), its body still the
    // shot's size — Arcade scales a body with the sprite, so it is set back.
    this.spins = !spec.texture;
    if (spec.texture) {
      this.setTexture(spec.texture);
      this.setScale(1);
    } else {
      this.setTexture(TEXTURES.enemyShot);
      this.setDisplaySize(spec.size * ENEMY_SHOT_FX.drawnScale, spec.size * ENEMY_SHOT_FX.drawnScale);
    }
    this.body?.setSize(spec.size / this.scaleX, spec.size / this.scaleY, true);
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
    const step = Math.min(delta, TIMING.maxDeltaMs);
    this.remainingMs -= step;
    if (this.spins) {
      this.rotation += (step / 1000) * ENEMY_SHOT_FX.spinPerSecond;
    }
    if (this.remainingMs <= 0) {
      this.despawn();
    }
  }
}
