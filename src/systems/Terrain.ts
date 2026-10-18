import Phaser from 'phaser';

import { COLORS, DEPTH, PLAYER, TERRAIN, WORLD } from '@/config';
import type { Enemy } from '@/entities/Enemy';

/** Points round each outline: enough to read smooth, few enough to test cheaply. */
const SAMPLES = 48;
/** How many places a rock may try before the field is called full. */
const TRIES_PER_ROCK = 40;
/** Never thinner than this share of its size, however the lumps fall. */
const MIN_SHARE = 0.4;

/** One rock: a centre and its outline as a distance at each sample angle. */
export interface Rock {
  readonly x: number;
  readonly y: number;
  readonly radii: readonly number[];
  /** The farthest the outline reaches, for a cheap first test. */
  readonly reach: number;
}

/** Same seed, same field: 불러오기 finds the rocks where they were. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 지형지물: rocks the survivor and every enemy are kept out of.
 *
 * Each outline is star-shaped round its centre (one distance per angle), so
 * "inside" is one comparison and the way out is straight away from the
 * centre — no creases for a body to wedge in. Bodies are pushed out after
 * Arcade has moved them for the frame (`postupdate`), so nothing is ever
 * drawn inside a rock, and an enemy that meets one steps along it toward
 * the survivor's side instead of standing there.
 */
export class Terrain {
  public readonly rocks: Rock[];
  private readonly scene: Phaser.Scene;
  private readonly player: Phaser.Physics.Arcade.Sprite;
  private readonly enemies: Phaser.Physics.Arcade.Group;
  private readonly graphics: Phaser.GameObjects.Graphics;

