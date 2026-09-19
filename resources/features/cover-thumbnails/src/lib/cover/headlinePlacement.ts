// Keeping the cover headline clear of the cut-out subject — PURE geometry, unit-tested in
// headlinePlacement.spec.ts. With "subject in front" on, the subject is drawn OVER the headline, so a
// headline left at the template's default spot can end up mostly hidden. This picks the box position —
// and, when a full-width headline can't avoid a centred subject, a narrower column beside it — where
// the subject hides the least of the headline's actual words.

import { defaultCoverBox, type CoverBox, type CoverPresetId } from './coverLayout';

/** The cut-out subject downsampled into COVER coordinates: alpha[row * w + col] ∈ [0, 1]. */
export interface SubjectGrid { w: number; h: number; alpha: Float32Array }

/** A rectangle as fractions (0–1) of the cover's width and height. */
export interface HeadlineBounds { top: number; bottom: number; left: number; right: number }

/**
 * A headline's text runs (line fragments) RELATIVE TO ITS BOX ANCHOR, as fractions of the cover. Moving
 * the box translates the runs rigidly; a different box width re-wraps the text, so each width has its own
 * shape.
 */
export interface HeadlineShape { runs: readonly HeadlineBounds[] }

/** What the stage measured for one headline (text, template, size, preset). */
export interface HeadlineLayouts {
  /** coverHeadlineKey of the box `current` was measured in — anything else makes the measurement stale. */
  key:     string;
  current: HeadlineShape;
  /** The same headline laid out at other box widths (see coverProbeWidths). */
  byWidth: readonly { widthPercent: number; shape: HeadlineShape }[];
}

/** Identity of a headline layout. A measurement only describes the exact text, template, size and box it came from. */
export function coverHeadlineKey(o: {
  text: string; styleId: string; fontScale: number; box: CoverBox; preset: CoverPresetId;
}): string {
  return [o.preset, o.styleId, o.text, o.fontScale, o.box.xPercent, o.box.yPercent, o.box.widthPercent].join('|');
}

/**
 * Vertical room a headline should use, as fractions of the cover height. A Reels cover shows up on the
 * profile grid cropped to its centre 1080×1350, so its headline prefers to stay inside that crop.
 */
export function headlineSafeBand(id: CoverPresetId): { top: number; bottom: number } {
  if (id === 'reel') {
    const crop = (1920 - 1350) / 2 / 1920;
    return { top: crop + 0.02, bottom: 1 - crop - 0.02 };
  }
  return { top: 0.05, bottom: 0.95 };
}

/** Box widths the stage also lays the headline out at: the full default width, and two columns. */
export function coverProbeWidths(id: CoverPresetId): number[] {
  return [defaultCoverBox(id).widthPercent, 52, 40];
}

/** A shape's runs placed with the box anchor at (xPercent, yPercent). */
export function shapeAt(shape: HeadlineShape, xPercent: number, yPercent: number): HeadlineBounds[] {
  const dx = xPercent / 100;
  const dy = yPercent / 100;
  return shape.runs.map(r => ({ top: r.top + dy, bottom: r.bottom + dy, left: r.left + dx, right: r.right + dx }));
}

export function shapeBounds(runs: readonly HeadlineBounds[]): HeadlineBounds {
  return {
    top:    Math.min(...runs.map(r => r.top)),
    bottom: Math.max(...runs.map(r => r.bottom)),
    left:   Math.min(...runs.map(r => r.left)),
    right:  Math.max(...runs.map(r => r.right)),
  };
}

function rectCoverage(grid: SubjectGrid, r: HeadlineBounds): number {
  const c0 = Math.max(0, Math.floor(r.left * grid.w));
  const c1 = Math.min(grid.w, Math.ceil(r.right * grid.w));
  const r0 = Math.max(0, Math.floor(r.top * grid.h));
  const r1 = Math.min(grid.h, Math.ceil(r.bottom * grid.h));
  let sum = 0;
  let n = 0;
  for (let y = r0; y < r1; y++) {
    for (let x = c0; x < c1; x++) { sum += grid.alpha[y * grid.w + x]; n++; }
  }
  return n ? sum / n : 0;
}

/**
 * How much of a headline the subject hides: mean subject alpha over its text runs, weighted by area.
 * Runs, not the bounding box — a multi-line headline's box includes the gaps between lines, and subject
 * showing through a gap hides nothing. 0 = fully readable, 1 = entirely behind the subject.
 */
