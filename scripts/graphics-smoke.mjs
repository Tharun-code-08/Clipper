// Renders every motion-graphics template — Captik's own and the imported Malloy Studio library — through the one
// renderer the editor and the export use (GraphicsOverlay), at three moments of its default duration, in Node via
// Vite SSR and react-dom/server. Fails on any template that throws or draws nothing.
//
//   npm run graphics:smoke                        all templates
//   npm run graphics:smoke -- --only ml_          ids starting with a prefix
//   npm run graphics:smoke -- --json out.json     write the per-template result
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { captikResolve } from '../captik/vite-plugin.mjs';
import { GRAPHICS_SRC } from '../captik/paths.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const MOMENTS = [0.15, 0.5, 0.85];

const server = await createServer({
  configFile: false,
  root: ROOT,
  logLevel: 'error',
  appType: 'custom',
  plugins: [captikResolve(), react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

const load = (rel) => server.ssrLoadModule(path.join(GRAPHICS_SRC, rel).split(path.sep).join('/'));

// Templates with photo slots start with empty image params on purpose (the placeholder prompts for the user's
// own photo), and React warns about each empty src/href. Count those instead of printing them.
let emptyAttrWarnings = 0;
const consoleError = console.error;
console.error = (...a) => {
  if (/An empty string \(""\) was passed to the/.test(String(a[0]))) { emptyAttrWarnings++; return; }
  consoleError(...a);
};

try {
  const reg = await load('lib/graphics/registry.ts');
  await reg.loadImportedTemplates();
  const { default: GraphicsOverlay } = await load('components/editor/GraphicsOverlay.tsx');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const draw = (graphics, currentTimeMs) => renderToStaticMarkup(
    React.createElement(GraphicsOverlay, { graphics, currentTimeMs, canvasWidthPx: 1080, canvasHeightPx: 1920 }),
  );
  const emptyLength = draw([], 0).length;

  const templates = reg.GRAPHICS_TEMPLATES.filter((t) => t.id.startsWith(only));
  const results = [];
  const started = Date.now();
  for (const t of templates) {
    const inst = reg.newGraphicInstance(t.id, 0, 9 / 16);
    if (!inst) { results.push({ id: t.id, name: t.name, ok: false, error: 'newGraphicInstance returned null' }); continue; }
    const r = { id: t.id, name: t.name, source: t.source || 'captik', category: t.category, ok: true, drew: false };
    for (const f of MOMENTS) {
      try {
        const html = draw([inst], inst.startMs + inst.durationMs * f);
        if (html.length > emptyLength + 40) r.drew = true;
      } catch (err) {
        Object.assign(r, { ok: false, at: f, error: String(err?.message || err).split('\n')[0].slice(0, 240) });
        break;
      }
    }
    results.push(r);
  }

  const failed = results.filter((r) => !r.ok);
  const blank = results.filter((r) => r.ok && !r.drew);
  const native = results.filter((r) => r.source !== 'malloy').length;
  console.log(`${results.length} templates (${native} Captik, ${results.length - native} imported) at ${MOMENTS.length} moments in ${Math.round((Date.now() - started) / 1000)} s: `
    + `${results.length - failed.length - blank.length} drew, ${blank.length} drew nothing, ${failed.length} threw`);
  for (const r of failed.slice(0, 25)) console.log(`  THREW ${r.id} (${r.name}) at ${r.at}: ${r.error}`);
  for (const r of blank.slice(0, 25)) console.log(`  BLANK ${r.id} (${r.name})`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
  process.exitCode = failed.length || blank.length ? 1 : 0;
} finally {
  await server.close();
}
