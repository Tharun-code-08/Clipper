import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { CAPTIK_DIR, CAPTIK_SRC, SHIMS } from '../captik/paths.mjs';

const posix = (p) => p.split(path.sep).join('/');
const exact = (spec) => new RegExp(`^${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

// Two pages, both built from Captik's own components (vendored unchanged in captik/src, so `@/…` resolves exactly
// as it does inside captik-app): the clipper home at / (Captik's dashboard) and the clip studio at /editor/.
export default defineConfig({
  root: import.meta.dirname,
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      ...Object.entries(SHIMS).map(([spec, file]) => ({ find: exact(spec), replacement: posix(file) })),
      { find: /^@\//, replacement: `${posix(CAPTIK_SRC)}/` },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: { fs: { allow: [path.join(import.meta.dirname, '..'), CAPTIK_DIR] } },
  // Fonts are served by Express from captik/public/fonts at /fonts, the URL Captik's stylesheet uses.
  publicDir: false,
  build: {
    outDir: path.join(import.meta.dirname, '../dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        home: path.join(import.meta.dirname, 'index.html'),
        editor: path.join(import.meta.dirname, 'editor', 'index.html'),
      },
    },
  },
});
