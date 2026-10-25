import Phaser from 'phaser';

import { CELEBRATE, DEPTH, TEXTURES } from '@/config';

/**
 * 도파민 (0.127, the user's ask): what a good moment looks like — gold coins
 * thrown up and falling, sparkles flying out, a glow that swells and fades.
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

/** Gold coins thrown up from a point, spinning, falling past it and fading. */
export function coinShower(scene: Phaser.Scene, at: At, count: number = CELEBRATE.coins.count): void {
  const { lifeMs, rise, spread, fall, size } = CELEBRATE.coins;
  for (let i = 0; i < count; i++) {
    const coin = scene.add
      .image(at.x, at.y, TEXTURES.coin)
      .setDisplaySize(size, size)
      .setDepth(at.depth ?? DEPTH.vfx + 2);
    const dx = Phaser.Math.FloatBetween(-spread, spread);
    const up = Phaser.Math.FloatBetween(rise * 0.6, rise);
    const life = lifeMs * Phaser.Math.FloatBetween(0.8, 1.15);
    const spin = Phaser.Math.FloatBetween(3, 6);
    const start = coin.scaleX;
    const delay = Phaser.Math.Between(0, CELEBRATE.coins.staggerMs);
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      delay,
      duration: life,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        // Up and over: a parabola that comes back down `fall` past where it began.
        coin.setPosition(at.x + dx * t, at.y - up * 4 * t * (1 - t) + fall * t * t);
        coin.scaleX = start * Math.cos(t * spin * Math.PI);
        coin.setAlpha(t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25);
      },
      onComplete: () => coin.destroy(),
    });
  }
}

/** Sparkles flying out from a point in a ring, shrinking as they go. */
export function sparkleBurst(
  scene: Phaser.Scene,
  at: At,
  color: number = CELEBRATE.sparkles.color,
  quick = false,
): void {
  const spec = quick ? CELEBRATE.quick : CELEBRATE.sparkles;
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

/** The full show — glow, sparkles and coins — for the biggest moments. */
export function jackpot(scene: Phaser.Scene, at: At, color: number = CELEBRATE.sparkles.color, coins: number = CELEBRATE.coins.count): void {
  glowPulse(scene, at, color, CELEBRATE.jackpotGlow);
  sparkleBurst(scene, at, color);
  coinShower(scene, at, coins);
}