  public constructor(
    scene: Phaser.Scene,
    seed: number,
    player: Phaser.Physics.Arcade.Sprite,
    enemies: Phaser.Physics.Arcade.Group,
  ) {
    this.scene = scene;
    this.player = player;
    this.enemies = enemies;
    this.rocks = Terrain.layOut(seed, player.x, player.y);
    this.graphics = scene.add.graphics().setDepth(DEPTH.terrain);
    this.draw(seed);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.keepOut, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  public destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.keepOut, this);
    this.graphics.destroy();
  }

  /** A fresh field's seed. */
  public static newSeed(): number {
    return Math.floor(Math.random() * 0x7fffffff);
  }

  /** Where a rock's edge is at this angle round its centre. */
  public static edgeAt(rock: Rock, angle: number): number {
    const turn = Math.PI * 2;
    const at = (((angle % turn) + turn) % turn) / turn * SAMPLES;
    const i = Math.floor(at) % SAMPLES;
    const share = at - Math.floor(at);
    return rock.radii[i]! * (1 - share) + rock.radii[(i + 1) % SAMPLES]! * share;
  }

  /** True when a body this wide at (x, y) would overlap a rock. */
  public blocks(x: number, y: number, radius = 0): boolean {
    return this.rocks.some((rock) => Terrain.depthIn(rock, x, y, radius) > 0);
  }

  /** The nearest open spot to (x, y) for a body this wide: itself, if it is open. */
  public clear(x: number, y: number, radius = 0): [number, number] {
    for (const rock of this.rocks) {
      if (Terrain.depthIn(rock, x, y, radius) > 0) {
        [x, y] = Terrain.outOf(rock, x, y, radius);
      }
    }
    return [x, y];
  }

  /** How far inside a rock's edge (grown by `radius`) a point is; ≤ 0 is outside. */
  private static depthIn(rock: Rock, x: number, y: number, radius: number): number {
    const dx = x - rock.x;
    const dy = y - rock.y;
    const far = rock.reach + radius;
    const distSq = dx * dx + dy * dy;
    if (distSq >= far * far) {
      return 0;
    }
    return Terrain.edgeAt(rock, Math.atan2(dy, dx)) + radius - Math.sqrt(distSq);
  }

  /** The point on the rock's grown edge straight out from its centre through (x, y). */
  private static outOf(rock: Rock, x: number, y: number, radius: number): [number, number] {
    const dx = x - rock.x;
    const dy = y - rock.y;
    const angle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
    const edge = Terrain.edgeAt(rock, angle) + radius;
    return [rock.x + Math.cos(angle) * edge, rock.y + Math.sin(angle) * edge];
  }

  /** Runs once Arcade has moved everything this frame. */
  private keepOut(): void {
    const player = this.player;
    if (player.active) {
      const [x, y] = this.clear(player.x, player.y, PLAYER.size / 2);
      player.x = x;
      player.y = y;
    }

    for (const child of this.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (enemy.active) {
        this.keepEnemyOut(enemy);
      }
    }
  }

  private keepEnemyOut(enemy: Enemy): void {
    const radius = enemy.bodySize / 2;
    for (const rock of this.rocks) {
      const depth = Terrain.depthIn(rock, enemy.x, enemy.y, radius);
      if (depth <= 0) {
        continue;
      }
      let [x, y] = Terrain.outOf(rock, enemy.x, enemy.y, radius);
      // The step the rock stopped goes along its edge instead, round the way
      // that is shorter to where it is headed.
      const goal = enemy.fleeTo ?? this.player;
      const ux = x - rock.x;
      const uy = y - rock.y;
      const side = Math.sign(ux * (goal.y - rock.y) - uy * (goal.x - rock.x)) || 1;
      const length = Math.hypot(ux, uy) || 1;
      const step = depth * TERRAIN.slide;
      x += (-uy / length) * side * step;
      y += (ux / length) * side * step;
      [x, y] = Terrain.outOf(rock, x, y, radius);
      enemy.x = x;
      enemy.y = y;
    }
    // A 도망자 told to run into a rock would walk round it for ever.
    if (enemy.fleeTo && this.blocks(enemy.fleeTo.x, enemy.fleeTo.y, radius)) {
      const [fx, fy] = this.clear(enemy.fleeTo.x, enemy.fleeTo.y, radius);
      enemy.fleeTo.set(fx, fy);
    }
  }

  /**
   * Lays the field: each rock tries spots until one keeps `gap` from every
   * other, from the edge, and `startClear` from where the survivor stands.
   */
  private static layOut(seed: number, startX: number, startY: number): Rock[] {
    const random = seeded(seed);
    const between = (from: number, to: number) => from + (to - from) * random();
    const rocks: Rock[] = [];

    for (let n = 0; n < TERRAIN.count; n++) {
      const radii = Terrain.outline(random);
      const reach = Math.max(...radii);
      const margin = reach + TERRAIN.gap;
      if (margin * 2 >= Math.min(WORLD.width, WORLD.height)) {
        continue;
      }
      for (let tryAt = 0; tryAt < TRIES_PER_ROCK; tryAt++) {
        const x = between(margin, WORLD.width - margin);
        const y = between(margin, WORLD.height - margin);
        const fromStart = Math.hypot(x - startX, y - startY);
        if (fromStart < TERRAIN.startClear + reach) {
          continue;
        }
        const crowded = rocks.some(
          (other) => Math.hypot(x - other.x, y - other.y) < reach + other.reach + TERRAIN.gap,
        );
        if (!crowded) {
          rocks.push({ x, y, radii, reach });
          break;
        }
      }
    }
    return rocks;
  }

  /** One smooth, lumpy outline: an oval turned any way, with a few slow waves on it. */
  private static outline(random: () => number): number[] {
    const size = TERRAIN.minRadius + (TERRAIN.maxRadius - TERRAIN.minRadius) * random();
    const stretch = 1 + (TERRAIN.maxStretch - 1) * random() * random();
    // Area kept: the long side grows as the short one shrinks.
    const long = size * Math.sqrt(stretch);
    const short = size / Math.sqrt(stretch);
    const turn = random() * Math.PI;
    const waves = [2, 3, 4, 5].map((k) => ({
      k,
      amount: (TERRAIN.roughness / (k - 1)) * (0.5 + random() * 0.5),
      phase: random() * Math.PI * 2,
    }));

    const radii: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const angle = (i / SAMPLES) * Math.PI * 2;
      const a = angle - turn;
      const oval = (long * short) / Math.hypot(short * Math.cos(a), long * Math.sin(a));
      const lumps = waves.reduce((sum, w) => sum + w.amount * Math.sin(w.k * angle + w.phase), 0);
      radii.push(Math.max(oval * (1 + lumps), short * MIN_SHARE));
    }
    return radii;
  }

  /** A shadow, the stone, a lit top and rim, and a few flecks on it. */
  private draw(seed: number): void {
    const random = seeded(seed ^ 0x5bd1e995);
    const g = this.graphics;
    const points = (rock: Rock, scale: number, ox: number, oy: number) =>
      rock.radii.map((r, i) => {
        const angle = (i / SAMPLES) * Math.PI * 2;
        return new Phaser.Math.Vector2(
          rock.x + ox + Math.cos(angle) * r * scale,
          rock.y + oy + Math.sin(angle) * r * scale,
        );
      });

    for (const rock of this.rocks) {
      g.fillStyle(COLORS.rockShadow, 0.45);
      g.fillPoints(points(rock, 1, 7, 10), true, true);
    }
    for (const rock of this.rocks) {
      const outline = points(rock, 1, 0, 0);
      g.fillStyle(COLORS.rockBody, 1);
      g.fillPoints(outline, true, true);
      g.fillStyle(COLORS.rockTop, 1);
      g.fillPoints(points(rock, 0.78, -2, -5), true, true);
      g.lineStyle(2, COLORS.rockRim, 1);
      g.strokePoints(outline, true, true);

      g.fillStyle(COLORS.rockFleck, 1);
      const flecks = 2 + Math.floor(random() * 4);
      for (let f = 0; f < flecks; f++) {
        const angle = random() * Math.PI * 2;
        const out = Terrain.edgeAt(rock, angle) * 0.55 * random();
        g.fillCircle(
          rock.x - 2 + Math.cos(angle) * out,
          rock.y - 5 + Math.sin(angle) * out,
          1.5 + random() * 2.5,
        );
      }
    }
  }
}
