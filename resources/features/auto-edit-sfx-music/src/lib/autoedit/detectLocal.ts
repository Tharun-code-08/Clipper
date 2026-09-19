// ─────────────────────────────────────────────────────────────────────────────
// Auto-Edit — LOCAL, deterministic cut detection. No model call, no API key, no DB.
//
// Input: captik's ms-based transcript (+ optional energy-VAD speech regions from
// the 16 kHz PCM). Output: an audited list of removals in SECONDS, each carrying
// {start, end, reason, detail, text}.
//
// ORDER IS LOAD-BEARING: retakes → fillers → gaps → edges.
//  • Fillers go before gaps are measured — one removed "umm" otherwise leaves two
//    half-gaps that each look too small to cut, and the edit keeps a 1 s dead spot.
//  • Every new cut is SUBTRACTED from what is already removed before it is recorded,
//    so the reported total equals the real removal (asserted in the spec).
//
// RETAKES: deleting real speech is the worst failure this module can have, so ALL of
//  these must hold: ≥4 matching normalized tokens in a row AND ≥2 distinct content
//  words among them, a bounded interruption (≤3.5 s) between the attempts, and the
//  second attempt starting within a 12 s forward window. Matching on any 3
//  consecutive words once deleted 7 s of good Hindi speech — never relax this.
//  Explicit markers ("sorry", "cut that", "phir se", "ek baar aur") are retake
//  BOUNDARIES: they never count as matched tokens, they are cut along with the
//  abandoned attempt, and they are named in the audit — but a marker alone never
//  cuts anything ("I'm sorry for your loss" is speech).
// ─────────────────────────────────────────────────────────────────────────────

import type { TranscriptWord } from '@/types/transcript';
import type { SpeechRegion } from '@/lib/srtUtils';
import { getAggressionLevel } from './aggression';
import type { EditOptions } from './types';

export type LocalReason = 'silence' | 'filler' | 'repetition';

export interface LocalRemoval {
  /** seconds (millisecond precision) */
  start: number;
  end: number;
  reason: LocalReason;
  /** Audit line: why this span was cut. */
  detail: string;
  /** What was said inside the span ('' for silence). */
  text: string;
}

export interface DetectLocalInput {
  words: readonly Pick<TranscriptWord, 'text' | 'startMs' | 'endMs' | 'lowConfidence'>[];
  durationMs: number;
  /** Energy-VAD speech regions (ms). When present, silence is only cut where the audio
   *  agrees there is no speech. Empty/absent = word timings alone. */
  speechRegions?: readonly SpeechRegion[] | null;
  options: EditOptions;
}

export interface DetectLocalOutput {
  removals: LocalRemoval[];
  /** Σ(end − start) of `removals`, seconds. Equals the length of their union. */
  totalSec: number;
}

// ── Tunables (ms) ────────────────────────────────────────────────────────────
export const FILLER_PAD_MS = 30;
export const SILENCE_GUARD_MS = 40;
export const EDGE_MIN_MS = 150;
export const RETAKE_MIN_TOKENS = 4;
export const RETAKE_MIN_CONTENT = 2;
export const RETAKE_MAX_INTERRUPTION_MS = 3500;
export const RETAKE_WINDOW_MS = 12000;
const RETAKE_PAD_MS = 30;
/** Context fillers need a pause at least this long on one side. */
const CONTEXT_PAUSE_MS = 120;
/** New cut edges within this distance of an existing cut (or 0 / the end) snap onto it,
 *  so no sub-frame sliver of "kept" video survives between two cuts. */
const SNAP_MS = 50;
/** Records shorter than this that touch a neighbour are folded into it (display noise). */
const TINY_MS = 50;

// ── Normalisation ────────────────────────────────────────────────────────────
/** Lower-case, NFC, strip everything that isn't a letter / combining mark / digit.
 *  Keeps Devanagari matras + virama (\p{M}) so "हम्म" survives intact. */
export function normToken(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
}

// Unmistakable hesitations. English + Roman Hinglish, elongation-tolerant.
const FILLER_LATIN =
  /^(?:u+m+|u+h+|u+h+m+|e+r+m*|h+m+|m{2,}|a+m{2,}|a{3,}|e+h{2,}|e+h+m+)$/;
// Devanagari hesitations. Deliberately NOT "हम" (= "we") or "हाँ" (= "yes").
const FILLER_DEVANAGARI = new Set(
  [
    'उम', 'उम्म', 'उम्मम', 'उम्ममम', 'अं', 'अंअं', 'अँ', 'अम्म', 'अम्मम',
    'हम्म', 'हम्मम', 'हम्ममम', 'ह्म', 'ह्म्म', 'हुम्म', 'उह', 'उँ', 'ऊँ', 'ऊं', 'एह', 'एम्म',
  ].map((s) => s.normalize('NFC')),
);

