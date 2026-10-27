/**
 * 시대별 몬스터 (0.146, the user's design). The same kinds wear three looks
 * by when they come: until 7 minutes goblins, beasts and the dead; until 14
 * fantasy creatures; after that machines. Only the picture changes — every
 * number, the body and the size shown stay the kind's. The 우두머리 and the
 * 키메라 keep one look throughout, and the 도망자 its star, only drawn finer.
 *
 * Each look is painted at boot by PixelPainter, frame by frame, under keys
 * built from `eraTexture(kind.texture, era)` the same way the kind's own are
 * (enemyWalk, enemyPose, giantFrame) — so Enemy only swaps the base key it
 * reads them from (`Enemy.look`, from the `look` hook).
 */
import Phaser from 'phaser';
import {
  ENEMY_KINDS,
  ENEMY_WALK_STEPS,
  MONSTER_ERAS,
  enemyPose,
  enemyWalk,
  eraTexture,
  fineTexture,
  giantFrame,
  type EnemyKind,
} from '@/config';
import { Painter, darker, ramp, type Ramp } from '@/systems/PixelPainter';

export interface ArtFrame {
  /** Legs forward (1), back (-1) or under (0). */
  readonly swing: number;
  /** The step where the legs pass: the body a pixel up. */
  readonly passing: boolean;
  readonly cast: boolean;
  readonly leap: boolean;
  /** A giant's picture: 1 and 2 a foot out. */
  readonly step: number;
  readonly view: 'front' | 'side' | 'back';
}

type Paint = (s: Painter, f: ArtFrame) => void;
interface Look {
  /** The square the shapes are given in. */
  readonly design: number;
  readonly paint: Paint;
}

// ---------------- palettes ----------------
const RED = ramp(0x2a0b10, 0x8e2630, 0xd2463f, 0xf07a5a, 0xffb08a);
const BONE = ramp(0x3a2c1c, 0xb8a888, 0xe6dcc4, 0xf6efe0, 0xffffff);
const GOB = ramp(0x0e2a17, 0x2f7a45, 0x5fc27e, 0x8fe0a0, 0xc8f7cf);
const LEATHER = ramp(0x1e1209, 0x4a3019, 0x6b4a2b, 0x8f6a42, 0xb08a5c);
const CLOTH = ramp(0x101a2e, 0x283c66, 0x3f5c94, 0x5d7fbd, 0x86a6dd);
const WOOD = ramp(0x24140a, 0x5a3416, 0x8a5a2b, 0xb07a40, 0xd09a5a);
const GOLDJ = ramp(0x3a2408, 0xb07818, 0xf2b134, 0xffd36e, 0xfff0b0);
const JDARK = ramp(0x2a1806, 0x5c3a0e, 0x8a5a18, 0xa87a2a, 0xc89a40);
const PURP = ramp(0x1c1040, 0x5a3cb0, 0x9b6bff, 0xc0a0ff, 0xe6dbff);
const TROLL = ramp(0x260a30, 0x7a2a90, 0xb44bd1, 0xd57de8, 0xf0b8f8);
const GREY = ramp(0x14161b, 0x50555f, 0x7d838f, 0xa4aab5, 0xd0d5dd);
const STEEL = ramp(0x101216, 0x3c424c, 0x646c78, 0x949ca8, 0xd4dae2);
const CROWN = ramp(0x3a2400, 0xb8860b, 0xffcc33, 0xffe680, 0xfff6cc);
const BLACK = ramp(0x08080a, 0x1a1b20, 0x2a2c33, 0x3c3f48, 0x555a66);
const BOOT = ramp(0x050506, 0x101114, 0x1c1d22, 0x2c2e36, 0x40434e);
const LION = ramp(0x2e1f08, 0x9a7638, 0xc9a25a, 0xe2c27e, 0xf6e0a8);
const MANE = ramp(0x1e0f04, 0x4a2a10, 0x6b3f1f, 0x8a5730, 0xa87040);
const SNAKE = ramp(0x0a2412, 0x2a6a3a, 0x4a9a52, 0x78c070, 0xb0e0a0);
const ROPE = ramp(0x1e1209, 0x8a7040, 0xb89a60, 0xd8bc80, 0xf0dca8);
const ZOMB = ramp(0x142018, 0x4a6648, 0x7a9670, 0xa2bc92, 0xcadfb6);
const RAG = ramp(0x1a1420, 0x4a3a52, 0x6a587a, 0x8a78a0, 0xaa9ac0);
const PANTS = ramp(0x0c1220, 0x22304a, 0x34466a, 0x4a5e88, 0x6a80a8);
const TOAD = ramp(0x14260c, 0x4a6a1e, 0x7a9a32, 0xa8c45a, 0xd8e890);
const CREAM = ramp(0x2e2410, 0xc8b47a, 0xe6d6a0, 0xf4ead0, 0xffffff);
const BEAR = ramp(0x1c0e06, 0x5a3418, 0x8a5a2e, 0xb07a44, 0xd09a60);
const TAN = ramp(0x2a1a0a, 0xa8865a, 0xc8a878, 0xe0c69a, 0xf2e2c0);
const ROBE = ramp(0x120a1e, 0x2e1a4a, 0x46306e, 0x644a96, 0x8a70be);
const SOOT = ramp(0x0a0606, 0x261a1a, 0x3e2c2c, 0x5a4242, 0x7a5e5e);
const FIRE = ramp(0x3a0a00, 0xc0300a, 0xff6a1a, 0xffb040, 0xfff0a0);
const GUN = ramp(0x0a0c10, 0x2a3038, 0x48505c, 0x6a7482, 0x96a0b0);
const HAZ = ramp(0x2a1e00, 0xb88a00, 0xf0c020, 0xffe060, 0xfff4b0);
const GLASS = ramp(0x062030, 0x1a7aa0, 0x40c8f0, 0x9ae8ff, 0xffffff);
const GREENLIGHT = ramp(0x0a3a1a, 0x20a050, 0x60ff90, 0xb0ffd0, 0xffffff);
const EYE_Y = 0xffe066;
const EYE_R = 0xff3a3a;
const DARK = 0x1a0a0a;
const CYAN = 0x40e0ff;
const ORANGE = 0xff8a1a;
const RED_GLOW = 0xff3030;

const bobOf = (f: ArtFrame): number => (f.passing ? -1 : 0);

// ======================= 0–7 min: goblins, beasts, the dead =======================

