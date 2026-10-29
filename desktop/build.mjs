/**
 * Builds Nox Survivors for PC: the game for app://nox into desktop/app, then
 * (unless --app-only) a portable Windows executable into desktop/release.
 *
 *   npm run desktop          the game in an Electron window, from this checkout
 *   npm run desktop:build    desktop/release/Nox Survivors <version>.exe
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const here = fileURLToPath(new URL('.', import.meta.url));
// src/systems/Platform.ts reads these: the PC build, calling the live server.
const env = { ...process.env, VITE_PLATFORM: 'desktop', VITE_API_BASE: 'https://exiledsurvivors.com' };

execSync('npx vite build --outDir desktop/app --emptyOutDir', { cwd: root, env, stdio: 'inherit' });
if (!process.argv.includes('--app-only')) {
  execSync('npm run dist', { cwd: here, stdio: 'inherit' });
}
