import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Where the built game is served from. The Cloudflare Worker serves it at the
// root of its own domain, which is the default. The old GitHub Pages site is
// a project site under /<repo>/, so its workflow sets BASE_PATH to that.
// `vite preview` gets the same base, so previewing matches production; plain
// `vite dev` stays at '/' for a clean localhost URL.
const BUILD_BASE = process.env.BASE_PATH ?? '/';

// What this build calls itself: the commit on CI, the time otherwise. The
// game is compiled knowing it (__BUILD_ID__), and version.json beside the
// game names the newest one, so an open page can tell it is out of date
// (src/systems/LiveUpdate.ts).
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 12) || Date.now().toString(36);

// The ranking API, as `wrangler dev` serves it locally.
const LOCAL_API = process.env.LOCAL_API ?? 'http://127.0.0.1:8787';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? BUILD_BASE : '/',
  define: {
    __BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : 'dev'),
  },
  plugins: [
    {
      name: 'version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false,
    // /api is the Worker's; in development it is handed to `wrangler dev`.
    proxy: { '/api': { target: LOCAL_API, changeOrigin: true } },
  },
  build: {
    target: 'es2022',
  },
}));