const zombie: Paint = (s, f) => {
  const b = bobOf(f);
  const w = f.swing;
  s.ground(16, 30.2, 7);
  const far = darker(ZOMB);
  s.capsule(14, 21 + b, 14 - 3 * w, 28.5, 1.6, darker(PANTS));
  s.ellipse(14 - 3 * w + 0.5, 29, 2, 1, far);
  s.capsule(18, 13.5 + b, 26, 14.5 + b, 1.3, far);
  s.ellipse(15.5, 17.5 + b, 5.2, 5.8, RAG);
  s.rect(11, 21 + b, 19.5, 23 + b, PANTS);
  s.capsule(17, 22 + b, 17 + 3 * w, 28.5, 1.7, PANTS);
  s.ellipse(17 + 3 * w + 1.5, 29, 2.3, 1.1, ZOMB);
  // A tear in the shirt, ribs through it; a ragged hem.
  s.pxs([[14, 16 + b], [15, 16 + b], [16, 17 + b], [14, 18 + b], [15, 18 + b], [16, 19 + b], [14, 20 + b]], 0x7a9670);
  s.pxs([[14, 17 + b], [15, 17 + b], [14, 19 + b], [15, 19 + b]], 0xe6dcc4);
  s.pxs([[11, 21 + b], [13, 21 + b], [16, 21 + b], [18, 21 + b]], 0x1a1420);
  // Head lolling forward, jaw hanging, stitches across the brow.
  s.circle(21, 9.5 + b, 4.6, ZOMB);
  s.ellipse(22.5, 13.8 + b, 2.6, 1.6, ZOMB);
  s.pxs([[18, 5 + b], [19, 5 + b], [20, 5 + b], [17, 6 + b], [21, 5 + b]], 0x2a2018);
  s.pxs([[23, 9 + b], [24, 9 + b]], 0xf4f4e0);
  s.px(24, 9 + b, 0x8a2020);
  s.pxs([[20, 9 + b], [20, 10 + b]], 0x142018);
  s.pxs([[22, 13 + b], [23, 13 + b], [24, 13 + b], [24, 12 + b]], 0x2a0a0a);
  s.px(23, 12 + b, 0xe6dcc4);
  s.pxs([[18, 7 + b], [19, 8 + b], [20, 7 + b], [21, 8 + b]], 0x2a2018);
  s.capsule(18.5, 14 + b, 27 - w, 15 + b, 1.5, ZOMB);
  s.pxs([[28 - w, 14 + b], [28 - w, 15 + b], [28 - w, 16 + b], [29 - w, 15 + b]], 0xa2bc92, 0x142018);
};

const goblinTorch: Paint = (s, f) => {
  const b = bobOf(f);
  const w = f.swing;
  s.ground(15.5, 30.2, 6.5);
  // A pouch on its back (it carried a quiver while it had a bow).
  s.capsule(9.5, 15 + b, 10, 19.5 + b, 1.8, LEATHER);
  s.capsule(14.5, 23 + b, 14.5 - 3 * w, 28.5, 1.4, darker(CLOTH));
  s.ellipse(14.5 - 3 * w + 0.7, 29, 1.8, 1, darker(LEATHER));
  s.ellipse(15.5, 18.5 + b, 5.2, 5.4, LEATHER);
  s.rect(10.5, 20 + b, 20.5, 21.2 + b, BLACK);
  s.px(16, 20 + b, 0xffcc33);
  s.capsule(17.5, 23 + b, 17.5 + 3 * w, 28.5, 1.5, CLOTH);
  s.ellipse(17.5 + 3 * w + 0.8, 29, 2, 1, LEATHER);
  // Head: ear swept back, a hood's edge, a pointed nose.
  s.poly([[12.8, 8 + b], [5.5, 4.2 + b], [8, 7.4 + b], [12.5, 11.8 + b]], GOB);
  s.circle(16, 10 + b, 5.1, GOB);
  s.poly([[20.4, 9 + b], [25, 11.6 + b], [20.4, 12.6 + b]], GOB);
  s.poly([[11, 8 + b], [15, 4.4 + b], [20, 5.4 + b], [16, 7 + b]], darker(LEATHER));
  s.px(18, 9 + b, EYE_R);
  s.px(19, 9 + b, 0xffb0b0);
  s.pxs([[18, 12 + b], [19, 12 + b]], 0x0e2a17);
  s.px(19, 13 + b, 0xf6efe0);
  // A torch: held up before it, thrust out as it throws (0.146, the user's ask — a bow before).
  const [hx, hy, tx, ty, flame] = f.cast ? [24, 15, 28, 9, 4.2] : [21.5, 18 + b, 23.5, 9 + b, 3.4];
  s.capsule(f.cast ? 22 : 20.5, f.cast ? 17 : 22 + b, tx, ty, 1.1, WOOD);
  s.rect(tx - 1.4, ty - 0.5, tx + 1.4, ty + 1.5, ramp(0x1e1209, 0x3a2614, 0x5a3c22, 0x6b4a2b, 0x8f6a42));
  const lean = f.cast ? 1.5 : 0.8 * w;
  s.ellipse(tx, ty - flame * 0.7, flame * 0.75, flame, FIRE);
  s.poly([[tx - flame * 0.6, ty - flame], [tx + flame * 0.6, ty - flame], [tx + lean, ty - flame * 2.4]], FIRE);
  s.pxs([[tx, ty - flame * 0.6], [tx, ty - flame], [tx - 1, ty - flame * 0.6]], 0xfff0a0);
  if (f.cast) {
    for (const [x, y] of [[tx + 4, ty - 6], [tx + 3, ty - 1], [tx - 3, ty - 7], [tx + 2, ty - 9]] as const) {
      s.px(x, y, 0xffb040);
    }
  }
  s.capsule(17.5, 17 + b, hx, hy, 1.2, GOB);
};

const jackal: Paint = (s, f) => {
  const w = f.swing;
  const b = w > 0 ? -1.5 : w < 0 ? 0.5 : 0;
  const feet = w > 0 ? 27 : 28.5;
  s.ground(16, 30.2, 8.5);
  const far = darker(GOLDJ);
  s.chain([[8, 17 + b], [5, 15 + b - w], [2.6, 12.5 + b - w]], 1.4, GOLDJ, 2);
  s.circle(2.4, 12 + b - w, 1.4, JDARK);
  s.capsule(11, 20 + b, 11 - 2 * w + 1, feet, 1.1, far);
  s.capsule(21, 20 + b, 21 + 2 * w - 1, feet, 1.1, far);
  s.ellipse(15.5, 18 + b, 7.8, 3.8, GOLDJ);
  s.ellipse(14, 15.6 + b, 5.5, 1.6, JDARK);
  s.capsule(9, 20 + b, 9 + 2.4 * w, feet, 1.2, GOLDJ);
  s.capsule(20, 20 + b, 20 - 2.4 * w + 1, feet, 1.2, GOLDJ);
  for (const fx of [9 + 2.4 * w, 20 - 2.4 * w + 1]) {
    s.px(fx + 0.6, feet + 0.6, 0x5c3a0e);
  }
  s.capsule(21, 17 + b, 24, 12.5 + b, 2.4, GOLDJ);
  s.ellipse(25.5, 11.5 + b, 3.4, 2.6, GOLDJ);
  s.capsule(26.5, 12.4 + b, 30, 13.2 + b, 1.3, GOLDJ);
  s.poly([[22.4, 10 + b], [23.4, 4.6 + b], [25, 9.4 + b]], GOLDJ);
  s.poly([[24.6, 9.6 + b], [26.6, 5 + b], [27, 10 + b]], JDARK);
  s.px(23.5, 7 + b, 0x5c3a0e);
  s.px(26.5, 10.6 + b, DARK);
  s.px(26.5, 10 + b, 0xfff0b0);
  s.px(30.4, 12.6 + b, DARK, 0x3a2408);
  s.pxs([[28, 14 + b], [29, 14 + b]], 0x3a1a08);
  s.px(28.5, 14.8 + b, 0xf6efe0);
};

