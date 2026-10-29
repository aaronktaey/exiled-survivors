import Phaser from 'phaser';

import { COLORS, DEPTH, NIGHT_SKY, TEXTURES } from '@/config';

/**
 * The title's night (0.158, the user's ask with the Nox Survivors logo): an
 * indigo sky darkening upward, a violet haze low on it, a scatter of stars
 * and a few that twinkle. One Graphics for the sky and the still stars —
 * a few hundred commands, nothing like the arena's — and a tween a twinkle.
 */
export function drawNightSky(scene: Phaser.Scene, width: number, height: number): void {
  const look = NIGHT_SKY;
  const sky = scene.add.graphics().setDepth(DEPTH.ground);
  sky.fillGradientStyle(look.top, look.top, look.bottom, look.bottom, 1).fillRect(0, 0, width, height);

  scene.add
    .image(width / 2, height * look.hazeAt, TEXTURES.glow)
    .setTint(COLORS.glow)
    .setAlpha(look.hazeAlpha)
    .setDisplaySize(width * 1.4, height * 0.8)
    .setDepth(DEPTH.ground);

  const stars = Math.round((width * height) / look.areaPerStar);
  for (let i = 0; i < stars; i++) {
    const big = Math.random() < look.bigShare;
    sky.fillStyle(Math.random() < 0.3 ? look.paleStar : 0xffffff, Phaser.Math.FloatBetween(look.dimmest, 0.9));
    sky.fillRect(Math.floor(Math.random() * width), Math.floor(Math.random() * height), big ? 2 : 1, big ? 2 : 1);
  }

  for (let i = 0; i < look.twinkles; i++) {
    const star = scene.add
      .image(Math.random() * width, Math.random() * height * look.twinkleBand, TEXTURES.sparkle)
      .setScale(Phaser.Math.FloatBetween(0.25, 0.45))
      .setTint(i % 3 === 0 ? look.paleStar : 0xffffff)
      .setAlpha(0.15)
      .setDepth(DEPTH.ground);
    scene.tweens.add({
      targets: star,
      alpha: Phaser.Math.FloatBetween(0.6, 1),
      duration: Phaser.Math.Between(look.twinkleMs[0], look.twinkleMs[1]),
      delay: Phaser.Math.Between(0, look.twinkleMs[1]),
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }
}
