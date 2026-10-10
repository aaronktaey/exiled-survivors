import Phaser from 'phaser';

import { SPAWN, WORLD } from '@/config';
import { Enemy } from '@/entities/Enemy';

/**
 * Decides when and where enemies appear. Spawns just outside the camera on a
 * ring around the player, and tightens the interval as the run goes on.
 *
 * Enemies are pooled: a kill disables one and the next spawn takes it back,
 * so a long run does not churn sprites and bodies.
 */
export class SpawnDirector {
  public readonly group: Phaser.Physics.Arcade.Group;

  private readonly scene: Phaser.Scene;
  private readonly target: Phaser.GameObjects.Components.Transform;
  private elapsedMs = 0;
  private sinceSpawnMs = 0;

  public constructor(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform) {
    this.scene = scene;
    this.target = target;

    this.group = scene.physics.add.group({ classType: Enemy, runChildUpdate: true });
    // No enemy-vs-enemy collider: Separation nudges the crowd apart instead,
    // which costs a fraction of full collision resolution at these counts.
  }

  public get alive(): number {
    return this.group.countActive(true);
  }

  /** Total sprites held by the pool, alive or waiting. */
  public get pooled(): number {
    return this.group.getLength();
  }

  /** Current gap between spawns, shrinking toward SPAWN.minIntervalMs. */
  public get intervalMs(): number {
    const minutes = this.elapsedMs / 60_000;
    const decay = Math.pow(1 - SPAWN.rampPerMinute, minutes);
    return SPAWN.minIntervalMs + (SPAWN.startIntervalMs - SPAWN.minIntervalMs) * decay;
  }

  public update(delta: number): void {
    this.elapsedMs += delta;
    this.sinceSpawnMs += delta;

    const interval = this.intervalMs;
    // Catch up if a long frame swallowed several spawn windows.
    while (this.sinceSpawnMs >= interval) {
      this.sinceSpawnMs -= interval;
      if (this.alive < SPAWN.maxAlive) {
        this.spawnOne();
      }
    }
  }

  /** Spawns `count` enemies at once, ignoring the usual cadence. */
  public spawnBurst(count: number): number {
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      if (!this.spawnOne()) {
        break;
      }
      spawned++;
    }
    return spawned;
  }

  /** Recycles every live enemy. */
  public clear(): void {
    for (const child of this.group.getChildren()) {
      const enemy = child as Enemy;
      if (enemy.active) {
        enemy.recycle();
      }
    }
  }

  private spawnOne(): boolean {
    const camera = this.scene.cameras.main;
    // Half-diagonal of the view, so the ring clears even the screen corners.
    const radius = Math.hypot(camera.width, camera.height) / 2 + SPAWN.offscreenMargin;
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);

    const x = Phaser.Math.Clamp(this.target.x + Math.cos(angle) * radius, 0, WORLD.width);
    const y = Phaser.Math.Clamp(this.target.y + Math.sin(angle) * radius, 0, WORLD.height);

    const enemy = this.group.get(x, y) as Enemy | null;
    if (!enemy) {
      return false;
    }

    enemy.spawn(x, y, this.target);
    return true;
  }
}
