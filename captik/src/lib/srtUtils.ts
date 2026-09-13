import type { TranscriptWord } from '@/types/transcript';
import { resolveSegments } from '@/lib/captionSegments';
export type { TranscriptWord };

function msToSRTTime(ms: number): string {
  const h   = Math.floor(ms / 3_600_000);
  const m   = Math.floor((ms % 3_600_000) / 60_000);
  const s   = Math.floor((ms % 60_000) / 1_000);
  const ms2 = ms % 1_000;
  return (
    [h, m, s].map((n) => String(n).padStart(2, '0')).join(':') +
    ',' +
    String(ms2).padStart(3, '0')
  );
}

/** Build SRT from plain transcript text + total duration. */
export function buildSRTFromTranscript(transcript: string, durationMs: number, wordsPerLine = 8): string {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (!words.length || !durationMs) return '';

  const groups: string[][] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    groups.push(words.slice(i, i + wordsPerLine));
  }

  const msPerGroup = durationMs / groups.length;
  return groups
    .map((group, i) => {
      const start = Math.round(i * msPerGroup);
      const end   = Math.max(start + 200, Math.round((i + 1) * msPerGroup) - 100);
      return `${i + 1}\n${msToSRTTime(start)} --> ${msToSRTTime(end)}\n${group.join(' ')}`;
    })
    .join('\n\n');
}

/**
 * Build SRT from the editor's live caption segments + per-word timings — one cue per
 * caption line, exactly matching what the preview shows (3–4 words per line, real
 * forced-aligned timing). This is the canonical export path; `buildSRTFromTranscript`
 * (fixed N-word groups, even timing) is only a fallback when no segments exist yet.
 *
 * Uses resolveSegments so stale segments (ids that no longer exist after a remap/restore)
 * are dropped instead of emitting empty cues. Returns '' when there is nothing to emit.
 */
export function buildSRTFromSegments(words: TranscriptWord[], segments: string[][]): string {
  const resolved = resolveSegments(segments, words);
  if (!resolved.length) return '';
  return resolved
    .map((seg, i) =>
      `${i + 1}\n${msToSRTTime(seg.startMs)} --> ${msToSRTTime(seg.endMs)}\n${seg.sw.map(w => w.text).join(' ')}`,
    )
    .join('\n\n');
}

