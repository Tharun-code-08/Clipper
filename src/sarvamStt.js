import { spawn } from 'node:child_process';
import { config } from './config.js';
import { mapLimit } from './util.js';

// Captik's production STT: Sarvam saaras:v3 (codemix) writes the transcript, ElevenLabs forced
// alignment times it. Sarvam returns no word timestamps and its sync endpoint rejects audio over 30 s;
// alignment times the exact text Sarvam heard, so there is nothing to reconcile.
const SR = 16000;
const BYTES_PER_SEC = SR * 2;
const CHUNK_MAX_SEC = 28;
const CHUNK_MIN_SEC = 18;
const WINDOW_TARGET_SEC = 168; // Captik's alignment window
const WINDOW_MAX_BYTES = 6_000_000;
const MAX_LOSS = 1.5; // measured: ~0.1-0.2 with correct text, ~2.5 with mangled text
const ENV_HZ = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round2 = (n) => Math.round(n * 100) / 100;

/** Decode any media file's audio to 16 kHz mono s16le PCM in memory (~115 MB per hour). */
export function decodePcm(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpeg, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { windowsHide: true });
    const parts = [];
    child.stdout.on('data', (d) => parts.push(d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(parts)) : reject(new Error(`ffmpeg audio decode exited ${code}`))));
  });
}

/** Mean |sample| per 10 ms. */
export function pcmEnvelope(pcm) {
  const hop = SR / ENV_HZ;
  const n = Math.floor(pcm.length / 2);
  const env = new Float32Array(Math.ceil(n / hop));
  for (let i = 0; i < n; i++) env[(i / hop) | 0] += Math.abs(pcm.readInt16LE(i * 2)) / hop;
  return env;
}

/** Chunks of ≤28 s that end on the quietest 300 ms between 18 and 28 s — never mid-word on a fixed clock. */
export function planSilenceChunks(env, durationSec) {
  const win = Math.round(0.3 * ENV_HZ);
  const chunks = [];
  let start = 0;
  while (durationSec - start > CHUNK_MAX_SEC) {
    const a = Math.round((start + CHUNK_MIN_SEC) * ENV_HZ);
    const b = Math.round((start + CHUNK_MAX_SEC) * ENV_HZ) - win;
    let sum = 0;
    for (let i = a; i < a + win; i++) sum += env[i] ?? 0;
    let best = a;
    let bestSum = sum;
    for (let i = a + 1; i <= b; i++) {
      sum += (env[i + win - 1] ?? 0) - (env[i - 1] ?? 0);
      if (sum < bestSum) { bestSum = sum; best = i; }
    }
    const cut = (best + win / 2) / ENV_HZ;
    chunks.push({ start, end: cut });
    start = cut;
  }
  chunks.push({ start, end: durationSec });
  return chunks;
}

/** WAV bytes for [startSec, endSec) of the PCM buffer. */
export function wavSlice(pcm, startSec, endSec) {
  const a = Math.max(0, Math.floor(startSec * SR)) * 2;
  const b = Math.min(pcm.length, Math.floor(endSec * SR) * 2);
  const data = pcm.subarray(a, b);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24); header.writeUInt32LE(BYTES_PER_SEC, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function sarvamChunk(wav, languageCode) {
  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'chunk.wav');
    form.append('model', config.sarvamModel);
    form.append('mode', 'codemix');
    if (languageCode) form.append('language_code', languageCode);
    let res;
    try {
      res = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST', headers: { 'api-subscription-key': config.sarvamKey }, body: form, signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      if (attempt < 3) { await sleep(1500 * 2 ** attempt); continue; }
      throw new Error(`Sarvam unreachable: ${err.message}`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(Math.min(30_000, 1500 * 2 ** attempt)); continue; }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      if (res.status === 402 || /insufficient|quota|credit/i.test(body)) throw new Error(`Sarvam is out of credits (HTTP ${res.status}). Top up the Sarvam account. ${body}`);
      throw new Error(`Sarvam transcription failed (HTTP ${res.status}): ${body}`);
    }
    const j = await res.json();
    return { text: String(j.transcript || '').trim(), language: j.language_code || null };
  }
}

function alignTarget() {
  if (config.elevenlabsKey) return { url: 'https://api.elevenlabs.io/v1/forced-alignment', headers: { 'xi-api-key': config.elevenlabsKey }, via: 'elevenlabs' };
  if (config.supabaseServiceRoleKey && config.captikAlignUrl) return { url: config.captikAlignUrl, headers: { Authorization: `Bearer ${config.supabaseServiceRoleKey}` }, via: 'captik-edge' };
  throw new Error('Word timing needs ELEVENLABS_API_KEY, or SUPABASE_SERVICE_ROLE_KEY + CAPTIK_ALIGN_URL to use Captik\'s elevenlabs-align function.');
}

async function forcedAlign(wav, text) {
  const target = alignTarget();
  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'window.wav');
    form.append('text', text); // multipart keeps Devanagari intact (a shell -F would turn it into ????)
    let res;
    try {
      res = await fetch(target.url, { method: 'POST', headers: target.headers, body: form, signal: AbortSignal.timeout(120_000) });
    } catch {
      if (attempt < 2) { await sleep(1000 * 2 ** attempt); continue; }
      return { status: 0 };
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) { await sleep(1000 * 2 ** attempt + Math.random() * 400); continue; }
    if (!res.ok) return { status: res.status, error: (await res.text()).slice(0, 200) };
    const j = await res.json().catch(() => null);
    const words = (Array.isArray(j?.words) ? j.words : [])
      .map((w) => ({ text: String(w.text ?? '').trim(), start: Number(w.start), end: Number(w.end) }))
      .filter((w) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end));
    return { status: res.status, words, loss: Number.isFinite(Number(j?.loss)) ? Number(j.loss) : null };
  }
}

