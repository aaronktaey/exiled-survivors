import Phaser from 'phaser';

import { CELEBRATE, DEPTH, TEXTURES } from '@/config';

/**
 * 도파민 (0.127, the user's ask): what a good moment looks like — sparkles
 * flying out and a glow that swells and fades. (0.127 threw gold coins too;
 * the user found them odd, and they went in 0.128.)
 * Every piece is a short-lived Image on a tween, nothing pooled and nothing
 * left behind; the numbers are CELEBRATE's (visuals.ts). Moments that come
 * round again and again (an upgrade picked, a 합성, a 구슬) use the `quick`
 * sizes, which are over in a blink.
 */

interface At {
  readonly x: number;
  readonly y: number;
  /** Over the run's world (depth among the vfx) or over a screen (above its ui). */
  readonly depth?: number;
}

/** Sparkles flying out from a point in a ring, shrinking as they go. */
export function sparkleBurst(
  scene: Phaser.Scene,
  at: At,
  color: number = CELEBRATE.sparkles.color,
  quick = false,
  big = false,
): void {
  const spec = quick ? CELEBRATE.quick : big ? CELEBRATE.big : CELEBRATE.sparkles;
  for (let i = 0; i < spec.count; i++) {
    const angle = (i / spec.count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
    const reach = spec.radius * Phaser.Math.FloatBetween(0.6, 1);
    const star = scene.add
      .image(at.x, at.y, TEXTURES.sparkle)
      .setDisplaySize(spec.size, spec.size)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(at.depth ?? DEPTH.vfx + 2);
    scene.tweens.add({
      targets: star,
      x: at.x + Math.cos(angle) * reach,
      y: at.y + Math.sin(angle) * reach,
      scale: 0,
      angle: 180,
      duration: spec.lifeMs * Phaser.Math.FloatBetween(0.8, 1.1),
      ease: 'Quad.easeOut',
      onComplete: () => star.destroy(),
    });
  }
}

/** A glow that swells out of a point and fades. */
export function glowPulse(scene: Phaser.Scene, at: At, color: number, size: number, quick = false): void {
  const glow = scene.add
    .image(at.x, at.y, TEXTURES.glow)
    .setDisplaySize(size, size)
    .setTint(color)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(at.depth ?? DEPTH.vfx + 1);
  scene.tweens.add({
    targets: glow,
    scale: glow.scale * 2.2,
    alpha: 0,
    duration: quick ? CELEBRATE.quick.lifeMs : CELEBRATE.glowMs,
    ease: 'Quad.easeOut',
    onComplete: () => glow.destroy(),
  });
}

/** The full show — a glow and a wide burst of sparkles — for the biggest moments. */
export function jackpot(scene: Phaser.Scene, at: At, color: number = CELEBRATE.sparkles.color): void {
  glowPulse(scene, at, color, CELEBRATE.jackpotGlow);
  sparkleBurst(scene, at, color, false, true);
}
