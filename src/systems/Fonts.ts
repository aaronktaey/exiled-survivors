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
 */
export function useGameFont(): void {
  const proto = Phaser.GameObjects.TextStyle.prototype as unknown as {
    setStyle: (style: Record<string, unknown> | undefined, updateText?: boolean, setDefaults?: boolean) => unknown;
  };
  const original = proto.setStyle;
  proto.setStyle = function (style, updateText, setDefaults) {
    const swapped =
      style && typeof style.fontFamily === 'string' && style.fontFamily.startsWith('system-ui')
        ? { ...style, fontFamily: TEXT.fontFamily }
        : style;
    return original.call(this, swapped, updateText, setDefaults);
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
