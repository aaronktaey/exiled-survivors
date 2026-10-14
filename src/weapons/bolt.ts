import Phaser from 'phaser';

import { COLORS, LIGHTNING } from '@/config';

/** The two strokes a bolt is drawn with: a soft glow under a bright core. */
const STROKES = [
  { width: LIGHTNING.glowWidth, color: COLORS.lightningGlow, alpha: 0.35 },
  { width: LIGHTNING.coreWidth, color: COLORS.lightning, alpha: 1 },
] as const;

/**
 * One zig-zagging bolt from (x1, y1) to (x2, y2), kinked sideways off the
 * straight line. Every lightning skill draws with this, so 연쇄번개's arcs
 * and 낙뢰's strikes read as the same element.
 */
export function drawBolt(
  graphics: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
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
    graphics.lineStyle(stroke.width, stroke.color, stroke.alpha);
    graphics.beginPath();
    graphics.moveTo(points[0]!, points[1]!);
    for (let i = 2; i < points.length; i += 2) {
      graphics.lineTo(points[i]!, points[i + 1]!);
    }
    graphics.strokePath();
  }
}
