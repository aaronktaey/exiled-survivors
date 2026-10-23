import Phaser from 'phaser';

import { ARENA_LOOK, DEPTH, WORLD } from '@/config';
import { seeded } from '@/systems/Terrain';

/**
 * 전투 배경 (0.101, the user's ask): worn flagstones for the floor
 * (BootScene.createArenaFloorTexture), loose decals over it, and rocks drawn
 * with light, cracks and moss (Terrain). `ARENA_LOOK.devOnly` keeps it to
 * the dev server for the user to try — and off the harness, so suites see
 * the look that ships.
 */
export function arenaLookOn(): boolean {
  if (!ARENA_LOOK.devOnly) {
    return true;
  }
  // `#run` counts as the harness too, as in BootScene: the page is marked
  // only after the first load, by which time the floor is laid.
  const harness = (window as Window & { __harness?: boolean }).__harness === true || window.location.hash === '#run';
  return import.meta.env.DEV && !harness;
}

/**
 * What lies loose on the floor, so the tiled flagstones do not read as a
 * grid: dark stains, grass round the cracks, rubble and the odd bone —
 * laid from the run's terrain seed, so 불러오기 finds the same floor.
 */
export function drawArenaDecals(scene: Phaser.Scene, seed: number): Phaser.GameObjects.Graphics {
  const random = seeded(seed ^ 0x2c1b3c6d);
  const g = scene.add.graphics().setDepth(DEPTH.ground + 1);
  const { decals } = ARENA_LOOK;
  const at = (): [number, number] => [random() * WORLD.width, random() * WORLD.height];

  for (let i = 0; i < decals.stains; i++) {
    const [x, y] = at();
    const r = 30 + random() * 90;
    g.fillStyle(ARENA_LOOK.stain, 0.22 + random() * 0.18);
    g.fillEllipse(x, y, r * (1.2 + random()), r);
    g.fillEllipse(x + (random() - 0.5) * r, y + (random() - 0.5) * r * 0.6, r * 0.8, r * 0.55);
  }
  for (let i = 0; i < decals.moss; i++) {
    const [x, y] = at();
    for (let b = 0; b < 5; b++) {
      g.fillStyle(ARENA_LOOK.moss, 0.35 + random() * 0.25);
      g.fillCircle(x + (random() - 0.5) * 40, y + (random() - 0.5) * 24, 6 + random() * 12);
    }
  }
  for (let i = 0; i < decals.grass; i++) {
    const [x, y] = at();
    const blades = 4 + Math.floor(random() * 5);
    for (let b = 0; b < blades; b++) {
      const bx = x + (random() - 0.5) * 14;
      const lean = (random() - 0.5) * 8;
      g.lineStyle(1.5, random() < 0.5 ? ARENA_LOOK.grass : ARENA_LOOK.grassLight, 0.9);
      g.lineBetween(bx, y, bx + lean, y - 6 - random() * 8);
    }
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
      g.fillStyle(ARENA_LOOK.pebble, 1);
      g.fillEllipse(sx, sy, r * 2, r * 1.5);
      g.fillStyle(ARENA_LOOK.pebbleLight, 0.8);
      g.fillCircle(sx - r * 0.3, sy - r * 0.3, r * 0.45);
    }
  }
  for (let i = 0; i < decals.bones; i++) {
    const [x, y] = at();
    const angle = random() * Math.PI;
    const len = 9 + random() * 7;
    const dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len * 0.6;
    g.lineStyle(2.4, ARENA_LOOK.bone, 0.55);
    g.lineBetween(x - dx, y - dy, x + dx, y + dy);
    g.fillStyle(ARENA_LOOK.bone, 0.55);
    for (const [ex, ey] of [[x - dx, y - dy], [x + dx, y + dy]] as const) {
      g.fillCircle(ex - 1.5, ey, 2);
      g.fillCircle(ex + 1.5, ey, 2);
    }
  }
  return g;
}
