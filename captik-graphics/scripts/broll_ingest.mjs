// B-ROLL INGEST — build the royalty-free cutaway library.
//
//   node scripts/broll_ingest.mjs [--per 12] [--topics money,phone] [--dry]
//
// Needs PEXELS_API_KEY (preferred) or PIXABAY_API_KEY in .env.local. Both licences allow
// commercial use with no attribution and both forbid redistributing the clips as a
// standalone stock library — so these are only ever composited into a render, never served
// as a browsable asset list. See src/lib/autopilot/brollLibrary.ts.
//
// Every clip is MEASURED before it is kept, not trusted from metadata:
//   · single-shot (stock results are often pre-cut montages — a cut inside a 2s insert
//     reads as a bug), verified by scene detection
//   · real motion classification via frame-to-frame luma difference, so the selector can
//     avoid a whip-pan under a caption
//   · portrait-cropped to 1080x1920, audio stripped, re-encoded to one consistent profile
// Output: public/broll/<topic>/<id>.mp4 + src/lib/autopilot/brollCatalogue.json

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'broll');
// --catalogue lets several ingests run at once, each writing its own fragment; the caller
// merges them by id afterwards. Serially, 44 topics is a six-hour job.
const CATALOGUE = process.argv.includes('--catalogue')
  ? process.argv[process.argv.indexOf('--catalogue') + 1]
  : path.join(ROOT, 'src', 'lib', 'autopilot', 'brollCatalogue.json');
const TMP = path.join(ROOT, '.broll-tmp');

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const PER_TOPIC = Number(arg('per', 12));
const DRY = argv.includes('--dry');
const ONLY = (arg('topics', '') || '').split(',').filter(Boolean);

// ── env ───────────────────────────────────────────────────────────────────────
const envFile = path.join(ROOT, '.env.local');
const env = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}
const PEXELS = env.PEXELS_API_KEY || process.env.PEXELS_API_KEY;
const PIXABAY = env.PIXABAY_API_KEY || process.env.PIXABAY_API_KEY;
if (!PEXELS && !PIXABAY) {
  console.error(`
No stock API key found.

Add ONE of these to captik-app/.env.local (both are free, take about a minute):

  PEXELS_API_KEY=...     https://www.pexels.com/api/new/     (recommended — bigger
                         portrait library, 200 req/hr, no attribution required)
  PIXABAY_API_KEY=...    https://pixabay.com/api/docs/

Then re-run: node scripts/broll_ingest.mjs --per 12
`);
  process.exit(1);
}

// The taxonomy lives with the selector so the two can never drift.
const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'autopilot', 'brollLibrary.ts'), 'utf8');
const qBlock = src.match(/BROLL_QUERIES[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!qBlock) { console.error('could not read BROLL_QUERIES from brollLibrary.ts'); process.exit(1); }
const QUERIES = {};
for (const m of qBlock[1].matchAll(/(\w+):\s*\[([^\]]+)\]/g)) {
  QUERIES[m[1]] = m[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}
const topics = ONLY.length ? ONLY.filter((t) => QUERIES[t]) : Object.keys(QUERIES);
console.log(`topics: ${topics.join(', ')}  |  target ${PER_TOPIC}/topic  |  source: ${PEXELS ? 'pexels' : 'pixabay'}`);

// ── search ────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchPexels(query, page = 1) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}`
    + `&orientation=portrait&size=medium&per_page=20&page=${page}`;
  const r = await fetch(url, { headers: { Authorization: PEXELS } });
  if (r.status === 429) { console.log('  rate limited, waiting 60s…'); await sleep(60_000); return searchPexels(query, page); }
  if (!r.ok) { console.log(`  search failed ${r.status}`); return []; }
  const j = await r.json();
  return (j.videos ?? []).map((v) => {
    // Highest-resolution portrait file we can actually use.
    const files = (v.video_files ?? []).filter((f) => f.width && f.height);
    const best = files.filter((f) => f.height >= 1280).sort((a, b) => b.height - a.height)[0]
      ?? files.sort((a, b) => b.height - a.height)[0];
    return best && {
      id: `px_${v.id}`, dl: best.link, w: best.width, h: best.height,
      durMs: Math.round((v.duration ?? 0) * 1000),
      credit: `${v.user?.name ?? 'unknown'} (pexels.com)`, source: 'pexels',
    };
  }).filter(Boolean);
}

async function searchPixabay(query, page = 1) {
  const url = `https://pixabay.com/api/videos/?key=${PIXABAY}&q=${encodeURIComponent(query)}`
    + `&per_page=20&page=${page}&safesearch=true`;
  const r = await fetch(url);
  if (!r.ok) { console.log(`  search failed ${r.status}`); return []; }
  const j = await r.json();
  return (j.hits ?? []).map((v) => {
    const f = v.videos?.large?.width ? v.videos.large : v.videos?.medium;
    return f && {
      id: `pb_${v.id}`, dl: f.url, w: f.width, h: f.height,
      durMs: Math.round((v.duration ?? 0) * 1000),
      credit: `${v.user ?? 'unknown'} (pixabay.com)`, source: 'pixabay',
    };
  }).filter(Boolean);
}

const search = PEXELS ? searchPexels : searchPixabay;

