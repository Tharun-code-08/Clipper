// Copies the Captik code the clipper runs on into this repo, unchanged, so it stays in step with Captik:
//
//   captik/           production master — the caption templates (KineticCaption composition, CaptionOverlay and
//                     every template's lib), the editor components, their libs and all caption fonts
//   captik-graphics/  the premium editor line — the motion-graphics system (Captik's own templates plus the
//                     imported Malloy Studio library), the export composition that draws graphics, b-roll library
//
//   npm run sync:captik                              both slices
//   npm run sync:captik -- --only core|graphics      one slice
//   npm run sync:captik -- --check                   exit 1 if a slice differs from its checkout
//
// Sources: CAPTIK_APP_DIR (default ../Captik/captik-app) and CAPTIK_PREMIUM_DIR (default <CAPTIK_APP_DIR>/wt-premium,
// the feat/shortform-showcase worktree).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CAPTIK_DIR, CAPTIK_FONTS, GRAPHICS_DIR, SHIMS, GRAPHICS_FILE_SHIMS } from '../captik/paths.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const APP = path.resolve(process.env.CAPTIK_APP_DIR || path.join(ROOT, '..', 'Captik', 'captik-app'));
const PREMIUM = path.resolve(process.env.CAPTIK_PREMIUM_DIR || path.join(APP, 'wt-premium'));

const PROFILES = {
  core: {
    source: APP,
    dest: CAPTIK_DIR,
    // The export composition, the five editor surfaces, and the libs the editor page calls directly.
    entries: [
      'src/remotion/index.tsx',
      'src/components/editor/TopBar.tsx',
      'src/components/editor/LeftPanel.tsx',
      'src/components/editor/VideoCanvas.tsx',
      'src/components/editor/RightPanel.tsx',
      'src/components/editor/EditorTimeline.tsx',
      'src/lib/captionStyles.tsx',
      'src/lib/captionSegments.ts',
      'src/lib/srtUtils.ts',
      'src/types/transcript.ts',
      'src/app/globals.css',
    ],
    extras: [],
    fonts: true,
    fileShims: {},
  },
  graphics: {
    source: PREMIUM,
    dest: GRAPHICS_DIR,
    // The template registry (and, through its on-demand import, the imported library), the one renderer, the
    // Graphics tab and parameter panel, sound cue playback, timeline drag, the export composition that draws
    // graphics + b-roll inserts, and the b-roll library.
    entries: [
      'src/lib/graphics/registry.ts',
      'src/lib/graphics/malloy/index.ts',
      'src/lib/graphics/useImportedTemplates.ts',
      'src/lib/graphics/sfxPlayer.ts',
      'src/lib/graphics/timelineDrag.ts',
      'src/lib/graphics/shotMount.tsx',
      'src/lib/graphics/catalogData.ts',
      'src/lib/graphics/sampleImages.ts',
      'src/types/graphics.ts',
      'src/components/editor/GraphicsOverlay.tsx',
      'src/components/editor/panel/GraphicsTab.tsx',
      'src/components/editor/panel/GraphicsParamsPanel.tsx',
      'src/lib/autopilot/brollLibrary.ts',
      'src/remotion/index.tsx',
    ],
    // Files nothing imports but that the slice needs: the b-roll catalogue and the scripts that rebuild the
    // b-roll library and the imported template library.
    extras: [
      'src/lib/autopilot/brollCatalogue.json',
      'scripts/broll_ingest.mjs',
      'scripts/broll_reindex.mjs',
      'scripts/import_malloy.mjs',
    ],
    fonts: false,
    fileShims: GRAPHICS_FILE_SHIMS,
  },
};

// A runtime import of one of these means the file needs captik.in's servers: refuse instead of vendoring it.
const FORBIDDEN = /^(next(\/|$)|@supabase\/|@google\/|@mediapipe\/)/;
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css'];
const toPosix = (p) => p.split(path.sep).join('/');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

