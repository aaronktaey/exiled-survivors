import Phaser from 'phaser';

import { COLORS, DEPTH, LIGHTNING } from '@/config';
import type { Enemy } from '@/entities/Enemy';
import { SKILLS } from '@/weapons/skills';
import { findNearestEnemy, type Weapon, type WeaponContext } from '@/weapons/Weapon';

/** The two strokes a bolt is drawn with: a soft glow under a bright core. */
const STROKES = [
  { width: LIGHTNING.glowWidth, color: COLORS.lightningGlow, alpha: 0.35 },
  { width: LIGHTNING.coreWidth, color: COLORS.lightning, alpha: 1 },
] as const;

/**
 * Drop-only skill: an instant arc that strikes the nearest enemy and then
 * jumps from victim to victim, never hitting the same one twice. There is no
 * projectile — the damage lands the moment it is cast.
 * Tags: 주문 · 번개 · 연쇄.
 */
export class ChainLightning implements Weapon {
  public readonly definition = SKILLS.chainLightning;

  private readonly scene: Phaser.Scene;
  private readonly bolt: Phaser.GameObjects.Graphics;
  private sinceCastMs = 0;
  /** Victims of the current cast, so the arc cannot double back. */
  private readonly struck = new Set<Enemy>();

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bolt = scene.add.graphics().setDepth(DEPTH.vfx).setAlpha(0);
  }

  public update(delta: number, context: WeaponContext): void {
    this.sinceCastMs += delta;
    if (this.sinceCastMs < context.cooldownMs) {
      return;
    }

    const first = findNearestEnemy(context.origin.x, context.origin.y, context.enemies, context.range);
    if (!first) {
      // Hold the charge so the first enemy to wander in is struck at once.
      this.sinceCastMs = context.cooldownMs;
      return;
    }

    this.sinceCastMs = 0;
    this.strike(context, first);
  }

  /**
   * Walks the arc through the crowd, damaging each link as it goes. Every
   * jump starts from where the last victim stood, so the chain spreads
   * outward rather than fanning out from the player.
   */
  private strike(context: WeaponContext, first: Enemy): void {
    // Flat x, y pairs: the player, then each enemy the arc reaches.
    const path = [context.origin.x, context.origin.y];
    this.struck.clear();

    // chainCount is how many *extra* enemies the arc reaches after the first.
    const links = 1 + Math.max(0, Math.round(context.chainCount));
    let target: Enemy | undefined = first;

    for (let i = 0; i < links && target; i++) {
      // Read the position before the hit: a kill recycles the sprite.
      const { x, y } = target;
      path.push(x, y);
      this.struck.add(target);
      context.hit(target, context.damage);

      target = findNearestEnemy(x, y, context.enemies, LIGHTNING.chainRadius, this.struck);
    }

    this.showBolt(path);
  }

  private showBolt(path: readonly number[]): void {
    this.bolt.clear();
    for (let i = 0; i + 3 < path.length; i += 2) {
      this.drawLink(path[i]!, path[i + 1]!, path[i + 2]!, path[i + 3]!);
    }

    this.scene.tweens.killTweensOf(this.bolt);
    this.bolt.setAlpha(1);
    this.scene.tweens.add({ targets: this.bolt, alpha: 0, duration: LIGHTNING.flashMs });
  }

  /** One zig-zagging link, kinked sideways off the straight line. */
  private drawLink(x1: number, y1: number, x2: number, y2: number): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    // Unit normal, so a kink of `jitter` px is `jitter` px whatever the span.
    const nx = -dy / length;
    const ny = dx / length;

    const points = [x1, y1];
    for (let i = 1; i < LIGHTNING.segments; i++) {
      const t = i / LIGHTNING.segments;
      const kink = Phaser.Math.FloatBetween(-LIGHTNING.jitter, LIGHTNING.jitter);
      points.push(x1 + dx * t + nx * kink, y1 + dy * t + ny * kink);
    }
    points.push(x2, y2);

    for (const stroke of STROKES) {
      this.bolt.lineStyle(stroke.width, stroke.color, stroke.alpha);
      this.bolt.beginPath();
      this.bolt.moveTo(points[0]!, points[1]!);
      for (let i = 2; i < points.length; i += 2) {
        this.bolt.lineTo(points[i]!, points[i + 1]!);
      }
      this.bolt.strokePath();
    }
  }
}
