import Phaser from 'phaser';

import { TEXT } from '@/config';
import { language } from '@/i18n';

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
 * moment the style is set (so the dev server's 폰트 비교 can change it) —
 * or, in Chinese, TEXT.fontFamilyZh (0.153), whose hanzi are Fusion Pixel's
 * (© TakWolf, SIL OFL 1.1, licences in public/fonts/fusion).
 *
 * It also hands Phaser the game font's metrics (TEXT.gameFontMetrics, 0.110).
 * Phaser measures a font from a test string, and these glyphs have no
 * descenders: it found none, put every spare pixel of the box above the
 * letters, and so drew each label lower in its box than the system font did
 * — enough for a title and the line under it to meet. Every size gets the
 * same shares of its own size instead, which sit the letters where they sat.
 */
const GAME_FAMILY = TEXT.fontFamily;

/** The family a label asking for the system's is given now: the language's, unless the dev picker chose another. */
function gameFamily(): string {
  return language() === 'zh' && TEXT.fontFamily === GAME_FAMILY ? TEXT.fontFamilyZh : TEXT.fontFamily;
}

function isGameFamily(family: string): boolean {
  return family === GAME_FAMILY || family === TEXT.fontFamilyZh;
}

/**
 * Japanese and Chinese put no spaces between words, and Phaser's plain wrap
 * breaks only at spaces: a line of either ran straight off its card (0.153).
 * In those two every wrapped label gets the advanced wrap, which breaks a
 * word too long for the line wherever it has to — unless it said otherwise.
 */
function wrapsWithoutSpaces(): boolean {
  return language() === 'ja' || language() === 'zh';
}

interface StyleInternals {
  fontFamily: string;
  fontSize: string;
  fontStyle: string;
  _font: string;
  metrics: { ascent: number; descent: number; fontSize: number };
  parent: { updateText: () => unknown };
  setStyle: (style: Record<string, unknown> | undefined, updateText?: boolean, setDefaults?: boolean) => unknown;
  setWordWrapWidth: (width: number | null, useAdvancedWrap?: boolean) => unknown;
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
    let swapped =
      style && typeof style.fontFamily === 'string' && style.fontFamily.startsWith('system-ui')
        ? { ...style, fontFamily: gameFamily() }
        : style;
    const wrap = swapped?.wordWrap as { width?: number; useAdvancedWrap?: boolean } | undefined;
    if (wrap?.width && wrap.useAdvancedWrap === undefined && wrapsWithoutSpaces()) {
      swapped = { ...swapped, wordWrap: { ...wrap, useAdvancedWrap: true } };
    }
    // Measured first as Phaser would, then the game font's own metrics laid over it.
    original.call(this, swapped, false, setDefaults);
    if (isGameFamily(this.fontFamily) && !(swapped && swapped.metrics)) {
      this.metrics = gameMetrics(this);
    }
    return updateText ? this.parent.updateText() : this.parent;
  };
  const setWrap = proto.setWordWrapWidth;
  proto.setWordWrapWidth = function (this: StyleInternals, width, useAdvancedWrap) {
    return setWrap.call(this, width, useAdvancedWrap ?? wrapsWithoutSpaces());
  };
  // A new size or family (setFontSize, setFontFamily — fitText shrinks labels this way) re-measures here.
  const update = proto.update;
  proto.update = function (this: StyleInternals, recalculateMetrics) {
    if (recalculateMetrics && isGameFamily(this.fontFamily)) {
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
    // Small (only the characters the game writes), so loaded whatever the language: a switch to 中文 draws at once.
    new FontFace('FusionPixelZh', `url(${base}fonts/fusion/fusion-pixel-zh.woff2)`),
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
