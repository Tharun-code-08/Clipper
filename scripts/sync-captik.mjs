// Copies the slice of captik-app the clipper runs on into captik/ — the caption templates (the KineticCaption
// Remotion composition, CaptionOverlay and every template's lib), the editor components, their libs and all
// caption fonts — unchanged, so the clipper stays in step with what captik.in ships.
//
//   npm run sync:captik                 sync from CAPTIK_APP_DIR (default ../Captik/captik-app)
//   npm run sync:captik -- <dir>        sync from another checkout
//   npm run sync:captik -- --check      exit 1 if captik/ differs from the checkout
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CAPTIK_DIR, CAPTIK_SRC, CAPTIK_FONTS, SHIMS } from '../captik/paths.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const APP = path.resolve(args.find((a) => !a.startsWith('--')) || process.env.CAPTIK_APP_DIR || path.join(ROOT, '..', 'Captik', 'captik-app'));
const APP_SRC = path.join(APP, 'src');

// The export composition, the five editor surfaces, and the libs the editor page calls directly.
const ENTRIES = [
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
];
// A runtime import of one of these means the file needs captik.in's servers: refuse instead of vendoring it.
const FORBIDDEN = /^(next(\/|$)|@supabase\/|@google\/|@mediapipe\/)/;
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css'];

if (!fs.existsSync(path.join(APP_SRC, 'remotion', 'index.tsx'))) {
  console.error(`No captik-app checkout at ${APP} (pass a path or set CAPTIK_APP_DIR).`);
  process.exit(2);
}

function resolveLocal(from, spec) {
  const base = spec.startsWith('@/') ? path.join(APP_SRC, spec.slice(2)) : path.resolve(path.dirname(from), spec);
  for (const ext of EXTS) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
  for (const ext of EXTS.slice(1)) if (fs.existsSync(path.join(base, `index${ext}`))) return path.join(base, `index${ext}`);
  return null;
}

const importsCache = new Map();
/** [{spec, typeOnly}] for every import/export-from, side-effect, dynamic and CSS import in a file. */
function importsOf(file) {
  if (importsCache.has(file)) return importsCache.get(file);
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const m of text.matchAll(/\b(import|export)(\s+type)?\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g)) out.push({ spec: m[3], typeOnly: Boolean(m[2]) });
  for (const m of text.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) out.push({ spec: m[1], typeOnly: false });
  for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1], typeOnly: false });
  for (const m of text.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) out.push({ spec: m[1], typeOnly: false });
  importsCache.set(file, out);
  return out;
}

const isLocal = (spec) => spec.startsWith('@/') || spec.startsWith('.');
const pkgName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

// Runtime closure: every file reached through a value import. Type-only targets are added when they (and
// everything they import at runtime) are portable — they carry the data model, but nothing needs them to run.
const files = new Set();
const packages = new Set();
const problems = [];
const portableMemo = new Map();

function portable(file, seen = new Set()) {
  if (portableMemo.has(file)) return portableMemo.get(file);
  if (seen.has(file)) return true;
  seen.add(file);
  let ok = true;
  for (const { spec, typeOnly } of importsOf(file)) {
    if (typeOnly || SHIMS[spec]) continue;
    if (isLocal(spec)) {
      const r = resolveLocal(file, spec);
      if (!r || !portable(r, seen)) ok = false;
    } else if (FORBIDDEN.test(spec)) ok = false;
  }
  portableMemo.set(file, ok);
  return ok;
}