const toad: Paint = (s, f) => {
  s.ground(15, 30.3, f.leap ? 6 : 9);
  const far = darker(TOAD);
  let hy = 17;
  if (f.leap) {
    s.chain([[9, 20], [4, 24], [1.5, 28]], 1.6, far);
    s.ellipse(16, 15, 8.5, 5.5, TOAD);
    s.ellipse(17, 18, 6, 2.6, CREAM);
    s.chain([[10, 18], [5, 21], [2, 24]], 1.8, TOAD);
    s.chain([[21, 18], [25, 21], [28, 22]], 1.2, TOAD);
    hy = 10;
  } else {
    s.ellipse(9, 25, 4.6, 3.6, far);
    s.ellipse(15.5, 22, 9.5, 6.5, TOAD);
    s.ellipse(18, 25.5, 6.5, 2.8, CREAM);
    s.ellipse(10.5, 26, 4.2, 3.2, TOAD);
    s.ellipse(8.5, 29, 3, 1, TOAD);
    s.capsule(22, 25, 23.5, 28.5, 1.3, TOAD);
    s.ellipse(24.5, 29, 2.4, 1, TOAD);
  }
  // Eyes up top with slit pupils; the wide mouth; warts.
  for (const ex of [18.5, 23.5]) {
    s.circle(ex, hy - 1.5, 2.6, TOAD);
    s.pxs([[ex - 1, hy - 2], [ex, hy - 2], [ex - 1, hy - 1], [ex, hy - 1]], 0xffd020);
    s.pxs([[ex, hy - 2], [ex, hy - 1]], 0x101008);
  }
  for (let x = 17; x < 26; x++) {
    s.px(x, hy + 3, 0x14260c);
  }
  s.px(25, hy + 2, 0x14260c);
  for (const [x, y] of [[11, 18], [14, 17], [9, 21], [13, 20], [16, 19]] as const) {
    s.px(x, y + (hy - 17), 0x4a6a1e);
    s.px(x - 1, y - 1 + (hy - 17), 0xd8e890);
  }
};

const bear: Paint = (s, f) => {
  const b = bobOf(f);
  const w = f.swing;
  s.ground(21, 39.6, 14);
  const far = darker(BEAR);
  for (const [x, dir] of [[13, 1], [27, -1]] as const) {
    s.capsule(x + 1.5, 27 + b, x + 1.5 + 2.5 * w * dir, 37.5, 2.8, far);
  }
  s.ellipse(20, 25 + b, 13, 8.5, BEAR);
  s.ellipse(14.5, 18.5 + b, 7, 4.5, BEAR);
  s.ellipse(22, 30 + b, 9, 3, TAN);
  for (const [x, dir] of [[10, -1], [25, 1]] as const) {
    const fx = x + 2.5 * w * dir;
    s.capsule(x, 28 + b, fx, 37.5, 3.1, BEAR);
    s.pxs([[fx + 1, 38.5], [fx + 2, 38.5], [fx + 3, 38]], 0xf6efe0, 0x2a1a0a);
  }
  s.ellipse(33, 22.5 + b, 6, 5.4, BEAR);
  s.circle(31, 17 + b, 2, BEAR);
  s.px(31, 17 + b, 0x5a3418);
  s.ellipse(37.5, 24.5 + b, 3.6, 2.6, TAN);
  s.pxs([[40, 23 + b], [40, 24 + b]], 0x140806);
  s.pxs([[34, 21 + b], [35, 21 + b]], 0x140806);
  s.px(35, 20 + b, 0xffffff);
  s.pxs([[37, 26 + b], [38, 26 + b], [39, 26 + b]], 0x3a1408);
  s.px(38, 27 + b, 0xf6efe0);
  // Claw scars on its flank.
  for (let k = 0; k < 3; k++) {
    s.pxs([[16 + k * 2, 21 + b], [17 + k * 2, 22 + b], [18 + k * 2, 23 + b]], 0xd09a60);
  }
};

/** Legs and boots of a giant seen from the front: frame 1 lifts the left, 2 the right. */
const giantLegs = (s: Painter, f: ArtFrame, legs: Ramp, boots: Ramp, rad = 5.5) => {
  const l = f.step === 1 ? -2.5 : 0;
  const r = f.step === 2 ? -2.5 : 0;
  s.capsule(28, 52, 28, 61 + l, rad, legs);
  s.capsule(44, 52, 44, 61 + r, rad, legs);
  s.ellipse(27, 64 + l, 7.5, 3.6, boots);
  s.ellipse(45, 64 + r, 7.5, 3.6, boots);
};

const sideOn = (s: Painter, f: ArtFrame) => {
  if (f.view === 'side') {
    s.squash = 0.62;
    s.squashAbout = 36;
  }
};

// ======================= 7–14 min: fantasy creatures =======================

