import { describe, it, expect } from 'vitest';
import type { TranscriptWord, LineOverride, CaptionBoxConfig } from '@/types/transcript';
import { resolveSegments, activeSegmentWindowAt, segmentDisplayWindow, type ResolvedSegment } from '@/lib/captionSegments';
import { migrateSegmentOverrideKeys } from '@/lib/captionEdits';
import {
  planFaceAwarePlacement, planFaceAwareDetails, faceAwareCounts, reconcileFaceAwareBoxes, removeAutoBoxes, markBoxPatchManual,
  lineSampleTimes, faceAwareSampleTimes, containRect, integrateGrid, gridRectMass, hiddenFaceShare,
  estimateCaptionBlock, blockRectAt, isManualBox, countAutoBoxes, countManualBoxes, faceAwareOverrideSig,
  fallbackAcceptable, CLEAR_COVERAGE, SAFE_TOP_FRAC, SAFE_BOTTOM_FRAC,
  FALLBACK_MAX_COVERAGE, FALLBACK_MIN_IMPROVEMENT, type FaceAwareInput,
} from './captionPlacement';
import { GRID_COLS, GRID_ROWS, type CoverageGrid } from './faceGrid';

// 9:16 logical caption canvas (logicalCanvasSize(9/16)) over a 9:16 source — identity mapping.
const W = 270, H = 480;
const DEFAULT_BOX: CaptionBoxConfig = { xPercent: 50, yPercent: 85, widthPercent: 84 };
const DURATION = 10_000;

type Rect = { left: number; top: number; right: number; bottom: number };
const FACE_HIGH:  Rect = { left: 0.35, top: 0.20, right: 0.65, bottom: 0.45 };   // talking head, face up top
const FACE_LOW:   Rect = { left: 0.30, top: 0.62, right: 0.70, bottom: 0.95 };   // face right where captions go
const FACE_LOWER: Rect = { left: 0.30, top: 0.70, right: 0.70, bottom: 0.95 };

const word = (id: string, text: string, startMs: number, endMs: number) =>
  ({ id, text, startMs, endMs }) as TranscriptWord;

/** A face rectangle (fractions of the source frame) painted into a 54×96 grid by cell centre. */
function paintFace(rect?: Rect): CoverageGrid {
  const data = new Float32Array(GRID_COLS * GRID_ROWS);
  if (rect) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const cy = (r + 0.5) / GRID_ROWS;
      if (cy < rect.top || cy > rect.bottom) continue;
      for (let c = 0; c < GRID_COLS; c++) {
        const cx = (c + 0.5) / GRID_COLS;
        if (cx >= rect.left && cx <= rect.right) data[r * GRID_COLS + c] = 1;
      }
    }
  }
  return { cols: GRID_COLS, rows: GRID_ROWS, data };
}
const fullGrid = (): CoverageGrid => ({ cols: GRID_COLS, rows: GRID_ROWS, data: new Float32Array(GRID_COLS * GRID_ROWS).fill(1) });

/** Several blobs at once — e.g. the head plus the speaker's own forearm, which the model reads as skin. */
function paintMany(rects: Rect[]): CoverageGrid {
  const data = new Float32Array(GRID_COLS * GRID_ROWS);
  for (const rect of rects) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const cy = (r + 0.5) / GRID_ROWS;
      if (cy < rect.top || cy > rect.bottom) continue;
      for (let c = 0; c < GRID_COLS; c++) {
        const cx = (c + 0.5) / GRID_COLS;
        if (cx >= rect.left && cx <= rect.right) data[r * GRID_COLS + c] = 1;
      }
    }
  }
  return { cols: GRID_COLS, rows: GRID_ROWS, data };
}

/** Two captions: A = "this is line" 0–1000 ms, B = "second caption" starting at bStart. */
function fixture(bStart = 1100): ResolvedSegment[] {
  const words = [
    word('a1', 'this', 0, 400), word('a2', 'is', 400, 600), word('a3', 'line', 600, 1000),
    word('b1', 'second', bStart, bStart + 400), word('b2', 'caption', bStart + 400, bStart + 900),
  ];
  return resolveSegments([['a1', 'a2', 'a3'], ['b1', 'b2']], words);
}

/** A grid for every instant the placement will read. */
function gridsFor(segments: ResolvedSegment[], paint: (tMs: number) => CoverageGrid) {
  const m = new Map<number, CoverageGrid>();
  for (const t of faceAwareSampleTimes(segments, 0, DURATION)) m.set(t, paint(t));
  return m;
}

