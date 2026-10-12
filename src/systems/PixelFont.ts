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

export interface PixelTextOptions {
  /** Side of one pixel, in screen px. */
  readonly pixel: number;
  readonly color: number;
  /** Drawn one pixel down-right, behind the face. Omit for no shadow. */
  readonly shadow?: number;
}

const lineWidth = (line: string): number =>
  line.length * (GLYPH_W + LETTER_GAP) - LETTER_GAP;

/**
 * Bakes `lines` into a texture and returns its size in screen px. Unknown
 * characters are drawn as blanks, which keeps a typo from throwing.
 */
export function createPixelTextTexture(
  scene: Phaser.Scene,
  key: string,
  lines: readonly string[],
  options: PixelTextOptions,
): { width: number; height: number } {
  const { pixel, color, shadow } = options;
  const cellsWide = Math.max(...lines.map(lineWidth));
  const cellsHigh = lines.length * GLYPH_H + (lines.length - 1) * LINE_GAP;
  // Room for the shadow, which sits one cell down and right.
  const pad = shadow === undefined ? 0 : 1;

  const graphics = scene.add.graphics();

  const paint = (fill: number, offset: number): void => {
    graphics.fillStyle(fill, 1);
    lines.forEach((line, lineIndex) => {
      // Centre each line within the widest one.
      const indent = Math.round((cellsWide - lineWidth(line)) / 2);
      const top = lineIndex * (GLYPH_H + LINE_GAP);

      [...line.toUpperCase()].forEach((character, charIndex) => {
        const glyph = GLYPHS[character];
        if (!glyph) {
          return;
        }

        const left = indent + charIndex * (GLYPH_W + LETTER_GAP);
        glyph.forEach((row, rowIndex) => {
          [...row].forEach((cell, colIndex) => {
            if (cell === '1') {
              graphics.fillRect(
                (left + colIndex + offset) * pixel,
                (top + rowIndex + offset) * pixel,
                pixel,
                pixel,
              );
            }
          });
        });
      });
    });
  };

  if (shadow !== undefined) {
    paint(shadow, 1);
  }
  paint(color, 0);

  const width = (cellsWide + pad) * pixel;
  const height = (cellsHigh + pad) * pixel;
  graphics.generateTexture(key, width, height);
  graphics.destroy();

  return { width, height };
}
