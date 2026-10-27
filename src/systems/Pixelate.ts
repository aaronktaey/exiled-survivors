/**
 * One dot size for the whole field (0.146, the user's ask): the monsters are
 * painted with a dot two game pixels across (MONSTER_ERAS.pixelScale), and
 * the survivor, the thorns and shards and the drones are re-drawn at boot to
 * the same dot for the size they are shown at (the icons and drops were too,
 * for a day, and went back — `pixelateWorld`). Each dot takes the commonest solid colour under it, so a
 * picture keeps its own colours; a dot only partly covered takes the darkest,
 * which keeps an outline. Soft things (glows, pillars, the 도망자's star, the
 * enemy bolt's halo) are left smooth.
 */
import Phaser from 'phaser';
import { DRONE, MONSTER_ERAS, PLAYER_LOOK, TEXTURES } from '@/config';

/** Re-draws one canvas texture in place, a dot `1 / pixelScale` game pixels across at `shownW` × `shownH`. */
export function pixelateTexture(scene: Phaser.Scene, key: string, shownW: number, shownH = shownW): void {
  if (!scene.textures.exists(key)) {
    return;
  }
  const texture = scene.textures.get(key);
  const canvas = texture.getSourceImage() as HTMLCanvasElement;
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return;
  }
  const W = canvas.width;
  const H = canvas.height;
  const dot = 1 / MONSTER_ERAS.pixelScale;
  const gw = Math.max(1, Math.round(shownW / dot));
  const gh = Math.max(1, Math.round(shownH / dot));
  const src = ctx.getImageData(0, 0, W, H).data;
  // One colour (or none) a dot.
  const cells = new Int32Array(gw * gh).fill(-1);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x0 = Math.floor((gx * W) / gw);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * W) / gw));
      const y0 = Math.floor((gy * H) / gh);
      const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * H) / gh));
      const counts = new Map<number, number>();
      let cover = 0;
      let darkest = -1;
      let darkLum = Infinity;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          const a = src[i + 3]!;
          cover += a;
          if (a < 64) {
            continue;
          }
          const rgb = (src[i]! << 16) | (src[i + 1]! << 8) | src[i + 2]!;
          const lum = src[i]! * 0.3 + src[i + 1]! * 0.59 + src[i + 2]! * 0.11;
          if (lum < darkLum) {
            darkLum = lum;
            darkest = rgb;
          }
          if (a > 128) {
            counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
          }
        }
      }
      const share = cover / ((x1 - x0) * (y1 - y0) * 255);
      if (share >= 0.5 && counts.size > 0) {
        let best = -1;
        let most = 0;
        for (const [rgb, n] of counts) {
          if (n > most) {
            most = n;
            best = rgb;
          }
        }
        cells[gy * gw + gx] = best;
      } else if (share >= 0.2 && darkest >= 0) {
        cells[gy * gw + gx] = darkest;
      }
    }
  }
  const out = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const gy = Math.min(gh - 1, Math.floor((y * gh) / H));
    for (let x = 0; x < W; x++) {
      const c = cells[gy * gw + Math.min(gw - 1, Math.floor((x * gw) / W))]!;
      if (c < 0) {
        continue;
      }
      const i = (y * W + x) * 4;
      out.data[i] = (c >> 16) & 255;
      out.data[i + 1] = (c >> 8) & 255;
      out.data[i + 2] = c & 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  (texture as Phaser.Textures.CanvasTexture).refresh?.();
}

/**
 * What on the field is re-drawn to the monsters' dot: the survivor, the
 * thorns, the ice spear's shard and the drones. The icons — skills, swords,
 * bones, 구슬 and every drop — keep their own pictures (0.148, the user's
 * word: at the dot they were mush).
 */
export function pixelateWorld(scene: Phaser.Scene): void {
  const shown: [string, number, number?][] = [
    [TEXTURES.drone, DRONE.size],
    [TEXTURES.thorn, 22, 8],
    [TEXTURES.thornPlayer, 22, 8],
    [TEXTURES.iceShard, 22, 8],
    ...scene.textures
      .getTextureKeys()
      .filter((key) => key.startsWith('tex-look-'))
      .map((key): [string, number] => [key, PLAYER_LOOK.drawn]),
  ];
  for (const [key, w, h] of shown) {
    pixelateTexture(scene, key, w, h ?? w);
  }
}

/** Whether the field is re-drawn to the dot: wherever the era looks are, and never on the harness unless asked. */
export function pixelateOn(): boolean {
  const w = window as unknown as { __harness?: boolean; __pixelOn?: boolean };
  if (MONSTER_ERAS.devOnly && !import.meta.env.DEV) {
    return false;
  }
  return w.__pixelOn ?? (!w.__harness && location.hash !== '#run');
}
