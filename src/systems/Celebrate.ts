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

/**
 * A skill's icon popping up over the survivor (0.159, the user's ask): it
 * swells out of the head, holds a moment and rises fading, `label` under
 * it. It rides with `over` as it moves, so a running survivor keeps it.
 */
export function skillPop(
  scene: Phaser.Scene,
  over: { readonly x: number; readonly y: number; readonly displayHeight: number },
  icon: string,
  label: string,
  labelColor: string,
  delayMs = 0,
): void {
  const spec = CELEBRATE.skillPop;
  const depth = DEPTH.healthBar + 1;
  const image = scene.add.image(over.x, over.y, icon).setDisplaySize(spec.size, spec.size).setDepth(depth).setAlpha(0);
  const full = image.scaleX;
  const text = scene.add
    .text(over.x, over.y, label, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: spec.labelSize,
      color: labelColor,
    })
    .setOrigin(0.5, 0)
    .setDepth(depth)
    .setAlpha(0);
  const state = { rise: 0, alpha: 0, swell: 0.4 };
  const place = (): void => {
    const top = over.y - over.displayHeight / 2 - spec.above - spec.size / 2 - state.rise;
    image.setPosition(over.x, top).setScale(full * state.swell).setAlpha(state.alpha);
    text.setPosition(over.x, top + spec.size / 2 + 1).setAlpha(state.alpha);
  };
  place();
  scene.tweens.chain({
    targets: state,
    delay: delayMs,
    onUpdate: place,
    tweens: [
      { swell: 1, alpha: 1, duration: spec.popMs, ease: 'Back.easeOut', onUpdate: place },
      { rise: spec.rise * 0.3, duration: spec.holdMs, ease: 'Sine.easeOut', onUpdate: place },
      { rise: spec.rise, alpha: 0, duration: spec.fadeMs, ease: 'Sine.easeIn', onUpdate: place },
    ],
    onComplete: () => {
      image.destroy();
      text.destroy();
    },
  });
}