export function isExactFiller(norm: string): boolean {
  if (!norm) return false;
  return FILLER_LATIN.test(norm) || FILLER_DEVANAGARI.has(norm);
}

/** Context fillers — real words that are often filler. Strongest two levels only, and
 *  only when they hang on a pause. Multi-word phrases are token arrays. */
const CONTEXT_FILLERS: string[][] = [
  ['like'], ['so'], ['basically'], ['actually'], ['literally'],
  ['you', 'know'], ['i', 'mean'],
  ['matlab'], ['toh'], ['yaani'], ['yani'],
  ['मतलब'], ['तो'], ['यानी'], ['यानि'],
].map((p) => p.map((t) => t.normalize('NFC')));

/** Retake markers — boundaries between an abandoned attempt and the restart. */
const RETAKE_MARKERS: string[][] = [
  ['sorry'], ['sory'], ['cut', 'that'], ['cut', 'it'], ['start', 'again'],
  ['one', 'more', 'time'], ['phir', 'se'], ['fir', 'se'], ['ek', 'baar', 'aur'],
  ['ek', 'bar', 'aur'], ['ek', 'baar', 'phir'], ['ek', 'bar', 'phir'],
  ['सॉरी'], ['सोरी'], ['फिर', 'से'], ['एक', 'बार', 'और'], ['एक', 'बार', 'फिर'],
].map((p) => p.map((t) => t.normalize('NFC')));

// Function words that never count as the "content" half of a retake match.
const STOP = new Set(
  [
    // Roman Hindi / Hinglish grammar
    'hai', 'hain', 'hei', 'tha', 'thi', 'the', 'ho', 'hoga', 'hogi', 'hota', 'hoti', 'hua', 'hue',
    'hoon', 'hun', 'hu', 'raha', 'rahi', 'rahe', 'rha', 'rhi', 'gaya', 'gayi', 'gaye',
    'ka', 'ki', 'ke', 'ko', 'ne', 'se', 'mein', 'me', 'par', 'pe', 'tak', 'liye',
    'wala', 'wali', 'wale', 'yeh', 'yah', 'ye', 'wo', 'woh', 'vo', 'is', 'us', 'in', 'un',
    'iska', 'uska', 'isko', 'usko', 'aur', 'ya', 'toh', 'to', 'bhi', 'hi', 'na', 'nahi',
    'nahin', 'mat', 'kya', 'kyun', 'kaise', 'ek', 'koi', 'kuch', 'sab', 'bahut', 'bas',
    'abhi', 'ab', 'jab', 'tab', 'agar', 'lekin', 'phir', 'fir', 'jo', 'matlab', 'aap',
    'aapko', 'apko', 'hum', 'humein', 'hame', 'tum', 'tumhe', 'main', 'mai', 'mujhe',
    'mera', 'meri', 'mere', 'apna', 'apni', 'apne', 'karo', 'kar', 'karna', 'karne',
    'karta', 'karti', 'karte', 'kiya', 'hona', 'guys', 'hey', 'hello', 'bhai', 'bro', 'okay', 'ok',
    // English grammar
    'a', 'an', 'are', 'was', 'were', 'be', 'been', 'am', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'can', 'it', 'its', 'this', 'that', 'these',
    'those', 'i', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they',
    'them', 'their', 'what', 'which', 'who', 'where', 'when', 'why', 'how', 'on', 'at', 'by',
    'for', 'from', 'with', 'of', 'up', 'out', 'as', 'if', 'but', 'or', 'and', 'not', 'no',
    'so', 'than', 'then', 'just', 'very', 'too', 'also', 'here', 'there', 'now', 'all',
    'some', 'like', 'really', 'actually', 'basically', 'going', 'gonna', 'let', 'lets',
    // Devanagari grammar
    'है', 'हैं', 'था', 'थी', 'थे', 'हो', 'होगा', 'होगी', 'होता', 'होती', 'हुआ', 'हुए', 'हूँ', 'हूं',
    'रहा', 'रही', 'रहे', 'गया', 'गई', 'गए', 'का', 'की', 'के', 'को', 'ने', 'से', 'में', 'पर',
    'तक', 'लिए', 'वाला', 'वाली', 'वाले', 'यह', 'ये', 'वह', 'वो', 'इस', 'उस', 'इन', 'उन',
    'और', 'या', 'तो', 'भी', 'ही', 'ना', 'न', 'नहीं', 'मत', 'क्या', 'क्यों', 'कैसे', 'कोई',
    'कुछ', 'सब', 'बहुत', 'बस', 'अभी', 'अब', 'जब', 'तब', 'अगर', 'लेकिन', 'फिर', 'जो', 'कि',
    'आप', 'आपको', 'हम', 'हमें', 'तुम', 'मैं', 'मुझे', 'मेरा', 'मेरी', 'मेरे', 'अपना', 'अपनी',
    'अपने', 'करो', 'कर', 'करना', 'करने', 'करता', 'करती', 'करते', 'किया', 'एक',
  ].map((s) => s.normalize('NFC')),
);

