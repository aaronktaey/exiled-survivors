/**
 * Pixel art painted from shapes (0.146, dev only for now): a monster is laid
 * down as parts — ellipses, capsules, polygons — on a grid, then each part is
 * shaded on its own (lit from the top left, a dark seam where something in
 * front overlaps it), flat detail pixels go on top, and everything gets a
 * one-pixel outline in the darkest tone of what it borders.
 *
 * Shapes are given in design units (a 32 or 72 square, say) and painted at
 * the size the monster is drawn, so the art follows `drawn` in the tables.
 * `squash` narrows everything round `squashAbout`, for a giant seen side on.
 */

/** Five tones, darkest first: outline, shade, body, light, highlight. */
export type Ramp = readonly [number, number, number, number, number];

export const ramp = (o: number, d: number, m: number, l: number, h: number): Ramp => [o, d, m, l, h];

const mixColor = (a: number, b: number, t: number): number => {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
};

/** One step down the ramp: the far limbs, the side in shadow. */
export function darker(r: Ramp, steps = 1): Ramp {
  let [o, d, m, l, h] = r;
  for (let i = 0; i < steps; i++) {
    [d, m, l, h] = [mixColor(d, o, 0.35), d, mixColor(m, d, 0.4), m];
  }
  return [o, d, m, l, h];
}

type Test = (x: number, y: number) => boolean;

export class Painter {
  private readonly part: Int32Array;
  private readonly over = new Map<number, { color: number; outline: number | null }>();
  private readonly ramps: Ramp[] = [];
  private readonly shadow = new Set<number>();
  private readonly k: number;
  /** Side on: x pulled toward `squashAbout` by this much. */
  public squash = 1;
  public squashAbout = 0;

  public constructor(
    public readonly w: number,
    public readonly h: number,
    design: number,
  ) {
    this.k = w / design;
    this.part = new Int32Array(w * h).fill(-1);
  }

  private toOut(x: number): number {
    return (this.squashAbout + (x - this.squashAbout) * this.squash) * this.k;
  }

  private toDesign(ox: number, oy: number): [number, number] {
    return [this.squashAbout + (ox / this.k - this.squashAbout) / this.squash, oy / this.k];
  }

  private fill(test: Test, r: Ramp, x0: number, y0: number, x1: number, y1: number, part?: number): number {
    const id = part ?? this.ramps.length;
    this.ramps[id] = r;
    const ax = Math.min(this.toOut(x0), this.toOut(x1));
    const bx = Math.max(this.toOut(x0), this.toOut(x1));
    for (let y = Math.max(0, Math.floor(y0 * this.k) - 1); y <= Math.min(this.h - 1, Math.ceil(y1 * this.k) + 1); y++) {
      for (let x = Math.max(0, Math.floor(ax) - 1); x <= Math.min(this.w - 1, Math.ceil(bx) + 1); x++) {
        const [dx, dy] = this.toDesign(x + 0.5, y + 0.5);
        if (test(dx, dy)) {
          this.part[y * this.w + x] = id;
          this.over.delete(y * this.w + x);
        }
      }
    }
    return id;
  }

