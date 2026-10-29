import Phaser from 'phaser';

/**
 * A 5x7 uppercase pixel font, drawn as blocks. It exists so the title can
 * be a real pixel-art logo rather than a web font pretending to be one;
 * everything else in the game still uses system text.
 */
const GLYPHS: Record<string, readonly string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

const GLYPH_W = 5;
const GLYPH_H = 7;
/** Blank columns between letters, and blank rows between lines. */
const LETTER_GAP = 1;
const LINE_GAP = 2;

const lineWidth = (line: string): number =>
  line.length * (GLYPH_W + LETTER_GAP) - LETTER_GAP;

export interface GlowLogoOptions {
  /** Side of one unit cell, in screen px. A line's `scale` makes its glyph cells that many units. */
  readonly pixel: number;
  readonly face: string;
  /** The bottom half of a scaled-up line, so its letters read in two tones. */
  readonly lower: string;
  /** The drop under every letter, and the colour of the glow. */
  readonly shade: string;
  readonly outline: string;
  /** Blur of the glow, in px; the texture keeps `pad` px of room round the letters for it. */
  readonly glow: number;
  readonly pad: number;
}

/**
 * The Nox Survivors logo (0.158, the user's pick of the sheet: C-2 with
 * a halo): the same 5x7 letters, a line drawn larger by `scale`, a dark
 * outline round every letter, a drop of `shade` under it, and the whole
 * thing glowing `shade`. Drawn on a canvas, as the glow is a canvas blur.
 */
export function createGlowLogoTexture(
  scene: Phaser.Scene,
  key: string,
  lines: readonly { readonly text: string; readonly scale: number }[],
  options: GlowLogoOptions,
): { width: number; height: number } {
  const { pixel, pad } = options;
  const lineUnits = (line: { text: string; scale: number }): number => lineWidth(line.text) * line.scale;
  const unitsWide = Math.max(...lines.map(lineUnits));
  const cells: { x: number; y: number; line: number; upper: boolean }[] = [];
  let top = 0;
  lines.forEach((line, lineIndex) => {
    const s = line.scale;
    const indent = Math.round((unitsWide - lineUnits(line)) / 2);
    [...line.text.toUpperCase()].forEach((character, charIndex) => {
      GLYPHS[character]?.forEach((row, rowIndex) => {
        [...row].forEach((cell, colIndex) => {
          if (cell !== '1') {
            return;
          }
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) {
              cells.push({
                x: indent + (charIndex * (GLYPH_W + LETTER_GAP) + colIndex) * s + dx,
                y: top + rowIndex * s + dy,
                line: lineIndex,
                upper: rowIndex * s + dy < (GLYPH_H * s) / 2,
              });
            }
          }
        });
      });
    });
    top += GLYPH_H * s + (lineIndex < lines.length - 1 ? LINE_GAP : 0);
  });

  // One unit of outline all round, and one more under for the drop.
  const unitsHigh = top + 3;
  const width = (unitsWide + 2) * pixel + pad * 2;
  const height = unitsHigh * pixel + pad * 2;
  const art = document.createElement('canvas');
  art.width = width;
  art.height = height;
  const ctx = art.getContext('2d')!;
  const at = (x: number, y: number): void => ctx.fillRect(pad + (x + 1) * pixel, pad + (y + 1) * pixel, pixel, pixel);
  const key2 = (x: number, y: number): string => `${x},${y}`;
  const on = new Set(cells.map((c) => key2(c.x, c.y)));

  ctx.fillStyle = options.outline;
  const ring = new Set<string>();
  cells.forEach((c) => {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = key2(c.x + dx, c.y + dy);
        if (!on.has(k) && !ring.has(k)) {
          ring.add(k);
          at(c.x + dx, c.y + dy);
        }
      }
    }
  });
  ctx.fillStyle = options.shade;
  cells.forEach((c) => {
    if (!on.has(key2(c.x, c.y + 1))) {
      at(c.x, c.y + 1);
    }
  });
  cells.forEach((c) => {
    ctx.fillStyle = lines[c.line]!.scale > 1 && !c.upper ? options.lower : options.face;
    at(c.x, c.y);
  });

  // The halo: the art laid down twice with a blur of its shade behind it, then once plain.
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) {
    return { width, height };
  }
  const out = texture.getContext();
  out.shadowColor = options.shade;
  out.shadowBlur = options.glow;
  out.drawImage(art, 0, 0);
  out.shadowBlur = options.glow * 0.4;
  out.drawImage(art, 0, 0);
  out.shadowBlur = 0;
  out.drawImage(art, 0, 0);
  texture.refresh();

  return { width, height };
}
