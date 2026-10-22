import Phaser from 'phaser';

import { AFFIX_TIMING, DEPTH, DRONE, SKILL_MASTERY, TEXTURES } from '@/config';
import type { Enemy } from '@/entities/Enemy';
import { sfx } from '@/systems/Sfx';
import { SKILLS } from '@/weapons/skills';
import type { Weapon, WeaponContext } from '@/weapons/Weapon';

const TAU = Math.PI * 2;

/** What one drone is doing. */
interface DroneState {
  readonly view: Phaser.GameObjects.Image;
  /** The enemy it holds, and that enemy's life count when it took it. */
  target?: Enemy;
  life: number;
  /** When it may fire again, on the weapon's own clock. */
  readyAt: number;
  /** Its last shot was a 반복's: the next waits out the whole cooldown. */
  repeated: boolean;
  /** Shots fired, for the 각성's bomb. */
  shots: number;
  /** It has been put by the survivor once (a new one does not start at the world's corner). */
  placed: boolean;
}

/**
 * 드론 (0.94 trial, the user's design): little robots that take the enemies
 * that come within `range` of the survivor — the nearest no other drone has,
 * or the nearest at all once every one is taken — fly to them, hover just off
 * them, and shoot each cooldown until the enemy dies or strays past the range.
 * A drone with nothing to shoot circles the survivor.
 *
 * No more than DRONE.perEnemy on one enemy: with enemies fewer than drones
 * the rest circle the survivor.
 *
 * 각성: every SKILL_MASTERY.droneBomb.every-th shot of a drone drops a bomb.
 * 2차 각성: SKILL_MASTERY.second.droneTimes as many drones.
 */
export class Drone implements Weapon {
  public readonly definition = SKILLS.drone;

