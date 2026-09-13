// Trimming a clip: move its in/out points inside the source video, keep every caption edit that survives,
// and caption newly revealed speech exactly the way the pipeline captions a fresh clip.
import { toCaptikWords } from './segments.js';

export const TRIM_MIN_SEC = 3;
export const TRIM_MAX_SEC = 180;
// Seconds of extra video fetched on each side when a trim reaches past the downloaded part, so the next
// small adjustment does not need another download.
export const TRIM_FETCH_PAD_SEC = 15;
const EDGE = 0.05; // the inclusion tolerance toCaptikWords uses

const round3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

/** Validate a requested range against the source. Returns {start, end, duration} or throws a 400. */
export function validateTrim({ start, end } = {}, { sourceDuration }) {
  const s = round3(Number(start));
  const e = round3(Math.min(Number(end), sourceDuration));
  if (!Number.isFinite(s) || !Number.isFinite(e)) throw badRequest('Send the new start and end in seconds.');
  if (s < 0 || Number(end) > sourceDuration + 0.05) throw badRequest('The trim must stay inside the video.');
  if (e - s < TRIM_MIN_SEC) throw badRequest(`A clip needs at least ${TRIM_MIN_SEC} seconds.`);
  if (e - s > TRIM_MAX_SEC) throw badRequest(`Keep a clip under ${TRIM_MAX_SEC} seconds.`);
  return { start: s, end: e, duration: round3(e - s) };
}

/** Does a downloaded part (source seconds [offset, offset + duration]) hold the whole range? */
export function partCovers(part, { start, end }) {
  if (!part) return false;
  if (part.local) return true;
  return start >= part.offset + 0.02 && end <= part.offset + part.duration - 0.05;
}

/** The editor's per-line override maps, derived from lineOverrides the way Captik's editor page derives them. */
export function overrideMapsFrom(captionSegments, lineOverrides = {}) {
  const live = new Set(captionSegments.map((seg) => seg[0]));
  const pick = (field) => Object.fromEntries(
    Object.entries(lineOverrides).filter(([k, v]) => live.has(k) && v?.[field] !== undefined).map(([k, v]) => [k, v[field]]),
  );
  return {
    segmentStyleOverrides: pick('styleId'),
    segmentBoxOverrides: pick('box'),
    segmentFontScaleOverrides: pick('fontScale'),
    segmentEmphBoxOverrides: pick('emphBox'),
    segmentEmphFontScaleOverrides: pick('emphFontScale'),
    lineTextOverrides: pick('text'),
    lineSlotOverrides: pick('slots'),
  };
}

/**
 * Re-time a clip's Captik edit state for a new source range [start, end] (the clip was [oldStart, oldEnd]).
 *
 * - Words already in the clip keep their id, text (romanized or hand-edited), style and line; they shift to the
 *   new start and drop out when they fall outside the range. Words the creator deleted stay deleted.
 * - Speech the new range reveals comes from the source transcript with fresh ids, grouped into lines as the
 *   pipeline groups them.
 * - A line whose first word is trimmed away keeps its per-line overrides (they are keyed by the first word);
 *   a line that lost words drops its replacement text, which no longer matches.
 *
 * Returns {edit, added: TranscriptWord[], dropped: number}.
 */
export function retimeEdit(edit, { oldStart, oldEnd, start, end, sourceWords, idPrefix = 't' }) {
  const shiftMs = Math.round((oldStart - start) * 1000);
  const durMs = Math.round((end - start) * 1000);
  const edgeMs = EDGE * 1000;

  const kept = [];
  for (const w of edit.words || []) {
    const s = w.startMs + shiftMs;
    const e = w.endMs + shiftMs;
    if (s < -edgeMs || e > durMs + edgeMs) continue;
    const startMs = clamp(s, 0, durMs);
    kept.push({ ...w, startMs, endMs: clamp(Math.max(e, startMs + 1), 1, durMs) });
  }

  const fresh = toCaptikWords(sourceWords, { start, end, idPrefix });
  const inRange = sourceWords.filter((w) => w.s >= start - EDGE && w.e <= end + EDGE); // same order as fresh.words
  const wasInClip = (w) => w.s >= oldStart - EDGE && w.e <= oldEnd + EDGE;
  const head = [];
  const tail = [];
  fresh.words.forEach((w, i) => {
    const src = inRange[i];
    if (wasInClip(src)) return;
    (src.s < oldStart ? head : tail).push(w);
  });

  const lineOverrides = { ...(edit.lineOverrides || {}) };
  const keptIds = new Set(kept.map((w) => w.id));
  const keptSegments = [];
  for (const seg of edit.captionSegments || []) {
    const next = seg.filter((id) => keptIds.has(id));
    const key = seg[0];
    const override = lineOverrides[key];
    if (!next.length) {
      delete lineOverrides[key];
      continue;
    }
    if (override && next.length !== seg.length) {
      const { text: _text, slots: _slots, ...rest } = override;
      delete lineOverrides[key];
      if (Object.keys(rest).length && !lineOverrides[next[0]]) lineOverrides[next[0]] = rest;
    }
    keptSegments.push(next);
  }

  const linesOf = (words) => {
    const ids = new Set(words.map((w) => w.id));
    return fresh.captionSegments.map((seg) => seg.filter((id) => ids.has(id))).filter((seg) => seg.length);
  };
  const captionSegments = [...linesOf(head), ...keptSegments, ...linesOf(tail)];

  return {
    edit: {
      ...edit,
      words: [...head, ...kept, ...tail],
      captionSegments,
      lineOverrides,
      ...overrideMapsFrom(captionSegments, lineOverrides),
    },
    added: [...head, ...tail],
    dropped: (edit.words?.length || 0) - kept.length,
  };
}

/** The editor's trim track: source words and loudness around the clip, in source seconds. */
export function trimWindow({ clip, sourceDuration, contextSec }) {
  const from = Math.max(0, Math.floor((clip.start - contextSec) * 10) / 10);
  const to = Math.min(sourceDuration, Math.ceil((clip.end + contextSec) * 10) / 10);
  return { from, to };
}