  public ellipse(cx: number, cy: number, rx: number, ry: number, r: Ramp, part?: number): number {
    return this.fill((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, r, cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, part);
  }

  public circle(cx: number, cy: number, rad: number, r: Ramp, part?: number): number {
    return this.ellipse(cx, cy, rad, rad, r, part);
  }

  public rect(x0: number, y0: number, x1: number, y1: number, r: Ramp, part?: number): number {
    return this.fill((x, y) => x0 <= x && x <= x1 && y0 <= y && y <= y1, r, x0 - 1, y0 - 1, x1 + 1, y1 + 1, part);
  }

  public capsule(x0: number, y0: number, x1: number, y1: number, rad: number, r: Ramp, part?: number, rad1 = rad): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = dx * dx + dy * dy;
    const test: Test = (x, y) => {
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len));
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      const rr = rad + (rad1 - rad) * t;
      return (x - px) ** 2 + (y - py) ** 2 <= rr * rr;
    };
    const m = Math.max(rad, rad1) + 1;
    return this.fill(test, r, Math.min(x0, x1) - m, Math.min(y0, y1) - m, Math.max(x0, x1) + m, Math.max(y0, y1) + m, part);
  }

  /** Capsules joined end to end, tapering from `rad` to `rad1`, as one part. */
  public chain(pts: readonly (readonly [number, number])[], rad: number, r: Ramp, rad1 = rad): number {
    let part: number | undefined;
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = rad + ((rad1 - rad) * i) / n;
      const b = rad + ((rad1 - rad) * (i + 1)) / n;
      part = this.capsule(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], a, r, part, b);
    }
    return part ?? -1;
  }

  public poly(pts: readonly (readonly [number, number])[], r: Ramp, part?: number): number {
    const test: Test = (x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      return inside;
    };
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return this.fill(test, r, Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1, part);
  }

  /** One flat pixel (an eye, a tooth), outlined in `outline` where it sticks out. */
  public px(x: number, y: number, color: number, outline: number | null = null): void {
    const ox = Math.floor(this.toOut(x));
    const oy = Math.floor(y * this.k);
    if (ox >= 0 && ox < this.w && oy >= 0 && oy < this.h) {
      this.over.set(oy * this.w + ox, { color, outline });
    }
  }

  public pxs(pts: readonly (readonly [number, number])[], color: number, outline: number | null = null): void {
    for (const [x, y] of pts) {
      this.px(x, y, color, outline);
    }
  }

  /** The soft shadow it stands on. */
  public ground(cx: number, cy: number, rx: number, ry = 1.6): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const [dx, dy] = this.toDesign(x + 0.5, y + 0.5);
        if (((dx - cx) / rx) ** 2 + ((dy - cy) / ry) ** 2 <= 1) {
          this.shadow.add(y * this.w + x);
        }
      }
    }
  }

  /** Shades, outlines and hands back the RGBA pixels. */
  public render(): Uint8ClampedArray {
    const { w, h, part } = this;
    const get = (x: number, y: number): number => (x >= 0 && x < w && y >= 0 && y < h ? part[y * w + x]! : -1);
    const boxes = new Map<number, [number, number, number, number]>();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = part[y * w + x]!;
        if (p < 0) {
          continue;
        }
        const b = boxes.get(p);
        if (!b) {
          boxes.set(p, [x, y, x, y]);
        } else {
          b[0] = Math.min(b[0], x);
          b[1] = Math.min(b[1], y);
          b[2] = Math.max(b[2], x);
          b[3] = Math.max(b[3], y);
        }
      }
    }
    const out = new Int32Array(w * h).fill(-1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = part[y * w + x]!;
        if (p < 0) {
          continue;
        }
        const [, d, m, l, hi] = this.ramps[p]!;
        const nu = get(x, y - 1);
        const nd = get(x, y + 1);
        const nl = get(x - 1, y);
        const nr = get(x + 1, y);
        // Light and shade only against the empty; where parts meet, the one
        // behind takes a dark seam instead.
        const up = nu < 0;
        const down = nd !== p;
        const left = nl < 0;
        const right = nr < 0;
        const [bx0, by0, bx1, by1] = boxes.get(p)!;
        const hgt = by1 - by0 + 1;
        const wid = bx1 - bx0 + 1;
        const ry = (y - by0) / Math.max(1, hgt - 1);
        const rx = (x - bx0) / Math.max(1, wid - 1);
        let tone = m;
        if (hgt >= 7 && ry > 0.72) tone = d;
        if (wid >= 7 && rx > 0.85 && ry > 0.3) tone = d;
        if (up && !down) tone = left && hgt >= 4 ? hi : l;
        else if (down && !up) tone = d;
        else if (right && !left && !up) tone = d;
        else if (left && !right && hgt >= 5 && ry < 0.6) tone = l;
        if (hgt >= 9 && wid >= 9 && rx > 0.15 && rx < 0.38 && ry > 0.12 && ry < 0.3 && !up) tone = l;
        if ([nu, nd, nl, nr].some((q) => q >= 0 && q > p)) tone = d;
        out[y * w + x] = tone;
      }
    }
    const flatOutline = new Map<number, number>();
    for (const [i, { color, outline }] of this.over) {
      out[i] = color;
      if (part[i]! < 0 && outline !== null) {
        flatOutline.set(i, outline);
      }
    }
    const rgba = new Uint8ClampedArray(w * h * 4);
    const put = (i: number, c: number, a: number) => {
      rgba[i * 4] = (c >> 16) & 255;
      rgba[i * 4 + 1] = (c >> 8) & 255;
      rgba[i * 4 + 2] = c & 255;
      rgba[i * 4 + 3] = a;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (out[i]! >= 0) {
          put(i, out[i]!, 255);
          continue;
        }
        let line = -1;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || out[ny * w + nx]! < 0) {
            continue;
          }
          const p = part[ny * w + nx]!;
          if (p >= 0) {
            line = this.ramps[p]![0];
            break;
          }
          const ol = flatOutline.get(ny * w + nx);
          if (ol !== undefined) {
            line = ol;
            break;
          }
        }
        if (line >= 0) {
          put(i, line, 255);
        } else if (this.shadow.has(i)) {
          put(i, 0, 80);
        }
      }
    }
    return rgba;
  }
}