const ghoul: Paint = (s, f) => {
  const b = bobOf(f);
  const w = f.swing;
  s.ground(16, 30.2, 7.5);
  const far = darker(RED);
  s.capsule(13, 21 + b, 13 - 3.5 * w, 28.5, 1.7, far);
  s.ellipse(13 - 3.5 * w + 0.5, 29, 2.2, 1.2, far);
  s.capsule(18, 14 + b, 23 + 1.5 * w, 19 + b, 1.4, far);
  s.ellipse(15, 17 + b, 6.8, 6.2, RED);
  s.capsule(17, 21 + b, 17 + 3.5 * w, 28.5, 1.8, RED);
  s.ellipse(17 + 3.5 * w + 0.8, 29, 2.4, 1.2, RED);
  for (const yy of [15, 17, 19]) {
    s.pxs([[13, yy + b], [14, yy + b], [15, yy + b]], 0x8e2630);
  }
  // The ridge of bone spikes down its back.
  for (const [x, y] of [[9, 13], [11, 11], [14, 10]] as const) {
    s.poly([[x - 1.3, y + 1.6 + b], [x + 1.3, y + 1.6 + b], [x - 0.4, y - 1.8 + b]], BONE);
  }
  const hx = 25 - 1.5 * w;
  s.capsule(19, 14 + b, hx, 18 + b, 1.5, RED);
  for (const dy of [-1, 0, 1]) {
    s.px(hx + 1.5, 18 + dy + b, 0xf2e6d0, 0x3a2c1c);
    s.px(hx + 2.5, 18 + dy * 1.6 + b, 0xf2e6d0, 0x3a2c1c);
  }
  s.circle(21.5, 10 + b, 4.9, RED);
  s.poly([[18.5, 7.5 + b], [20.6, 6.4 + b], [16.6, 2.2 + b]], BONE);
  s.pxs([[23, 8 + b], [24, 8 + b]], EYE_Y);
  s.px(24, 9 + b, 0xff9a2a);
  s.pxs([[22, 12 + b], [23, 12 + b], [24, 12 + b], [25, 12 + b], [23, 13 + b], [24, 13 + b]], 0x3a0d0d);
  s.pxs([[22, 11 + b], [24, 11 + b], [25, 13 + b]], 0xf6efe0);
};

const skeletonMage: Paint = (s, f) => {
  const b = bobOf(f);
  const sway = f.swing;
  s.ground(16, 30.2, 7);
  s.poly([[12, 14 + b], [20, 14 + b], [23 + sway, 29], [9 + sway, 29]], ROBE);
  for (let x = 10; x < 23; x++) {
    s.px(x + sway, 28, 0xd8b040);
  }
  s.rect(11.5, 20 + b, 21, 21 + b, ROPE);
  s.circle(16.5, 10.5 + b, 5.6, ROBE);
  s.ellipse(18, 11.5 + b, 3.2, 3.4, BONE);
  s.pxs([[17, 11 + b], [19, 11 + b]], 0x101010);
  s.pxs([[17, 10 + b], [19, 10 + b]], 0x60ff90);
  s.pxs([[17, 14 + b], [18, 14 + b], [19, 14 + b]], 0x3a2c1c);
  s.px(18, 13 + b, 0x101010);
  const sx = f.cast ? 27 : 25;
  const top = f.cast ? 3 : 5 + b;
  for (let y = top + 3; y < 30; y++) {
    s.px(sx, y, 0x8a5a2b, 0x24140a);
  }
  s.circle(sx, top + 1.5, f.cast ? 3.2 : 2.4, GREENLIGHT);
  const hy = f.cast ? 13 : 17 + b;
  s.capsule(19, 17 + b, sx - 1, hy, 1.1, ROBE);
  s.pxs([[sx - 1, hy], [sx + 1, hy]], 0xe6dcc4, 0x3a2c1c);
  if (f.cast) {
    for (const [x, y] of [[sx - 4, top], [sx + 4, top + 1], [sx, top - 3], [sx - 3, top + 4]] as const) {
      s.px(x, y, 0xb0ffd0);
    }
  }
};

const hellhound: Paint = (s, f) => {
  const w = f.swing;
  const b = w > 0 ? -1.5 : w < 0 ? 0.5 : 0;
  const feet = w > 0 ? 27 : 28.5;
  s.ground(16, 30.2, 8.5);
  const far = darker(SOOT);
  s.chain([[8, 17 + b], [5, 14 + b - w], [3, 10 + b - w]], 1.5, FIRE, 2.2);
  s.capsule(11, 20 + b, 11 - 2 * w + 1, feet, 1.3, far);
  s.capsule(21, 20 + b, 21 + 2 * w - 1, feet, 1.3, far);
  s.ellipse(15.5, 18 + b, 7.8, 4.2, SOOT);
  // A mane of fire along the neck and back.
  for (const [x, y, h] of [[11, 14, 3], [14, 13, 4], [17, 12.5, 4.5], [20, 12, 5], [22.5, 11, 4]] as const) {
    s.poly([[x - 1.6, y + 1.5 + b], [x + 1.6, y + 1.5 + b], [x - 0.4 - w * 0.4, y - h + b]], FIRE);
  }
  s.capsule(9, 20 + b, 9 + 2.4 * w, feet, 1.4, SOOT);
  s.capsule(20, 20 + b, 20 - 2.4 * w + 1, feet, 1.4, SOOT);
  s.capsule(21, 17 + b, 24, 12.5 + b, 2.6, SOOT);
  s.ellipse(25.5, 11.5 + b, 3.6, 2.8, SOOT);
  s.capsule(26.5, 12.6 + b, 30, 13.4 + b, 1.4, SOOT);
  s.poly([[22.4, 10 + b], [23, 4.6 + b], [25, 9.4 + b]], SOOT);
  s.pxs([[26, 10 + b], [27, 10 + b]], 0xffd020);
  s.pxs([[28, 14 + b], [29, 14 + b], [30, 14 + b]], 0xff6a1a);
  s.px(28.5, 14.8 + b, 0xf6efe0);
  s.pxs([[21, 15 + b], [22, 14 + b], [23, 15 + b]], 0xd4dae2, 0x101216);
};

