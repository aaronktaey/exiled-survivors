import Phaser from 'phaser';

import {
  BALANCE,
  CHILL,
  DEPTH,
  ENEMY,
  ENEMY_KINDS,
  TEXTURES,
  TIMING,
  type EnemyKind,
  type EnemyShotSpec,
} from '@/config';

/** What an enemy needs from the world around it. */
export interface EnemyHooks {
  /** Fires one enemy shot. Only the kinds that shoot ever call it. */
  readonly fireShot: (x: number, y: number, angle: number, spec: EnemyShotSpec) => void;
}

/**
 * A chaser. Which chaser it is comes from its kind: ENEMY_KINDS holds the
 * health, speed, size and reward of every variant, so a new enemy is an
 * entry in that table rather than a subclass. The one behavioural branch is
 * the kinds that shoot — they stop at their standoff and open fire instead
 * of walking into the player.
 *
 * Pooled by SpawnDirector's group, so a kill disables it rather than
 * destroying it and `spawn` is what actually starts a life.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public hp = 0;
  public kind: EnemyKind = 'grunt';

  private spec = ENEMY_KINDS.grunt;
  private speed: number = ENEMY.speed;
  private target?: Phaser.GameObjects.Components.Transform;
  private hooks?: EnemyHooks;
  /** Countdown on the white hit flash, ticked in update. */
  private flashMs = 0;
  /** Countdown on the 냉각 debuff, ticked in update. */
  private chillMs = 0;
  /** Countdown to the next shot, for the kinds that have one. */
  private shotCooldownMs = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.enemy);
    this.setDepth(DEPTH.enemies);
  }

  /** Contact damage this kind deals to the player. */
  public get contactDamage(): number {
    return this.spec.contactDamage;
  }

  /** XP its gem is worth. */
  public get xpValue(): number {
    return this.spec.xp;
  }

  public get kindName(): string {
    return this.spec.name;
  }

  /** True while 냉각 is slowing it down. */
  public get isChilled(): boolean {
    return this.chillMs > 0;
  }

  /** Current move speed, after 냉각. */
  public get currentSpeed(): number {
    return this.isChilled ? this.speed * (1 - CHILL.slowFactor) : this.speed;
  }

  /** (Re)starts this enemy at a position. Safe to call on a recycled one. */
  public spawn(
    x: number,
    y: number,
    target: Phaser.GameObjects.Components.Transform,
    kind: EnemyKind = 'grunt',
    hooks?: EnemyHooks,
  ): void {
    const spec = ENEMY_KINDS[kind];
    this.kind = kind;
    this.spec = spec;
    this.hooks = hooks;
    this.target = target;
    this.hp = Math.max(1, Math.round(spec.maxHp * BALANCE.enemyHpScale));
    this.flashMs = 0;
    this.chillMs = 0;
    this.clearTint();

    // A little spread so a pack does not move as one rigid blob.
    this.speed = spec.speed * Phaser.Math.FloatBetween(1 - ENEMY.speedVariance, 1 + ENEMY.speedVariance);
    // Stagger the first shot, or a wave of shooters fires in one volley.
    this.shotCooldownMs = spec.shot ? Phaser.Math.Between(0, spec.shot.cooldownMs) : 0;

    this.setTexture(spec.texture);
    this.enableBody(true, x, y, true, true);
    this.body?.setSize(spec.size, spec.size, true);
    this.setVelocity(0, 0);
  }

  /** Returns it to the pool without destroying it. */
  public recycle(): void {
    this.target = undefined;
    this.hooks = undefined;
    this.chillMs = 0;
    this.clearTint();
    this.disableBody(true, true);
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

    const distance = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);

    if (this.spec.shot && this.fightAtRange(dt, distance, this.spec.shot)) {
      return;
    }

    this.scene.physics.moveTo(this, this.target.x, this.target.y, this.currentSpeed);
  }

  /**
   * Shoots when the player is in range. Returns true once inside the
   * standoff, where it holds position instead of closing further.
   */
  private fightAtRange(delta: number, distance: number, shot: EnemyShotSpec): boolean {
    this.shotCooldownMs -= delta;

    if (distance <= shot.range && this.shotCooldownMs <= 0 && this.target) {
      this.shotCooldownMs = shot.cooldownMs;
      const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
      this.hooks?.fireShot(this.x, this.y, angle, shot);
    }

    if (distance > shot.standoff) {
      return false;
    }

    this.setVelocity(0, 0);
    return true;
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
