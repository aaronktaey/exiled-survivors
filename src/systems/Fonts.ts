import Phaser from 'phaser';

import { TEXT } from '@/config';

/**
 * 게임 폰트 (0.108, the user's pick): the title logo's own pixel letters
 * (`ExiledPixel`, built by tools/make-logo-font.py — Latin, digits and
 * symbols) with 갈무리 11 (Galmuri11, SIL OFL 1.1, © Lee Minseo — its
 * licence ships beside it in public/fonts/galmuri) for everything the logo
 * font has no glyph for: Hangul, kana, kanji, arrows. The browser picks per
 * character, first family first. Both are served from the game's own files.
 *
 * Every label in the code still asks for `system-ui, sans-serif`;
 * `useGameFont` turns any such request into TEXT.fontFamily, read at the
 * moment the style is set (so the dev server's 폰트 비교 can change it).
 *
 * It also hands Phaser the game font's metrics (TEXT.gameFontMetrics, 0.110).
 * Phaser measures a font from a test string, and these glyphs have no
 * descenders: it found none, put every spare pixel of the box above the
 * letters, and so drew each label lower in its box than the system font did
 * — enough for a title and the line under it to meet. Every size gets the
 * same shares of its own size instead, which sit the letters where they sat.
 */
const GAME_FAMILY = TEXT.fontFamily;

interface StyleInternals {
  fontFamily: string;
  fontSize: string;
  fontStyle: string;
  _font: string;
  metrics: { ascent: number; descent: number; fontSize: number };
  parent: { updateText: () => unknown };
  setStyle: (style: Record<string, unknown> | undefined, updateText?: boolean, setDefaults?: boolean) => unknown;
  update: (recalculateMetrics: boolean) => unknown;
}

function gameMetrics(style: StyleInternals): StyleInternals['metrics'] {
  const px = parseFloat(style.fontSize) || 16;
  const ascent = Math.round(px * TEXT.gameFontMetrics.ascent);
  const descent = Math.round(px * TEXT.gameFontMetrics.descent);
  return { ascent, descent, fontSize: ascent + descent };
}

export function useGameFont(): void {
  const proto = Phaser.GameObjects.TextStyle.prototype as unknown as StyleInternals;
  const original = proto.setStyle;
  proto.setStyle = function (this: StyleInternals, style, updateText = true, setDefaults = false) {
    const swapped =
      style && typeof style.fontFamily === 'string' && style.fontFamily.startsWith('system-ui')
        ? { ...style, fontFamily: TEXT.fontFamily }
        : style;
    // Measured first as Phaser would, then the game font's own metrics laid over it.
    original.call(this, swapped, false, setDefaults);
    if (this.fontFamily === GAME_FAMILY && !(swapped && swapped.metrics)) {
      this.metrics = gameMetrics(this);
    }
    return updateText ? this.parent.updateText() : this.parent;
  };
  // A new size or family (setFontSize, setFontFamily — fitText shrinks labels this way) re-measures here.
  const update = proto.update;
  proto.update = function (this: StyleInternals, recalculateMetrics) {
    if (recalculateMetrics && this.fontFamily === GAME_FAMILY) {
      this._font = [this.fontStyle, this.fontSize, this.fontFamily].join(' ').trim();
      this.metrics = gameMetrics(this);
      return this.parent.updateText();
    }
    return update.call(this, recalculateMetrics);
  };
}

/** The game's font files, loaded before the first scene draws a word — or given up on after `waitMs`. */
export async function loadGameFonts(waitMs = 5000): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const faces = [
    new FontFace('ExiledPixel', `url(${base}fonts/exiled-pixel.woff2)`),
    new FontFace('Galmuri11', `url(${base}fonts/galmuri/Galmuri11.woff2)`, { weight: '400' }),
    new FontFace('Galmuri11', `url(${base}fonts/galmuri/Galmuri11-Bold.woff2)`, { weight: '700' }),
  ];
  const loads = faces.map(async (face) => {
    try {
      document.fonts.add(await face.load());
    } catch {
      // Not there: the next family in the list draws it.
    }
  });
  await Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, waitMs))]);
}
