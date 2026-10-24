import Phaser from 'phaser';

/** The outline texture's key for a picture. */
export const silhouetteKey = (key: string): string => `${key}~outline`;

/**
 * An outline the shape of a picture (0.117, the user's ask: a rare enemy's
 * mark follows its figure instead of a square round it). Made once a key,
 * the first time it is asked for: the picture stamped round itself `pad`
 * pixels out in every direction, filled white, and its own inside cut away —
 * a ring `pad` wide that hugs the figure. Drawn tinted, under the sprite,
 * at the sprite's scale (the texture is `pad` larger on each side, so it
 * lines up at the same origin). Returns the key, or null when the picture
 * cannot be read (not drawn yet, or a frame in an atlas).
 */
export function silhouetteOf(scene: Phaser.Scene, key: string, pad: number): string | null {
  const out = silhouetteKey(key);
  if (scene.textures.exists(out)) {
    return out;
  }
  if (!scene.textures.exists(key)) {
    return null;
  }
  const source = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
  if (!source || !source.width || !source.height) {
    return null;
  }
  const w = source.width + pad * 2;
  const h = source.height + pad * 2;
  const canvas = scene.textures.createCanvas(out, w, h);
  if (!canvas) {
    return null;
  }
  const ctx = canvas.getContext();
  // The figure, stamped round itself: a ring of copies `pad` out.
  const steps = Math.max(8, pad * 8);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.drawImage(source, pad + Math.round(Math.cos(a) * pad), pad + Math.round(Math.sin(a) * pad));
  }
  // White, whatever colour the copies were, so a tint gives it its colour.
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  // And the figure's own inside cut away: only the edge is left.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(source, pad, pad);
  ctx.globalCompositeOperation = 'source-over';
  canvas.refresh();
  return out;
}
