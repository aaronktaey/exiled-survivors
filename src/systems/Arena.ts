import Phaser from 'phaser';

import { ARENA_LOOK, ARENA_THEMES, DEPTH, WORLD, arenaFloorTexture, type ArenaTheme, type ArenaThemeId } from '@/config';
import { settings } from '@/systems/Settings';
import { seeded } from '@/systems/Terrain';

/**
 * 전투 배경 (0.101; live, in five grounds and with a switch in 설정 since
 * 0.105, the user's ask): a seamless floor tile for the run's ground
 * (`ensureArenaFloor`), loose decals over it (`drawArenaDecals`), and rocks
 * drawn with light, cracks and moss (Terrain). Off — the old grid — when
 * 설정's 맵 디자인 is off, while `ARENA_LOOK.devOnly` keeps it to the dev
 * server, and on the harness (and `#run`) unless a page sets
 * `window.__arenaOn`, so suites see one floor whatever the setting.
 */
export function arenaLookOn(): boolean {
  if (ARENA_LOOK.devOnly && !import.meta.env.DEV) {
    return false;
  }
  const page = window as Window & { __harness?: boolean; __arenaOn?: boolean };
  // `#run` counts as the harness too, as in BootScene: the page is marked
  // only after the first load, by which time the floor is laid.
  const harness = page.__harness === true || window.location.hash === '#run';
  if (harness && !page.__arenaOn) {
    return false;
  }
  return settings.value.mapDesign;
}

/** The run's ground: one of ARENA_THEMES, from its terrain seed, so 불러오기 stands on the same one. */
export function themeFor(seed: number): ArenaThemeId {
  return ARENA_THEMES[(seed >>> 0) % ARENA_THEMES.length]!;
}

type Draw = (ox: number, oy: number) => void;

/**
 * Something small strewn on a ground: grass, an ice shard, an ember, a
 * rivet or a mote — at (x, y), in one of its two colours.
 */
function drawAccent(g: Phaser.GameObjects.Graphics, theme: ArenaTheme, random: () => number, x: number, y: number): Draw {
  const [dark, light] = theme.accentColors;
  switch (theme.accent) {
    case 'grass': {
      const blades = Array.from({ length: 3 + Math.floor(random() * 4) }, () => {
        const bx = x + (random() - 0.5) * 10;
        const by = y + (random() - 0.5) * 4;
        return [bx, by, bx + (random() - 0.5) * 6, by - 4 - random() * 5, random() < 0.5] as const;
      });
      return (ox, oy) => {
        for (const [x1, y1, x2, y2, lit] of blades) {
          g.lineStyle(1.2, lit ? light : dark, 0.8);
          g.lineBetween(x1 + ox, y1 + oy, x2 + ox, y2 + oy);
        }
      };
    }
    case 'shard': {
      const shards = Array.from({ length: 2 + Math.floor(random() * 3) }, () => {
        const a = random() * Math.PI * 2;
        const len = 3 + random() * 5;
        const sx = x + (random() - 0.5) * 10;
        const sy = y + (random() - 0.5) * 6;
        return [sx, sy, a, len, random() < 0.5] as const;
      });
      return (ox, oy) => {
        for (const [sx, sy, a, len, lit] of shards) {
          const side = a + Math.PI / 2;
          g.fillStyle(lit ? light : dark, 0.7);
          g.fillTriangle(
            sx + ox + Math.cos(side) * 1.2, sy + oy + Math.sin(side) * 1.2,
            sx + ox - Math.cos(side) * 1.2, sy + oy - Math.sin(side) * 1.2,
            sx + ox + Math.cos(a) * len, sy + oy + Math.sin(a) * len,
          );
        }
      };
    }
    case 'ember': {
      const r = 0.8 + random() * 1.2;
      const lit = random() < 0.3;
      return (ox, oy) => {
        g.fillStyle(dark, 0.1);
        g.fillCircle(x + ox, y + oy, r * 3.5);
        g.fillStyle(lit ? light : dark, 0.6);
        g.fillCircle(x + ox, y + oy, r);
      };
    }
    case 'rivet': {
      const r = 1.6 + random() * 1.2;
      return (ox, oy) => {
        g.fillStyle(0x000000, 0.35);
        g.fillCircle(x + ox + 0.8, y + oy + 1, r);
        g.fillStyle(dark, 1);
        g.fillCircle(x + ox, y + oy, r);
        g.fillStyle(light, 0.9);
        g.fillCircle(x + ox - r * 0.35, y + oy - r * 0.35, r * 0.4);
      };
    }
    case 'mote': {
      const r = 0.8 + random() * 1.4;
      const lit = random() < 0.5;
      return (ox, oy) => {
        g.fillStyle(dark, 0.08);
        g.fillCircle(x + ox, y + oy, r * 4);
        g.fillStyle(lit ? light : dark, 0.55);
        g.fillCircle(x + ox, y + oy, r);
      };
    }
  }
}

