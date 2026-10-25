import Phaser from 'phaser';

import { SKILL_ART, skillArtTexture } from '@/config';
import type { SkillId } from '@/weapons/skills';

/**
 * 스킬 일러스트 (0.129, the user's ask): one picture a skill for its TCG card
 * on the pick screen, painted in code like everything else the game shows
 * (no bought art — the Raven Fantasy pack went for its licence). Each is
 * SKILL_ART.width × height: a sky that fades top to bottom in the skill's
 * colours, then its motif. Made once, at boot.
 */
type Painter = (g: Phaser.GameObjects.Graphics, w: number, h: number) => void;

/** A sky fading from `top` to `bottom` in bands. */
function sky(g: Phaser.GameObjects.Graphics, w: number, h: number, top: number, bottom: number): void {
  const bands = 14;
  const a = Phaser.Display.Color.IntegerToColor(top);
  const b = Phaser.Display.Color.IntegerToColor(bottom);
  for (let i = 0; i < bands; i++) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, bands - 1, i);
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1).fillRect(0, (h / bands) * i, w, h / bands + 1);
  }
}

/** A few faint stars or motes, always in the same places. */
function motes(g: Phaser.GameObjects.Graphics, w: number, h: number, color: number, count: number, seed: number): void {
  let s = seed;
  const next = (): number => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    g.fillStyle(color, 0.25 + next() * 0.5).fillCircle(next() * w, next() * h, 0.8 + next() * 1.6);
  }
}

/** A zig-zag bolt from one point to another, a wide glow under a bright core. */
function bolt(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, glow: number, core: number, kinks = 6, jitter = 8): void {
  const points: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(x1, y1)];
  for (let i = 1; i < kinks; i++) {
    const t = i / kinks;
    const off = (i % 2 === 0 ? 1 : -1) * jitter;
    points.push(new Phaser.Math.Vector2(x1 + (x2 - x1) * t + off, y1 + (y2 - y1) * t + off * 0.4));
  }
  points.push(new Phaser.Math.Vector2(x2, y2));
  g.lineStyle(7, glow, 0.35).strokePoints(points);
  g.lineStyle(3, glow, 0.9).strokePoints(points);
  g.lineStyle(1.4, core, 1).strokePoints(points);
}