const aberration: Paint = (s, f) => {
  s.ground(16, 30.3, f.leap ? 5 : 7);
  const far = darker(PURP);
  let hx = 18.5;
  let hy = 9.5;
  if (f.leap) {
    s.chain([[12, 17], [7, 20], [3.5, 24]], 1.1, far);
    s.chain([[14, 18], [9, 22.5], [5, 27]], 1.2, PURP);
    s.ellipse(15.5, 15, 5, 4.4, PURP);
    s.chain([[18, 13], [23, 10], [28, 7.5]], 1, PURP);
    s.chain([[17, 16], [23, 15.5], [28.5, 14]], 1, far);
    for (const [x, y] of [[28.5, 6.6], [29.5, 8], [29.2, 13.2], [30, 14.5]] as const) {
      s.px(x, y, 0xe6dbff, 0x1c1040);
    }
    hx = 20;
    hy = 8.5;
  } else {
    s.chain([[13, 19], [9, 22], [11, 28.5]], 1.1, far);
    s.chain([[16.5, 19.5], [21.5, 22.5], [19, 28.5]], 1.2, PURP);
    s.ellipse(10.5, 29, 1.8, 0.9, far);
    s.ellipse(19.5, 29, 2, 1, PURP);
    s.ellipse(15, 16.5, 5.2, 4.6, PURP);
    s.chain([[12, 14], [8, 19], [7.5, 25]], 1, far);
    s.chain([[18, 14], [22.5, 17.5], [24.5, 23.5]], 1.05, PURP);
    for (const [x, y] of [[24, 24.5], [25, 24.8], [26, 24.2]] as const) {
      s.px(x, y, 0xe6dbff, 0x1c1040);
    }
  }
  // A lopsided head: one huge eye, one small, a crooked grin.
  s.ellipse(hx, hy, 5, 4.3, PURP);
  s.circle(hx + 1.6, hy - 0.6, 2.4, ramp(0x1c1040, 0xd8d8e8, 0xf4f4ff, 0xffffff, 0xffffff));
  s.pxs([[hx + 2.2, hy - 0.6], [hx + 2.2, hy + 0.4]], 0x220a40);
  s.px(hx + 1.4, hy - 1.4, 0xffffff);
  s.px(hx - 2.4, hy - 1.2, 0xffe066);
  s.pxs([[hx - 1.5, hy + 2.4], [hx - 0.5, hy + 2.9], [hx + 0.5, hy + 2.6], [hx + 1.5, hy + 3]], 0x1c1040);
  s.px(hx + 0.2, hy + 3.4, 0xf6efe0);
  for (const [x, y] of f.leap ? ([[10.5, 11.5], [12.5, 10.6]] as const) : ([[10.5, 13], [12.5, 11.7]] as const)) {
    s.poly([[x - 1, y + 1.2], [x + 1, y + 1.2], [x - 0.6, y - 1.8]], darker(PURP, 2));
  }
};

const troll: Paint = (s, f) => {
  const b = bobOf(f);
  const w = f.swing;
  s.ground(21, 39.6, 12);
  const far = darker(TROLL);
  s.capsule(17, 30 + b, 17 - 3 * w, 37.5, 3, far);
  s.ellipse(17 - 3 * w + 1, 38.5, 3.6, 1.6, far);
  s.capsule(14, 15 + b, 9 + 1.5 * w, 30 + b, 3, far);
  s.circle(9 + 1.5 * w, 31 + b, 3.6, far);
  s.ellipse(20, 21 + b, 12, 11, TROLL);
  s.ellipse(25, 25 + b, 6.5, 6, ramp(0x260a30, 0xb05ac8, 0xd486e6, 0xe6aaf2, 0xf6d2fa));
  s.poly([[13, 27 + b], [29, 27 + b], [27, 34 + b], [15, 34 + b]], LEATHER);
  s.rect(12.5, 26.5 + b, 29.5, 27.8 + b, ROPE);
  s.capsule(24, 31 + b, 24 + 3 * w, 37.5, 3.2, TROLL);
  s.ellipse(24 + 3 * w + 1.5, 38.5, 4, 1.7, TROLL);
  // Head sunk low between the shoulders: one yellow eye, tusks up.
  s.ellipse(31, 15 + b, 6.2, 5.6, TROLL);
  s.ellipse(36, 17 + b, 2.4, 2, TROLL);
  s.pxs([[32, 12 + b], [33, 12 + b], [34, 12 + b], [35, 12 + b], [36, 13 + b]], 0x260a30);
  s.pxs([[33, 13 + b], [34, 13 + b], [33, 14 + b], [34, 14 + b]], EYE_Y);
  s.px(34, 14 + b, 0x3a2400);
  s.px(33, 13 + b, 0xffffff);
  s.pxs([[31, 19 + b], [32, 19 + b], [33, 19 + b], [34, 19 + b], [35, 19 + b], [32, 20 + b], [33, 20 + b], [34, 20 + b]], 0x3a0a3a);
  for (const x of [31, 35]) {
    s.pxs([[x, 19 + b], [x, 18 + b]], 0xf6efe0, 0x3a2c1c);
    s.px(x, 17 + b, 0xffffff, 0x3a2c1c);
  }
  // The near arm, a fist nearly at the ground, an iron-studded band.
  s.capsule(27, 17 + b, 31 - 2 * w, 29 + b, 3.6, TROLL, undefined, 3.2);
  for (let k = 0; k < 4; k++) {
    s.px(28.5 - 2 * w + k * 1.4, 24.5 + b + k * 0.6, 0xd4dae2, 0x101216);
  }
  s.circle(32 - 2 * w, 31.5 + b, 4.4, TROLL);
  for (let i = 0; i < 3; i++) {
    s.px(34 - 2 * w, 29.5 + 1.6 * i + b, 0x7a2a90);
  }
  s.pxs([[15, 14 + b], [16, 15 + b], [17, 14 + b], [18, 15 + b], [19, 14 + b]], 0xf0b8f8);
};

const crownedGiant: Paint = (s, f) => {
  sideOn(s, f);
  const back = f.view === 'back';
  s.ground(36, 67.5, 22, 2.6);
  giantLegs(s, f, BLACK, BOOT);
  // Arms hanging, iron bracers, big fists.
  for (const side of [-1, 1]) {
    const ax = 36 + side * 22;
    s.capsule(36 + side * 15, 30, ax, 46, 6, GREY);
    s.rect(ax - 6.5, 42, ax + 6.5, 46, STEEL);
    s.pxs([[ax - 4, 44], [ax, 44], [ax + 4, 44]], 0xd4dae2);
    s.circle(ax, 51, 6.6, GREY);
    for (let k = 0; k < 3; k++) {
      s.px(ax - 3 + 3 * k, 55, 0x50555f);
    }
  }
  for (const side of [-1, 1]) {
    s.ellipse(36 + side * 17, 28, 8, 5.2, STEEL);
    s.px(36 + side * 17, 26, 0xd4dae2);
    s.px(36 + side * 17 - 3, 27, 0xd4dae2);
  }
  s.ellipse(36, 41, 20, 17, GREY);
  if (back) {
    for (let y = 30; y < 50; y += 2) {
      s.px(36, y, 0x50555f);
    }
  } else {
    s.ellipse(36, 45, 13, 10, ramp(0x14161b, 0x7d838f, 0x9aa0ac, 0xb6bcc6, 0xd8dde4));
    s.pxs([[33, 45], [34, 46], [35, 45], [36, 46], [37, 45], [38, 46], [39, 45]], 0x7d838f);
    for (let i = 0; i < 7; i++) {
      s.px(23 + i, 32 + (i % 2), 0xd0d5dd);
    }
  }
  s.rect(16.5, 51, 55.5, 55, BLACK);
  for (let x = 19; x < 54; x += 4) {
    s.px(x, 53, 0x555a66);
  }
  if (!back) {
    s.rect(32, 50, 40, 56, CROWN);
    s.pxs([[35, 52], [36, 52], [35, 53], [36, 53]], 0x3a2400);
  }
  // Head: a heavy brow, yellow eyes, tusks, the crown.
  s.circle(36, 19, 10.5, GREY);
  if (!back) {
    s.ellipse(36, 25, 7.5, 3.6, darker(GREY));
    for (const ex of [31, 40]) {
      s.pxs([[ex, 16], [ex + 1, 16], [ex + 2, 16]], 0x14161b);
      s.pxs([[ex, 18], [ex + 1, 18], [ex, 19], [ex + 1, 19]], EYE_Y);
      s.px(ex + 1, 19, 0x3a2400);
      s.px(ex, 18, 0xffffff);
    }
    s.pxs([[35, 21], [36, 21]], 0x3c424c);
    for (let x = 31; x < 42; x++) s.px(x, 25, 0x1a0606);
    for (let x = 32; x < 41; x++) s.px(x, 26, 0x1a0606);
    for (const tx of [32, 40]) {
      s.pxs([[tx, 25], [tx, 24], [tx, 23]], 0xf6efe0, 0x3a2c1c);
      s.px(tx, 22, 0xffffff, 0x3a2c1c);
    }
  }
  s.poly([[26.5, 11], [27.5, 3], [31, 8], [36, 1.5], [41, 8], [44.5, 3], [45.5, 11]], CROWN);
  s.rect(26.5, 9, 45.5, 12, CROWN);
  s.pxs([[35, 6], [36, 6], [35, 7], [36, 7]], 0xe0304a, 0x3a2400);
  s.pxs([[29, 10], [43, 10]], 0x30a0e0);
};

