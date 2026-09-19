// "Keep captions off faces" — PURE placement, unit-tested in captionPlacement.spec.ts.
//
// For every caption line, pick the vertical position (and ONLY the vertical position) that keeps
// the caption block off the speaker's face, then express it through the EXISTING per-line box
// override (lineOverrides[key].box). The preview and every export path already resolve that map by
// the canonical segment key via activeSegmentIndexAt, so nothing downstream changes.
//
// Auto vs manual: an auto-written box carries `boxAuto: true`. A box without it is the user's own and
// is never touched. The flag lives INSIDE the override bundle on purpose — every re-keying path
// (migrateSegmentOverrideKeys / applyLineKeyMigration / reanchorLineOverrideKeys), undo snapshots and
// the project snapshot then carry it along with the box, so "which boxes are automatic" can never
// drift from the boxes themselves (the head-word-key orphaning landmine).
//
// Block size is ESTIMATED from text, not measured from the preview DOM. The preview only renders the
// caption under the playhead, so measuring every line would mean seeking through the whole video;
// the estimate reuses fitText's char-width table (the same one the overlay's fit guard uses), is
// deterministic, and is padded with a clearance margin so small estimation error doesn't touch a face.

import type { CaptionBoxConfig, LineOverride } from '@/types/transcript';
import { segmentDisplayWindow, type ResolvedSegment } from '@/lib/captionSegments';
import { estTextWidth, fitRowScale } from '@/lib/fitText';
import type { CoverageGrid } from './faceGrid';

export type { CoverageGrid } from './faceGrid';

// ── Platform-safe band ────────────────────────────────────────────────────────────────────────────
/** Top UI zone of Reels / Shorts / TikTok (account row, "Following", camera icons), as a fraction of
 *  the canvas height. An auto-moved caption never enters it. */
export const SAFE_TOP_FRAC = 0.12;
/** Bottom UI zone (description, audio ticker, action buttons). An auto-moved caption never enters it.
 *  The user's own default may sit here — it is kept whenever it is clear of the face. */
export const SAFE_BOTTOM_FRAC = 0.20;

// ── Sampling ──────────────────────────────────────────────────────────────────────────────────────
/** Samples sit on a fixed global time grid so caption edits reuse already-analysed frames. */
export const SAMPLE_STEP_MS = 400;
/** At most this many sampled instants per caption line. */
export const MAX_SAMPLES_PER_LINE = 4;

// ── Cost ──────────────────────────────────────────────────────────────────────────────────────────
/** A position "clears" the face when it hides at most this share of the face mass at every sample. */
export const CLEAR_COVERAGE = 0.03;
/** Cost per full canvas height moved away from the user's default Y. */
export const DISTANCE_PENALTY = 0.05;
/** Cost per full canvas height jumped relative to the previous caption (only for back-to-back lines). */
export const STABILITY_PENALTY = 0.15;
/** Lines further apart than this are not "consecutive" — no stability pull between them. */
export const STABLE_GAP_MS = 1200;
/** Candidates within this cost of the best count as equal; among them the smallest move wins. */
export const NEAR_EQUAL_COST = 0.002;
/** Face mass (in grid cells) below which a sample is treated as "no face" (segmentation noise). */
export const MIN_FACE_MASS = 0.75;

// ── Fallback for lines where NOTHING clears ───────────────────────────────────────────────────────
// Coverage is scored on the WORST sampled instant, so a position that is clear for most of a line but
// brushed once — e.g. the speaker's own forearm swings under the caption for a moment, and the model
// reads that skin as face — scores above the clear bar and is thrown away. Measured on a close-up
// selfie clip: one line sat at 23.7% / 38.1% / 29.3% hidden at its three instants while the bottom of
// the safe band scored 5.4% / 0.0% / 1.1% — plainly better everywhere, yet "blocked".
// So when nothing clears, take the least-covered position — but only when it is BOTH decisively
// better than the user's own default AND not itself sitting on the face. On that clip a 10-point bar
// moved 10 of 11 lines but parked two of them on the speaker's forehead (~9.5% hidden at EVERY
// instant); these values moved only the two lines that had a genuinely good spot.
/** The least-covered position must hide this much less of the face than the default to be worth it. */
export const FALLBACK_MIN_IMPROVEMENT = 0.20;
/** …and must itself hide no more than this, so a caption is never parked on a face. */
export const FALLBACK_MAX_COVERAGE = 0.10;
/** Positions within this of the least-covered one are equally good (then distance/stability decide). */
export const FALLBACK_TOLERANCE = 0.01;

