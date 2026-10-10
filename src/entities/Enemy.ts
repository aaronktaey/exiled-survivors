import Phaser from 'phaser';

import { BALANCE, DEPTH, ENEMY, TEXTURES, TIMING } from '@/config';

/**
 * A basic chaser: walks straight at its target every frame. Variants with
 * other behaviours get their own files alongside this one.
 *
 * Pooled by SpawnDirector's group, so a kill disables it rather than
 * destroying it and `spawn` is what actually starts a life.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public hp = 0;

  private speed: number = ENEMY.speed;
  private target?: Phaser.GameObjects.Components.Transform;
  /** Countdown on the white hit flash, ticked in update. */
  private flashMs = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.enemy);
    this.setDepth(DEPTH.enemies);
  }

  /** (Re)starts this enemy at a position. Safe to call on a recycled one. */
  public spawn(x: number, y: number, target: Phaser.GameObjects.Components.Transform): void {
    this.target = target;
    this.hp = Math.max(1, Math.round(ENEMY.maxHp * BALANCE.enemyHpScale));
    this.flashMs = 0;
    this.clearTint();

    // A little spread so a pack does not move as one rigid blob.
    this.speed = ENEMY.speed * Phaser.Math.FloatBetween(1 - ENEMY.speedVariance, 1 + ENEMY.speedVariance);

    this.enableBody(true, x, y, true, true);
    this.setVelocity(0, 0);
  }

  /** Returns it to the pool without destroying it. */
  public recycle(): void {
    this.target = undefined;
    this.clearTint();
    this.disableBody(true, true);
  }

  /** Returns true when this hit killed it. */
  public takeDamage(amount: number): boolean {
    this.hp -= amount;

    if (this.hp > 0) {
      // Flash timed in update rather than a per-hit delayedCall, which would
      // allocate a timer for every single hit.
      this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.flashMs = 60;
      return false;
    }

    return true;
  }

  public override update(_time: number, delta: number): void {
    if (!this.active) {
      return;
    }

    if (this.flashMs > 0) {
      this.flashMs -= Math.min(delta, TIMING.maxDeltaMs);
      if (this.flashMs <= 0) {
        this.clearTint();
      }
    }

    if (!this.target || !this.body) {
      return;
    }

    this.scene.physics.moveTo(this, this.target.x, this.target.y, this.speed);
  }
}