const lionChimera: Paint = (s, f) => {
  const up = f.leap ? -6 : 0;
  s.ground(40, 66, f.leap ? 14 : 20, 2.6);
  const far = darker(LION);
  const reach = f.leap ? [[-6, -3], [-4, -2], [6, -3], [8, -4]] : [[0, 0], [0, 0], [0, 0], [0, 0]];
  [26, 34, 46, 54].forEach((x, i) => {
    const r = i % 2 ? far : LION;
    const [dx, dy] = reach[i]!;
    s.capsule(x, 46 + up, x + dx!, 60 + up + dy!, i % 2 === 0 ? 3.4 : 3, r);
    s.ellipse(x + dx! + 1.5, 61.5 + up + dy!, 4, 2.2, r);
    for (let k = 0; k < 3; k++) {
      s.px(x + dx! + k + 1, 63 + up + dy!, 0xf6efe0, 0x2e1f08);
    }
  });
  // The snake: rising from the hindquarters, head over the back.
  s.chain([[22, 44 + up], [14, 40 + up], [10, 31 + up], [13, 22 + up], [19, 18 + up]], 3.4, SNAKE, 2.6);
  for (const [x, y] of [[14, 40], [10, 32], [12, 24]] as const) {
    s.pxs([[x, y + up], [x + 1, y + 1 + up]], 0xd8e890);
  }
  s.ellipse(21.5, 17 + up, 4.6, 3.4, SNAKE);
  s.px(23, 15.5 + up, EYE_Y);
  s.px(23, 16.5 + up, DARK);
  s.pxs([[26, 18 + up], [27, 18 + up], [28, 17 + up], [28, 19 + up]], 0xe03040, 0x3a0a10);
  s.ellipse(40, 43 + up, 18, 10.5, LION);
  s.ellipse(40, 47 + up, 13, 5, ramp(0x2e1f08, 0xc9a25a, 0xe2c27e, 0xf0d8a0, 0xfaecc8));
  s.circle(54, 34 + up, 12.5, MANE);
  for (let a = 0; a < 360; a += 30) {
    const r = (a * Math.PI) / 180;
    s.px(54 + Math.cos(r) * 10.5, 34 + up + Math.sin(r) * 10.5, 0x8a5730);
  }
  s.ellipse(57.5, 36 + up, 7.5, 7, LION);
  s.ellipse(62, 39 + up, 3.6, 2.6, ramp(0x2e1f08, 0xc9a25a, 0xf0d8a0, 0xfaecc8, 0xffffff));
  s.pxs([[64, 37 + up], [65, 37 + up]], 0x2a1a0a);
  s.pxs([[58, 33 + up], [59, 33 + up]], 0x1a0a0a);
  s.px(59, 34 + up, EYE_R);
  s.px(58, 34 + up, 0xff9a9a);
  s.pxs([[59, 31 + up], [60, 31 + up], [61, 32 + up]], 0x4a2a10);
  s.pxs([[59, 42 + up], [60, 42 + up], [61, 42 + up], [62, 42 + up]], 0x3a0a0a);
  s.pxs([[60, 41 + up], [62, 43 + up]], 0xf6efe0);
  // Goat's horns, curling back.
  s.chain([[50, 24 + up], [48, 17 + up], [51, 11 + up]], 2.2, BONE, 0.8);
  s.chain([[57, 24 + up], [58, 16 + up], [62, 11 + up]], 2.2, BONE, 0.8);
  for (const [x, y] of [[49, 20], [58, 19], [59.5, 15]] as const) {
    s.px(x, y + up, 0xb8a888);
  }
  if (f.cast) {
    for (let x = 28; x < 50; x += 5) {
      s.poly([[x - 1.4, 34 + up], [x + 1.4, 34 + up], [x, 26 + up]], BONE);
    }
  }
};

// ======================= 14+ min: machines =======================

const scrapBot: Paint = (s, f) => {
  const b = bobOf(f);
  const w = f.swing;
  s.ground(16, 30.2, 7);
  const far = darker(GUN);
  s.capsule(13.5, 22 + b, 13.5 - 2.5 * w, 28.5, 1.4, far);
  s.rect(10.5 - 2.5 * w, 28, 15.5 - 2.5 * w, 29.5, far);
  s.capsule(18, 15 + b, 25, 18 + b, 1.2, far);
  s.rect(10, 12 + b, 21, 22 + b, STEEL);
  s.rect(10, 17 + b, 21, 18.6 + b, HAZ);
  for (const x of [10, 12, 14, 16, 18, 20]) s.px(x, 18 + b, 0x1a1400);
  s.pxs([[11, 13 + b], [20, 13 + b], [11, 21 + b], [20, 21 + b]], 0x2a3038);
  s.pxs([[13, 20 + b], [14, 20 + b], [14, 21 + b]], 0x9a5228);
  s.capsule(17.5, 22 + b, 17.5 + 2.5 * w, 28.5, 1.5, GUN);
  s.circle(17.5 + 1.2 * w, 25, 1.6, STEEL);
  s.rect(15.5 + 2.5 * w, 28, 21 + 2.5 * w, 29.5, GUN);
  // Head: a dome, one wide visor, an antenna.
  s.circle(17.5, 8.5 + b, 4.4, GUN);
  s.rect(16, 7 + b, 22.5, 9.4 + b, GLASS);
  s.pxs([[20, 8 + b], [21, 8 + b]], 0xffffff);
  for (let y = 1; y < 5; y++) s.px(15, y + b, 0x96a0b0, 0x0a0c10);
  s.px(15, b, RED_GLOW);
  s.capsule(19, 14.5 + b, 25, 16 + b, 1.4, STEEL);
  s.pxs([[26, 14 + b], [27, 13 + b], [26, 17 + b], [27, 18 + b]], 0xd4dae2, 0x101216);
  s.pxs([[7, 13 + b], [7, 15 + b], [8, 14 + b]], 0x8a8a8a);
};