function input(o: Partial<FaceAwareInput> & Pick<FaceAwareInput, 'segments' | 'grids'>): FaceAwareInput {
  return {
    overrides: {}, captionGapMs: 0, durationMs: DURATION, defaultBox: DEFAULT_BOX, fontScale: 1,
    captionLines: 'single', canvasW: W, canvasH: H, sourceAspect: 9 / 16, ...o,
  };
}

function blockFor(text: string) {
  return estimateCaptionBlock({ text, fontScale: 1, captionLines: 'single', widthPercent: DEFAULT_BOX.widthPercent, canvasW: W, canvasH: H });
}

describe('planFaceAwarePlacement', () => {
  it('face in the upper half → the caption stays at its default (no override written)', () => {
    const segments = fixture();
    const grids = gridsFor(segments, () => paintFace(FACE_HIGH));
    const plan = planFaceAwarePlacement(input({ segments, grids }));
    expect(plan).toEqual({ a1: null, b1: null });
    expect(reconcileFaceAwareBoxes(input({ segments, grids }))).toEqual({});
  });

  it('face low → the caption moves up, above the face, inside the platform-safe band', () => {
    const segments = fixture();
    const grids = gridsFor(segments, () => paintFace(FACE_LOW));
    const plan = planFaceAwarePlacement(input({ segments, grids }));
    const y = plan.a1;
    expect(typeof y).toBe('number');
    const size = blockFor('this is line');
    const textTop = y! / 100 - size.height / 2;
    const textBottom = y! / 100 + size.height / 2;
    expect(textTop).toBeGreaterThanOrEqual(SAFE_TOP_FRAC);
    expect(textBottom).toBeLessThanOrEqual(1 - SAFE_BOTTOM_FRAC);
    expect(textBottom).toBeLessThanOrEqual(FACE_LOW.top);          // the caption's text sits above the face
    const share = hiddenFaceShare(integrateGrid(grids.get(0)!), blockRectAt(size, 50, y!), { x: 0, y: 0, w: 1, h: 1 });
    expect(share).toBeLessThanOrEqual(CLEAR_COVERAGE);
    // …and it moves only as far as it has to: the nearest clear spot, not the top of the frame.
    expect(y!).toBeGreaterThan(45);
  });

  it('subject covers the whole frame → nothing clears, so the default is kept', () => {
    const segments = fixture();
    const grids = gridsFor(segments, () => fullGrid());
    expect(planFaceAwarePlacement(input({ segments, grids }))).toEqual({ a1: null, b1: null });
  });

  it('back-to-back captions hold a steady height instead of hopping; distant ones are placed independently', () => {
    const paint = (t: number) => paintFace(t < 1100 ? FACE_LOW : FACE_LOWER);
    const near = fixture(1100);
    const nearPlan = planFaceAwarePlacement(input({ segments: near, grids: gridsFor(near, paint) }));
    expect(typeof nearPlan.a1).toBe('number');
    expect(typeof nearPlan.b1).toBe('number');
    expect(Math.abs(nearPlan.b1! - nearPlan.a1!)).toBeLessThanOrEqual(3);

    // Same faces, but B appears 5 s later — no stability pull, so B sits nearer its default.
    const far = fixture(6000);
    const farPlan = planFaceAwarePlacement(input({ segments: far, grids: gridsFor(far, t => paintFace(t < 1100 ? FACE_LOW : FACE_LOWER)) }));
    expect(farPlan.a1).toBe(nearPlan.a1);
    expect(farPlan.b1!).toBeGreaterThan(nearPlan.a1! + 3);
  });

  it('when nothing clears, still moves to a position that hides far less of the face', () => {
    // The real shape of the problem: a head high in the frame AND the speaker's forearm running down
    // the lower half (the model reads that skin as face). Every position in the band touches one of
    // them, so nothing "clears" — but below the head only the narrow forearm is under the caption,
    // which hides a fraction of what the default does.
    const HEAD = { left: 0.28, top: 0.18, right: 0.72, bottom: 0.50 };
    const ARM  = { left: 0.45, top: 0.52, right: 0.52, bottom: 0.98 };   // inside the caption's width
    const segments = fixture();
    const grids = gridsFor(segments, () => paintMany([HEAD, ARM]));
    const centred: CaptionBoxConfig = { xPercent: 50, yPercent: 33, widthPercent: 84 };
    const details = planFaceAwareDetails(input({ segments, grids, defaultBox: centred }));
    const y = details.a1.y;
    expect(details.a1.reason).toBe('moved-partial');
    expect(typeof y).toBe('number');
    const size = blockFor('this is line');
    const sat = integrateGrid(grids.get(0)!);
    const full = { x: 0, y: 0, w: 1, h: 1 };
    const atDefault = hiddenFaceShare(sat, blockRectAt(size, 50, centred.yPercent), full);
    const atChosen  = hiddenFaceShare(sat, blockRectAt(size, 50, y!), full);
    expect(atDefault).toBeGreaterThan(CLEAR_COVERAGE);
    expect(atChosen).toBeGreaterThan(CLEAR_COVERAGE);              // not clear…
    expect(atChosen).toBeLessThanOrEqual(FALLBACK_MAX_COVERAGE);   // …but not on the face either
    expect(atChosen).toBeLessThanOrEqual(atDefault - FALLBACK_MIN_IMPROVEMENT);
  });

  it('the fallback refuses a least-bad position that is still on the face, or barely better', () => {
    expect(fallbackAcceptable(0.05, 0.40)).toBe(true);    // decisively better, and off the face
    expect(fallbackAcceptable(0.15, 0.40)).toBe(false);   // 25 pt better, but still on the face
    expect(fallbackAcceptable(0.08, 0.20)).toBe(false);   // off the face, but only 12 pt better
    expect(fallbackAcceptable(0.30, 0.31)).toBe(false);
  });

  it('never moves a caption the user positioned by hand', () => {
    const segments = fixture();
    const grids = gridsFor(segments, () => paintFace(FACE_LOW));
    const manual: CaptionBoxConfig = { xPercent: 50, yPercent: 80, widthPercent: 84 };
    const overrides: Record<string, LineOverride> = { a1: { box: manual, styleId: 'hormozi' } };
    const plan = planFaceAwarePlacement(input({ segments, grids, overrides }));
    expect('a1' in plan).toBe(false);
    const next = reconcileFaceAwareBoxes(input({ segments, grids, overrides }));
    expect(next.a1).toEqual({ box: manual, styleId: 'hormozi' });
    expect(isManualBox(next.a1)).toBe(true);
    expect(next.b1?.boxAuto).toBe(true);               // its neighbour is still placed automatically
  });

  it('a letterboxed video: caption over the black bar never counts as covering the face', () => {
    // 16:9 source in a 9:16 canvas → the video is a band in the middle (y 34%–66%); the default caption
    // at 85% sits on black, however low the face is inside the source frame.
    const segments = fixture();
    const grids = gridsFor(segments, () => paintFace(FACE_LOW));
    const plan = planFaceAwarePlacement(input({ segments, grids, sourceAspect: 16 / 9 }));
    expect(plan).toEqual({ a1: null, b1: null });
  });

  it('reports WHY each caption sits where it does', () => {
    const segments = fixture();
    const manual: Record<string, LineOverride> = { b1: { box: { ...DEFAULT_BOX, yPercent: 30 } } };
    const clear   = planFaceAwareDetails(input({ segments, grids: gridsFor(segments, () => paintFace(FACE_HIGH)) }));
    const moved   = planFaceAwareDetails(input({ segments, grids: gridsFor(segments, () => paintFace(FACE_LOW)) }));
    const blocked = planFaceAwareDetails(input({ segments, grids: gridsFor(segments, () => fullGrid()) }));
    const mixed   = planFaceAwareDetails(input({ segments, grids: gridsFor(segments, () => paintFace(FACE_LOW)), overrides: manual }));
    const pending = planFaceAwareDetails(input({ segments, grids: new Map() }));
    expect(clear.a1.reason).toBe('clear-at-default');
    expect(moved.a1.reason).toBe('moved');
    expect(blocked.a1.reason).toBe('no-clear-spot');      // covers the face, but nothing clears it
    expect(blocked.a1.y).toBe(null);                      // …so the default is kept
    expect(mixed.b1.reason).toBe('manual');
    expect(pending.a1.reason).toBe('unknown');
    expect(faceAwareCounts(moved)).toEqual({ moved: 2, partial: 0, clear: 0, blocked: 0, manual: 0, pending: 0 });
    expect(faceAwareCounts(blocked)).toEqual({ moved: 0, partial: 0, clear: 0, blocked: 2, manual: 0, pending: 0 });
    expect(faceAwareCounts(mixed).manual).toBe(1);
  });

  it('leaves lines alone while their instants are not analysed yet', () => {
    const segments = fixture();
    const overrides: Record<string, LineOverride> = { a1: { box: { ...DEFAULT_BOX, yPercent: 40 }, boxAuto: true } };
    const inp = input({ segments, grids: new Map(), overrides });
    expect(planFaceAwarePlacement(inp)).toEqual({});
    expect(reconcileFaceAwareBoxes(inp)).toBe(overrides);   // same reference — auto box survives a reload
  });
});

