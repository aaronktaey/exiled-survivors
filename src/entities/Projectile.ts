import Phaser from 'phaser';

import { DEPTH, ICONS, TEXTURES, TIMING, WEAPON } from '@/config';

/**
 * A single shot. Pooled by the weapon's group, so instances are reused
 * rather than allocated every cooldown.
 */
/** What a shot needs to know at launch, all of it from the skill's stats. */
export interface LaunchSpec {
  readonly damage: number;
  /** px per second. */
  readonly speed: number;
  /** How far the firing skill reaches, in px. */
  readonly range: number;
}

export class Projectile extends Phaser.Physics.Arcade.Image {
  public damage = 0;
  private remainingMs = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.projectile);
    this.setDepth(DEPTH.projectiles);
    this.setDisplaySize(ICONS.projectile.size, ICONS.projectile.size);
  }

  public launch(x: number, y: number, angle: number, spec: LaunchSpec): void {
    this.damage = spec.damage;
    // Fizzle at the edge of the skill's range (plus a little overshoot), so a
    // shorter range really is shorter instead of just a smaller target radius.
    const travelMs = ((spec.range * WEAPON.rangeOvershoot) / spec.speed) * 1000;
    this.remainingMs = Math.min(WEAPON.lifespanMs, travelMs);

    this.enableBody(true, x, y, true, true);
    this.setDisplaySize(ICONS.projectile.size, ICONS.projectile.size);
    this.body?.setSize(ICONS.projectile.size, ICONS.projectile.size, true);
    // Point the flame along its flight path.
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