const gunnerBot: Paint = (s, f) => {
  const b = bobOf(f);
  const w = f.swing;
  s.ground(15.5, 30.2, 6.5);
  s.rect(7, 13 + b, 10.5, 21 + b, GUN);
  s.pxs([[8, 15 + b], [8, 16 + b], [8, 17 + b]], CYAN);
  const far = darker(GUN);
  s.capsule(14, 22 + b, 14 - 2.5 * w, 28.5, 1.3, far);
  s.rect(11.5 - 2.5 * w, 28, 16 - 2.5 * w, 29.5, far);
  s.ellipse(15, 18 + b, 4.6, 5.6, STEEL);
  s.capsule(17.5, 22 + b, 17.5 + 2.5 * w, 28.5, 1.4, GUN);
  s.rect(16.5 + 2.5 * w, 28, 21 + 2.5 * w, 29.5, GUN);
  s.rect(12, 20.5 + b, 18.5, 22 + b, HAZ);
  s.circle(16, 9.5 + b, 4.4, STEEL);
  s.rect(15, 8 + b, 21, 10.6 + b, GUN);
  s.pxs([[19, 9 + b], [20, 9 + b]], RED_GLOW);
  s.px(18, 9 + b, 0xff9090);
  // The arm is a cannon.
  const cb = f.cast ? 0 : b;
  s.rect(15, 14.5 + cb, 27, 18 + cb, GUN);
  s.rect(25, 14 + cb, 28.5, 18.5 + cb, STEEL);
  s.pxs([[29, 16 + cb], [29, 17 + cb]], 0x0a0c10);
  for (const x of [17, 19, 21]) s.px(x, 15 + cb, CYAN);
  if (f.cast) {
    s.pxs([[30, 15], [30, 16], [30, 17], [31, 16], [31, 15], [31, 17]], 0xff7a9c);
    s.px(30, 16, 0xffffff);
  }
};

const roboHound: Paint = (s, f) => {
  const w = f.swing;
  const b = w > 0 ? -1.5 : w < 0 ? 0.5 : 0;
  const feet = w > 0 ? 27 : 28.5;
  s.ground(16, 30.2, 8.5);
  const far = darker(STEEL);
  for (let i = 0; i < 5; i++) {
    s.px(8 - i * 1.2, 16 - i * 1.2 + b - w * i * 0.3, [0x48505c, 0x96a0b0][i % 2]!, 0x0a0c10);
  }
  s.capsule(11, 20 + b, 11 - 2 * w + 1, feet, 1.1, far);
  s.capsule(21, 20 + b, 21 + 2 * w - 1, feet, 1.1, far);
  s.ellipse(15.5, 18 + b, 7.6, 3.8, STEEL);
  s.rect(10, 15 + b, 20, 16 + b, HAZ);
  s.pxs([[11, 18 + b], [14, 18 + b], [17, 18 + b], [20, 18 + b]], 0x2a3038);
  s.capsule(9, 20 + b, 9 + 2.4 * w, feet, 1.2, GUN);
  s.capsule(20, 20 + b, 20 - 2.4 * w + 1, feet, 1.2, GUN);
  s.capsule(21, 17 + b, 24, 12.5 + b, 2.2, GUN);
  s.ellipse(25.5, 11.5 + b, 3.6, 2.6, STEEL);
  s.rect(26, 12 + b, 30.5, 14 + b, GUN);
  s.poly([[22.4, 10 + b], [23.4, 4.6 + b], [25, 9.4 + b]], GUN);
  s.pxs([[26, 10 + b], [27, 10 + b], [28, 10 + b]], RED_GLOW);
  s.pxs([[27, 14 + b], [28, 14 + b], [29, 14 + b]], 0xd4dae2);
};

const springBot: Paint = (s, f) => {
  s.ground(16, 30.3, f.leap ? 4 : 6);
  const top = f.leap ? 7 : 12;
  const bottom = 28.5;
  const n = f.leap ? 7 : 5;
  // The coil, zigzag from the body to the foot.
  for (let i = 0; i < n * 2; i++) {
    const y = top + 5 + ((bottom - top - 6) * i) / (n * 2);
    const ny = top + 5 + ((bottom - top - 6) * (i + 1)) / (n * 2);
    const x = i % 2 === 0 ? 13 : 19;
    const nx = i % 2 === 0 ? 19 : 13;
    for (let k = 0; k <= 6; k++) {
      s.px(x + ((nx - x) * k) / 6, y + ((ny - y) * k) / 6, 0x96a0b0, 0x0a0c10);
    }
  }
  s.ellipse(16, bottom, 5, 1.6, GUN);
  s.circle(16, top, 6, STEEL);
  s.rect(10.5, top + 2, 21.5, top + 3, HAZ);
  s.circle(18.5, top - 1, 2.8, GLASS);
  s.pxs([[19, top - 1], [20, top - 1]], 0x062030);
  s.px(18, top - 2, 0xffffff);
  s.capsule(11, top + 1, 7, top + 4, 0.9, GUN);
  s.capsule(21, top + 1, 25, top + 3, 0.9, GUN);
  if (f.leap) {
    s.pxs([[15, 30], [16, 30], [17, 30], [16, 31]], ORANGE);
  }
};

