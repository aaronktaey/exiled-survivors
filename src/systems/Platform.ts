/**
 * Where the game is running: its own site (`web`), the PC build (desktop/,
 * Electron, 0.160 — `npm run desktop:build`) or itch.io's page (0.161 —
 * `npm run itch:build`), set at build time by VITE_PLATFORM.
 *
 * The web page calls /api on its own address. The other two are served from
 * somewhere else (app://nox, html-classic.itch.zone), so they call the live
 * server by its full address (VITE_API_BASE) — the Worker answers them with
 * CORS (server/http.ts).
 */
const BUILT_FOR = import.meta.env.VITE_PLATFORM;
export const PLATFORM: 'web' | 'desktop' | 'itch' = BUILT_FOR === 'desktop' || BUILT_FOR === 'itch' ? BUILT_FOR : 'web';

/**
 * Played off the game's own site. There it has no sign-in (a cookie for
 * exiledsurvivors.com does not reach it, and a sign-in comes back to the
 * site, not here — records stay on the device), no live update (a new
 * version arrives as a new upload) and no ad columns.
 */
export const OFFSITE = PLATFORM !== 'web';

if (typeof document !== 'undefined') {
  // The page's own styles tell those builds apart (no ad columns there).
  document.documentElement.classList.toggle('offsite', OFFSITE);
}

const API_BASE: string = typeof import.meta.env.VITE_API_BASE === 'string' ? import.meta.env.VITE_API_BASE : '';

/** `path` (an /api route) at the address this build calls. */
export function apiUrl(path: string): string {
  return path.startsWith('/api/') || path === '/api' ? `${API_BASE}${path}` : path;
}