function walk(file) {
  if (files.has(file)) return;
  files.add(file);
  for (const { spec, typeOnly } of importsOf(file)) {
    if (SHIMS[spec]) continue;
    if (!isLocal(spec)) {
      if (typeOnly || spec.startsWith('node:')) continue;
      if (FORBIDDEN.test(spec)) problems.push(`${path.relative(APP, file)} imports ${spec} at runtime`);
      else packages.add(pkgName(spec));
      continue;
    }
    const r = resolveLocal(file, spec);
    if (!r) { if (!typeOnly) problems.push(`${path.relative(APP, file)}: cannot resolve ${spec}`); continue; }
    if (typeOnly && !portable(r)) continue;
    walk(r);
  }
}
for (const e of ENTRIES) walk(path.join(APP, e));
if (problems.length) {
  console.error(`captik-app now needs captik.in's servers at runtime; add a shim in captik/paths.mjs or stop:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const toPosix = (p) => p.split(path.sep).join('/');
const wanted = new Map(); // dest abs path → source abs path
for (const f of files) wanted.set(path.join(CAPTIK_DIR, path.relative(APP, f)), f);
for (const name of fs.readdirSync(path.join(APP, 'public', 'fonts'))) {
  const f = path.join(APP, 'public', 'fonts', name);
  if (fs.statSync(f).isFile()) wanted.set(path.join(CAPTIK_FONTS, name), f);
}

const listFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map((p) => path.join(dir, p)).filter((p) => fs.statSync(p).isFile()) : []);
const changed = [];
const removed = [];
for (const [dest, src] of wanted) {
  const buf = fs.readFileSync(src);
  if (fs.existsSync(dest) && fs.readFileSync(dest).equals(buf)) continue;
  changed.push(toPosix(path.relative(CAPTIK_DIR, dest)));
  if (!CHECK) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf); }
}
for (const f of [...listFiles(CAPTIK_SRC), ...listFiles(CAPTIK_FONTS)]) {
  if (wanted.has(f)) continue;
  removed.push(toPosix(path.relative(CAPTIK_DIR, f)));
  if (!CHECK) fs.rmSync(f);
}

const git = (...a) => { try { return execFileSync('git', ['-C', APP, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
const version = (pkg) => { try { return JSON.parse(fs.readFileSync(path.join(APP, 'node_modules', pkg, 'package.json'), 'utf8')).version; } catch { return null; } };
const ours = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const ourDeps = { ...ours.dependencies, ...ours.devDependencies };
const pkgVersions = Object.fromEntries([...packages].sort().map((p) => [p, version(p)]));
const mismatched = Object.entries(pkgVersions).filter(([p, v]) => v && ourDeps[p] && p !== 'tailwindcss' && ourDeps[p].replace(/^[\^~]/, '') !== v);
const missing = Object.keys(pkgVersions).filter((p) => !ourDeps[p]);

const upstream = {
  source: 'captik-app',
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  commit: git('rev-parse', 'HEAD'),
  uncommittedChanges: Boolean(git('status', '--porcelain', '--', 'src', 'public/fonts')),
  syncedAt: new Date().toISOString(),
  packages: pkgVersions,
  shims: Object.keys(SHIMS),
  files: Object.fromEntries([...wanted.keys()].map((d) => [toPosix(path.relative(CAPTIK_DIR, d)), sha(fs.readFileSync(CHECK ? wanted.get(d) : d))]).sort(([a], [b]) => a.localeCompare(b))),
};

if (CHECK) {
  const drift = changed.length + removed.length;
  console.log(drift ? `captik/ differs from ${APP}: ${changed.length} changed, ${removed.length} stale` : `captik/ matches captik-app ${upstream.commit?.slice(0, 7)}`);
  for (const f of [...changed, ...removed].slice(0, 30)) console.log(`  ${f}`);
  process.exit(drift ? 1 : 0);
}
fs.writeFileSync(path.join(CAPTIK_DIR, 'UPSTREAM.json'), `${JSON.stringify(upstream, null, 2)}\n`);
const srcCount = [...wanted.keys()].filter((d) => d.startsWith(CAPTIK_SRC)).length;
console.log(`Synced captik-app ${upstream.branch}@${upstream.commit?.slice(0, 7)}${upstream.uncommittedChanges ? ' (with uncommitted changes)' : ''}: ${srcCount} source files, ${wanted.size - srcCount} fonts; ${changed.length} written, ${removed.length} removed.`);
if (missing.length) console.log(`Add to package.json: ${missing.map((p) => `${p}@${pkgVersions[p]}`).join(' ')}`);
if (mismatched.length) console.log(`Version drift vs captik-app: ${mismatched.map(([p, v]) => `${p} ours ${ourDeps[p]} / captik ${v}`).join(', ')}`);
