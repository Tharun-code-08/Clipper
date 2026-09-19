import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { CAPTIK_DIR, GRAPHICS_DIR } from '../captik/paths.mjs';
import { captikResolve } from '../captik/vite-plugin.mjs';

// Two pages, both built from Captik's own components (vendored unchanged in captik/src and captik-graphics/src):
// the clipper home at / (Captik's dashboard) and the clip studio at /editor/. captikResolve() maps each tree's
// `@/…` imports to that tree, so production-master code and the premium graphics system can be imported together.
export default defineConfig({
  root: import.meta.dirname,
  base: '/',
  plugins: [captikResolve(), react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { fs: { allow: [path.join(import.meta.dirname, '..'), CAPTIK_DIR, GRAPHICS_DIR] } },
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
