import { VIEWPORT } from '@/config';

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

/**
 * How big the game's canvas is, in game units, for the window it has to fit.
 *
 * The Scale Manager draws the canvas at this size and then stretches it to
 * fit the window, so the ratio between the two is how large everything
 * looks. A 960x540 canvas on a desktop stretches up and reads fine; the
 * same canvas on a phone shrinks to about 0.4x, which is what made the text
 * and the HUD unreadable there — and in portrait it also left the game as a
 * thin band with black above and below it.
 *
 * So the canvas follows the window instead:
 *
 * - its short side matches the window's short side, floored so a very small
 *   phone still has room to lay a menu out and capped at the design size, so
 *   a desktop is unchanged at 960x540;
 * - its long side follows the window's own ratio, clamped, so the canvas is
 *   the shape of the screen and nothing is letterboxed away.
 *
 * On a 390x844 phone that lands near 420x909 — a scale of about 0.93, where
 * it used to be 0.41.
 */
export function canvasSizeFor(windowWidth: number, windowHeight: number): CanvasSize {
  const w = Math.max(1, windowWidth);
  const h = Math.max(1, windowHeight);

  const portrait = h > w;
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);

  const short = Math.round(
    Math.min(VIEWPORT.designShortSide, Math.max(VIEWPORT.minShortSide, shortSide)),
  );
  const ratio = Math.min(VIEWPORT.maxAspect, Math.max(VIEWPORT.minAspect, longSide / shortSide));
  const long = Math.round(short * ratio);

  return portrait ? { width: short, height: long } : { width: long, height: short };
}

/** The size for the window the game is actually in. */
export function currentCanvasSize(): CanvasSize {
  if (typeof window === 'undefined') {
    return canvasSizeFor(VIEWPORT.designShortSide * VIEWPORT.minAspect, VIEWPORT.designShortSide);
  }

  // The game sits in #game-root, which the ad columns may have narrowed.
  const host = document.getElementById('game-root');
  const box = host?.getBoundingClientRect();
  return canvasSizeFor(
    Math.round(box?.width || window.innerWidth),
    Math.round(box?.height || window.innerHeight),
  );
}
