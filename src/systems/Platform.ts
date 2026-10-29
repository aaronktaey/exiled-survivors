/**
 * Where the game is running (0.160): the web page, or the PC build
 * (desktop/, Electron), which `npm run desktop:build` makes with
 * VITE_PLATFORM=desktop.
 *
 * The web page calls /api on its own address. The PC build is served from
 * app://nox, so it calls the live server by its full address
 * (VITE_API_BASE) — the Worker answers it with CORS (server/http.ts).
 */
export const PLATFORM: 'web' | 'desktop' = import.meta.env.VITE_PLATFORM === 'desktop' ? 'desktop' : 'web';

const API_BASE: string = typeof import.meta.env.VITE_API_BASE === 'string' ? import.meta.env.VITE_API_BASE : '';

/** `path` (an /api route) at the address this build calls. */
export function apiUrl(path: string): string {
  return path.startsWith('/api/') || path === '/api' ? `${API_BASE}${path}` : path;
}
