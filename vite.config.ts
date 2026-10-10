import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// GitHub Pages serves a project site from /<repo>/, so built asset URLs need
// that prefix. `vite preview` gets it too, so previewing matches production;
// plain `vite dev` stays at '/' for a clean localhost URL.
const REPO_BASE = '/exiled-survivors/';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? REPO_BASE : '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
  },
}));
