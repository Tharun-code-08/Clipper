// ─────────────────────────────────────────────────────────────────────────────
// Auto-Edit — the edit math (keep derivation, time mapping). Pure & isomorphic;
// all times are SECONDS. Detection itself lives in ./detectLocal.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  KeepSegment,
  RemovedSegment,
  Segment,
  WordToken,
} from './types';
import { r2, r3, uid } from './util';

/**
 * Silence detection from the transcript's word timings — more accurate than RMS
 * for speech pauses. Rules:
 *  - Leading silence (0 → first word) and trailing silence (last word → end) are
 *    ALWAYS removed completely, so the video starts and ends on speech.
 *  - A gap between two words is removed completely only if it exceeds `threshold`
 *    (shorter pauses are kept for natural rhythm).
 * A small guard is left around each cut so word onsets aren't clipped.
 */
export function silencesFromWords(
  words: WordToken[],
  duration: number,
  threshold: number,
): Segment[] {
  if (words.length === 0) return [];
  const GUARD = 0.04;
  const out: Segment[] = [];

  // Leading — always strip.
  const first = words[0].start;
  if (first > 0.15) out.push({ start: 0, end: r2(Math.max(0, first - GUARD)) });

  // Between words — strip only gaps longer than the threshold.
  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].start - words[i].end;
    if (gap > threshold) {
      const start = r2(words[i].end + GUARD);
      const end = r2(words[i + 1].start - GUARD);
      if (end - start > 0.05) out.push({ start, end });
    }
  }

  // Trailing — always strip.
  const lastEnd = words[words.length - 1].end;
  if (duration - lastEnd > 0.15) {
    out.push({ start: r2(lastEnd + GUARD), end: r2(duration) });
  }

  return out;
}

const EPS = 0.04; // 40ms — treat sub-frame gaps as touching

/** Merge a list of raw spans into non-overlapping, sorted spans. */
export function mergeSpans(spans: Segment[]): Segment[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return [];

  const out: Segment[] = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur.start <= last.end + EPS) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ start: cur.start, end: cur.end });
    }
  }
  return out;
}

/**
 * Given the *active* (non-restored) removed segments and the total duration,
 * compute the contiguous keep segments that make up the final edit.
 */
export function deriveKeepSegments(activeRemoved: Segment[], duration: number): KeepSegment[] {
  if (duration <= 0) return [];
  const cuts = mergeSpans(activeRemoved).filter((s) => s.end > 0 && s.start < duration);

  const keeps: KeepSegment[] = [];
  let cursor = 0;
  for (const cut of cuts) {
    const cutStart = Math.max(0, cut.start);
    if (cutStart - cursor > EPS) {
      keeps.push({ id: uid('keep'), start: r3(cursor), end: r3(cutStart) });
    }
    cursor = Math.max(cursor, Math.min(duration, cut.end));
  }
  if (duration - cursor > EPS) {
    keeps.push({ id: uid('keep'), start: r3(cursor), end: r3(duration) });
  }
  // If literally everything was cut, keep the whole thing as a safety net.
  if (keeps.length === 0) {
    return [{ id: uid('keep'), start: 0, end: r3(duration) }];
  }
  return keeps;
}

/** Total seconds across a list of spans. */
export function totalDuration(spans: Segment[]): number {
  return r2(spans.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0));
}

/**
 * Find the keep-segment that contains `t`, or the next one after `t`.
 * Returns null if `t` is past the end of the final edit.
 */
export function findKeepAt(
  keeps: KeepSegment[],
  t: number,
): { current: KeepSegment | null; next: KeepSegment | null } {
  let current: KeepSegment | null = null;
  let next: KeepSegment | null = null;
  for (const k of keeps) {
    if (t >= k.start - EPS && t < k.end - EPS) {
      current = k;
      break;
    }
    if (k.start > t && next === null) next = k;
  }
  return { current, next };
}

/**
 * Map a source-video timestamp to its position on the *edited* timeline
 * (i.e. with cuts removed). Used to drive the edited-mode playhead + captions.
 */
export function sourceToEdited(keeps: KeepSegment[], t: number): number {
  let acc = 0;
  for (const k of keeps) {
    if (t >= k.end) {
      acc += k.end - k.start;
    } else if (t >= k.start) {
      acc += t - k.start;
      break;
    } else {
      break;
    }
  }
  return r2(acc);
}

/**
 * Inverse of sourceToEdited: map a position on the edited timeline back to the
 * corresponding source-video timestamp.
 */
export function editedToSource(keeps: KeepSegment[], editedT: number): number {
  let acc = 0;
  for (const k of keeps) {
    const len = k.end - k.start;
    if (editedT <= acc + len) return r2(k.start + (editedT - acc));
    acc += len;
  }
  return keeps.length ? keeps[keeps.length - 1].end : editedT;
}

/**
 * Edited-view playback: where the playhead should go from source time `t` (seconds).
 *  - null    → `t` is inside a kept span: keep playing.
 *  - number  → `t` is in a removed span: jump to the next kept span's start.
 *  - 'end'   → `t` is past the last kept span: pause.
 * A kept span's final 30ms counts as already past it, so one frame of removed video never
 * flashes before the jump; landing up to 20ms before a keep counts as inside it (seek
 * rounding). `keeps` must be sorted (deriveKeepSegments output is).
 */
export function skipTarget(keeps: readonly Segment[], t: number): number | 'end' | null {
  const HEAD = 0.02;
  const TAIL = 0.03;
  for (const k of keeps) {
    if (t < k.start - HEAD) return k.start;
    if (t < k.end - TAIL) return null;
  }
  return 'end';
}

/** Dedup removed segments by near-identical span (keeps the first/strongest). */
export function dedupeRemoved(removed: RemovedSegment[]): RemovedSegment[] {
  const out: RemovedSegment[] = [];
  for (const seg of [...removed].sort((a, b) => a.start - b.start)) {
    const clash = out.find(
      (o) => Math.abs(o.start - seg.start) < 0.15 && Math.abs(o.end - seg.end) < 0.15,
    );
    if (!clash) out.push(seg);
  }
  return out;
}
