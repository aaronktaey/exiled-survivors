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
 *
 * It is applied by wrapping the `text` factory, so every `scene.add.text(...)`
 * in the game gets it without each call site asking.
 */
export function textResolution(): number {
  const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Phaser.Math.Clamp(Math.round(pixelRatio * TEXT.resolution), 1, TEXT.maxResolution);
}

/** Call once, before the game is created. */
export function registerSharpText(): void {
  const factory = Phaser.GameObjects.GameObjectFactory.prototype;
  // `GameObjectFactory.register` refuses to replace a built-in, so wrap the
  // original rather than installing a second one.
  const original = factory.text as TextFactory;

  const sharp: TextFactory = function (x, y, content, style) {
    return original.call(this, x, y, content, style).setResolution(textResolution());
  };

  factory.text = sharp;
}
