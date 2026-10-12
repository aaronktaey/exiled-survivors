import Phaser from 'phaser';

import { TEXT } from '@/config';

/** The `scene.add.text(...)` signature, as the factory prototype holds it. */
type TextFactory = (
  this: Phaser.GameObjects.GameObjectFactory,
  x: number,
  y: number,
  content: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle,
) => Phaser.GameObjects.Text;

/**
 * Text, rendered at more than one pixel per screen pixel.
 *
 * The game draws at 960x540 and the Scale Manager stretches that to fit the
 * window, so by default every glyph is a 960-wide bitmap blown up — soft
 * edges on every label. Phaser's Text can render its internal canvas at a
 * multiple of that and sample it back down, which costs texture memory on
 * the text objects themselves and nothing at all per frame: no extra draw
 * calls, no extra work in the game loop.
 */
export function textResolution(): number {
  const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Phaser.Math.Clamp(Math.round(pixelRatio * TEXT.resolution), 1, TEXT.maxResolution);
}

/**
 * How thick a label's dark outline is, for a font size in px. Thin on the
 * fine print, heavier on a headline, so the weight reads the same either way.
 */
export function outlineWidth(fontSize: string | number | undefined): number {
  const px = typeof fontSize === 'number' ? fontSize : parseFloat(String(fontSize ?? '16'));
  const size = Number.isFinite(px) ? px : 16;

  return Phaser.Math.Clamp(
    Math.round(size * TEXT.outline.share),
    TEXT.outline.minPx,
    TEXT.outline.maxPx,
  );
}

/**
 * Call once, before the game is created.
 *
 * Both the resolution and the outline are applied by wrapping the `text`
 * factory, so every `scene.add.text(...)` in the game gets them without each
 * call site asking. A call site that wants neither — dark text on a pale
 * plate, where an outline would only muddy it — passes `strokeThickness: 0`.
 */
export function registerSharpText(): void {
  const factory = Phaser.GameObjects.GameObjectFactory.prototype;
  // `GameObjectFactory.register` refuses to replace a built-in, so wrap the
  // original rather than installing a second one.
  const original = factory.text as TextFactory;

  const sharp: TextFactory = function (x, y, content, style) {
    const text = original.call(this, x, y, content, style).setResolution(textResolution());

    const asked = style?.strokeThickness !== undefined || style?.stroke !== undefined;
    if (!asked) {
      text.setStroke(TEXT.outline.color, outlineWidth(style?.fontSize));
    }

    return text;
  };

  factory.text = sharp;
}
