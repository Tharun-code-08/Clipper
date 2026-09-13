import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The editor UI is Captik's own editor: TopBar, LeftPanel, VideoCanvas, RightPanel, EditorTimeline
// and the caption templates are imported straight from the captik-app checkout (production master),
// so the clipper can never drift from what captik.in ships.
export const CAPTIK_APP_DIR = path.resolve(process.env.CAPTIK_APP_DIR || path.join(import.meta.dirname, '../../Captik/captik-app'));

export default defineConfig({
  root: import.meta.dirname,
  base: '/editor/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [{ find: /^@\//, replacement: `${path.join(CAPTIK_APP_DIR, 'src').split(path.sep).join('/')}/` }],
    // captik-app files resolve packages from captik-app/node_modules; React must be ONE copy for
    // hooks to work, so it is pinned to the clipper's install (same version as captik-app).
    dedupe: ['react', 'react-dom'],
  },
  server: { fs: { allow: [path.join(import.meta.dirname, '..'), CAPTIK_APP_DIR] } },
  // Captik's fonts are served by the Express server straight from captik-app/public, not copied.
  publicDir: false,
  build: {
    outDir: path.join(import.meta.dirname, '../public/editor'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
