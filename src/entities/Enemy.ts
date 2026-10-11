import Phaser from 'phaser';

import { BALANCE, CHILL, DEPTH, ENEMY, TEXTURES, TIMING } from '@/config';

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
  /** Countdown on the 냉각 debuff, ticked in update. */
  private chillMs = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.enemy);
    this.setDepth(DEPTH.enemies);
  }

  /** (Re)starts this enemy at a position. Safe to call on a recycled one. */
  public spawn(x: number, y: number, target: Phaser.GameObjects.Components.Transform): void {
    this.target = target;
    this.hp = Math.max(1, Math.round(ENEMY.maxHp * BALANCE.enemyHpScale));
    this.flashMs = 0;
    this.chillMs = 0;
    this.clearTint();

    // A little spread so a pack does not move as one rigid blob.
    this.speed = ENEMY.speed * Phaser.Math.FloatBetween(1 - ENEMY.speedVariance, 1 + ENEMY.speedVariance);

    this.enableBody(true, x, y, true, true);
    this.setVelocity(0, 0);
  }

  /** Returns it to the pool without destroying it. */
  public recycle(): void {
    this.target = undefined;
    this.chillMs = 0;
    this.clearTint();
    this.disableBody(true, true);
  }

  /** True while 냉각 is slowing it down. */
  public get isChilled(): boolean {
    return this.chillMs > 0;
  }

  /** Current move speed, after 냉각. */
  public get currentSpeed(): number {
    return this.isChilled ? this.speed * (1 - CHILL.slowFactor) : this.speed;
  }

  /**
   * Applies 냉각. Re-applying refreshes the timer rather than stacking the
   * slow, so a shot through a crowd does not freeze it solid.
   */
  public chill(durationMs: number = CHILL.durationMs): void {
    if (!this.active) {
      return;
    }

    this.chillMs = Math.max(this.chillMs, durationMs);
    this.applyTint();
  }

  /** Returns true when this hit killed it. */
  public takeDamage(amount: number): boolean {
    this.hp -= amount;

    if (this.hp > 0) {
      // Flash timed in update rather than a per-hit delayedCall, which would
      // allocate a timer for every single hit.
      this.flashMs = 60;
      this.applyTint();
      return false;
    }

    return true;
  }

  public override update(_time: number, delta: number): void {
    if (!this.active) {
      return;
    }

    const dt = Math.min(delta, TIMING.maxDeltaMs);

    if (this.flashMs > 0) {
      this.flashMs -= dt;
      if (this.flashMs <= 0) {
        this.applyTint();
      }
    }

    if (this.chillMs > 0) {
      this.chillMs -= dt;
      if (this.chillMs <= 0) {
        this.applyTint();
      }
    }

    if (!this.target || !this.body) {
      return;
    }

    this.scene.physics.moveTo(this, this.target.x, this.target.y, this.currentSpeed);
  }

  /** The hit flash wins while it lasts, then 냉각 shows through under it. */
  private applyTint(): void {
    if (this.flashMs > 0) {
      this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      return;
    }

    if (this.chillMs > 0) {
      // FILL, not MULTIPLY: multiplying ice blue into a red enemy just
      // muddies it, while a flat frost colour reads at a glance.
      this.setTint(CHILL.tint).setTintMode(Phaser.TintModes.FILL);
      return;
    }

    this.clearTint();
  }
}