describe('reconcileFaceAwareBoxes', () => {
  it('writes auto boxes through the per-line override (x/width from the default) and is idempotent', () => {
    const segments = fixture();
    const grids = gridsFor(segments, () => paintFace(FACE_LOW));
    const overrides: Record<string, LineOverride> = { b1: { styleId: 'mrbeast' } };
    const next = reconcileFaceAwareBoxes(input({ segments, grids, overrides }));
    expect(next.a1?.boxAuto).toBe(true);
    expect(next.a1?.box?.xPercent).toBe(50);
    expect(next.a1?.box?.widthPercent).toBe(84);
    expect(next.b1?.styleId).toBe('mrbeast');
    expect(next.b1?.boxAuto).toBe(true);
    expect(reconcileFaceAwareBoxes(input({ segments, grids, overrides: next }))).toBe(next);
  });

  it('follows the default box and drops a stale auto box once the face moves away', () => {
    const segments = fixture();
    const low = reconcileFaceAwareBoxes(input({ segments, grids: gridsFor(segments, () => paintFace(FACE_LOW)) }));
    const moved = reconcileFaceAwareBoxes(input({
      segments, grids: gridsFor(segments, () => paintFace(FACE_LOW)), overrides: low,
      defaultBox: { ...DEFAULT_BOX, xPercent: 46 },
    }));
    expect(moved.a1?.box?.xPercent).toBe(46);
    const withStyle = { ...moved, a1: { ...moved.a1, styleId: 'hormozi' } };
    const high = reconcileFaceAwareBoxes(input({ segments, grids: gridsFor(segments, () => paintFace(FACE_HIGH)), overrides: withStyle }));
    expect(high).toEqual({ a1: { styleId: 'hormozi' } });
  });

  it('auto boxes survive the segment re-keying that used to orphan per-line overrides', () => {
    const segments = fixture();
    const placed = reconcileFaceAwareBoxes(input({ segments, grids: gridsFor(segments, () => paintFace(FACE_LOW)) }));
    // Split A after its first word: the new caption headed by a2 must inherit the (auto) box.
    const rekeyed = migrateSegmentOverrideKeys([['a1', 'a2', 'a3'], ['b1', 'b2']], [['a1'], ['a2', 'a3'], ['b1', 'b2']], placed);
    expect(rekeyed.a2?.boxAuto).toBe(true);
    expect(rekeyed.a2?.box).toEqual(placed.a1?.box);
  });
});