  private readonly scene: Phaser.Scene;
  /** The drones, in the air or hidden. Public for tests. */
  public readonly drones: DroneState[] = [];
  private readonly tracers: { x1: number; y1: number; x2: number; y2: number; leftMs: number }[] = [];
  private readonly lines: Phaser.GameObjects.Graphics;
  private elapsedMs = 0;
  private spin = 0;
  /** Bombs so far, for tests. */
  public bombs = 0;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.lines = scene.add.graphics().setDepth(DEPTH.vfx);
  }

  public update(delta: number, context: WeaponContext): void {
    this.elapsedMs += delta;
    this.spin = Phaser.Math.Angle.Wrap(this.spin + (delta / 1000) * 1.6);
    const times = context.masteredTwice ? SKILL_MASTERY.second.droneTimes : 1;
    const count = Math.max(1, Math.round(((context.droneCount ?? 1) + (context.extraProjectiles ?? 0)) * times));
    this.sync(count);

    const { x, y } = context.origin;
    const reach = Math.max(1, context.range) * (context.areaScale ?? 1);
    const fly = DRONE.flySpeed * (delta / 1000);

    // Who keeps what they hold: alive, the same life, still within reach,
    // and no more than DRONE.perEnemy on it.
    const taken = new Set<Enemy>();
    const onIt = new Map<Enemy, number>();
    for (let i = 0; i < count; i++) {
      const drone = this.drones[i]!;
      const t = drone.target;
      if (t && (!t.active || t.lives !== drone.life || Phaser.Math.Distance.Between(x, y, t.x, t.y) > reach || (onIt.get(t) ?? 0) >= DRONE.perEnemy)) {
        drone.target = undefined;
      } else if (t) {
        taken.add(t);
        onIt.set(t, (onIt.get(t) ?? 0) + 1);
      }
    }

    // Doubled up while another enemy in reach has no drone: the second and
    // later ones on an enemy go to it, so they gather only when enemies are
    // fewer than drones (the user's ask — they bunched up on the first one).
    const holders = new Map<Enemy, number[]>();
    for (let i = 0; i < count; i++) {
      const t = this.drones[i]!.target;
      if (t) {
        holders.set(t, [...(holders.get(t) ?? []), i]);
      }
    }
    for (const indices of holders.values()) {
      for (const i of indices.slice(1)) {
        const drone = this.drones[i]!;
        const free = this.nearest(context, drone.view.x, drone.view.y, reach, taken, x, y);
        if (!free) {
          break;
        }
        onIt.set(drone.target!, (onIt.get(drone.target!) ?? 1) - 1);
        drone.target = free;
        drone.life = free.lives;
        taken.add(free);
        onIt.set(free, 1);
      }
    }

    for (let i = 0; i < count; i++) {
      const drone = this.drones[i]!;
      const home = this.spin + (i / count) * TAU;
      if (!drone.placed) {
        drone.view.setPosition(x + Math.cos(home) * DRONE.idleRadius, y + Math.sin(home) * DRONE.idleRadius);
        drone.placed = true;
      }
      if (!drone.target) {
        // One no drone has; or, every one taken, one not yet at DRONE.perEnemy.
        const full = new Set([...onIt].filter(([, n]) => n >= DRONE.perEnemy).map(([enemy]) => enemy));
        const pick = this.nearest(context, x, y, reach, taken) ?? this.nearest(context, x, y, reach, full);
        if (pick) {
          drone.target = pick;
          drone.life = pick.lives;
          taken.add(pick);
          onIt.set(pick, (onIt.get(pick) ?? 0) + 1);
          context.onCast?.(pick.x);
        }
      }

      // Where it is going: just off its enemy, or its place round the survivor.
      const t = drone.target;
      let tx = x + Math.cos(home) * DRONE.idleRadius;
      let ty = y + Math.sin(home) * DRONE.idleRadius;
      if (t) {
        const off = t.shownRadius + DRONE.hover;
        const a = this.spin * 0.5 + (i / count) * TAU;
        tx = t.x + Math.cos(a) * off;
        ty = t.y + Math.sin(a) * off;
      }
      const dist = Phaser.Math.Distance.Between(drone.view.x, drone.view.y, tx, ty);
      if (dist <= fly) {
        drone.view.setPosition(tx, ty);
      } else {
        drone.view.setPosition(drone.view.x + ((tx - drone.view.x) / dist) * fly, drone.view.y + ((ty - drone.view.y) / dist) * fly);
      }
      drone.view.setFlipX(t ? t.x < drone.view.x : false);

      // In range of its enemy: a shot each cooldown (반복 as every skill has it).
      if (t && Phaser.Math.Distance.Between(drone.view.x, drone.view.y, t.x, t.y) <= t.shownRadius + DRONE.hover * 2 && this.elapsedMs >= drone.readyAt) {
        const again = !drone.repeated && Math.random() < (context.repeatChance ?? 0);
        drone.readyAt = this.elapsedMs + (again ? Math.min(AFFIX_TIMING.repeatDelayMs, context.cooldownMs / 2) : context.cooldownMs);
        drone.repeated = again;
        drone.shots += 1;
        const tx2 = t.x;
        const ty2 = t.y;
        this.tracers.push({ x1: drone.view.x, y1: drone.view.y, x2: tx2, y2: ty2, leftMs: DRONE.tracerMs });
        context.hit(t, context.damage);
        sfx.playSkill(this.scene, this.definition.id);
        // 각성: every so many shots, a bomb where that enemy stood.
        const bomb = SKILL_MASTERY.droneBomb;
        if (context.mastered && drone.shots % bomb.every === 0) {
          this.burst(context, tx2, ty2, bomb.radius * (context.areaScale ?? 1), context.damage * bomb.damageShare, 0xffb347);
          this.bombs += 1;
        }
      }
    }

    this.drawTracers(delta);
  }

  /** Grows or hides the drones so exactly `count` fly. */
  private sync(count: number): void {
    while (this.drones.length < count) {
      this.drones.push({
        view: this.scene.add.image(0, 0, TEXTURES.drone).setDepth(DEPTH.projectiles).setDisplaySize(DRONE.size, DRONE.size),
        life: -1,
        readyAt: 0,
        repeated: false,
        shots: 0,
        placed: false,
      });
    }
    this.drones.forEach((drone, i) => {
      const on = i < count;
      drone.view.setVisible(on);
      if (!on) {
        drone.target = undefined;
        drone.placed = false;
      }
    });
  }

  /**
   * The nearest active enemy to (x, y), skipping `taken`, among those within
   * `reach` of the survivor at (ox, oy) — (x, y) itself when not given.
   */
  private nearest(
    context: WeaponContext,
    x: number,
    y: number,
    reach: number,
    taken?: ReadonlySet<Enemy>,
    ox = x,
    oy = y,
  ): Enemy | undefined {
    let best: Enemy | undefined;
    let bestDist = Infinity;
    for (const child of context.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active || taken?.has(enemy) || Phaser.Math.Distance.Between(ox, oy, enemy.x, enemy.y) > reach) {
        continue;
      }
      const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    return best;
  }

  /** Hurts every enemy within `radius` of (x, y), with a ring to say where. */
  private burst(context: WeaponContext, x: number, y: number, radius: number, damage: number, color: number): void {
    for (const child of [...context.enemies.getChildren()]) {
      const enemy = child as Enemy;
      if (enemy.active && Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= radius + enemy.shownRadius) {
        context.hit(enemy, damage);
      }
    }
    const ring = this.scene.add.circle(x, y, radius, color, 0.25).setStrokeStyle(3, color, 0.9).setDepth(DEPTH.vfx).setScale(0.4);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 320, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
  }

  /** Each shot's thin line from the drone to what it hit, fading fast. */
  private drawTracers(delta: number): void {
    this.lines.clear();
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]!;
      tr.leftMs -= delta;
      if (tr.leftMs <= 0) {
        this.tracers.splice(i, 1);
        continue;
      }
      this.lines.lineStyle(2, 0xfff2a8, tr.leftMs / DRONE.tracerMs);
      this.lines.lineBetween(tr.x1, tr.y1, tr.x2, tr.y2);
    }
  }
}
