import type { TranscriptWord } from '@/types/transcript';

export interface ResolvedSegment {
  sw:      TranscriptWord[];
  startMs: number;
  endMs:   number;
  /** Canonical per-line override key — the RAW seg[0] (see segmentKeyOf). */
  key:     string;
}

/**
 * The canonical per-line override key for a caption segment: its FIRST word id — the RAW
 * `seg[0]`, NOT the first *surviving* word (`resolveSegments(...).sw[0].id`).
 *
 * `lineOverrides` (styleId / box / slots / text) are keyed by this id, and
 * deleteWords()/applyLineKeyMigration() migrate that exact key. So EVERY site that writes an
 * override (the timeline) and EVERY site that reads one (the live preview AND the Remotion export)
 * must derive the key the same way — otherwise a per-caption template silently misses its lookup
 * and that caption falls back to the GLOBAL style ("only the first template exports"). On a
 * pristine transcription `seg[0] === sw[0].id`; they diverge only when a segment's head word was
 * pruned without re-keying (a native↔roman remap / restore), which is exactly when the mismatch
 * bit. Routing every site through this one function keeps storage ≡ preview ≡ export.
 */
export function segmentKeyOf(seg: string[]): string {
  return seg[0];
}

/**
 * The caption keys a timeline selection targets, for the per-caption ("Only selected") position /
 * style / behind-subject edits.
 *
 * The timeline's `selectedIdxs` indexes whichever TRACK is showing, so the mapping differs:
 *   - line mode: an index IS a caption index → that caption's key.
 *   - word mode: an index is a WORD index → the caption CONTAINING that word.
 * Indexing captionSegments with a word index (the old behaviour) silently aimed a per-caption edit
 * at unrelated captions — "I positioned the selected caption and other captions moved".
 *
 * `wordIds` must be the word-track's ids in the same index order the timeline renders them.
 * Returns keys in timeline order, deduped (several selected words can share one caption).
 */
export function selectionSegmentKeys(
  segments:     string[][],
  selectedIdxs: Iterable<number>,
  mode:         'line' | 'word',
  wordIds:      string[] = [],
): string[] {
  const idxs = [...selectedIdxs];
  if (!idxs.length) return [];
  if (mode === 'word') {
    const picked = new Set(idxs.map(i => wordIds[i]).filter((id): id is string => !!id));
    if (!picked.size) return [];
    return segments.filter(seg => seg.some(id => picked.has(id))).map(segmentKeyOf);
  }
  return idxs
    .sort((a, b) => a - b)
    .map(i => segments[i])
    .filter((seg): seg is string[] => !!seg)
    .map(segmentKeyOf);
}

/**
 * Resolve caption segments (arrays of word IDs) to their live word lists + raw time spans,
 * dropping any segment whose words are ALL gone — e.g. after a native↔roman remap or a project
 * restore left a segment pointing at IDs that no longer exist.
 *
 * Shared by the live preview (CaptionOverlay) and the Remotion render
 * (KineticCaptionComposition) so both agree on the key distinction:
 *   - returns a NON-EMPTY array → segments are authoritative; show only the active one.
 *   - returns an EMPTY array (no segments, or every segment is stale) → callers fall back to
 *     ad-hoc phrase chunking instead of blanking the timeline.
 */
export function resolveSegments(
  segments: string[][] | null | undefined,
  words:    TranscriptWord[],
): ResolvedSegment[] {
  if (!segments?.length || !words.length) return [];
  const map = new Map(words.map(w => [w.id, w]));
  return segments
    .map(seg => ({ key: segmentKeyOf(seg), sw: seg.map(id => map.get(id)).filter((w): w is TranscriptWord => w !== undefined) }))
    .filter(({ sw }) => sw.length > 0)
    .map(({ key, sw }) => ({ key, sw, startMs: sw[0].startMs, endMs: sw[sw.length - 1].endMs }));
}