const PAINTERS: Record<SkillId, Painter> = {
  // 타격: a blade cutting down through the air, three bright arcs behind it.
  meleeStrike: (g, w, h) => {
    sky(g, w, h, 0x3a1214, 0x120608);
    motes(g, w, h, 0xffb0a0, 14, 7);
    for (let i = 0; i < 3; i++) {
      g.lineStyle(6 - i * 1.5, 0xffe8e0, 0.75 - i * 0.2);
      g.beginPath();
      g.arc(w * 0.42, h * 0.95, h * (0.62 + i * 0.12), Phaser.Math.DegToRad(205), Phaser.Math.DegToRad(300), false);
      g.strokePath();
    }
    // The sword: blade, guard, grip.
    g.fillStyle(0xd8dee8, 1).fillTriangle(w * 0.72, h * 0.1, w * 0.76, h * 0.14, w * 0.48, h * 0.7);
    g.fillStyle(0xffffff, 0.8).fillTriangle(w * 0.72, h * 0.1, w * 0.735, h * 0.12, w * 0.5, h * 0.66);
    g.lineStyle(5, 0xc9a24a, 1).lineBetween(w * 0.43, h * 0.62, w * 0.55, h * 0.76);
    g.lineStyle(5, 0x6a4a2a, 1).lineBetween(w * 0.47, h * 0.71, w * 0.41, h * 0.8);
  },
  // 화염구: a ball of fire streaking down, its tail behind it, embers falling off.
  fireball: (g, w, h) => {
    sky(g, w, h, 0x4a160a, 0x140604);
    motes(g, w, h, 0xffb060, 20, 11);
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      g.fillStyle(i % 2 ? 0xff7a2a : 0xffb347, 0.55 - t * 0.4)
        .fillCircle(w * (0.62 - t * 0.42), h * (0.42 - t * 0.28), h * (0.2 - t * 0.02));
    }
    g.fillStyle(0xd9361a, 1).fillCircle(w * 0.64, h * 0.5, h * 0.24);
    g.fillStyle(0xff8a2a, 1).fillCircle(w * 0.645, h * 0.5, h * 0.18);
    g.fillStyle(0xffd75a, 1).fillCircle(w * 0.65, h * 0.5, h * 0.11);
    g.fillStyle(0xfff6d0, 1).fillCircle(w * 0.655, h * 0.49, h * 0.05);
  },
  // 연쇄번개: an arc leaping from one dark figure to the next.
  chainLightning: (g, w, h) => {
    sky(g, w, h, 0x0e1a3a, 0x060a16);
    motes(g, w, h, 0x9bd3ff, 18, 13);
    const spots: [number, number][] = [[0.12, 0.7], [0.36, 0.42], [0.6, 0.72], [0.86, 0.38]];
    spots.forEach(([x, y]) => {
      g.fillStyle(0x1a2238, 1).fillCircle(w * x, h * y, h * 0.09);
      g.fillStyle(0x9bd3ff, 0.25).fillCircle(w * x, h * y, h * 0.14);
    });
    for (let i = 0; i < spots.length - 1; i++) {
      const [ax, ay] = spots[i]!;
      const [bx, by] = spots[i + 1]!;
      bolt(g, w * ax, h * ay, w * bx, h * by, 0x6fb8ff, 0xffffff, 5, 7);
    }
  },
  // 얼음창: a spear of ice flying through falling frost, shards round its head.
  iceSpear: (g, w, h) => {
    sky(g, w, h, 0x163a5a, 0x08141f);
    motes(g, w, h, 0xe0f4ff, 26, 17);
    g.lineStyle(5, 0xbfe3ff, 1).lineBetween(w * 0.1, h * 0.8, w * 0.7, h * 0.32);
    g.lineStyle(2, 0xffffff, 0.8).lineBetween(w * 0.12, h * 0.78, w * 0.68, h * 0.33);
    g.fillStyle(0xd6f2ff, 1).fillTriangle(w * 0.9, h * 0.16, w * 0.64, h * 0.26, w * 0.72, h * 0.42);
    g.fillStyle(0x7fc4f0, 1).fillTriangle(w * 0.9, h * 0.16, w * 0.72, h * 0.42, w * 0.76, h * 0.3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = w * 0.78 + Math.cos(a) * h * 0.26;
      const y = h * 0.3 + Math.sin(a) * h * 0.22;
      g.fillStyle(0xbfe3ff, 0.8).fillTriangle(x, y - 5, x - 3, y + 3, x + 3, y + 3);
    }
  },
  // 공허구체: a hole of dark, orbs riding round it on a tilted ring.
  voidOrb: (g, w, h) => {
    sky(g, w, h, 0x24123e, 0x0a0514);
    motes(g, w, h, 0xd4b8ff, 24, 19);
    g.lineStyle(2, 0xb07cff, 0.45).strokeEllipse(w * 0.5, h * 0.52, w * 0.62, h * 0.42);
    g.fillStyle(0xb07cff, 0.25).fillCircle(w * 0.5, h * 0.52, h * 0.24);
    g.fillStyle(0x05020a, 1).fillCircle(w * 0.5, h * 0.52, h * 0.15);
    g.lineStyle(2, 0xefe4ff, 0.9).strokeCircle(w * 0.5, h * 0.52, h * 0.15);
    [0.15, 2.2, 4.1].forEach((a) => {
      const x = w * 0.5 + Math.cos(a) * w * 0.31;
      const y = h * 0.52 + Math.sin(a) * h * 0.21;
      g.fillStyle(0xb07cff, 0.35).fillCircle(x, y, 11);
      g.fillStyle(0x3a1d66, 1).fillCircle(x, y, 7);
      g.lineStyle(2, 0xefe4ff, 1).strokeCircle(x, y, 7);
    });
  },
  // 낙뢰: a bolt out of a heavy cloud onto the ground, which flashes.
  thunderStrike: (g, w, h) => {
    sky(g, w, h, 0x22263a, 0x0b0c14);
    [[0.25, 0.14, 0.2], [0.45, 0.1, 0.24], [0.68, 0.15, 0.2], [0.85, 0.12, 0.14]].forEach(([x, y, r]) => {
      g.fillStyle(0x3a3f55, 1).fillCircle(w * x!, h * y!, h * r!);
    });
    g.fillStyle(0xf0d050, 0.35).fillEllipse(w * 0.52, h * 0.92, w * 0.4, h * 0.12);
    g.fillStyle(0xfff3b0, 0.8).fillEllipse(w * 0.52, h * 0.92, w * 0.16, h * 0.05);
    bolt(g, w * 0.5, h * 0.22, w * 0.52, h * 0.9, 0xf0d050, 0xffffff, 6, 10);
  },
  // 드론: a little quadcopter over the field, its gun's line to a target.
  drone: (g, w, h) => {
    sky(g, w, h, 0x12302a, 0x06110e);
    motes(g, w, h, 0x7fe0c0, 16, 23);
    g.lineStyle(2, 0xff5a4a, 0.85).lineBetween(w * 0.5, h * 0.5, w * 0.82, h * 0.86);
    g.fillStyle(0xff5a4a, 0.4).fillCircle(w * 0.82, h * 0.86, 7);
    const arms: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    arms.forEach(([dx, dy]) => {
      g.lineStyle(4, 0x2a2f38, 1).lineBetween(w * 0.5, h * 0.45, w * 0.5 + dx * w * 0.16, h * 0.45 + dy * h * 0.18);
      g.fillStyle(0x7fe0c0, 0.35).fillEllipse(w * 0.5 + dx * w * 0.16, h * 0.45 + dy * h * 0.18, w * 0.16, h * 0.07);
    });
    g.fillStyle(0x3d5a4a, 1).fillRoundedRect(w * 0.42, h * 0.37, w * 0.16, h * 0.16, 5);
    g.fillStyle(0xff5a4a, 1).fillCircle(w * 0.5, h * 0.47, 4);
  },
  // 독성폭발: a ring of poison bursting out, droplets flying, bubbles rising.
  poisonNova: (g, w, h) => {
    sky(g, w, h, 0x1a3410, 0x081206);
    motes(g, w, h, 0xb8ff7a, 14, 29);
    g.fillStyle(0x6fd13a, 0.18).fillCircle(w * 0.5, h * 0.55, h * 0.42);
    g.lineStyle(4, 0xb8ff7a, 0.9).strokeCircle(w * 0.5, h * 0.55, h * 0.36);
    g.lineStyle(1.5, 0xeaffd0, 0.6).strokeCircle(w * 0.5, h * 0.55, h * 0.3);
    g.fillStyle(0xeaffd0, 0.9).fillCircle(w * 0.5, h * 0.55, h * 0.08);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = h * 0.46;
      g.fillStyle(0xb8ff7a, 1).fillCircle(w * 0.5 + Math.cos(a) * r * 1.3, h * 0.55 + Math.sin(a) * r, 2.6);
    }
    [[0.2, 0.3, 5], [0.78, 0.24, 4], [0.86, 0.6, 6], [0.14, 0.7, 4]].forEach(([x, y, r]) => {
      g.lineStyle(1.5, 0xb8ff7a, 0.8).strokeCircle(w * x!, h * y!, r!);
    });
  },
};

/** Paints every skill's card picture, once. */
export function createSkillArt(scene: Phaser.Scene): void {
  const { width: w, height: h } = SKILL_ART;
  for (const [id, paint] of Object.entries(PAINTERS) as [SkillId, Painter][]) {
    const key = skillArtTexture(id);
    if (scene.textures.exists(key)) {
      continue;
    }
    const g = scene.add.graphics();
    paint(g, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}