/** A crack or a seam from (x, y): a bent hairline, or straight steel joints at right angles. */
function drawCrack(g: Phaser.GameObjects.Graphics, theme: ArenaTheme, random: () => number, x: number, y: number, scale = 1): Draw {
  const points: [number, number][] = [[x, y]];
  if (theme.crackStyle === 'seam') {
    let horizontal = random() < 0.5;
    for (let k = 0; k < 2; k++) {
      const len = (20 + random() * 40) * scale * (random() < 0.5 ? -1 : 1);
      const [px, py] = points[points.length - 1]!;
      points.push(horizontal ? [px + len, py] : [px, py + len]);
      horizontal = !horizontal;
    }
  } else {
    let angle = random() * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      angle += (random() - 0.5) * 1.4;
      const len = (8 + random() * 10) * scale;
      const [px, py] = points[points.length - 1]!;
      points.push([px + Math.cos(angle) * len, py + Math.sin(angle) * len]);
    }
  }
  const stroke = (ox: number, oy: number, width: number, color: number, alpha: number): void => {
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(points[0]![0] + ox, points[0]![1] + oy);
    for (const [px, py] of points.slice(1)) {
      g.lineTo(px + ox, py + oy);
    }
    g.strokePath();
  };
  return (ox, oy) => {
    if (theme.crackGlow !== undefined) {
      stroke(ox, oy, 4, theme.crackGlow, 0.22);
    }
    stroke(ox, oy, theme.crackStyle === 'seam' ? 1.5 : 1, theme.crack, theme.crackGlow !== undefined ? 0.85 : 0.6);
    // A steel seam catches the light along one lip.
    if (theme.crackStyle === 'seam') {
      stroke(ox + 1, oy + 1, 1, theme.pebbleLight, 0.35);
    }
  };
}

/**
 * The floor tile of a ground (ARENA_LOOK): dark ground with nothing laid on
 * it in rows — soft patches, grit, cracks or seams, pebbles and the ground's
 * accent — seamless, every piece near an edge drawn again on the far side.
 * Drawn once, the first time a run stands on that ground.
 */
