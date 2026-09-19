// ─────────────────────────────────────────────────────────────────────────────
// Auto-Edit — remap the transcript onto the CUT timeline for export. Pure &
// isomorphic. Input is captik's ms-based world; keep spans are seconds.
//
// When exporting the Auto-Edited cut, the video is physically concatenated from the
// kept clips, so every kept word's absolute source time must be shifted onto the new
// contiguous timeline, words inside removed spans dropped, and caption segments
// rebuilt from the surviving word ids. The render pipeline is then fed exactly the
// same payload shape it always uses — it never learns about "cuts".
// ─────────────────────────────────────────────────────────────────────────────

import type { TranscriptWord } from '@/types/transcript';

export interface CutRemap {
  words: TranscriptWord[];
  captionSegments: string[][];
  durationMs: number;
  /** Segments whose HEAD word was cut but whose tail survived: old head id → new head id.
   *  Every per-line override map (style/box/text/slots) is keyed by the segment's first word
   *  id (`segmentKeyOf`), so the caller MUST re-key those maps (rekeyOverrides) or the cut
   *  export silently falls back to the global template — the exact bug class the codebase
   *  was bitten by before (see /api/render's [captik-seg] diagnostic). */
  headKeyMap: Record<string, string>;
}

export function remapForCut(
  words: TranscriptWord[],
  captionSegments: string[][],
  keepsSec: { start: number; end: number }[],
): CutRemap {
  const keeps = keepsSec
    .map((k) => ({ start: k.start * 1000, end: k.end * 1000 }))
    .filter((k) => k.end > k.start)
    .sort((a, b) => a.start - b.start);

  const durationMs = Math.round(keeps.reduce((a, k) => a + (k.end - k.start), 0));

  // Source ms → edited ms (position on the concatenated timeline).
  const srcToEdited = (t: number): number => {
    let acc = 0;
    for (const k of keeps) {
      if (t >= k.end) acc += k.end - k.start;
      else if (t >= k.start) return acc + (t - k.start);
      else return acc;
    }
    return acc;
  };
  const inKeep = (t: number): boolean => keeps.some((k) => t >= k.start && t < k.end);

  const keptIds = new Set<string>();
  const outWords: TranscriptWord[] = [];
  for (const w of words) {
    // A word survives if its midpoint lands in a kept span (robust to edge clipping).
    if (!inKeep((w.startMs + w.endMs) / 2)) continue;
    keptIds.add(w.id);
    const ns = srcToEdited(Math.max(0, w.startMs));
    const ne = Math.max(ns + 1, srcToEdited(w.endMs));
    outWords.push({ ...w, startMs: Math.round(ns), endMs: Math.round(ne) });
  }

  const headKeyMap: Record<string, string> = {};
  const outSegments = captionSegments
    .map((seg) => {
      const kept = seg.filter((id) => keptIds.has(id));
      if (kept.length > 0 && kept[0] !== seg[0]) headKeyMap[seg[0]] = kept[0];
      return kept;
    })
    .filter((seg) => seg.length > 0);

  return { words: outWords, captionSegments: outSegments, durationMs, headKeyMap };
}

/** Move per-line override entries onto their segment's NEW head id after a cut. Returns the
 *  original object when nothing changed (memo/identity friendly). */
export function rekeyOverrides<T>(
  map: Record<string, T>,
  headKeyMap: Record<string, string>,
): Record<string, T> {
  let changed = false;
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) {
    const nk = headKeyMap[k] ?? k;
    if (nk !== k) changed = true;
    out[nk] = v;
  }
  return changed ? out : map;
}

type KeepsSec = readonly { start: number; end: number }[];

function keepsToMs(keepsSec: KeepsSec): { start: number; end: number }[] {
  return keepsSec
    .map((k) => ({ start: k.start * 1000, end: k.end * 1000 }))
    .filter((k) => k.end > k.start)
    .sort((a, b) => a.start - b.start);
}

/** Source-clock ms RANGES (bleeps) → the cut clock. Each range keeps only its parts inside
 *  kept spans; one straddling a cut becomes two touching pieces; one fully cut vanishes. */
export function remapRangesForCut<T extends { startMs: number; endMs: number }>(
  ranges: readonly T[],
  keepsSec: KeepsSec,
): T[] {
  const keeps = keepsToMs(keepsSec);
  const out: T[] = [];
  for (const r of ranges) {
    let acc = 0;
    for (const k of keeps) {
      const s = Math.max(r.startMs, k.start);
      const e = Math.min(r.endMs, k.end);
      if (e > s) out.push({ ...r, startMs: Math.round(acc + (s - k.start)), endMs: Math.round(acc + (e - k.start)) });
      acc += k.end - k.start;
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Point events (placed sound effects) onto the cut clock: each keeps its fields with `atMs`
 *  shifted; one whose instant was cut is dropped — its moment no longer exists in the video. */
export function remapPointsForCut<T extends { atMs: number }>(items: readonly T[], keepsSec: KeepsSec): T[] {
  const out: T[] = [];
  for (const it of items) {
    const t = sourceToCutMs(keepsSec, it.atMs);
    if (t !== null) out.push({ ...it, atMs: t });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** Source ms → cut-clock ms, or null when that instant was cut (point events such as SFX). */
export function sourceToCutMs(keepsSec: KeepsSec, srcMs: number): number | null {
  let acc = 0;
  for (const k of keepsToMs(keepsSec)) {
    if (srcMs < k.start) return null;
    if (srcMs < k.end) return Math.round(acc + (srcMs - k.start));
    acc += k.end - k.start;
  }
  return null;
}

/** Cut-clock ms → source ms (inverse of sourceToCutMs; past the end clamps to the last kept
 *  instant). Used to read source-indexed data — e.g. behind-subject cut-outs — during a cut export. */
export function cutToSourceMs(keepsSec: KeepsSec, cutMs: number): number {
  const keeps = keepsToMs(keepsSec);
  let acc = 0;
  for (const k of keeps) {
    const len = k.end - k.start;
    if (cutMs < acc + len) return k.start + Math.max(0, cutMs - acc);
    acc += len;
  }
  return keeps.length ? keeps[keeps.length - 1].end : cutMs;
}
