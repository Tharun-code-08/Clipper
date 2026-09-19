// REPAIR: rebuild the catalogue from what is actually on disk.
//
// The ingest used to write its catalogue only at the end, so an interrupted run left the
// clips downloaded and normalised but unindexed — invisible to the selector while still
// occupying disk. This re-derives every missing entry from the files themselves: topic from
// the folder, dimensions and duration from ffprobe, and motion re-measured the same way the
// ingest measures it, so a repaired entry is indistinguishable from a fresh one.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'broll');
const CATALOGUE = path.join(ROOT, 'src', 'lib', 'autopilot', 'brollCatalogue.json');

const cat = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, 'utf8')) : [];
const have = new Set(cat.map((c) => c.id));

function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1', file], { encoding: 'utf8' });
  const g = (k) => (out.match(new RegExp(`${k}=([^\n]+)`)) || [])[1];
  return { w: Number(g('width')), h: Number(g('height')), durMs: Math.round(Number(g('duration')) * 1000) };
}

function motionOf(file) {
  try {
    const out = execFileSync('ffmpeg', ['-v', 'error', '-t', '6', '-i', file, '-vf',
      'scale=-2:360,fps=10,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
      '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const v = [...out.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
    if (!v.length) return 'slow';
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    return avg < 1.6 ? 'static' : avg < 6 ? 'slow' : 'fast';
  } catch { return 'slow'; }
}

let added = 0, scanned = 0;
for (const topic of fs.readdirSync(DIR)) {
  const tdir = path.join(DIR, topic);
  if (!fs.statSync(tdir).isDirectory()) continue;
  for (const f of fs.readdirSync(tdir).filter((x) => x.endsWith('.mp4'))) {
    scanned++;
    const id = path.basename(f, '.mp4');
    if (have.has(id)) continue;
    const file = path.join(tdir, f);
    let p;
    try { p = probe(file); } catch { continue; }
    if (!p.w || !p.h) continue;
    cat.push({ id, url: `/broll/${topic}/${f}`, durMs: p.durMs, w: p.w, h: p.h,
      tags: [topic], topic, motion: motionOf(file), source: 'pexels',
      credit: 'pexels.com', reindexed: true });
    have.add(id); added++;
    if (added % 50 === 0) process.stdout.write(`  recovered ${added}\r`);
  }
}
cat.sort((a, b) => a.topic.localeCompare(b.topic) || a.id.localeCompare(b.id));
fs.writeFileSync(CATALOGUE, JSON.stringify(cat, null, 2) + '\n');
const by = {};
for (const c of cat) by[c.topic] = (by[c.topic] ?? 0) + 1;
console.log(`\nscanned ${scanned} files, recovered ${added}. Catalogue: ${cat.length}`);
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([t, n]) => `  ${t}: ${n}`).join('\n'));