describe('removeAutoBoxes (toggle OFF)', () => {
  it('removes only automatic boxes, keeping manual boxes and every other per-line field', () => {
    const manual: CaptionBoxConfig = { xPercent: 30, yPercent: 60, widthPercent: 70 };
    const overrides: Record<string, LineOverride> = {
      a: { box: { ...DEFAULT_BOX, yPercent: 50 }, boxAuto: true, styleId: 'hormozi' },
      b: { box: manual },
      c: { box: { ...DEFAULT_BOX, yPercent: 40 }, boxAuto: true },
      d: { fontScale: 1.2 },
    };
    expect(countAutoBoxes(overrides)).toBe(2);
    expect(countManualBoxes(overrides)).toBe(1);
    expect(removeAutoBoxes(overrides)).toEqual({ a: { styleId: 'hormozi' }, b: { box: manual }, d: { fontScale: 1.2 } });
  });

  it('returns the same reference when there is nothing automatic', () => {
    const overrides: Record<string, LineOverride> = { b: { box: DEFAULT_BOX } };
    expect(removeAutoBoxes(overrides)).toBe(overrides);
  });
});

describe('markBoxPatchManual', () => {
  it('a user patch that sets or clears the box makes that position manual', () => {
    expect(markBoxPatchManual({ box: DEFAULT_BOX })).toEqual({ box: DEFAULT_BOX, boxAuto: undefined });
    expect(markBoxPatchManual({ box: undefined })).toEqual({ box: undefined, boxAuto: undefined });
  });
  it('leaves other patches and explicit auto writes alone', () => {
    const style = { styleId: 'hormozi' };
    expect(markBoxPatchManual(style)).toBe(style);
    const auto = { box: DEFAULT_BOX, boxAuto: true };
    expect(markBoxPatchManual(auto)).toBe(auto);
  });
});

