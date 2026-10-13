/**
 * Two small sums that every shell screen needs now that the canvas is the
 * shape of the window rather than always 960x540.
 *
 * A screen laid out from the top with fixed offsets looks right at 540 tall
 * and leaves four hundred blank pixels under it on a phone held upright, so
 * the screens measure their own block and centre it instead.
 */

/** Top edge of a block of `blockHeight`, centred, but never above `minTop`. */
export function centredTop(height: number, blockHeight: number, minTop = 24): number {
  return Math.max(minTop, Math.round((height - blockHeight) / 2));
}

/** A panel's width: what it wants, or what the screen can spare. */
export function fitWidth(wanted: number, available: number, margin = 20): number {
  return Math.max(120, Math.min(wanted, Math.round(available - margin * 2)));
}