// ── measurement ───────────────────────────────────────────────────────────────
const ff = (args) => execFileSync('ffmpeg', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Hard cuts inside the clip — a montage is useless as a 2s insert. */
function sceneCuts(file) {
  try {
    const out = execFileSync('ffmpeg',
      ['-v', 'error', '-t', '6', '-i', file, '-vf', "scale=-2:360,select='gt(scene,0.4)',metadata=print:file=-", '-f', 'null', '-'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return (out.match(/pts_time/g) || []).length;
  } catch { return 0; }
}

/** Mean frame-to-frame luma difference → how much the frame actually moves. */
function motionOf(file) {
  try {
    const out = execFileSync('ffmpeg',
      ['-v', 'error', '-t', '6', '-i', file, '-vf',
       'scale=-2:360,fps=10,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
       '-f', 'null', '-'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const vals = [...out.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
    if (!vals.length) return { motion: 'slow', score: 0 };
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { motion: avg < 1.6 ? 'static' : avg < 6 ? 'slow' : 'fast', score: Math.round(avg * 100) / 100 };
  } catch { return { motion: 'slow', score: 0 }; }
}

function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1', file], { encoding: 'utf8' });
  const g = (k) => (out.match(new RegExp(`${k}=([^\\n]+)`)) || [])[1];
  return { w: Number(g('width')), h: Number(g('height')), durMs: Math.round(Number(g('duration')) * 1000) };
}

// ── run ───────────────────────────────────────────────────────────────────────
fs.mkdirSync(TMP, { recursive: true });
const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, 'utf8')) : [];
const have = new Set(catalogue.map((c) => c.id));
let added = 0, rejected = 0;

for (const topic of topics) {
  const need = PER_TOPIC - catalogue.filter((c) => c.topic === topic).length;
  if (need <= 0) { console.log(`\n${topic}: already full`); continue; }
  console.log(`\n${topic}: need ${need}`);
  const seen = new Set();
  let got = 0;

  for (const q of QUERIES[topic]) {
    if (got >= need) break;
    let results = [];
    try { results = await search(q); } catch (e) { console.log(`  "${q}" failed: ${e.message}`); continue; }
    console.log(`  "${q}" → ${results.length} results`);

    for (const r of results) {
      if (got >= need) break;
      if (have.has(r.id) || seen.has(r.id)) continue;
      seen.add(r.id);
      if (r.durMs && r.durMs < 3000) { rejected++; continue; }
      if (r.h < 720) { rejected++; continue; }
      if (DRY) { console.log(`    [dry] ${r.id} ${r.w}x${r.h} ${(r.durMs / 1000).toFixed(1)}s`); got++; continue; }

      const raw = path.join(TMP, `${r.id}.mp4`);
      try {
        const res = await fetch(r.dl);
        if (!res.ok) { rejected++; continue; }
        fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
      } catch { rejected++; continue; }

      const cuts = sceneCuts(raw);
      if (cuts > 0) { console.log(`    ✗ ${r.id} — ${cuts} hard cut(s), not single-shot`); fs.rmSync(raw, { force: true }); rejected++; continue; }
      const { motion, score } = motionOf(raw);

      // Normalise: centre-crop to 9:16, 1080x1920, no audio, one encode profile.
      const dir = path.join(OUT_DIR, topic);
      fs.mkdirSync(dir, { recursive: true });
      const final = path.join(dir, `${r.id}.mp4`);
      try {
        ff(['-y', '-v', 'error', '-i', raw, '-t', '8',
          '-vf', "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
          '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart', final]);
      } catch (e) { console.log(`    ✗ ${r.id} — encode failed`); fs.rmSync(raw, { force: true }); rejected++; continue; }
      fs.rmSync(raw, { force: true });

      const p = probe(final);
      catalogue.push({
        id: r.id, url: `/broll/${topic}/${r.id}.mp4`,
        durMs: p.durMs, w: p.w, h: p.h, tags: q.split(' '), topic, motion,
        source: r.source, credit: r.credit,
      });
      have.add(r.id); got++; added++;
      console.log(`    ✓ ${r.id} ${p.w}x${p.h} ${(p.durMs / 1000).toFixed(1)}s motion=${motion}(${score})`);
    }
    await sleep(400);                      // stay well inside the rate limit
  }
}

if (!DRY) {
  catalogue.sort((a, b) => a.topic.localeCompare(b.topic) || a.id.localeCompare(b.id));
  fs.writeFileSync(CATALOGUE, JSON.stringify(catalogue, null, 2) + '\n');
}
// Best effort. The scratch directory is shared, so a parallel ingest may still hold files in
// it — Windows then refuses the delete and the process exits 1 having done all of its work,
// which reads as a failed run. Leaving a few temp files behind is the cheaper mistake.
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* another ingest is using it */ }

const byTopic = {};
for (const c of catalogue) byTopic[c.topic] = (byTopic[c.topic] ?? 0) + 1;
const mb = fs.existsSync(OUT_DIR)
  ? Math.round(execFileSync('bash', ['-c', `du -sm "${OUT_DIR}" 2>/dev/null | cut -f1`], { encoding: 'utf8' }).trim() || 0)
  : 0;
console.log(`\n${added} added, ${rejected} rejected. Library: ${catalogue.length} clips, ~${mb}MB`);
console.log(Object.entries(byTopic).map(([t, n]) => `  ${t}: ${n}`).join('\n'));