export function subjectCoverage(grid: SubjectGrid, runs: readonly HeadlineBounds[]): number {
  let sum = 0;
  let area = 0;
  for (const run of runs) {
    const a = Math.max(0, run.right - run.left) * Math.max(0, run.bottom - run.top);
    if (!a) continue;
    sum += rectCoverage(grid, run) * a;
    area += a;
  }
  return area ? sum / area : 0;
}

/** Candidates within this much of the best cost count as equally good. */
export const HEADLINE_CLEAR_TOLERANCE = 0.02;
/** Keep this far (fraction of the cover) from every edge. */
const EDGE = 0.03;
/** Leaving the grid-visible band must clear this much more of the headline to be worth it. */
const OUT_OF_BAND_PENALTY = 0.08;
/** A narrower column than the template default must clear this much more to be worth it. */
const NARROW_PENALTY = 0.04;
/** Side columns sit this many percent from the cover edge. */
const COLUMN_MARGIN = 4;
const Y_STEP = 0.5;

/**
 * The box that lets the subject hide the least of the headline.
 *
 * Candidates: the current layout at every height, the full default width centred, and each narrower
 * probe width as a left or right column, all at every height. Cost = coverage, plus a penalty for leaving
 * the grid-visible band and for shrinking the column, so the headline only moves somewhere unusual when
 * that genuinely clears it. Among near-equal candidates the smallest change wins — the current layout
 * first, then the nearest position — so a headline that is already clear never moves and the placement
 * is stable when re-run on its own result. Returns the box and the coverage there.
 */
export function placeHeadline(o: {
  grid: SubjectGrid;
  box: CoverBox;
  preset: CoverPresetId;
  layouts: Pick<HeadlineLayouts, 'current' | 'byWidth'>;
}): { box: CoverBox; coverage: number } {
  const band = headlineSafeBand(o.preset);
  const fullWidth = defaultCoverBox(o.preset).widthPercent;
  type Candidate = { box: CoverBox; coverage: number; cost: number; change: number };
  const candidates: Candidate[] = [];

  const consider = (shape: HeadlineShape, widthPercent: number, xs: number[], isCurrent: boolean) => {
    if (!shape.runs.length) return;
    const rel = shapeBounds(shape.runs);
    const narrow = widthPercent < fullWidth - 0.5;
    for (const x of xs) {
      if (x / 100 + rel.left < EDGE || x / 100 + rel.right > 1 - EDGE) continue;
      for (let y = 5; y <= 95 + 1e-9; y += Y_STEP) {
        const top = y / 100 + rel.top;
        const bottom = y / 100 + rel.bottom;
        if (top < EDGE || bottom > 1 - EDGE) continue;
        const coverage = subjectCoverage(o.grid, shapeAt(shape, x, y));
        const inBand = top >= band.top - 1e-9 && bottom <= band.bottom + 1e-9;
        candidates.push({
          box: { xPercent: x, yPercent: y, widthPercent },
          coverage,
          cost: coverage + (inBand ? 0 : OUT_OF_BAND_PENALTY) + (narrow ? NARROW_PENALTY : 0),
          change: (isCurrent ? 0 : 1000) + Math.abs(y - o.box.yPercent) + Math.abs(x - o.box.xPercent),
        });
      }
    }
  };

  consider(o.layouts.current, o.box.widthPercent, [o.box.xPercent], true);
  for (const alt of o.layouts.byWidth) {
    if (Math.abs(alt.widthPercent - o.box.widthPercent) < 0.5) continue;
    const xs = alt.widthPercent >= fullWidth - 0.5
      ? [50]
      : [COLUMN_MARGIN + alt.widthPercent / 2, 100 - COLUMN_MARGIN - alt.widthPercent / 2];
    consider(alt.shape, alt.widthPercent, xs, false);
  }

  if (!candidates.length) {
    return { box: o.box, coverage: subjectCoverage(o.grid, shapeAt(o.layouts.current, o.box.xPercent, o.box.yPercent)) };
  }
  const min = Math.min(...candidates.map(c => c.cost));
  let best = candidates[0];
  let bestChange = Infinity;
  for (const c of candidates) {
    if (c.cost > min + HEADLINE_CLEAR_TOLERANCE) continue;
    if (c.change < bestChange) { best = c; bestChange = c.change; }
  }
  return { box: best.box, coverage: best.coverage };
}
