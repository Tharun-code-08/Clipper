import fs from 'node:fs/promises';
import path from 'node:path';
import { config, FONTS_DIR } from './config.js';
import { run, runOk, clamp } from './util.js';
import { trackSubject, cropXExpression } from './focus.js';

export const OUT_W = 1080;
export const OUT_H = 1920;
const INDIC = /[ऀ-෿]/;
const ACCENT_ASS = '&H0000E5FF'; // #FFE500 in ASS BGR order

export const assTime = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

// Braces start ASS override blocks and backslashes start tags; neutralise both in spoken text.
const clean = (s) => String(s).replace(/[{}]/g, '').replace(/\\/g, '/').replace(/\s+/g, ' ').trim();

/** Group clip-relative words into on-screen chunks of ≤3 words / ~13 characters. */
export function captionChunks(words, { maxWords = 3, maxChars = 13, gapSec = 0.45 } = {}) {
  const chunks = [];
  let cur = [];
  const flush = () => { if (cur.length) chunks.push(cur); cur = []; };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const chars = cur.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length;
    if (prev && (w.s - prev.e > gapSec || cur.length >= maxWords || chars > maxChars)) flush();
    cur.push(w);
    if (/[.?!।,]$/.test(w.w)) flush();
  }
  flush();
  return chunks;
}

/**
 * ASS subtitle document for one clip: word-by-word highlighted captions + a boxed hook overlay.
 * `words` must already be clip-relative (0 = clip start).
 */