function syncProfile(name, profile) {
  const { source: APPDIR, dest: DEST } = profile;
  const APP_SRC = path.join(APPDIR, 'src');
  if (!fs.existsSync(path.join(APPDIR, profile.entries[0]))) {
    console.error(`[${name}] No checkout at ${APPDIR} (set ${name === 'core' ? 'CAPTIK_APP_DIR' : 'CAPTIK_PREMIUM_DIR'}).`);
    return { drift: 0, failed: true };
  }
  const shimmedFiles = new Set(Object.keys(profile.fileShims).map((rel) => path.join(APP_SRC, rel).toLowerCase()));

  const resolveLocal = (from, spec) => {
    const base = spec.startsWith('@/') ? path.join(APP_SRC, spec.slice(2)) : path.resolve(path.dirname(from), spec);
    for (const ext of EXTS) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
    for (const ext of EXTS.slice(1)) if (fs.existsSync(path.join(base, `index${ext}`))) return path.join(base, `index${ext}`);
    return null;
  };
  const importsCache = new Map();
  const importsOf = (file) => {
    if (importsCache.has(file)) return importsCache.get(file);
    const text = fs.readFileSync(file, 'utf8');
    const out = [];
    for (const m of text.matchAll(/\b(import|export)(\s+type)?\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g)) out.push({ spec: m[3], typeOnly: Boolean(m[2]) });
    for (const m of text.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) out.push({ spec: m[1], typeOnly: false });
    for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1], typeOnly: false });
    for (const m of text.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) out.push({ spec: m[1], typeOnly: false });
    importsCache.set(file, out);
    return out;
  };
  const isLocal = (spec) => spec.startsWith('@/') || spec.startsWith('.');
  const pkgName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

  // Runtime closure: every file reached through a value import. Type-only targets are added when they (and
  // everything they import at runtime) are portable — they carry the data model, but nothing needs them to run.
  const files = new Set();
  const packages = new Set();
  const problems = [];
  const portableMemo = new Map();
  const portable = (file, seen = new Set()) => {
    if (portableMemo.has(file)) return portableMemo.get(file);
    if (seen.has(file)) return true;
    seen.add(file);
    let ok = true;
    for (const { spec, typeOnly } of importsOf(file)) {
      if (typeOnly || SHIMS[spec]) continue;
      if (isLocal(spec)) {
        const r = resolveLocal(file, spec);
        if (!r || (!shimmedFiles.has(r.toLowerCase()) && !portable(r, seen))) ok = false;
      } else if (FORBIDDEN.test(spec)) ok = false;
    }
    portableMemo.set(file, ok);
    return ok;
  };
  const walk = (file) => {
    if (files.has(file) || shimmedFiles.has(file.toLowerCase())) return;
    files.add(file);
    for (const { spec, typeOnly } of importsOf(file)) {
      if (SHIMS[spec]) continue;
      if (!isLocal(spec)) {
        if (typeOnly || spec.startsWith('node:')) continue;
        if (FORBIDDEN.test(spec)) problems.push(`${path.relative(APPDIR, file)} imports ${spec} at runtime`);
        else packages.add(pkgName(spec));
        continue;
      }
      const r = resolveLocal(file, spec);
      if (!r) { if (!typeOnly) problems.push(`${path.relative(APPDIR, file)}: cannot resolve ${spec}`); continue; }
      if (typeOnly && !portable(r)) continue;
      walk(r);
    }
  };
  for (const e of profile.entries) walk(path.join(APPDIR, e));
  if (problems.length) {
    console.error(`[${name}] captik-app now needs captik.in's servers at runtime; add a shim in captik/paths.mjs or stop:\n  ${problems.join('\n  ')}`);
    return { drift: 0, failed: true };
  }

  const wanted = new Map(); // dest abs path → source abs path
  for (const f of files) wanted.set(path.join(DEST, path.relative(APPDIR, f)), f);
  for (const rel of profile.extras) {
    const f = path.join(APPDIR, rel);
    if (fs.existsSync(f)) wanted.set(path.join(DEST, rel), f);
  }
  if (profile.fonts) {
    for (const n of fs.readdirSync(path.join(APPDIR, 'public', 'fonts'))) {
      const f = path.join(APPDIR, 'public', 'fonts', n);
      if (fs.statSync(f).isFile()) wanted.set(path.join(CAPTIK_FONTS, n), f);
    }
  }

  // Only src/, scripts/ and the fonts are managed; paths.mjs, shims/ and the rest of each slice are hand-written.
  const managed = [path.join(DEST, 'src'), path.join(DEST, 'scripts'), ...(profile.fonts ? [CAPTIK_FONTS] : [])];
  const listFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map((p) => path.join(dir, p)).filter((p) => fs.statSync(p).isFile()) : []);
  const changed = [];
  const removed = [];
  for (const [dest, src] of wanted) {
    const buf = fs.readFileSync(src);
    if (fs.existsSync(dest) && fs.readFileSync(dest).equals(buf)) continue;
    changed.push(toPosix(path.relative(DEST, dest)));
    if (!CHECK) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf); }
  }
  for (const f of managed.flatMap(listFiles)) {
    if (wanted.has(f)) continue;
    removed.push(toPosix(path.relative(DEST, f)));
    if (!CHECK) fs.rmSync(f);
  }

  const git = (...a) => { try { return execFileSync('git', ['-C', APPDIR, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
  const version = (pkg) => {
    for (const dir of [APPDIR, path.dirname(APPDIR)]) {
      try { return JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', pkg, 'package.json'), 'utf8')).version; } catch { /* next */ }
    }
    return null;
  };
  const ours = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const ourDeps = { ...ours.dependencies, ...ours.devDependencies };
  const pkgVersions = Object.fromEntries([...packages].sort().map((p) => [p, version(p)]));
  const mismatched = Object.entries(pkgVersions).filter(([p, v]) => v && ourDeps[p] && p !== 'tailwindcss' && ourDeps[p].replace(/^[\^~]/, '') !== v);
  const missing = Object.keys(pkgVersions).filter((p) => !ourDeps[p] && pkgVersions[p]);

  const upstream = {
    source: 'captik-app',
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    commit: git('rev-parse', 'HEAD'),
    uncommittedChanges: Boolean(git('status', '--porcelain', '--', 'src', 'scripts', ...(profile.fonts ? ['public/fonts'] : []))),
    syncedAt: new Date().toISOString(),
    packages: pkgVersions,
    shims: Object.keys(SHIMS),
    replacedFiles: Object.keys(profile.fileShims).map((rel) => `src/${rel}`),
    files: Object.fromEntries([...wanted.keys()].map((d) => [toPosix(path.relative(DEST, d)), sha(fs.readFileSync(CHECK ? wanted.get(d) : d))]).sort(([a], [b]) => a.localeCompare(b))),
  };

  if (CHECK) {
    const drift = changed.length + removed.length;
    console.log(drift ? `[${name}] differs from ${APPDIR}: ${changed.length} changed, ${removed.length} stale` : `[${name}] matches ${upstream.branch}@${upstream.commit?.slice(0, 7)}`);
    for (const f of [...changed, ...removed].slice(0, 30)) console.log(`  ${f}`);
    return { drift, failed: false };
  }
  fs.writeFileSync(path.join(DEST, 'UPSTREAM.json'), `${JSON.stringify(upstream, null, 2)}\n`);
  const srcCount = [...wanted.keys()].filter((d) => d.startsWith(path.join(DEST, 'src'))).length;
  console.log(`[${name}] synced ${upstream.branch}@${upstream.commit?.slice(0, 7)}${upstream.uncommittedChanges ? ' (with uncommitted changes)' : ''}: ${srcCount} source files, ${wanted.size - srcCount} other; ${changed.length} written, ${removed.length} removed.`);
  if (missing.length) console.log(`[${name}] add to package.json: ${missing.map((p) => `${p}@${pkgVersions[p]}`).join(' ')}`);
  if (mismatched.length) console.log(`[${name}] version drift vs captik-app: ${mismatched.map(([p, v]) => `${p} ours ${ourDeps[p]} / captik ${v}`).join(', ')}`);
  return { drift: 0, failed: false };
}

let exitCode = 0;
for (const [name, profile] of Object.entries(PROFILES)) {
  if (ONLY && ONLY !== name) continue;
  const r = syncProfile(name, profile);
  if (r.failed) exitCode = 2;
  else if (CHECK && r.drift) exitCode = Math.max(exitCode, 1);
}
process.exit(exitCode);