/**
 * Nothing clears the face: is the least-covered position worth moving to? PURE — the whole fallback
 * decision in one place so its two guards can be unit-tested directly.
 */
export function fallbackAcceptable(bestCoverage: number, defaultCoverage: number): boolean {
  return bestCoverage <= FALLBACK_MAX_COVERAGE
    && bestCoverage <= defaultCoverage - FALLBACK_MIN_IMPROVEMENT;
}
/** Candidate Y step, in percent of canvas height. */
export const Y_STEP_PERCENT = 1;

// ── Caption block estimate (logical canvas px — the space CaptionOverlay's fonts are tuned in) ──
/** Typical template row font at fontScale 1 (hormozi / mrbeast / most rows use sz(18)–sz(20)). */
export const ROW_FONT_PX = 20;
export const LINE_HEIGHT = 1.25;
export const WORD_GAP_PX = 6;
export const BLOCK_PAD_X_PX = 8;
export const BLOCK_PAD_Y_PX = 5;
/** Extra clearance kept between the caption block and the face (fractions of canvas W / H). */
export const CLEARANCE_X = 0.01;
export const CLEARANCE_Y = 0.015;
const MAX_WRAP_ROWS = 3;

// ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Rectangle as fractions (0–1) of the caption canvas. */
export interface CanvasRect { left: number; top: number; right: number; bottom: number }
/** Caption block size as fractions of the canvas, padding included, clearance excluded. */
export interface BlockSize { width: number; height: number }

/**
 * Sample instants for one caption: grid points inside its display window, thinned evenly to
 * MAX_SAMPLES_PER_LINE; a window shorter than one step gets the grid point nearest its middle.
 */
export function lineSampleTimes(
  startMs: number, endMs: number, winStart: number, winEnd: number, durationMs: number,
  stepMs = SAMPLE_STEP_MS, maxSamples = MAX_SAMPLES_PER_LINE,
): number[] {
  let a = Number.isFinite(winStart) ? winStart : startMs;
  let b = Number.isFinite(winEnd) ? winEnd : endMs;
  if (!(b >= a)) { a = startMs; b = endMs; }
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || stepMs <= 0) return [];
  const lastT = durationMs > 0 ? Math.floor((durationMs - 1) / stepMs) * stepMs : Infinity;
  const lo = Math.max(0, a);
  const hi = Math.min(b, lastT);
  const pts: number[] = [];
  for (let t = Math.ceil(lo / stepMs) * stepMs; t <= hi; t += stepMs) pts.push(t);
  if (!pts.length) {
    const t = Math.round((a + b) / 2 / stepMs) * stepMs;
    return [Math.max(0, Math.min(lastT, t))];
  }
  if (pts.length <= maxSamples) return pts;
  const out: number[] = [];
  for (let k = 0; k < maxSamples; k++) {
    const t = pts[Math.min(pts.length - 1, Math.floor(((k + 0.5) * pts.length) / maxSamples))];
    if (out[out.length - 1] !== t) out.push(t);
  }
  return out;
}

/** Every instant the placement reads for these captions — sorted, unique. What the sampler analyses. */
export function faceAwareSampleTimes(
  segments: ResolvedSegment[], captionGapMs: number, durationMs: number,
): number[] {
  const set = new Set<number>();
  for (let i = 0; i < segments.length; i++) {
    const { winStart, winEnd } = segmentDisplayWindow(segments, i, captionGapMs);
    for (const t of lineSampleTimes(segments[i].startMs, segments[i].endMs, winStart, winEnd, durationMs)) set.add(t);
  }
  return [...set].sort((x, y) => x - y);
}

/**
 * Where the source video sits in the caption canvas. Every render surface draws the video with
 * objectFit: contain, so a mismatched aspect letterboxes (never crops). Fractions of the canvas.
 */
