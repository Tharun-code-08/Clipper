import fs from 'node:fs/promises';
import path from 'node:path';
import { config, STT_PRICING, STT_MIN_BILLED_SEC } from './config.js';
import { planChunks, cutAudio } from './media.js';
import { mapLimit } from './util.js';

const round2 = (n) => Math.round(n * 100) / 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function groqTranscribe(file, model, language) {
  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([await fs.readFile(file)], { type: 'audio/mpeg' }), path.basename(file));
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');
    form.append('temperature', '0');
    if (language) form.append('language', language);
    let res;
    try {
      res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${config.groqKey}` },
        body: form,
        signal: AbortSignal.timeout(240_000),
      });
    } catch (err) {
      if (attempt < 3) { await sleep(2000 * 2 ** attempt); continue; }
      throw new Error(`Groq transcription unreachable: ${err.message}`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const retryAfter = Number(res.headers.get('retry-after')) * 1000;
      await sleep(Math.min(60_000, retryAfter || 2000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Groq transcription failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
    }
    return res.json();
  }
}

/**
 * Whisper word tokens arrive without punctuation; segment text has it.
 * When a segment's whitespace tokens line up 1:1 with its words, borrow the punctuated spelling.
 */
function punctuate(words, segments) {
  let wi = 0;
  for (const seg of segments) {
    const inSeg = [];
    while (wi < words.length && words[wi].s < seg.e - 0.01) inSeg.push(words[wi++]);
    if (!inSeg.length) continue;
    const tokens = seg.text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === inSeg.length) inSeg.forEach((w, i) => { w.w = tokens[i]; });
    inSeg[inSeg.length - 1].eos = true;
  }
  return words;
}

/**
 * Transcribe `audio` (mp3) with Groq Whisper in overlapping chunks.
 * Returns {language, model, words:[{w,s,e,eos?}], segments:[{s,e,text}], billedSec, usd}.
 */
export async function transcribe(audio, duration, workDir, { model = config.sttModel, language, onProgress } = {}) {
  if (!config.groqKey) throw new Error('GROQ_API_KEY is missing from .env');
  if (!STT_PRICING[model]) throw new Error(`Unknown STT model ${model}`);
  const chunks = planChunks(duration);
  let done = 0;
  const results = await mapLimit(chunks, 3, async (chunk, i) => {
    const file = path.join(workDir, `stt_${String(i).padStart(2, '0')}.mp3`);
    await cutAudio(audio, chunk, file);
    try {
      const json = await groqTranscribe(file, model, language);
      onProgress?.(++done / chunks.length);
      return { chunk, json };
    } finally {
      await fs.rm(file, { force: true });
    }
  });

  const words = [];
  const segments = [];
  let billedSec = 0;
  let detected = null;
  for (const { chunk, json } of results) {
    billedSec += Math.max(STT_MIN_BILLED_SEC, Number(json.duration) || chunk.end - chunk.start);
    detected ||= json.language || null;
    for (const w of json.words || []) {
      const s = chunk.start + Number(w.start);
      const text = String(w.word ?? '').trim();
      if (!text || s < chunk.keepFrom || s >= chunk.keepTo) continue;
      words.push({ w: text, s: round2(s), e: round2(Math.max(s, chunk.start + Number(w.end))) });
    }
    for (const seg of json.segments || []) {
      const s = chunk.start + Number(seg.start);
      if (s < chunk.keepFrom || s >= chunk.keepTo) continue;
      segments.push({ s: round2(s), e: round2(chunk.start + Number(seg.end)), text: String(seg.text || '').trim() });
    }
  }
  // Chunks come back in order and Whisper's own word order is authoritative: sorting by start
  // time scrambles words whose timestamps overlap ("your and body what").
  punctuate(words, segments);
  return {
    language: detected,
    model,
    words,
    segments,
    billedSec: round2(billedSec),
    usd: (billedSec / 3600) * STT_PRICING[model],
  };
}