export function isContentToken(norm: string): boolean {
  return !!norm && [...norm].length >= 2 && !STOP.has(norm) && !isExactFiller(norm);
}

// ── Span arithmetic (integer ms, half-open [start, end)) ─────────────────────
interface Span { start: number; end: number }

const spanLen = (spans: readonly Span[]): number =>
  spans.reduce((a, s) => a + Math.max(0, s.end - s.start), 0);

/** `src` minus the sorted, non-overlapping `cuts`. */
function subtract(src: Span, cuts: readonly Span[]): Span[] {
  const out: Span[] = [];
  let cursor = src.start;
  for (const c of cuts) {
    if (c.end <= cursor) continue;
    if (c.start >= src.end) break;
    if (c.start > cursor) out.push({ start: cursor, end: Math.min(c.start, src.end) });
    cursor = Math.max(cursor, c.end);
    if (cursor >= src.end) break;
  }
  if (cursor < src.end) out.push({ start: cursor, end: src.end });
  return out.filter((s) => s.end > s.start);
}

function subtractAll(src: Span, cuts: readonly Span[]): Span[] {
  return subtract(src, normaliseSpans(cuts));
}

function normaliseSpans(spans: readonly Span[]): Span[] {
  const sorted = spans.filter((s) => s.end > s.start).map((s) => ({ ...s })).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push(s);
  }
  return out;
}

// ── Detector ─────────────────────────────────────────────────────────────────
interface Rec extends Span { reason: LocalReason; detail: string; text: string }

interface W { text: string; norm: string; start: number; end: number; low: boolean }

const fmtS = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

function matchPhraseAt(ws: readonly W[], i: number, phrases: readonly string[][]): string[] | null {
  for (const p of phrases) {
    if (i + p.length > ws.length) continue;
    let ok = true;
    for (let k = 0; k < p.length; k++) {
      if (ws[i + k].norm !== p[k]) { ok = false; break; }
    }
    if (ok) return p;
  }
  return null;
}

