import Phaser from 'phaser';

import { BALANCE, DEPTH, ENEMY, TEXTURES } from '@/config';

/**
 * A basic chaser: walks straight at its target every frame. Variants with
 * other behaviours get their own files alongside this one.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public hp: number = Math.max(1, Math.round(ENEMY.maxHp * BALANCE.enemyHpScale));

  private readonly speed: number;
  private target?: Phaser.GameObjects.Components.Transform;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.enemy);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(DEPTH.enemies);
    // A little spread so a pack does not move as one rigid blob.
    this.speed = ENEMY.speed * Phaser.Math.FloatBetween(1 - ENEMY.speedVariance, 1 + ENEMY.speedVariance);
  }

  public chase(target: Phaser.GameObjects.Components.Transform): void {
    this.target = target;
  }

  /** Returns true when this hit killed it. */
  public takeDamage(amount: number): boolean {
    this.hp -= amount;

    if (this.hp > 0) {
      // Brief white flash so hits read at a glance.
      this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.scene.time.delayedCall(60, () => this.clearTint());
      return false;
    }

    return true;
  }

  public override update(): void {
    if (!this.target || !this.body) {
      return;
    }

    this.scene.physics.moveTo(this, this.target.x, this.target.y, this.speed);
  }
}