const heavyMech: Paint = (s, f) => {
  const b = bobOf(f);
  const w = f.swing;
  s.ground(21, 39.6, 13);
  const far = darker(GUN);
  s.rect(7, 6 + b, 10, 14 + b, far);
  s.pxs([[8, 4 + b], [9, 3 + b], [7, 2 + b]], 0x8a8a8a);
  s.capsule(16, 30 + b, 16 - 2.5 * w, 37.5, 3.2, far);
  s.rect(11.5 - 2.5 * w, 36, 20.5 - 2.5 * w, 38.5, far);
  s.capsule(14, 15 + b, 9 + 1.5 * w, 30 + b, 3, far);
  s.circle(9 + 1.5 * w, 31.5 + b, 3.8, far);
  s.rect(9, 9 + b, 31, 30 + b, GUN);
  s.rect(9, 9 + b, 31, 12 + b, HAZ);
  for (let x = 10; x < 31; x += 3) s.pxs([[x, 10 + b], [x, 11 + b]], 0x1a1400);
  s.rect(23, 14 + b, 30, 20 + b, GLASS);
  s.pxs([[25, 17 + b], [26, 17 + b], [25, 18 + b]], 0x103040);
  s.pxs([[24, 15 + b], [25, 15 + b]], 0xffffff);
  s.pxs([[11, 22 + b], [11, 27 + b], [20, 22 + b], [20, 27 + b]], 0x96a0b0);
  s.capsule(26, 31 + b, 26 + 2.5 * w, 37.5, 3.4, GUN);
  s.rect(21 + 2.5 * w, 36, 31 + 2.5 * w, 38.5, GUN);
  s.capsule(28, 18 + b, 32 - w, 28 + b, 3.6, STEEL);
  s.rect(28 - w, 22 + b, 36 - w, 31 + b, STEEL);
  for (let i = 0; i < 3; i++) s.pxs([[36 - w, 23 + i * 3 + b], [35 - w, 23 + i * 3 + b]], 0x2a3038);
  s.pxs([[29 - w, 24 + b], [30 - w, 24 + b]], CYAN);
};

/**
 * Each kind's looks, era by era. A kind with one look (MONSTER_ERAS.steady:
 * the 우두머리 and the 키메라, the user's word) wears it in every era; the
 * 도망자 is in none — it keeps its star.
 */
export const ERA_LOOKS: Partial<Record<EnemyKind, readonly Look[]>> = {
  grunt: [{ design: 32, paint: zombie }, { design: 32, paint: ghoul }, { design: 32, paint: scrapBot }],
  shooter: [{ design: 32, paint: goblinTorch }, { design: 32, paint: skeletonMage }, { design: 32, paint: gunnerBot }],
  runner: [{ design: 32, paint: jackal }, { design: 32, paint: hellhound }, { design: 32, paint: roboHound }],
  erratic: [{ design: 32, paint: toad }, { design: 32, paint: aberration }, { design: 32, paint: springBot }],
  brute: [{ design: 42, paint: bear }, { design: 42, paint: troll }, { design: 42, paint: heavyMech }],
  boss: [{ design: 72, paint: crownedGiant }],
  chimera: [{ design: 72, paint: lionChimera }],
};

const STAND: ArtFrame = { swing: 0, passing: false, cast: false, leap: false, step: 0, view: 'front' };

/** Every picture a kind needs, keyed as Enemy reads them off `base`. */
function framesFor(kind: EnemyKind, base: string): { key: string; frame: ArtFrame }[] {
  const spec = ENEMY_KINDS[kind];
  const out = [{ key: base, frame: STAND }];
  if (spec.giant) {
    out.push(
      { key: giantFrame(base, 1), frame: { ...STAND, step: 1 } },
      { key: giantFrame(base, 2), frame: { ...STAND, step: 2 } },
      { key: giantFrame(base, 3), frame: { ...STAND, view: 'side' } },
      { key: giantFrame(base, 4), frame: { ...STAND, view: 'back' } },
    );
  } else if (spec.walk) {
    for (let step = 0; step < ENEMY_WALK_STEPS; step++) {
      out.push({ key: enemyWalk(base, step), frame: { ...STAND, swing: [1, 0, -1, 0][step % 4]!, passing: step % 2 === 1 } });
    }
    if (spec.poses) {
      out.push({ key: enemyPose(base, 'cast'), frame: { ...STAND, cast: true } });
    }
  } else {
    // Hoppers and the 키메라: standing, the leap, and (the 키메라) the cast.
    out.push({ key: enemyPose(base, 'leap'), frame: { ...STAND, leap: true } });
    out.push({ key: enemyPose(base, 'cast'), frame: { ...STAND, cast: true } });
  }
  return out;
}

/** Paints every era's pictures into the texture manager (BootScene, dev server only for now). */
export function paintEraTextures(scene: Phaser.Scene): void {
  // Painted on a grid `pixelScale` of the picture (0.5: a dot is two game
  // pixels, the user's pick), then blown up by whole pixels; Enemy shows it
  // at the kind's own size (`baseScale`), a pixel or so either way.
  const blow = Math.round(1 / MONSTER_ERAS.pixelScale);
  for (const [kind, looks] of Object.entries(ERA_LOOKS) as [EnemyKind, readonly Look[]][]) {
    const spec = ENEMY_KINDS[kind];
    const grid = Math.round((spec.giant?.drawn ?? spec.drawn ?? spec.size) / blow);
    looks.forEach((look, era) => {
      for (const { key, frame } of framesFor(kind, eraTexture(spec.texture, era))) {
        if (scene.textures.exists(key)) {
          continue;
        }
        const painter = new Painter(grid, grid, look.design);
        look.paint(painter, frame);
        const small = document.createElement('canvas');
        small.width = grid;
        small.height = grid;
        small.getContext('2d')!.putImageData(new ImageData(painter.render() as Uint8ClampedArray<ArrayBuffer>, grid, grid), 0, 0);
        const canvas = document.createElement('canvas');
        canvas.width = grid * blow;
        canvas.height = grid * blow;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, grid * blow, grid * blow);
        scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    });
  }
}

/** Whether runs wear the era looks: the dev server only while devOnly, and never the harness unless a page asks. */
export function erasOn(): boolean {
  const w = window as unknown as { __harness?: boolean; __erasOn?: boolean };
  if (MONSTER_ERAS.devOnly && !import.meta.env.DEV) {
    return false;
  }
  if (w.__erasOn !== undefined) {
    return w.__erasOn;
  }
  return !w.__harness && location.hash !== '#run';
}

/** Which era a run is in at `elapsedMs`. */
export function eraAt(elapsedMs: number): number {
  let era = 0;
  MONSTER_ERAS.fromMs.forEach((from, i) => {
    if (elapsedMs >= from) {
      era = i;
    }
  });
  return era;
}

/** The base texture a kind spawning now wears. */
export function monsterLook(kind: EnemyKind, elapsedMs: number): string {
  const spec = ENEMY_KINDS[kind];
  if (!erasOn()) {
    return spec.texture;
  }
  const looks = ERA_LOOKS[kind];
  if (!looks) {
    return spec.flashy ? fineTexture(spec.texture) : spec.texture;
  }
  return eraTexture(spec.texture, Math.min(eraAt(elapsedMs), looks.length - 1));
}
