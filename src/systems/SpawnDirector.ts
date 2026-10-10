import Phaser from 'phaser';

import { Enemy } from '@/entities/Enemy';
import { SPAWN, WORLD } from '@/config';

/**
 * Decides when and where enemies appear. Spawns just outside the camera on a
 * ring around the player, and tightens the interval as the run goes on.
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

    this.group = scene.physics.add.group({ runChildUpdate: true });
    // Stop packs from stacking into a single point.
    scene.physics.add.collider(this.group, this.group);
  }

  public get alive(): number {
    return this.group.countActive(true);
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

  private spawnOne(): void {
    const camera = this.scene.cameras.main;
    // Half-diagonal of the view, so the ring clears even the screen corners.
    const radius = Math.hypot(camera.width, camera.height) / 2 + SPAWN.offscreenMargin;
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);

    const x = Phaser.Math.Clamp(this.target.x + Math.cos(angle) * radius, 0, WORLD.width);
    const y = Phaser.Math.Clamp(this.target.y + Math.sin(angle) * radius, 0, WORLD.height);

    const enemy = new Enemy(this.scene, x, y);
    enemy.chase(this.target);
    this.group.add(enemy);
  }
}