export function containRect(sourceAspect: number, canvasAspect: number): { x: number; y: number; w: number; h: number } {
  if (!(sourceAspect > 0) || !(canvasAspect > 0)) return { x: 0, y: 0, w: 1, h: 1 };
  if (sourceAspect > canvasAspect) {
    const h = canvasAspect / sourceAspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = sourceAspect / canvasAspect;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

// ── Grid integral (summed-area table) ─────────────────────────────────────────────────────────────

export interface GridIntegral { cols: number; rows: number; sat: Float64Array; total: number }

export function integrateGrid(g: CoverageGrid): GridIntegral {
  const { cols, rows, data } = g;
  const W = cols + 1;
  const sat = new Float64Array(W * (rows + 1));
  for (let r = 0; r < rows; r++) {
    let rowSum = 0;
    for (let c = 0; c < cols; c++) {
      rowSum += data[r * cols + c] || 0;
      sat[(r + 1) * W + (c + 1)] = sat[r * W + (c + 1)] + rowSum;
    }
  }
  return { cols, rows, sat, total: sat[rows * W + cols] };
}

/** ∫∫ of the piecewise-constant grid over [0,x]×[0,y] (grid units). Bilinear interpolation of the
 *  summed-area table is EXACT for piecewise-constant cells, so partial cells count by area. */
function integralAt(g: GridIntegral, x: number, y: number): number {
  if (g.cols < 1 || g.rows < 1) return 0;
  const W = g.cols + 1;
  const cx = Math.max(0, Math.min(g.cols, x));
  const cy = Math.max(0, Math.min(g.rows, y));
  const c = Math.min(Math.floor(cx), g.cols - 1);
  const r = Math.min(Math.floor(cy), g.rows - 1);
  const fx = cx - c, fy = cy - r;
  const s00 = g.sat[r * W + c], s01 = g.sat[r * W + c + 1];
  const s10 = g.sat[(r + 1) * W + c], s11 = g.sat[(r + 1) * W + c + 1];
  return s00 + fx * (s01 - s00) + fy * (s10 - s00) + fx * fy * (s11 - s01 - s10 + s00);
}

/** Face mass inside a rectangle given in grid units. */
export function gridRectMass(g: GridIntegral, x0: number, y0: number, x1: number, y1: number): number {
  return integralAt(g, x1, y1) - integralAt(g, x0, y1) - integralAt(g, x1, y0) + integralAt(g, x0, y0);
}

/**
 * Share (0–1) of the face a caption block hides at one sampled instant: face mass under the block /
 * total face mass in the frame. A share, not a density — a small face in a wide shot fully under a
 * wide caption is 100% hidden even though it covers a sliver of the block.
 */
export function hiddenFaceShare(
  g: GridIntegral, block: CanvasRect, video: { x: number; y: number; w: number; h: number },
): number {
  if (!(g.total >= MIN_FACE_MASS)) return 0;
  const l = Math.max(block.left, video.x), r = Math.min(block.right, video.x + video.w);
  const t = Math.max(block.top, video.y),  b = Math.min(block.bottom, video.y + video.h);
  if (r <= l || b <= t) return 0;
  const x0 = ((l - video.x) / video.w) * g.cols, x1 = ((r - video.x) / video.w) * g.cols;
  const y0 = ((t - video.y) / video.h) * g.rows, y1 = ((b - video.y) / video.h) * g.rows;
  return Math.max(0, Math.min(1, gridRectMass(g, x0, y0, x1, y1) / g.total));
}

// ── Caption block ─────────────────────────────────────────────────────────────────────────────────

/**
 * Estimated caption block size. Single-line mode shrinks the font to fit the box exactly like the
 * overlay's fit guard (fitRowScale); two-line mode wraps into as many rows as the text needs (≤ 3).
 */
export function estimateCaptionBlock(o: {
  text: string; fontScale: number; captionLines: 'single' | 'double';
  widthPercent: number; canvasW: number; canvasH: number;
}): BlockSize {
  const words = o.text.split(/\s+/).filter(Boolean);
  if (!words.length || !(o.canvasW > 0) || !(o.canvasH > 0)) return { width: 0, height: 0 };
  const fontPx = ROW_FONT_PX * (o.fontScale > 0 ? o.fontScale : 1);
  const inner = Math.max(1, o.canvasW * (o.widthPercent / 100) * 0.9);   // rows render at maxWidth 90%
  const items = words.map(text => ({ text, fontPx }));
  const gaps = (words.length - 1) * WORD_GAP_PX;
  const textPx = items.reduce((s, it) => s + estTextWidth(it.text, it.fontPx), 0);
  let rows = 1;
  let rowPx = fontPx;
  let rowW: number;
  if (o.captionLines === 'single') {
    const k = fitRowScale(items, WORD_GAP_PX, inner);
    rowPx = fontPx * k;
    rowW = Math.min(inner, textPx * k + gaps);
  } else {
    rows = Math.min(MAX_WRAP_ROWS, Math.max(1, Math.ceil((textPx + gaps) / inner)));
    rowW = Math.min(inner, textPx + gaps);
  }
  const heightPx = rows * rowPx * LINE_HEIGHT + 2 * BLOCK_PAD_Y_PX;
  const widthPx = rowW + 2 * BLOCK_PAD_X_PX;
  return { width: Math.min(o.widthPercent / 100, widthPx / o.canvasW), height: heightPx / o.canvasH };
}

/** The block (plus clearance) centred on the box anchor — CaptionOverlay uses translate(-50%,-50%). */
export function blockRectAt(size: BlockSize, xPercent: number, yPercent: number): CanvasRect {
  const cx = xPercent / 100, cy = yPercent / 100;
  return {
    left:   cx - size.width / 2 - CLEARANCE_X,
    right:  cx + size.width / 2 + CLEARANCE_X,
    top:    cy - size.height / 2 - CLEARANCE_Y,
    bottom: cy + size.height / 2 + CLEARANCE_Y,
  };
}

// ── Placement ─────────────────────────────────────────────────────────────────────────────────────

export interface FaceAwareInput {
  /** Current per-line overrides (manual boxes are respected, auto boxes are rewritten). */
  overrides:    Record<string, LineOverride>;
  /** resolveSegments(captionSegments, words) — the same resolution every render surface uses. */
  segments:     ResolvedSegment[];
  captionGapMs: number;
  durationMs:   number;
  /** Analysed face grids keyed by sample time (see faceAwareSampleTimes). */
  grids:        ReadonlyMap<number, CoverageGrid>;
  /** The user's global caption box — the "default" position. */
  defaultBox:   CaptionBoxConfig;
  fontScale:    number;
  captionLines: 'single' | 'double';
  /** Logical caption canvas (logicalCanvasSize). */
  canvasW:      number;
  canvasH:      number;
  /** Source video width / height. */
  sourceAspect: number;
}

/** A box the user placed themselves (auto placement never overrides it). */
export function isManualBox(o: LineOverride | undefined): boolean {
  return !!o?.box && !o.boxAuto;
}

/**
 * key → auto Y (percent) for lines that must move, null for lines that stay at the default.
 * Lines with a manual box, or whose samples are not analysed yet, are ABSENT (leave them as they are).
 */
export type FacePlan = Record<string, number | null>;

/**
 * Why a line ended up where it did:
 *   moved             — it would have covered the face; this Y clears it.
 *   moved-partial     — nothing clears it, but this Y hides far less of the face than the default
 *                       (see fallbackAcceptable).
 *   clear-at-default  — the user's own position already misses the face.
 *   no-clear-spot     — it covers the face and no position is clear OR decisively better (subject
 *                       fills the frame) — the default is kept rather than thrashing to somewhere
 *                       just as bad.
 *   manual            — the user placed this caption; auto placement never touches it.
 *   unknown           — its instants are not analysed yet.
 */
export type FacePlacementReason = 'moved' | 'moved-partial' | 'clear-at-default' | 'no-clear-spot' | 'manual' | 'unknown';
export interface FacePlacement { y: number | null; reason: FacePlacementReason }

export interface FaceAwareCounts { moved: number; partial: number; clear: number; blocked: number; manual: number; pending: number }

export function faceAwareCounts(details: Record<string, FacePlacement>): FaceAwareCounts {
  const c: FaceAwareCounts = { moved: 0, partial: 0, clear: 0, blocked: 0, manual: 0, pending: 0 };
  for (const d of Object.values(details)) {
    if (d.reason === 'moved') c.moved++;
    else if (d.reason === 'moved-partial') c.partial++;
    else if (d.reason === 'clear-at-default') c.clear++;
    else if (d.reason === 'no-clear-spot') c.blocked++;
    else if (d.reason === 'manual') c.manual++;
    else c.pending++;
  }
  return c;
}

/** The decisions auto placement acts on — manual and not-yet-analysed lines are left alone. */
export function detailsToPlan(details: Record<string, FacePlacement>): FacePlan {
  const plan: FacePlan = {};
  for (const [key, d] of Object.entries(details)) {
    if (d.reason === 'manual' || d.reason === 'unknown') continue;
    plan[key] = d.y;
  }
  return plan;
}

export function planFaceAwarePlacement(input: FaceAwareInput): FacePlan {
  return detailsToPlan(planFaceAwareDetails(input));
}

export function planFaceAwareDetails(input: FaceAwareInput): Record<string, FacePlacement> {
  const { segments, defaultBox, canvasW, canvasH } = input;
  const details: Record<string, FacePlacement> = {};
  if (!(canvasW > 0) || !(canvasH > 0)) return details;
  const video = containRect(input.sourceAspect, canvasW / canvasH);
  const integrals = new Map<number, GridIntegral>();
  const integral = (t: number): GridIntegral | undefined => {
    let g = integrals.get(t);
    if (!g) {
      const grid = input.grids.get(t);
      if (!grid) return undefined;
      g = integrateGrid(grid);
      integrals.set(t, g);
    }
    return g;
  };

  const dY = defaultBox.yPercent;
  let prev: { y: number; endMs: number } | null = null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const ov = input.overrides[seg.key];
    if (isManualBox(ov)) {
      const y = ov!.box!.yPercent;
      details[seg.key] = { y, reason: 'manual' };
      prev = { y, endMs: seg.endMs };
      continue;
    }

    const { winStart, winEnd } = segmentDisplayWindow(segments, i, input.captionGapMs);
    const times = lineSampleTimes(seg.startMs, seg.endMs, winStart, winEnd, input.durationMs);
    const samples = times.map(integral);
    if (!times.length || samples.some(s => !s)) {
      const y = ov?.box?.yPercent ?? dY;
      details[seg.key] = { y, reason: 'unknown' };   // not analysed yet — leave as is
      prev = { y, endMs: seg.endMs };
      continue;
    }

    const size = estimateCaptionBlock({
      text: seg.sw.map(w => w.text).join(' '),
      fontScale: ov?.fontScale ?? input.fontScale,
      captionLines: input.captionLines,
      widthPercent: defaultBox.widthPercent,
      canvasW, canvasH,
    });
    // Worst instant wins: a caption must stay off the face at every sampled moment it is on screen.
    const coverageAt = (y: number) => {
      const rect = blockRectAt(size, defaultBox.xPercent, y);
      let worst = 0;
      for (const s of samples) worst = Math.max(worst, hiddenFaceShare(s!, rect, video));
      return worst;
    };

    let chosen: number | null = null;
    let reason: FacePlacementReason = 'clear-at-default';
    const defaultCov = size.height > 0 ? coverageAt(dY) : 0;
    // Only move when the default would actually hide the face.
    if (size.height > 0 && defaultCov > CLEAR_COVERAGE) {
      reason = 'no-clear-spot';
      const halfPct = size.height * 50;
      const lo = Math.ceil(SAFE_TOP_FRAC * 100 + halfPct);
      const hi = Math.floor((1 - SAFE_BOTTOM_FRAC) * 100 - halfPct);
      const stableY = prev && seg.startMs - prev.endMs <= STABLE_GAP_MS ? prev.y : null;
      const costOf = (y: number, cov: number) => cov
        + DISTANCE_PENALTY * (Math.abs(y - dY) / 100)
        + (stableY != null ? STABILITY_PENALTY * (Math.abs(y - stableY) / 100) : 0);
      // ONE position per line (never per frame), chosen by: cost, then the smallest move.
      const pick = (from: { y: number; cov: number }[]): number | null => {
        let min = Infinity;
        for (const c of from) min = Math.min(min, costOf(c.y, c.cov));
        let best: { y: number; cov: number } | null = null;
        for (const c of from) {
          if (costOf(c.y, c.cov) > min + NEAR_EQUAL_COST) continue;
          if (!best || Math.abs(c.y - dY) < Math.abs(best.y - dY)) best = c;
        }
        return best ? best.y : null;
      };

      const all: { y: number; cov: number }[] = [];
      let bestCov = Infinity;
      for (let y = lo; y <= hi; y += Y_STEP_PERCENT) {
        const cov = coverageAt(y);
        all.push({ y, cov });
        if (cov < bestCov) bestCov = cov;
      }
      const clearOnes = all.filter(c => c.cov <= CLEAR_COVERAGE);
      if (clearOnes.length) {
        const y = pick(clearOnes);
        if (y != null) { chosen = y; reason = 'moved'; }
      } else if (all.length && fallbackAcceptable(bestCov, defaultCov)) {
        // Nothing clears, but one position hides far less of the face than the default — take it.
        const y = pick(all.filter(c => c.cov <= bestCov + FALLBACK_TOLERANCE));
        if (y != null) { chosen = y; reason = 'moved-partial'; }
      }
      // Otherwise the default is kept: never thrash to a spot that is just as bad.
    }
    details[seg.key] = { y: chosen, reason };
    prev = { y: chosen ?? dY, endMs: seg.endMs };
  }
  return details;
}

function sameBox(a: CaptionBoxConfig, b: CaptionBoxConfig): boolean {
  return a.xPercent === b.xPercent && a.yPercent === b.yPercent && a.widthPercent === b.widthPercent;
}

function withoutBox(o: LineOverride): LineOverride {
  const rest = { ...o };
  delete rest.box;
  delete rest.boxAuto;
  return rest;
}

/** Write a plan into the override map. Returns the SAME reference when nothing changes. */
export function applyFacePlan(
  overrides: Record<string, LineOverride>, plan: FacePlan, defaultBox: CaptionBoxConfig,
): Record<string, LineOverride> {
  let next: Record<string, LineOverride> | null = null;
  for (const [key, y] of Object.entries(plan)) {
    const ov = overrides[key];
    if (isManualBox(ov)) continue;
    if (y == null) {
      if (!ov || (!ov.box && !ov.boxAuto)) continue;
      next ??= { ...overrides };
      const rest = withoutBox(ov);
      if (Object.keys(rest).length) next[key] = rest; else delete next[key];
      continue;
    }
    const box: CaptionBoxConfig = { xPercent: defaultBox.xPercent, yPercent: y, widthPercent: defaultBox.widthPercent };
    if (ov?.boxAuto && ov.box && sameBox(ov.box, box)) continue;
    next ??= { ...overrides };
    next[key] = { ...ov, box, boxAuto: true };
  }
  return next ?? overrides;
}

/** Plan + apply in one step. Idempotent: re-running on its own result returns the same reference. */
export function reconcileFaceAwareBoxes(input: FaceAwareInput): Record<string, LineOverride> {
  return applyFacePlan(input.overrides, planFaceAwarePlacement(input), input.defaultBox);
}

/**
 * Apply an already-computed plan (so the editor can report WHY each caption sits where it does
 * without planning twice). Manual boxes in `overrides` are still honoured — a plan computed a beat
 * earlier can never overwrite a position the user has just set.
 */
export function applyFaceDetails(
  overrides: Record<string, LineOverride>, details: Record<string, FacePlacement>, defaultBox: CaptionBoxConfig,
): Record<string, LineOverride> {
  return applyFacePlan(overrides, detailsToPlan(details), defaultBox);
}

/** Toggle OFF: drop every automatic box, keep the user's manual ones and every other field. */
export function removeAutoBoxes(overrides: Record<string, LineOverride>): Record<string, LineOverride> {
  let next: Record<string, LineOverride> | null = null;
  for (const [key, o] of Object.entries(overrides)) {
    if (!o.boxAuto) continue;
    next ??= { ...overrides };
    const rest = withoutBox(o);
    if (Object.keys(rest).length) next[key] = rest; else delete next[key];
  }
  return next ?? overrides;
}

/**
 * A user edit that sets or clears a line's `box` makes that position MANUAL — unless the patch itself
 * says otherwise. Applied at the editor's single per-line patch choke point, so every manual path
 * (drag commit, Position fields, line popover) is covered without each one knowing about auto boxes.
 */
export function markBoxPatchManual<P extends Partial<LineOverride>>(patch: P): P {
  return 'box' in patch && !('boxAuto' in patch) ? { ...patch, boxAuto: undefined } : patch;
}

export function countManualBoxes(overrides: Record<string, LineOverride>): number {
  let n = 0;
  for (const o of Object.values(overrides)) if (isManualBox(o)) n++;
  return n;
}

export function countAutoBoxes(overrides: Record<string, LineOverride>): number {
  let n = 0;
  for (const o of Object.values(overrides)) if (o.box && o.boxAuto) n++;
  return n;
}

/**
 * The part of the override map the placement READS (manual boxes + per-line font scales), as a
 * string. Lets the editor re-run placement when those change without re-running on its own writes.
 */
export function faceAwareOverrideSig(overrides: Record<string, LineOverride>): string {
  const parts: string[] = [];
  for (const [k, o] of Object.entries(overrides)) {
    const manual = isManualBox(o) ? `${o.box!.xPercent},${o.box!.yPercent},${o.box!.widthPercent}` : '';
    const fs = typeof o.fontScale === 'number' ? String(o.fontScale) : '';
    if (manual || fs) parts.push(`${k}:${manual}:${fs}`);
  }
  return parts.sort().join('|');
}