export function detectLocal(input: DetectLocalInput): DetectLocalOutput {
  const { options } = input;
  const level = getAggressionLevel(options.aggressionLevel);

  // Clean, ordered word list (ms).
  const ws: W[] = input.words
    .filter((w) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs))
    .map((w) => ({
      text: w.text,
      norm: normToken(w.text),
      start: Math.max(0, Math.round(w.startMs)),
      end: Math.max(Math.round(w.startMs), Math.round(w.endMs)),
      low: !!w.lowConfidence,
    }))
    .sort((a, b) => a.start - b.start);
  const n = ws.length;
  const lastEnd = n ? ws[n - 1].end : 0;
  const duration = Math.max(Math.round(Number.isFinite(input.durationMs) ? input.durationMs : 0), lastEnd);
  if (n === 0 || duration <= 0) return { removals: [], totalSec: 0 };

  const speech = input.speechRegions && input.speechRegions.length
    ? normaliseSpans(input.speechRegions.map((r) => ({ start: Math.round(r.startMs), end: Math.round(r.endMs) })))
    : null;

  /** Union of everything cut so far (sorted, merged). */
  let removed: Span[] = [];
  const recs: Rec[] = [];
  const cutWord = new Uint8Array(n);

  /** Snap → subtract what's already cut → record the remainder. Returns ms recorded. */
  const record = (span: Span, reason: LocalReason, detail: string, text: string): number => {
    let { start, end } = span;
    start = Math.max(0, start);
    end = Math.min(duration, end);
    if (start < SNAP_MS) start = 0;
    if (duration - end < SNAP_MS) end = duration;
    for (const r of removed) {
      if (r.end <= start && start - r.end < SNAP_MS) start = r.end;
      if (r.start >= end && r.start - end < SNAP_MS) end = r.start;
    }
    if (end <= start) return 0;
    const pieces = subtract({ start, end }, removed);
    for (const p of pieces) recs.push({ ...p, reason, detail, text });
    removed = normaliseSpans([...removed, ...pieces]);
    return spanLen(pieces);
  };

  // ── 1. Retakes ─────────────────────────────────────────────────────────────
  if (options.removeRepetitions) {
    const markerAt = new Map<number, string>();
    for (let i = 0; i < n; i++) {
      const p = matchPhraseAt(ws, i, RETAKE_MARKERS);
      if (p) for (let k = 0; k < p.length; k++) markerAt.set(i + k, p.join(' '));
    }
    // Comparison sequence: real tokens only (no hesitations, no markers, no empties).
    const seq: number[] = [];
    for (let i = 0; i < n; i++) {
      if (ws[i].norm && !isExactFiller(ws[i].norm) && !markerAt.has(i)) seq.push(i);
    }
    let p = 0;
    while (p < seq.length) {
      let hit: { q: number; L: number } | null = null;
      for (let q = p + RETAKE_MIN_TOKENS; q < seq.length; q++) {
        const a = ws[seq[p]];
        const b = ws[seq[q]];
        if (b.start - a.start > RETAKE_WINDOW_MS) break;
        if (a.norm !== b.norm) continue;
        let L = 0;
        while (p + L < q && q + L < seq.length && ws[seq[p + L]].norm === ws[seq[q + L]].norm) L++;
        if (L < RETAKE_MIN_TOKENS) continue;
        const content = new Set<string>();
        for (let k = 0; k < L; k++) {
          const t = ws[seq[p + k]].norm;
          if (isContentToken(t)) content.add(t);
        }
        if (content.size < RETAKE_MIN_CONTENT) {
          // A spoken restart marker ("sorry", "फिर से") BETWEEN the two attempts is itself strong
          // evidence of a retake, so one content word is enough there. Everything else still has to
          // hold: ≥4 matching tokens, the bounded interruption, verified timing. Without this, a real
          // restart like "अभी। देखते हैं क्या कर — sorry — अभी। देखते हैं क्या कर सकते हैं" was kept,
          // because only one of its repeated words ("देखते") is a content word.
          let marked = false;
          for (let k = seq[p + L - 1] + 1; k < seq[q]; k++) if (markerAt.has(k)) { marked = true; break; }
          if (!marked || content.size < 1) continue;
        }
        const firstAttemptEnd = ws[seq[p + L - 1]].end;
        if (b.start - firstAttemptEnd > RETAKE_MAX_INTERRUPTION_MS) continue;
        // Unverified timing anywhere from the first attempt to the restart's onset → no cut.
        let low = false;
        for (let k = seq[p]; k <= seq[q]; k++) if (ws[k].low) { low = true; break; }
        if (low) continue;
        hit = { q, L };
        break;
      }
      if (!hit) { p++; continue; }
      const i = seq[p];
      const j = seq[hit.q];
      const prevEnd = i > 0 ? Math.min(ws[i - 1].end, ws[i].start) : 0;
      const start = Math.max(prevEnd, ws[i].start - RETAKE_PAD_MS);
      const end = Math.max(ws[j].start - RETAKE_PAD_MS, Math.min(ws[j - 1].end, ws[j].start));
      const markers = new Set<string>();
      for (let k = i; k < j; k++) { const m = markerAt.get(k); if (m) markers.add(m); }
      const phrase = seq.slice(p, p + hit.L).map((k) => ws[k].text).join(' ');
      const detail =
        `retake: "${phrase}" (${hit.L} words) restarted ${fmtS(ws[j].start - ws[seq[p + hit.L - 1]].end)} later` +
        (markers.size ? `; marker "${[...markers].join('", "')}"` : '');
      const text = ws.slice(i, j).map((w) => w.text).join(' ');
      record({ start, end }, 'repetition', detail, text);
      for (let k = i; k < j; k++) cutWord[k] = 1;
      p = hit.q;
    }
  }

  // ── 2. Fillers ─────────────────────────────────────────────────────────────
  if (options.removeFillers) {
    for (let i = 0; i < n; i++) {
      if (cutWord[i] || ws[i].low) continue;
      let span = 1;
      let kind: 'exact' | 'context' | null = null;
      if (isExactFiller(ws[i].norm)) kind = 'exact';
      else if (level.contextFillers) {
        const ph = matchPhraseAt(ws, i, CONTEXT_FILLERS);
        if (ph) {
          let clean = true;
          for (let k = 0; k < ph.length; k++) if (cutWord[i + k] || ws[i + k].low) clean = false;
          const before = i === 0 ? Infinity : ws[i].start - ws[i - 1].end;
          const last = i + ph.length - 1;
          const after = last === n - 1 ? Infinity : ws[last + 1].start - ws[last].end;
          if (clean && (before >= CONTEXT_PAUSE_MS || after >= CONTEXT_PAUSE_MS)) {
            kind = 'context';
            span = ph.length;
          }
        }
      }
      if (!kind) continue;
      const last = i + span - 1;
      const prevEnd = i > 0 ? Math.min(ws[i - 1].end, ws[i].start) : 0;
      const nextStart = last < n - 1 ? Math.max(ws[last + 1].start, ws[last].end) : duration;
      const start = Math.max(prevEnd, ws[i].start - FILLER_PAD_MS);
      const end = Math.min(nextStart, ws[last].end + FILLER_PAD_MS);
      const text = ws.slice(i, last + 1).map((w) => w.text).join(' ');
      record({ start, end }, 'filler', kind === 'exact' ? `filler "${text}"` : `context filler "${text}" on a pause`, text);
      for (let k = i; k <= last; k++) cutWord[k] = 1;
      i = last;
    }
  }

  // ── 3. Gaps + 4. Edges ─────────────────────────────────────────────────────
  if (options.removeSilences) {
    const kept: number[] = [];
    for (let i = 0; i < n; i++) if (!cutWord[i]) kept.push(i);
    const thresholdMs = Math.round(level.silenceThreshold * 1000);
    const candidates = (raw: Span): Span[] => (speech ? subtract(raw, speech) : [raw]);

    for (let k = 0; k + 1 < kept.length; k++) {
      const a = ws[kept[k]];
      const b = ws[kept[k + 1]];
      if (a.low || b.low) continue;
      if (b.start <= a.end) continue;
      for (const c of candidates({ start: a.end, end: b.start })) {
        // The pause as it will PLAY after earlier cuts (a removed filler no longer splits it).
        const effective = spanLen(subtractAll(c, removed));
        if (effective <= thresholdMs) continue;
        record(
          { start: c.start + SILENCE_GUARD_MS, end: c.end - SILENCE_GUARD_MS },
          'silence',
          `pause ${fmtS(effective)} > ${fmtS(thresholdMs)}${speech ? ' (audio confirms silence)' : ''}`,
          '',
        );
      }
    }

    if (kept.length) {
      const first = ws[kept[0]];
      if (!(first.low && !speech)) {
        for (const c of candidates({ start: 0, end: first.start })) {
          if (spanLen(subtractAll(c, removed)) <= EDGE_MIN_MS) continue;
          record(
            { start: c.start === 0 ? 0 : c.start + SILENCE_GUARD_MS, end: c.end - SILENCE_GUARD_MS },
            'silence', 'leading silence', '',
          );
        }
      }
      const lastW = ws[kept[kept.length - 1]];
      if (!(lastW.low && !speech) && duration > lastW.end) {
        for (const c of candidates({ start: lastW.end, end: duration })) {
          if (spanLen(subtractAll(c, removed)) <= EDGE_MIN_MS) continue;
          record(
            { start: c.start + SILENCE_GUARD_MS, end: c.end === duration ? duration : c.end - SILENCE_GUARD_MS },
            'silence', 'trailing silence', '',
          );
        }
      }
    }
  }

  // ── Consolidate for display (never changes the union) ──────────────────────
  recs.sort((a, b) => a.start - b.start);
  const merged: Rec[] = [];
  for (const r of recs) {
    const last = merged[merged.length - 1];
    if (last && last.end === r.start && last.reason === r.reason && last.detail === r.detail) {
      last.end = r.end;
    } else merged.push({ ...r });
  }
  // Fold tiny touching slivers into a neighbour so the list isn't cluttered with 0.01s rows.
  for (let i = 0; i < merged.length; i++) {
    const r = merged[i];
    if (r.end - r.start >= TINY_MS) continue;
    const prev = merged[i - 1];
    const next = merged[i + 1];
    if (prev && prev.end === r.start) { prev.end = r.end; merged.splice(i, 1); i--; }
    else if (next && next.start === r.end) { next.start = r.start; merged.splice(i, 1); i--; }
  }

  const removals: LocalRemoval[] = merged.map((r) => ({
    start: r.start / 1000,
    end: r.end / 1000,
    reason: r.reason,
    detail: r.detail,
    text: r.text,
  }));
  return { removals, totalSec: spanLen(merged) / 1000 };
}
