/**
 * A second clock on a run, kept where nothing on screen reads it (0.71, the
 * user's ask). The run's clock (GameScene.elapsedMs) is what the HUD shows
 * and what the board ranks; this one adds up the real time between the
 * frames that moved that clock, and lives in this module rather than on the
 * scene. A run whose shown clock was pushed on (or held back) from the
 * console reaches the ranking with the two far apart, and the server
 * refuses it without saying why (server/ranking.ts `implausible`).
 *
 * Honest play keeps this one at or a little over the shown clock: that one
 * steps by at most TIMING.maxDeltaMs a frame, this one by the real gap,
 * capped at FRAME_CAP_MS so a frame after a long stall (a tab in the
 * background, a pause) does not count the wait.
 */
const FRAME_CAP_MS = 250;

let total = 0;
let last: number | null = null;

export const runLedger = {
  /** A run starts — or comes back from a save, at what that save had counted. */
  begin(fromMs = 0): void {
    total = Math.max(0, fromMs);
    last = null;
  },

  /** A frame that moved the run's clock by `stepMs`. */
  step(stepMs: number): void {
    const now = performance.now();
    total += last === null ? stepMs : Math.min(Math.max(0, now - last), FRAME_CAP_MS);
    last = now;
  },

  /** The run is held (a card, a popup, a pause): the next frame starts afresh. */
  hold(): void {
    last = null;
  },

  get ms(): number {
    return Math.floor(total);
  },
};