/**
 * Index of the caption segment whose DISPLAY window contains `tMs` — the exact window
 * CaptionOverlay paints with: a caption appears LEAD ms before its first word, clears TAIL ms
 * after its last (captionGapMs lengthens the tail), and the grace extends into SILENCE only
 * (clamped at the neighbouring segments). −1 when no caption is on screen.
 *
 * This is THE single source of truth for "which caption is active right now". The live preview
 * (page.tsx), CaptionOverlay itself, and the export compositions (LambdaCaptionComposition /
 * CaptionExportComposition) all resolve per-line overrides — box position, per-caption template,
 * per-line text/slots — through this window. Before it existed each surface had its own window
 * (preview key [start, end+200], exports [start−80, end+150] UNCLAMPED, overlay display
 * [start−80, end+120+gap] clamped), so on back-to-back captions an export could paint the newly
 * visible caption with the PREVIOUS caption's box/template for ~150ms and then jump mid-caption
 * ("caption position keeps changing in the export"). One window = an override can never apply
 * while its caption is off screen, and never miss a frame while it is on.
 */
export interface SegmentWindow { index: number; winStart: number; winEnd: number }

/**
 * The active segment AND the exact instants it appears and disappears.
 *
 * A template that animates on the way OUT needs winEnd, and it must be the SAME winEnd the
 * display uses or the exit plays at the wrong moment (or gets cut off mid-way). Deriving it
 * a second time by hand is how the export once drifted from the preview — see the ad-hoc
 * [start-80, end+150] window that outlived the display on back-to-back captions. So the
 * window is computed here, once, and activeSegmentIndexAt is a thin reader of it.
 */
export function activeSegmentWindowAt(
  resolved:     ResolvedSegment[],
  tMs:          number,
  captionGapMs: number = 0,
): SegmentWindow | null {
  for (let i = 0; i < resolved.length; i++) {
    const { winStart, winEnd } = segmentDisplayWindow(resolved, i, captionGapMs);
    if (tMs >= winStart && tMs <= winEnd) return { index: i, winStart, winEnd };
  }
  return null;
}

/**
 * The display window of segment `i` — the exact instants it appears and clears on screen. The one
 * formula activeSegmentWindowAt scans with, exported so code that reasons about a caption's whole
 * on-screen span (face-aware placement samples inside it) can't drift from what is displayed.
 */
export function segmentDisplayWindow(
  resolved:     ResolvedSegment[],
  i:            number,
  captionGapMs: number = 0,
): { winStart: number; winEnd: number } {
  const LEAD = 80;
  const TAIL = Math.max(120, 120 + captionGapMs);
  const cur = resolved[i], prev = resolved[i - 1], next = resolved[i + 1];
  return {
    winStart: Math.max(cur.startMs - LEAD, prev ? prev.endMs : -Infinity),
    winEnd:   Math.min(cur.endMs + TAIL, next ? next.startMs : Infinity),
  };
}

export function activeSegmentIndexAt(
  resolved:     ResolvedSegment[],
  tMs:          number,
  captionGapMs: number = 0,
): number {
  return activeSegmentWindowAt(resolved, tMs, captionGapMs)?.index ?? -1;
}

/**
 * Decide whether caption segments must be rebuilt from scratch against the current word set.
 *
 * Rebuild ONLY in the OVERFLOW direction — segments cover significantly MORE words than the set
 * has (a translation/transliteration produced fewer words, so the IDs the segments point at no
 * longer all exist and the groupings are stale). NEVER rebuild on UNDERFLOW (segments cover
 * FEWER words than the set): that's the signature of a deliberate caption deletion that left
 * orphaned words behind, and rebuilding there would resurrect the deleted lines.
 */
export function shouldRebuildSegments(
  segments: string[][],
  words:    TranscriptWord[],
): boolean {
  if (!segments.length || !words.length) return false;
  const totalSegWords = segments.reduce((sum, seg) => sum + seg.length, 0);
  const overflow = totalSegWords - words.length;
  return overflow > Math.max(3, words.length * 0.15);
}