const PUNCT_STRIP = /[।,\.!?;:"""''「」【】()[\]]/g;

/** Convert transcript text to per-word timed TranscriptWord objects (even distribution fallback). */
export function transcriptToWords(transcript: string, durationMs: number): TranscriptWord[] {
  const cleaned  = transcript.trim().replace(PUNCT_STRIP, '');
  const rawWords = cleaned.split(/\s+/).filter(Boolean);
  if (!rawWords.length || !durationMs) return [];
  const msPerWord = durationMs / rawWords.length;
  return rawWords.map((text, i) => ({
    id:            String(i + 1),
    text,
    startMs:       Math.round(i * msPerWord),
    endMs:         Math.max(Math.round(i * msPerWord) + 100, Math.round((i + 1) * msPerWord) - 50),
    styleOverride: {},
  }));
}

export type SarvamWordTimestamp = { word: string; start: number; end: number };

// Force monotonic, non-overlapping caption windows so one caption never stacks on top
// of the next. Overlaps arise from (a) the forced aligner returning overlapping/
// out-of-order spans on some audio, and (b) timing remaps assigning the same start to
// consecutive tokens. Mutates in place; transcript order is preserved (only timings
// nudged); a no-op when timings are already clean.
export function enforceNoOverlap(words: TranscriptWord[]): void {
  for (let i = 1; i < words.length; i++) {
    if (words[i].startMs < words[i - 1].endMs) words[i].startMs = words[i - 1].endMs;
    if (words[i].endMs <= words[i].startMs)    words[i].endMs   = words[i].startMs + 60;
  }
}

/** A contiguous region of speech (ms, relative to whatever audio it describes). */
export interface SpeechRegion {
  startMs: number;
  endMs:   number;
}

/**
 * Distribute a transcript's words across detected speech regions.
 *
 * Sarvam's sync STT only gives one timestamp window for the whole request, so we
 * can't place words from its timing. Instead we lay the words across the regions
 * where speech actually occurs (from energy-based VAD), weighting each word by its
 * length so longer words get proportionally more time, and — crucially — leaving
 * the silence BETWEEN regions empty. Result: captions pop in when a phrase starts
 * and clear during pauses, instead of sliding evenly across the whole window.
 *
 * Falls back to even distribution when no usable regions are supplied.
 */
export function transcriptToWordsOverSpeech(
  transcript: string,
  regions: SpeechRegion[],
  durationMs: number,
): TranscriptWord[] {
  const cleaned  = transcript.trim().replace(PUNCT_STRIP, '');
  const rawWords = cleaned.split(/\s+/).filter(Boolean);
  if (!rawWords.length || !durationMs) return [];

  const valid = regions
    .filter(r => r.endMs > r.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const totalSpeech = valid.reduce((s, r) => s + (r.endMs - r.startMs), 0);
  if (!valid.length || totalSpeech <= 0) return transcriptToWords(transcript, durationMs);

  // Per-word weight (char count ≈ duration); compressed-time offsets per region.
  const weights = rawWords.map(w => Math.max(1, w.length));
  const totalW  = weights.reduce((a, b) => a + b, 0);

  const regionCStart: number[] = [];
  let acc = 0;
  for (const r of valid) {
    regionCStart.push(acc);
    acc += r.endMs - r.startMs;
  }

  // Map a "compressed" time (silence removed, 0..totalSpeech) to real ms + its region.
  const mapC = (c: number): { real: number; ri: number } => {
    const cc = Math.max(0, Math.min(totalSpeech, c));
    let ri = valid.length - 1;
    for (let j = 0; j < valid.length; j++) {
      if (cc <= regionCStart[j] + (valid[j].endMs - valid[j].startMs)) { ri = j; break; }
    }
    return { real: valid[ri].startMs + (cc - regionCStart[ri]), ri };
  };

  const out: TranscriptWord[] = [];
  let wAcc = 0;
  for (let i = 0; i < rawWords.length; i++) {
    const cStart = (wAcc / totalW) * totalSpeech;
    wAcc += weights[i];
    const cEnd = (wAcc / totalW) * totalSpeech;
    const a = mapC(cStart);
    const b = mapC(cEnd);
    const startMs = a.real;
    // Keep a word inside ONE speech region so it never visually spans a silence gap.
    let endMs = b.ri !== a.ri ? valid[a.ri].endMs : b.real;
    if (endMs < startMs + 60) endMs = startMs + 60;
    out.push({ id: String(i + 1), text: rawWords[i], startMs: Math.round(startMs), endMs: Math.round(endMs), styleOverride: {} });
  }
  return out;
}

/**
 * Build TranscriptWord array from real Sarvam word-level timestamps.
 * Falls back to even distribution if timestamps array is empty.
 *
 * Sarvam sometimes returns the entire transcript as a single timestamp entry
 * (one {word: "full text", start, end} object). We detect this by checking if
 * any entry contains multiple space-separated tokens and split them evenly.
 * If the resulting word count is still less than half the transcript word count,
 * we fall back to even distribution (transcriptToWords).
 */
export function transcriptToWordsWithTimestamps(
  timestamps: SarvamWordTimestamp[],
  fallbackTranscript: string,
  durationMs: number,
): TranscriptWord[] {
  if (!timestamps.length) return transcriptToWords(fallbackTranscript, durationMs);

  // Sarvam sometimes returns timestamps as plain strings instead of per-word objects.
  const first = timestamps[0] as unknown;
  if (typeof first !== 'object' || first === null || !('word' in (first as object))) {
    return transcriptToWords(fallbackTranscript, durationMs);
  }

  // Expand any multi-word timestamp entries into individual word entries.
  const expanded: Array<{ text: string; start: number; end: number }> = [];
  for (const t of timestamps) {
    if (t.word == null) continue;
    const rawText = String(t.word).trim();
    const parts   = rawText.split(/\s+/).filter(p => p.replace(PUNCT_STRIP, '').trim().length > 0);
    if (parts.length === 0) continue;
    if (parts.length === 1) {
      expanded.push({ text: rawText, start: t.start ?? 0, end: t.end ?? 0 });
    } else {
      // Distribute the timestamp window evenly across the sub-words.
      const totalSec  = (t.end ?? 0) - (t.start ?? 0);
      const secPerPart = totalSec / parts.length;
      const baseStart = t.start ?? 0;
      for (let pi = 0; pi < parts.length; pi++) {
        expanded.push({
          text:  parts[pi],
          start: baseStart + pi * secPerPart,
          end:   baseStart + (pi + 1) * secPerPart,
        });
      }
    }
  }

  // Use the fallback transcript's word text when counts match.
  // This ensures wordsRoman / wordsEn get Roman/English text rather than the
  // native-script text that Sarvam embeds in its timestamp objects.
  const fallbackWords = fallbackTranscript
    .trim()
    .replace(PUNCT_STRIP, '')
    .split(/\s+/)
    .filter(p => p.trim().length > 0);

  if (fallbackWords.length === expanded.length) {
    for (let i = 0; i < expanded.length; i++) {
      expanded[i] = { ...expanded[i], text: fallbackWords[i] };
    }
  }

  // Safety fallback: if we have meaningfully fewer timestamped words than the transcript
  // has, the API dropped timing for some words (often the trailing ones). Keeping only the
  // timestamped words would make the rest of the caption silently vanish, so even-distribute
  // the FULL transcript across the window instead — every word stays visible, timing stays
  // roughly on the speech. (When Sarvam returns proper per-word timing the counts match and
  // we keep the exact timestamps below.)
  const fallbackWordCount = fallbackWords.length;
  if (expanded.length < fallbackWordCount * 0.85 && fallbackWordCount > 4) {
    return transcriptToWords(fallbackTranscript, durationMs);
  }

  const words = expanded
    .map((w, i) => ({
      id:            String(i + 1),
      text:          w.text.replace(PUNCT_STRIP, '').trim(),
      startMs:       Math.round(w.start * 1000),
      endMs:         Math.round(w.end   * 1000),
      styleOverride: {},
    }))
    .filter(w => w.text.length > 0);

  // Degenerate-timing guard: if the API returned timestamps but they don't actually
  // span the clip (e.g. all words at 0, or collapsed into a tiny window — happens when
  // the timestamp field shape differs from what we parse), the per-word times are
  // useless. Fall back to even distribution so captions track the speech instead of
  // all stacking at the start.
  const lastEnd = words.length ? words[words.length - 1].endMs : 0;
  if (durationMs > 0 && lastEnd < Math.min(durationMs * 0.25, 1500) && words.length > 4) {
    return transcriptToWords(fallbackTranscript, durationMs);
  }

  // Ensure each word has at least 50 ms of display time.
  for (const w of words) {
    if (w.endMs < w.startMs + 50) w.endMs = w.startMs + 50;
  }

  // Fill only TINY gaps (< 250 ms) so a word doesn't flicker between near-adjacent
  // tokens, but real pauses are preserved — captions should track speech and clear
  // when the speaker stops, not stretch each word across the silence after it.
  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].startMs - words[i].endMs;
    if (gap > 0 && gap < 250) words[i].endMs = words[i + 1].startMs - 1;
  }

  return words;
}

/** A timed word in chunk-relative SECONDS (the shape the forced aligner returns). */
export interface AlignedLite { text: string; start: number; end: number; }

const normTok = (s: string) => s.replace(PUNCT_STRIP, '').trim().toLowerCase();

/**
 * Reconcile a forced aligner's (possibly partial) word timings against the chunk's
 * FULL token list so no word is ever dropped or bunched.
 *
 * The aligner (ElevenLabs) often returns timings for only some of a chunk's tokens.
 * The old behaviour pushed just those words, so the un-aligned ones vanished from the
 * caption — the "a few words missing / mis-placed" bug. Here we instead:
 *   1. Anchor each aligner word to its matching token (sequential, normalized text,
 *      bounded look-ahead so one disagreement doesn't desync the rest).
 *   2. For every run of tokens BETWEEN anchors (and the lead/tail), linearly
 *      interpolate start/end across the gap, weighted by token length.
 * Result: one timed entry per token, every word kept, each placed between real
 * anchors instead of guessed across the whole window. Times stay chunk-relative
 * seconds. Returns [] only when there are zero usable anchors (caller falls back).
 */
export function reconcileAlignedWords(
  tokens: string[],
  aligned: AlignedLite[],
  chunkDurSec: number,
): AlignedLite[] {
  const n = tokens.length;
  if (n === 0) return [];

  // Anchor aligner words to token positions (greedy, monotonic).
  const anchored: (AlignedLite | null)[] = new Array(n).fill(null);
  let ti = 0;
  for (let ai = 0; ai < aligned.length && ti < n; ai++) {
    const at = normTok(aligned[ai].text);
    if (!at || !Number.isFinite(aligned[ai].start) || !Number.isFinite(aligned[ai].end)) continue;
    let found = -1;
    for (let k = ti; k < Math.min(n, ti + 6); k++) {
      if (normTok(tokens[k]) === at) { found = k; break; }
    }
    if (found === -1) continue;                       // no nearby match → skip (interp covers it)
    anchored[found] = { text: tokens[found], start: aligned[ai].start, end: aligned[ai].end };
    ti = found + 1;
  }

  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (anchored[i]) idx.push(i);
  if (idx.length === 0) return [];

  const out: AlignedLite[] = new Array(n);
  for (const i of idx) out[i] = anchored[i]!;

  const wlen = (s: string) => Math.max(1, normTok(s).length);
  // Even, length-weighted spread of tokens [lo..hi] across the seconds window [t0,t1].
  const fillRange = (lo: number, hi: number, t0: number, t1: number) => {
    const span = Math.max(0, t1 - t0);
    let total = 0;
    for (let i = lo; i <= hi; i++) total += wlen(tokens[i]);
    let acc = 0;
    for (let i = lo; i <= hi; i++) {
      const start = t0 + (total ? (acc / total) * span : 0);
      acc += wlen(tokens[i]);
      const end = t0 + (total ? (acc / total) * span : 0);
      out[i] = { text: tokens[i], start, end };
    }
  };

  // Lead: tokens before the first anchor — bounded backward so they don't span a long silence.
  if (idx[0] > 0) {
    const firstStart = out[idx[0]].start;
    const lead = idx[0];                              // count of leading tokens
    fillRange(0, idx[0] - 1, Math.max(0, firstStart - 0.4 * lead), firstStart);
  }
  // Between consecutive anchors.
  for (let a = 0; a < idx.length - 1; a++) {
    const lo = idx[a] + 1, hi = idx[a + 1] - 1;
    if (lo <= hi) fillRange(lo, hi, out[idx[a]].end, out[idx[a + 1]].start);
  }
  // Tail: tokens after the last anchor — bounded forward by the chunk end.
  const last = idx[idx.length - 1];
  if (last < n - 1) {
    const trail = n - 1 - last;
    const t1 = Math.min(chunkDurSec || (out[last].end + 0.4 * trail), out[last].end + 0.4 * trail);
    fillRange(last + 1, n - 1, out[last].end, Math.max(out[last].end + 0.05, t1));
  }

  // Floor each word to ≥50 ms so nothing collapses to zero width.
  for (const w of out) if (w.end < w.start + 0.05) w.end = w.start + 0.05;
  return out;
}

/**
 * Gently snap each word's start to a nearby speech onset (energy-VAD region start)
 * when one sits within `windowMs` — tightening the common ~50-150 ms offset between
 * an aligned/estimated start and where the sound actually begins. Conservative by
 * design: only nudges clearly-close onsets, never relocates a word, preserves order
 * (clamped between the previous word's start and this word's own end). Mutates in
 * place; run enforceNoOverlap afterwards to clean up. Operates in the same ms space
 * as `words` and `regions` (use global ms for both).
 */
export function snapWordsToOnsets(
  words: TranscriptWord[],
  regions: SpeechRegion[],
  windowMs = 120,
): void {
  if (!words.length || !regions.length) return;
  const onsets = regions.map(r => r.startMs).filter(s => Number.isFinite(s)).sort((a, b) => a - b);
  if (!onsets.length) return;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let best = -1, bestD = Infinity;
    for (const s of onsets) {
      const d = Math.abs(s - w.startMs);
      if (d < bestD) { bestD = d; best = s; }
      if (s > w.startMs + windowMs) break;            // onsets are sorted — no closer one ahead
    }
    if (best < 0 || bestD > windowMs) continue;
    const lower = i > 0 ? words[i - 1].startMs + 1 : 0;
    const upper = w.endMs - 40;
    const snapped = Math.min(Math.max(best, lower), upper);
    if (snapped < w.endMs) w.startMs = snapped;
  }
}

/** Trigger a browser download of an SRT string. */
export function triggerSRTDownload(filename: string, srtContent: string) {
  const blob = new Blob([srtContent], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename.endsWith('.srt') ? filename : filename.replace(/\.[^.]+$/, '.srt');
  a.click();
  URL.revokeObjectURL(url);
}
