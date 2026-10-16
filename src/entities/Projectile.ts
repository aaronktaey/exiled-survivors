import Phaser from 'phaser';

import { DEPTH, TEXTURES, TIMING, WEAPON } from '@/config';
import type { Enemy } from '@/entities/Enemy';

/** What a shot needs to know at launch, all of it from the skill's stats. */
export interface LaunchSpec {
  readonly damage: number;
  /** px per second. */
  readonly speed: number;
  /** How far the firing skill reaches, in px. */
  readonly range: number;
  /** Extra enemies it passes through after the first. 0 stops on contact. */
  readonly pierce: number;
  /** 냉각 applied to whatever it hits, in ms. 0 for none. */
  readonly chillMs: number;
  /** Bursts where it lands, hurting everything this close too. 0 for none. */
  readonly blastRadius?: number;
  /** 화염구 각성: the burst leaves the ground burning at this much a second. */
  readonly fireZoneDps?: number;
  /** 얼음창 각성: an enemy already under 냉각 is frozen this long. */
  readonly freezeMs?: number;
  readonly texture: string;
  /** Drawn size. Width runs along the flight path. */
  readonly width: number;
  readonly height: number;
}

/**
 * A single shot. Pooled by the weapon's group, so instances are reused
 * rather than allocated every cooldown.
 */
export class Projectile extends Phaser.Physics.Arcade.Image {
  public damage = 0;
  /** 냉각 this shot leaves on contact, in ms. */
  public chillMs = 0;
  /** How far its burst reaches from the first hit. 0 for none. */
  public blastRadius = 0;
  /** What the burst leaves burning a second. 0 for none. */
  public fireZoneDps = 0;
  /** How long a chilled enemy it strikes is frozen. 0 for none. */
  public freezeMs = 0;

  private remainingMs = 0;
  /** Enemies left to pass through before it fizzles. */
  private pierceLeft = 0;
  /** Already hit by this shot, so an overlap cannot damage twice. */
  private readonly struck = new Set<Enemy>();

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.projectile);
    this.setDepth(DEPTH.projectiles);
  }

  public launch(x: number, y: number, angle: number, spec: LaunchSpec): void {
    this.damage = spec.damage;
    this.chillMs = spec.chillMs;
    this.blastRadius = spec.blastRadius ?? 0;
    this.fireZoneDps = spec.fireZoneDps ?? 0;
    this.freezeMs = spec.freezeMs ?? 0;
    this.pierceLeft = Math.max(0, Math.round(spec.pierce));
    this.struck.clear();

    // Fizzle at the edge of the skill's range (plus a little overshoot), so a
    // shorter range really is shorter instead of just a smaller target radius.
    const travelMs = ((spec.range * WEAPON.rangeOvershoot) / spec.speed) * 1000;
    this.remainingMs = Math.min(WEAPON.lifespanMs, travelMs);

    this.setTexture(spec.texture);
    this.enableBody(true, x, y, true, true);
    this.setDisplaySize(spec.width, spec.height);
    this.body?.setSize(spec.width, spec.height, true);
    // Point the shot along its flight path.
    this.setRotation(angle);
    this.scene.physics.velocityFromRotation(
      angle,
      spec.speed,
      (this.body as Phaser.Physics.Arcade.Body).velocity,
    );
  }

  /**
   * Books a hit on an enemy. False means this shot has already damaged it —
   * a piercing shot overlaps the same body for several frames on its way
   * through, and only the first of those frames should count.
   */
  public registerHit(enemy: Enemy): boolean {
    if (this.struck.has(enemy)) {
      return false;
    }

    this.struck.add(enemy);
    return true;
  }

  /** Spends one pierce. False means the shot is used up and should stop. */
  public consumePierce(): boolean {
    if (this.pierceLeft <= 0) {
      return false;
    }

    this.pierceLeft -= 1;
    return true;
  }

  public despawn(): void {
    this.struck.clear();
    this.disableBody(true, true);
  }

  public override update(_time: number, delta: number): void {
    this.remainingMs -= Math.min(delta, TIMING.maxDeltaMs);
    if (this.remainingMs <= 0) {
      this.despawn();
    }
  }
}