export function buildAss({ words, hookText, duration, layout, captions = true }) {
  const indic = INDIC.test(words.map((w) => w.w).join(' ') + (hookText || ''));
  const font = indic ? 'Nirmala UI' : 'Montserrat Black';
  const upper = (s) => (indic ? s : s.toUpperCase());
  const captionMarginV = layout === 'fit' ? 430 : 470;
  const hookMarginV = layout === 'fit' ? 300 : 230;

  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${OUT_W}`,
    `PlayResY: ${OUT_H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Caption,${font},${indic ? 90 : 94},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,8,5,2,60,60,${captionMarginV},1`,
    `Style: Hook,${font},${indic ? 80 : 78},&H00111111,&H00111111,${ACCENT_ASS},&H00000000,1,0,0,0,100,100,0,0,3,26,0,8,90,90,${hookMarginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  if (hookText) {
    const end = Math.min(duration, 3.2);
    lines.push(`Dialogue: 1,${assTime(0.05)},${assTime(end)},Hook,,0,0,0,,{\\fad(120,220)\\fscx86\\fscy86\\t(0,170,\\fscx100\\fscy100)}${clean(upper(hookText))}`);
  }

  if (captions) {
    const chunks = captionChunks(words);
    chunks.forEach((chunk, ci) => {
      const nextStart = chunks[ci + 1]?.[0].s ?? duration;
      const chunkEnd = Math.min(nextStart, chunk[chunk.length - 1].e + 0.5, duration);
      chunk.forEach((w, wi) => {
        const from = wi === 0 ? chunk[0].s : w.s;
        const to = wi === chunk.length - 1 ? chunkEnd : chunk[wi + 1].s;
        if (to - from < 0.02) return;
        const text = chunk
          .map((x, xi) => (xi === wi ? `{\\c${ACCENT_ASS}&}${clean(upper(x.w))}{\\c&H00FFFFFF&}` : clean(upper(x.w))))
          .join(' ');
        const pop = wi === 0 ? '{\\fscx114\\fscy114\\t(0,90,\\fscx100\\fscy100)}' : '';
        lines.push(`Dialogue: 0,${assTime(from)},${assTime(to)},Caption,,0,0,0,,${pop}${text}`);
      });
    });
  }
  return `${lines.join('\n')}\n`;
}

const even = (n) => Math.max(2, Math.floor(n / 2) * 2);

/**
 * Video filter that turns a landscape (or portrait) source into a 1080x1920 frame.
 * With a subject track, each shot gets its own treatment: shots with a person use the tracked crop,
 * shots without one (slides, screens, audience) letterbox over a blurred copy so nothing is cut off.
 */
export function layoutFilter({ width, height }, { layout, focusX }, track) {
  if (width / height <= 0.8) {
    return `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H}`;
  }
  const cropW = even(height * (9 / 16));
  const fit = (p) => [
    `split=2[bg${p}][fg${p}]`,
    `[bg${p}]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,gblur=sigma=12,eq=brightness=-0.12,scale=${OUT_W}:${OUT_H}[bgb${p}]`,
    `[fg${p}]scale=${OUT_W}:-2[fgs${p}]`,
    `[bgb${p}][fgs${p}]overlay=(W-w)/2:(H-h)/2`,
  ].join(';');
  const crop = () => {
    const x = track?.keys?.length
      ? `'${cropXExpression(track.keys, { width, cropW })}'`
      : String(clamp(Math.round(focusX * width - cropW / 2), 0, width - cropW));
    return `crop=${cropW}:${even(height)}:${x}:0,scale=${OUT_W}:${OUT_H}`;
  };

  const shots = track?.shots?.length ? track.shots : [{ from: 0, to: Infinity, mode: layout === 'fit' ? 'fit' : 'crop' }];
  const modes = new Set(shots.map((s) => s.mode));
  if (cropW > width || !modes.has('crop')) return fit('');
  if (!modes.has('fit')) return crop();
  const on = shots.filter((s) => s.mode === 'crop').map((s) => `between(t,${s.from.toFixed(3)},${s.to.toFixed(3)})`).join('+');
  return `split=2[lc][lf];[lc]${crop()},setsar=1[crop];[lf]${fit('f')},setsar=1[fit];[fit][crop]overlay=0:0:enable='${on}'`;
}

/** Render one clip to `<jobDir>/clips/<id>.mp4` plus a poster jpg. */
export async function renderClip({ jobDir, sourceFile, probe, clip, words, captions = true, onProgress }) {
  const clipsDir = path.join(jobDir, 'clips');
  await fs.mkdir(clipsDir, { recursive: true });
  const started = Date.now();

  let track = null;
  if (probe.width / probe.height > 0.8) {
    try {
      track = await trackSubject({ sourceFile: path.resolve(sourceFile), probe, clip, prior: clip.focusX });
      const modes = new Set(track.shots.map((s) => s.mode));
      clip.layout = modes.size > 1 ? 'mixed' : [...modes][0];
      clip.track = { keyframes: track.keys.length, cuts: track.cuts, shots: track.shots };
    } catch {
      track = null; // fall back to the curator's static layout and focus_x
    }
  }
  onProgress?.(0.05);

  const rel = words
    .filter((w) => w.s >= clip.start - 0.05 && w.e <= clip.end + 0.05)
    .map((w) => ({ w: w.w, s: Math.max(0, w.s - clip.start), e: Math.max(0, w.e - clip.start) }));
  const assName = `${clip.id}.ass`;
  await fs.writeFile(path.join(clipsDir, assName), buildAss({ words: rel, hookText: clip.hookText, duration: clip.duration, layout: clip.layout, captions }), 'utf8');

  // Run inside clipsDir so filter paths stay relative (Windows drive colons break filter parsing).
  let fontsDir = path.relative(clipsDir, FONTS_DIR).split(path.sep).join('/');
  if (/^[A-Za-z]:/.test(fontsDir)) fontsDir = fontsDir.replace(':', '\\:');
  const graph = `[0:v]${layoutFilter(probe, clip, track)},setsar=1,ass=${assName}:fontsdir=${fontsDir},format=yuv420p[v]`;

  const out = `${clip.id}.mp4`;
  const args = [
    '-v', 'error', '-y', '-nostats', '-progress', 'pipe:1',
    '-ss', clip.start.toFixed(3), '-t', clip.duration.toFixed(3), '-i', path.resolve(sourceFile),
    '-filter_complex', graph, '-map', '[v]',
  ];
  if (probe.hasAudio) args.push('-map', '0:a:0', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000', '-c:a', 'aac', '-b:a', '160k');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-maxrate', '12M', '-bufsize', '24M', '-movflags', '+faststart', out);

  const r = await run(config.ffmpeg, args, {
    cwd: clipsDir,
    onLine: (line) => {
      const m = line.match(/^out_time_us=(\d+)/);
      if (m) onProgress?.(0.05 + 0.95 * clamp(Number(m[1]) / 1e6 / clip.duration, 0, 1));
    },
  });
  if (r.code !== 0) throw new Error(`Render failed for ${clip.id}: ${r.stderr.trim().split(/\r?\n/).slice(-3).join(' ')}`);

  const poster = `${clip.id}.jpg`;
  await runOk(config.ffmpeg, ['-v', 'error', '-y', '-ss', String(Math.min(1.2, clip.duration / 2)), '-i', out, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', poster], { cwd: clipsDir });
  const { size } = await fs.stat(path.join(clipsDir, out));
  return { file: `clips/${out}`, poster: `clips/${poster}`, sizeBytes: size, renderMs: Date.now() - started };
}
