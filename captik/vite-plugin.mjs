// Resolves Captik imports for the Vite builds (studio, home, graphics smoke test).
//
// Two vendored trees both use `@/…` for their own `src/`: captik/src (production master) and
// captik-graphics/src (the premium editor line). One alias cannot serve both, so `@/` is resolved against
// the tree the IMPORTING file lives in; files outside both trees (web/, src/) get captik/src, as before.
// Import-specifier shims (SHIMS) and replaced files (GRAPHICS_FILE_SHIMS) are applied here too.
import path from 'node:path';
import { CAPTIK_SRC, GRAPHICS_DIR, GRAPHICS_SRC, SHIMS, GRAPHICS_FILE_SHIMS } from './paths.mjs';

const posix = (p) => p.split(path.sep).join('/');
const inside = (file, dir) => {
  const rel = path.relative(dir, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};
const fileShims = new Map(Object.entries(GRAPHICS_FILE_SHIMS).map(([rel, shim]) => [posix(path.join(GRAPHICS_SRC, rel)).toLowerCase(), posix(shim)]));

export function captikResolve() {
  return {
    name: 'captik-resolve',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (SHIMS[source]) return posix(SHIMS[source]);
      if (!importer) return null;
      const from = path.resolve(importer.split('?')[0]);
      const graphicsSide = inside(from, GRAPHICS_DIR);
      let target = null;
      if (source.startsWith('@/')) target = path.join(graphicsSide ? GRAPHICS_SRC : CAPTIK_SRC, source.slice(2));
      else if (graphicsSide && source.startsWith('.')) target = path.resolve(path.dirname(from), source);
      if (!target) return null;
      const resolved = await this.resolve(posix(target), importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      return fileShims.get(posix(resolved.id.split('?')[0]).toLowerCase()) ?? resolved;
    },
  };
}