describe('faceAwareOverrideSig', () => {
  it('changes with manual boxes and per-line font scale, not with auto boxes', () => {
    const base: Record<string, LineOverride> = { a: { box: DEFAULT_BOX } };
    const withAuto = { ...base, b: { box: { ...DEFAULT_BOX, yPercent: 50 }, boxAuto: true } };
    expect(faceAwareOverrideSig(withAuto)).toBe(faceAwareOverrideSig(base));
    expect(faceAwareOverrideSig({ ...base, c: { fontScale: 1.4 } })).not.toBe(faceAwareOverrideSig(base));
    expect(faceAwareOverrideSig({ a: { box: { ...DEFAULT_BOX, yPercent: 70 } } })).not.toBe(faceAwareOverrideSig(base));
  });
});

describe('sampling + geometry helpers', () => {
  it('samples on the fixed grid inside the display window, thinned to at most 4', () => {
    expect(lineSampleTimes(0, 1000, -80, 1100, DURATION)).toEqual([0, 400, 800]);
    expect(lineSampleTimes(450, 600, 450, 600, DURATION)).toEqual([400]);          // shorter than a step
    expect(lineSampleTimes(0, 5000, 0, 5000, DURATION)).toHaveLength(4);
    expect(lineSampleTimes(9900, 10_500, 9900, 10_500, DURATION)).toEqual([9600]); // never past the end — the last real instant
    expect(lineSampleTimes(9700, 9900, 9700, 9900, DURATION)).toEqual([9600]);
    expect(lineSampleTimes(NaN, NaN, NaN, NaN, DURATION)).toEqual([]);
  });

  it('segmentDisplayWindow is the window activeSegmentWindowAt displays', () => {
    const segments = fixture(1100);
    segments.forEach((_, i) => {
      const w = segmentDisplayWindow(segments, i, 0);
      const mid = (Math.max(w.winStart, 0) + w.winEnd) / 2;
      expect(activeSegmentWindowAt(segments, mid, 0)).toEqual({ index: i, ...w });
    });
  });

  it('containRect letterboxes a wide source in a tall canvas and pillarboxes the reverse', () => {
    const tall = containRect(16 / 9, 9 / 16);
    expect(tall.w).toBe(1);
    expect(tall.h).toBeCloseTo((9 / 16) / (16 / 9));
    expect(tall.y).toBeCloseTo((1 - tall.h) / 2);
    const wide = containRect(9 / 16, 16 / 9);
    expect(wide.h).toBe(1);
    expect(wide.x).toBeCloseTo((1 - wide.w) / 2);
  });

  it('grid integrals count partial cells by area', () => {
    const g = integrateGrid({ cols: 2, rows: 2, data: new Float32Array([1, 1, 1, 1]) });
    expect(g.total).toBe(4);
    expect(gridRectMass(g, 0.5, 0, 1.5, 2)).toBeCloseTo(2);
    expect(gridRectMass(g, 0.25, 0.25, 0.75, 0.75)).toBeCloseTo(0.25);
  });

  it('a wrapped two-line caption is taller than the same text on one fitted row', () => {
    const text = 'this caption is long enough to need a second row in the box';
    const single = estimateCaptionBlock({ text, fontScale: 1, captionLines: 'single', widthPercent: 84, canvasW: W, canvasH: H });
    const double = estimateCaptionBlock({ text, fontScale: 1, captionLines: 'double', widthPercent: 84, canvasW: W, canvasH: H });
    expect(double.height).toBeGreaterThan(single.height);
    expect(single.width).toBeLessThanOrEqual(0.84);
    const bigger = estimateCaptionBlock({ text: 'short', fontScale: 2, captionLines: 'single', widthPercent: 84, canvasW: W, canvasH: H });
    expect(bigger.height).toBeGreaterThan(blockFor('short').height);
  });
});
