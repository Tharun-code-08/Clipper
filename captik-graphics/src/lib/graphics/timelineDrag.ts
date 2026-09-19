// The arithmetic behind dragging a graphic on the timeline, kept OUT of EditorTimeline so it can
// be tested. The component owns pointer plumbing; this owns what a drag means.
//
// Everything is in source-clock milliseconds — the same clock as TranscriptWord.startMs and
// GraphicsInstance.startMs — so there is no second scale to keep in sync.

/** The shortest a graphic may be trimmed to. Below this the block is too small to grab again. */
export const MIN_GFX_DUR = 200;

/** Carries the template id from the picker to the timeline. Readable only on `drop`. */
export const GRAPHIC_DRAG_MIME = 'application/x-captik-graphic';

/** Duration is encoded in a synthetic MIME TYPE rather than as data, because `getData()` is
 *  blocked during `dragover` for security — only `dataTransfer.types` is readable there, and the
 *  timeline needs the duration BEFORE the drop to size its preview. */
export function graphicDurMime(durationMs: number): string {
  return `x-captik-dur/${Math.max(1, Math.round(durationMs))}`;
}

/** The dragged template's duration, or null when this drag is not one of ours. */
export function readDurFromTypes(types: readonly string[] | DOMStringList): number | null {
  for (const t of Array.from(types as ArrayLike<string>)) {
    if (t.startsWith('x-captik-dur/')) {
      const n = Number(t.slice('x-captik-dur/'.length));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

export type GfxDragMode = 'move' | 'left' | 'right';

export interface GfxDragOrigin {
  /** startMs when the drag began — deltas apply to this, never to the live value, so a drag
   *  cannot accumulate rounding error across pointermove events. */
  startMs: number;
  durationMs: number;
}

export interface GfxTiming {
  startMs: number;
  durationMs: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Where a graphic lands for a drag of `deltaMs` from `origin`.
 *
 * - `move`  slides the whole block and is clamped so it stays inside [0, clipDurationMs].
 *   It is NOT clamped against neighbouring graphics: graphics are layered and may overlap,
 *   which is the difference from a caption clip.
 * - `left`  trims the head — the start moves and the body shortens so the TAIL STAYS PUT.
 *   Moving the start without shortening is the bug this exists to prevent.
 * - `right` trims the tail, leaving the start alone.
 */
export function gfxDragResult(
  mode: GfxDragMode,
  origin: GfxDragOrigin,
  deltaMs: number,
  clipDurationMs: number,
): GfxTiming {
  const origEnd = origin.startMs + origin.durationMs;

  if (mode === 'move') {
    // A graphic longer than the clip would have an empty valid range; keep the lower bound.
    const latestStart = Math.max(0, clipDurationMs - origin.durationMs);
    return {
      startMs: Math.round(clamp(origin.startMs + deltaMs, 0, latestStart)),
      durationMs: origin.durationMs,
    };
  }

  if (mode === 'left') {
    const startMs = clamp(origin.startMs + deltaMs, 0, origEnd - MIN_GFX_DUR);
    return { startMs: Math.round(startMs), durationMs: Math.round(origEnd - startMs) };
  }

  const maxDur = Math.max(MIN_GFX_DUR, clipDurationMs - origin.startMs);
  return {
    startMs: origin.startMs,
    durationMs: Math.round(clamp(origin.durationMs + deltaMs, MIN_GFX_DUR, maxDur)),
  };
}