export function ensureArenaFloor(scene: Phaser.Scene, themeId: ArenaThemeId): string {
  const key = arenaFloorTexture(themeId);
  if (scene.textures.exists(key)) {
    return key;
  }
  const A = ARENA_LOOK;
  const theme = A.themes[themeId];
  const tile = A.tile;
  const random = seeded(0x51a7 + ARENA_THEMES.indexOf(themeId) * 7919);
  const g = scene.add.graphics();
  const everywhere = (draw: Draw): void => {
    for (const ox of [-tile, 0, tile]) {
      for (const oy of [-tile, 0, tile]) {
        draw(ox, oy);
      }
    }
  };
  const at = (): [number, number] => [random() * tile, random() * tile];
  g.fillStyle(theme.base, 1);
  g.fillRect(0, 0, tile, tile);
  for (let n = 0; n < A.patches; n++) {
    const [x, y] = at();
    const r = 30 + random() * 80;
    const color = theme.patchShades[Math.floor(random() * theme.patchShades.length)]!;
    const alpha = 0.25 + random() * 0.3;
    const stretch = 0.6 + random() * 0.8;
    everywhere((ox, oy) => {
      g.fillStyle(color, alpha);
      g.fillEllipse(x + ox, y + oy, r * 2 * stretch, r * 2);
      g.fillStyle(color, alpha * 0.6);
      g.fillEllipse(x + ox + r * 0.3, y + oy - r * 0.2, r * 1.3 * stretch, r * 1.2);
    });
  }
  for (let n = 0; n < A.specks; n++) {
    const [x, y] = at();
    const r = 0.6 + random();
    const lit = random() < 0.5;
    everywhere((ox, oy) => {
      g.fillStyle(lit ? theme.pebbleLight : theme.stain, lit ? 0.35 : 0.6);
      g.fillCircle(x + ox, y + oy, r);
    });
  }
  for (let n = 0; n < A.cracks; n++) {
    const [x, y] = at();
    everywhere(drawCrack(g, theme, random, x, y));
  }
  for (let n = 0; n < A.pebbles; n++) {
    const [x, y] = at();
    const r = 1.5 + random() * 1.7;
    everywhere((ox, oy) => {
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(x + ox + 1, y + oy + 1.2, r * 2.2, r * 1.4);
      g.fillStyle(theme.pebble, 1);
      g.fillEllipse(x + ox, y + oy, r * 2, r * 1.5);
    });
  }
  for (let n = 0; n < A.accents; n++) {
    const [x, y] = at();
    everywhere(drawAccent(g, theme, random, x, y));
  }
  g.generateTexture(key, tile, tile);
  g.destroy();
  return key;
}

/**
 * A drawing that never changes, turned into one picture the size of the
 * world: a Graphics replays every one of its commands every frame, and the
 * decals and the rocks came to 150,000 of them (20 ms a frame, the user's
 * stutter). The texture under `key` is replaced each run and dropped when
 * the scene shuts down.
 */
export function bake(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, key: string, depth: number): Phaser.GameObjects.Image {
  if (scene.textures.exists(key)) {
    scene.textures.remove(key);
  }
  g.generateTexture(key, WORLD.width, WORLD.height);
  g.destroy();
  const image = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    image.destroy();
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }
  });
  return image;
}

/** Something bigger lying about: a bone, an icicle, a charred bone, a gear or a rune. */
function drawBit(g: Phaser.GameObjects.Graphics, theme: ArenaTheme, random: () => number, x: number, y: number): void {
  const color = theme.bitColor;
  switch (theme.bits) {
    case 'bone':
    case 'char': {
      const angle = random() * Math.PI;
      const len = 9 + random() * 7;
      const dx = Math.cos(angle) * len;
      const dy = Math.sin(angle) * len * 0.6;
      const alpha = theme.bits === 'char' ? 0.8 : 0.55;
      g.lineStyle(2.4, color, alpha);
      g.lineBetween(x - dx, y - dy, x + dx, y + dy);
      g.fillStyle(color, alpha);
      for (const [ex, ey] of [[x - dx, y - dy], [x + dx, y + dy]] as const) {
        g.fillCircle(ex - 1.5, ey, 2);
        g.fillCircle(ex + 1.5, ey, 2);
      }
      return;
    }
    case 'icicle': {
      for (let i = 0; i < 3 + Math.floor(random() * 3); i++) {
        const ix = x + (random() - 0.5) * 18;
        const iy = y + (random() - 0.5) * 10;
        const h = 6 + random() * 10;
        g.fillStyle(color, 0.65);
        g.fillTriangle(ix - 2.2, iy, ix + 2.2, iy, ix + (random() - 0.5) * 2, iy - h);
        g.fillStyle(0xffffff, 0.6);
        g.fillTriangle(ix - 0.8, iy, ix + 0.2, iy, ix - 0.3, iy - h * 0.8);
      }
      return;
    }
    case 'gear': {
      const r = 6 + random() * 5;
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(x + 1.5, y + 2, r + 2);
      g.fillStyle(color, 0.85);
      for (let t = 0; t < 8; t++) {
        const a = (t / 8) * Math.PI * 2;
        g.fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, 2);
      }
      g.fillCircle(x, y, r);
      g.fillStyle(theme.base, 1);
      g.fillCircle(x, y, r * 0.35);
      return;
    }
    case 'rune': {
      const r = 10 + random() * 8;
      g.lineStyle(4, color, 0.12);
      g.strokeCircle(x, y, r);
      g.lineStyle(1.2, color, 0.55);
      g.strokeCircle(x, y, r);
      for (let t = 0; t < 3; t++) {
        const a = random() * Math.PI * 2;
        g.lineBetween(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4), x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3));
      }
      return;
    }
  }
}

