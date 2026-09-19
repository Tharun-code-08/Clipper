// Where a property scene puts its type against the person — their geometry, read from the public
// scenes chunk their site ships and re-implemented here. Sizes in the scene's own px (their
// 1080-wide surface scaled by width / 1080), positions in px of the frame.

import type { FaceTrack } from '@/lib/matte/faceTrack';
import { faceAt } from '@/lib/matte/faceTrack';
import { DEPTH_GRID_H, DEPTH_GRID_W, headTopFromGrid } from '../depth';

export interface FaceBand { top: number; bottom: number }

/** The headline sits just below the top of the head: at least 8% down, sized so its box (0.42 of
 *  the size above the baseline) clears the 2.5% margin, never under 3.5% of the height. */
export function rearCaptionGeometry(size: number, headTopFrac: number, heightPx: number): { size: number; y: number } {
  const n = Math.max(0.08 * heightPx, headTopFrac * heightPx);
  const a = Math.min(size, Math.max(0.035 * heightPx, (n - 0.025 * heightPx) / 0.42));
  return { size: a, y: n + 0.24 * a };
}

/** A row wanting `y` with `above` px over it and `below` px under it: moved under the face band
 *  (a 2.5% margin either side) if it would cross it, or over it when there is room — under first
 *  unless the caller prefers above, and never past 90% of the height. */
export function clearFaceY(y: number, above: number, below: number, heightPx: number, band?: FaceBand | null, preferAbove = false): number {
  if (!band) return y;
  const margin = 0.025 * heightPx;
  const top = band.top * heightPx - margin, bottom = band.bottom * heightPx + margin;
  if (y + below <= top || y - above >= bottom) return y;
  const under = bottom + above, over = top - below;
  if (preferAbove && over - above >= 0.04 * heightPx) return over;
  if (under + below <= 0.9 * heightPx) return under;
  return over - above >= 0.04 * heightPx ? over : under;
}

/** The face band the scene reads from the face track at a moment: from the top of the HEAD (hair
 *  included — their headline box centres at headTop + .24 x size, measured on their Gable frames:
 *  hair top .102H, box centre .131H at 141px of 1280, 3px off the formula) to the chin. */
export function faceBandAt(track: FaceTrack | null | undefined, tMs: number): { band: FaceBand; headTop: number } | null {
  const f = faceAt(track, tMs);
  return f ? { band: { top: f.headTop, bottom: f.faceBottom }, headTop: f.headTop } : null;
}

/** Their scene's face band from the subject grid (the one the depth treatment reads): the head top
 *  where a grid row first reaches half alpha, less 1.5%; the bottom a face-height down, read from
 *  how WIDE the head is in its top two rows (a wider head is a taller face, by the frame's aspect).
 *  Quantised to the grid's 24 rows, as theirs is — their headline steps down a row as the person
 *  walks in (frames 36 to 60 of their Gable preview), and so does ours. */
export function faceBandFromGrid(grid: ArrayLike<number> | null | undefined, aspect = 9 / 16): FaceBand | null {
  if (!grid) return null;
  const headTop = headTopFromGrid(grid);
  if (headTop == null) return null;
  const row = Math.min(DEPTH_GRID_H - 1, Math.ceil(headTop * DEPTH_GRID_H));
  let run = 0;
  for (let r = row; r <= Math.min(row + 1, DEPTH_GRID_H - 1); r++) {
    let n = 0;
    for (let c = 0; c < DEPTH_GRID_W; c++) { n = grid[r * DEPTH_GRID_W + c] >= 128 ? n + 1 : 0; run = Math.max(run, n); }
  }
  const faceH = Math.max(0.075, Math.min(0.3, (Math.max(1, run - 0.5) / DEPTH_GRID_W) * aspect * 1.35));
  return { top: Math.max(0, headTop - 0.015), bottom: Math.min(1, headTop + faceH + 0.25 / DEPTH_GRID_H) };
}

export interface HeadlineFont { family: string; weight: number | string; italic: boolean; letterSpacingEm: number }

let measureCtx: CanvasRenderingContext2D | null | undefined;
function measure(text: string, font: HeadlineFont, px: number): { width: number; left: number } | null {
  if (measureCtx === undefined) measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!measureCtx) return null;
  measureCtx.font = `${font.italic ? 'italic' : 'normal'} ${font.weight} ${px}px ${font.family}`;
  const m = measureCtx.measureText(text);
  return Number.isFinite(m.width) && m.width > 0 ? { width: m.width, left: m.actualBoundingBoxLeft || 0 } : null;
}

/** The largest size, up to `maxSize`, at which the words fit `maxWidth` on one row with .24em
 *  between them: measured on a canvas in the loaded face (0.7em a character where none). */
export function fitPropertyHeadline(words: { text: string }[], font: HeadlineFont, maxSize: number, maxWidth: number): number {
  if (!words.length) return maxSize;
  const PX = 100;
  let x = 0, left = 0, right = 0;
  words.forEach((w, i) => {
    const m = measure(w.text, font, PX);
    const width = (m?.width ?? w.text.length * PX * 0.7) + font.letterSpacingEm * PX * w.text.length;
    if (i) x += 0.24 * PX;
    left = Math.min(left, x - (m?.left ?? 0));
    right = Math.max(right, x + width + (font.italic ? 0.12 * PX : 0));
    x += width;
  });
  return Math.min(maxSize, (PX * Math.max(1, maxWidth)) / Math.max(1, right - left, x));
}

/** The row's width at `size`, by the same measure. */
export function propertyHeadlineWidth(words: { text: string }[], font: HeadlineFont, size: number): number {
  return words.length ? (1000 * size) / fitPropertyHeadline(words, font, 1e6, 1000) : 0;
}

/** The lead words showing above a headline at `t`: the last three spoken, trimmed from the front
 *  while they run past 26 characters. */
export function propertyLeadAtTime<W extends { start: number; text: string }>(lead: W[], t: number): W[] {
  const shown = lead.filter((w) => w.start <= t).slice(-3);
  while (shown.length > 1 && shown.map((w) => w.text).join(' ').length > 26) shown.shift();
  return shown;
}
