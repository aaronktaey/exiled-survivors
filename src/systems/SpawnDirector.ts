import Phaser from 'phaser';

import { ENEMY_KINDS, SPAWN, SPAWN_TABLE, WORLD, type EnemyKind } from '@/config';
import { Enemy, type EnemyHooks } from '@/entities/Enemy';

/**
 * Decides when and where enemies appear. Spawns just outside the camera on a
 * ring around the player, and tightens the interval as the run goes on.
 *
 * Which kind appears is a weighted draw from SPAWN_TABLE, and a kind only
 * joins the draw once the run has reached its unlock time.
 *
 * Enemies are pooled: a kill disables one and the next spawn takes it back,
 * so a long run does not churn sprites and bodies.
 */
export class SpawnDirector {
  public readonly group: Phaser.Physics.Arcade.Group;

  private readonly scene: Phaser.Scene;
  private readonly target: Phaser.GameObjects.Components.Transform;
  private readonly hooks: EnemyHooks;
  private elapsedMs = 0;
  private sinceSpawnMs = 0;

  public constructor(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Components.Transform,
    hooks: EnemyHooks,
  ) {
    this.scene = scene;
    this.target = target;
    this.hooks = hooks;

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

  /** How many of each kind are on the field right now. */
  public get aliveByKind(): Record<EnemyKind, number> {
    const counts = { grunt: 0, brute: 0, runner: 0, shooter: 0 };
    for (const child of this.group.getChildren()) {
      const enemy = child as Enemy;
      if (enemy.active) {
        counts[enemy.kind] += 1;
      }
    }
    return counts;
  }

  /** The kinds the run has reached, in table order. */
  public get unlockedKinds(): readonly EnemyKind[] {
    return SPAWN_TABLE.filter((row) => this.elapsedMs >= row.unlockMs).map((row) => row.kind);
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
  public spawnBurst(count: number, kind?: EnemyKind): number {
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      if (!this.spawnOne(kind)) {
        break;
      }
      spawned++;
    }
    return spawned;
  }

  /** One of every kind, next to the player. Used by the debug keys. */
  public spawnOneOfEach(): number {
    let spawned = 0;
    const kinds = Object.keys(ENEMY_KINDS) as EnemyKind[];
    kinds.forEach((kind, index) => {
      const angle = (index / kinds.length) * Math.PI * 2;
      const x = this.target.x + Math.cos(angle) * 140;
      const y = this.target.y + Math.sin(angle) * 140;
      const enemy = this.group.get(x, y) as Enemy | null;
      if (enemy) {
        enemy.spawn(x, y, this.target, kind, this.hooks);
        spawned++;
      }
    });
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

  /** Weighted draw over whatever the run has unlocked so far. */
  public pickKind(): EnemyKind {
    const open = SPAWN_TABLE.filter((row) => this.elapsedMs >= row.unlockMs);
    const total = open.reduce((sum, row) => sum + row.weight, 0);

    let roll = Math.random() * total;
    for (const row of open) {
      roll -= row.weight;
      if (roll < 0) {
        return row.kind;
      }
    }

    return 'grunt';
  }

  private spawnOne(kind?: EnemyKind): boolean {
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

    enemy.spawn(x, y, this.target, kind ?? this.pickKind(), this.hooks);
    return true;
  }
}