/** Even spread of a chunk's tokens over its duration — the last resort, flagged low-confidence. */
function spreadEvenly(chunk) {
  const tokens = chunk.text.split(/\s+/).filter(Boolean);
  const per = (chunk.end - chunk.start) / Math.max(1, tokens.length);
  return tokens.map((w, i) => ({ w, s: round2(chunk.start + i * per), e: round2(chunk.start + (i + 0.9) * per), low: true }));
}

async function alignWindow(pcm, win, stats) {
  const tokens = win.chunks.flatMap((c) => c.text.split(/\s+/).filter(Boolean));
  if (!tokens.length) return [];
  const wav = wavSlice(pcm, win.start, win.end);
  for (const text of [tokens.join(' '), tokens.map((t) => t.normalize('NFC').toLowerCase()).join(' ')]) {
    const r = await forcedAlign(wav, text);
    stats.alignedSec += win.end - win.start;
    if (r.status === 413 && win.chunks.length > 1) {
      const mid = Math.ceil(win.chunks.length / 2);
      const halves = [win.chunks.slice(0, mid), win.chunks.slice(mid)].map((cs) => ({ start: cs[0].start, end: cs.at(-1).end, chunks: cs }));
      stats.splits++;
      return [...await alignWindow(pcm, halves[0], stats), ...await alignWindow(pcm, halves[1], stats)];
    }
    const coverage = r.words ? r.words.length / tokens.length : 0;
    if (r.words?.length && coverage >= 0.8 && (r.loss === null || r.loss <= MAX_LOSS)) {
      stats.accepted++;
      stats.losses.push(r.loss);
      // Keep the transcript's spelling (with punctuation) and take the timing from the alignment.
      return r.words.map((w, i) => ({ w: tokens[i] ?? w.text, s: round2(win.start + w.start), e: round2(win.start + Math.max(w.start + 0.04, w.end)) }));
    }
    stats.rejected.push({ start: round2(win.start), status: r.status, loss: r.loss ?? null, coverage: round2(coverage), error: r.error });
  }
  if (win.chunks.length > 1) {
    const mid = Math.ceil(win.chunks.length / 2);
    const halves = [win.chunks.slice(0, mid), win.chunks.slice(mid)].map((cs) => ({ start: cs[0].start, end: cs.at(-1).end, chunks: cs }));
    stats.splits++;
    return [...await alignWindow(pcm, halves[0], stats), ...await alignWindow(pcm, halves[1], stats)];
  }
  stats.fallback++;
  return win.chunks.flatMap(spreadEvenly);
}

/**
 * Transcribe `audioFile` with Sarvam + ElevenLabs alignment.
 * Resolves {language, model, words:[{w,s,e,low?}], segments:[], billedSec, alignedSec, stats}.
 */
export async function transcribeSarvam(audioFile, durationSec, { languageCode, onProgress } = {}) {
  if (!config.sarvamKey) throw new Error('SARVAM_API_KEY is missing from .env');
  alignTarget(); // fail fast before spending on transcription
  const pcm = await decodePcm(audioFile);
  const duration = Math.min(durationSec || Infinity, pcm.length / BYTES_PER_SEC);
  const chunks = planSilenceChunks(pcmEnvelope(pcm), duration);

  let done = 0;
  const total = chunks.length * 2;
  await mapLimit(chunks, 6, async (c) => {
    const r = await sarvamChunk(wavSlice(pcm, c.start, c.end), languageCode);
    Object.assign(c, r);
    onProgress?.(++done / total);
  });

  const windows = [];
  for (const c of chunks) {
    const cur = windows.at(-1);
    if (cur && c.end - cur.start <= WINDOW_TARGET_SEC && (c.end - cur.start) * BYTES_PER_SEC <= WINDOW_MAX_BYTES) {
      cur.chunks.push(c);
      cur.end = c.end;
    } else {
      windows.push({ start: c.start, end: c.end, chunks: [c] });
    }
  }
  const stats = { chunks: chunks.length, windows: windows.length, accepted: 0, splits: 0, fallback: 0, rejected: [], losses: [], alignedSec: 0 };
  const perWindow = await mapLimit(windows, 6, async (win) => {
    const words = await alignWindow(pcm, win, stats);
    done += win.chunks.length;
    onProgress?.(Math.min(1, done / total));
    return words;
  });

  const langCounts = {};
  for (const c of chunks) if (c.language && c.text) langCounts[c.language] = (langCounts[c.language] || 0) + (c.end - c.start);
  const language = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const billedSec = chunks.reduce((a, c) => a + (c.end - c.start), 0);
  return {
    language,
    model: `sarvam:${config.sarvamModel}`,
    aligner: 'elevenlabs:forced-alignment',
    words: perWindow.flat(),
    segments: [],
    billedSec: round2(billedSec),
    alignedSec: round2(stats.alignedSec),
    stats: { ...stats, meanLoss: stats.losses.length ? round2(stats.losses.reduce((a, b) => a + (b ?? 0), 0) / stats.losses.length) : null, losses: undefined },
  };
}
