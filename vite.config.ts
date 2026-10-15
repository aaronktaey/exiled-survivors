import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Where the built game is served from. The Cloudflare Worker serves it at the
// root of its own domain, which is the default. The old GitHub Pages site is
// a project site under /<repo>/, so its workflow sets BASE_PATH to that.
// `vite preview` gets the same base, so previewing matches production; plain
// `vite dev` stays at '/' for a clean localhost URL.
const BUILD_BASE = process.env.BASE_PATH ?? '/';

// The ranking API, as `wrangler dev` serves it locally.
const LOCAL_API = process.env.LOCAL_API ?? 'http://127.0.0.1:8787';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? BUILD_BASE : '/',
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