/**
 * What lies loose on the floor, so the tiled ground does not read as a
 * grid: stains, the ground's moss (frost, ash, rust, void pools), its
 * accents in clumps, rubble and its bits — laid from the run's terrain seed,
 * so 불러오기 finds the same floor, and baked into one picture.
 */
export function drawArenaDecals(scene: Phaser.Scene, seed: number, themeId: ArenaThemeId): Phaser.GameObjects.Image {
  const theme = ARENA_LOOK.themes[themeId];
  const random = seeded(seed ^ 0x2c1b3c6d);
  const g = scene.add.graphics().setDepth(DEPTH.ground + 1);
  const { decals } = ARENA_LOOK;
  const at = (): [number, number] => [random() * WORLD.width, random() * WORLD.height];

  for (let i = 0; i < decals.stains; i++) {
    const [x, y] = at();
    const r = 30 + random() * 90;
    g.fillStyle(theme.stain, 0.22 + random() * 0.18);
    g.fillEllipse(x, y, r * (1.2 + random()), r);
    g.fillEllipse(x + (random() - 0.5) * r, y + (random() - 0.5) * r * 0.6, r * 0.8, r * 0.55);
  }
  for (let i = 0; i < decals.moss; i++) {
    const [x, y] = at();
    for (let b = 0; b < 5; b++) {
      g.fillStyle(theme.moss, 0.25 + random() * 0.25);
      g.fillCircle(x + (random() - 0.5) * 40, y + (random() - 0.5) * 24, 6 + random() * 12);
    }
  }
  for (let i = 0; i < decals.accents; i++) {
    const [x, y] = at();
    drawAccent(g, theme, random, x, y)(0, 0);
  }
  for (let i = 0; i < decals.rubble; i++) {
    const [x, y] = at();
    const stones = 3 + Math.floor(random() * 5);
    for (let s = 0; s < stones; s++) {
      const sx = x + (random() - 0.5) * 30;
      const sy = y + (random() - 0.5) * 18;
      const r = 1.5 + random() * 3.5;
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(sx + 1, sy + 1.5, r * 2.2, r * 1.4);
      g.fillStyle(theme.pebble, 1);
      g.fillEllipse(sx, sy, r * 2, r * 1.5);
      g.fillStyle(theme.pebbleLight, 0.8);
      g.fillCircle(sx - r * 0.3, sy - r * 0.3, r * 0.45);
    }
  }
  for (let i = 0; i < decals.bits; i++) {
    const [x, y] = at();
    drawBit(g, theme, random, x, y);
  }
  // A few long cracks or seams across the world, bigger than the tile's.
  for (let i = 0; i < 24; i++) {
    const [x, y] = at();
    drawCrack(g, theme, random, x, y, 2.5)(0, 0);
  }
  return bake(scene, g, 'tex-arena-decals', DEPTH.ground + 1);
}
