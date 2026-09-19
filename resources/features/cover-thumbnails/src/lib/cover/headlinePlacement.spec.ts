import { describe, it, expect } from 'vitest';
import { defaultCoverBox, defaultCoverSettings, sanitizeCoverSettings } from './coverLayout';
import {
  subjectCoverage, placeHeadline, headlineSafeBand, coverHeadlineKey, coverProbeWidths, shapeAt,
  type SubjectGrid, type HeadlineShape,
} from './headlinePlacement';

/** A w×h grid whose rows [rowFrom, rowTo) are fully subject. */
function rowsGrid(w: number, h: number, rowFrom: number, rowTo: number): SubjectGrid {
  const alpha = new Float32Array(w * h);
  for (let y = rowFrom; y < rowTo; y++) for (let x = 0; x < w; x++) alpha[y * w + x] = 1;
  return { w, h, alpha };
}

/** A w×h grid whose columns [colFrom, colTo) are fully subject — a person standing in the middle. */
function colsGrid(w: number, h: number, colFrom: number, colTo: number): SubjectGrid {
  const alpha = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = colFrom; x < colTo; x++) alpha[y * w + x] = 1;
  return { w, h, alpha };
}

/** A centred block of `lines` lines, each `lineH` tall with `gap` between, `halfW` either side of the anchor. */
function block(lines: number, lineH: number, gap: number, halfW: number): HeadlineShape {
  const total = lines * lineH + (lines - 1) * gap;
  return {
    runs: Array.from({ length: lines }, (_, i) => {
      const top = -total / 2 + i * (lineH + gap);
      return { top, bottom: top + lineH, left: -halfW, right: halfW };
    }),
  };
}

const box = defaultCoverBox('reel'); // x 50, y 28, width 88
const oneLine = block(1, 0.06, 0, 0.4);

describe('subjectCoverage', () => {
  it('is 0 away from the subject, 1 fully behind it, and partial across its edge', () => {
    const g = rowsGrid(20, 40, 0, 20); // top half is subject
    expect(subjectCoverage(g, [{ top: 0.6, bottom: 0.7, left: 0, right: 1 }])).toBe(0);
    expect(subjectCoverage(g, [{ top: 0.1, bottom: 0.2, left: 0, right: 1 }])).toBe(1);
    expect(subjectCoverage(g, [{ top: 0.45, bottom: 0.55, left: 0, right: 1 }])).toBeCloseTo(0.5, 1);
  });

  it('counts the words, not the gap between lines', () => {
    const g = rowsGrid(20, 40, 18, 22); // a subject band across y 0.45–0.55
    const runs = [
      { top: 0.40, bottom: 0.44, left: 0.2, right: 0.8 },
      { top: 0.56, bottom: 0.60, left: 0.3, right: 0.7 },
    ];
    expect(subjectCoverage(g, runs)).toBe(0);
  });

  it('weights runs by area, so a long hidden line counts more than a short clear one', () => {
    const g = rowsGrid(20, 40, 0, 20);
    const cov = subjectCoverage(g, [
      { top: 0.30, bottom: 0.35, left: 0.1, right: 0.9 },
      { top: 0.60, bottom: 0.65, left: 0.4, right: 0.6 },
    ]);
    expect(cov).toBeCloseTo(0.8, 1);
  });
});

describe('placeHeadline', () => {
  it('moves a full-width headline just below a subject filling the top half, keeping its width', () => {
    const r = placeHeadline({ grid: rowsGrid(20, 40, 0, 20), box, preset: 'reel', layouts: { current: oneLine, byWidth: [] } });
    expect(r.coverage).toBe(0);
    expect(r.box.widthPercent).toBe(88);
    expect(r.box.xPercent).toBe(50);
    expect(r.box.yPercent).toBeGreaterThanOrEqual(53);
    expect(r.box.yPercent).toBeLessThanOrEqual(54);
  });

  it('leaves a headline that is already clear exactly where it is', () => {
    const r = placeHeadline({ grid: rowsGrid(20, 40, 20, 40), box, preset: 'reel', layouts: { current: oneLine, byWidth: [] } });
    expect(r.coverage).toBe(0);
    expect(r.box).toEqual(box);
  });

  it('stays put when the subject fills the whole frame, since nowhere is clearer', () => {
    const r = placeHeadline({ grid: rowsGrid(20, 40, 0, 40), box, preset: 'reel', layouts: { current: oneLine, byWidth: [] } });
    expect(r.coverage).toBe(1);
    expect(r.box).toEqual(box);
  });

  it('puts the headline in a narrow column beside a subject standing in the middle', () => {
    const grid = colsGrid(40, 40, 17, 23); // subject across x 0.425–0.575, full height
    const layouts = {
      current: block(2, 0.06, 0.02, 0.42),
      byWidth: [
        { widthPercent: 88, shape: block(2, 0.06, 0.02, 0.42) },
        { widthPercent: 52, shape: block(3, 0.06, 0.02, 0.24) },
        { widthPercent: 40, shape: block(4, 0.06, 0.02, 0.18) },
      ],
    };
    const r = placeHeadline({ grid, box, preset: 'reel', layouts });
    expect(r.coverage).toBe(0);
    expect(r.box.widthPercent).toBe(40);
    expect([24, 76]).toContain(r.box.xPercent);
    // A 4-line column is too tall for y 28 inside the grid-visible band, so it moves just enough to fit.
    const shape = layouts.byWidth[2].shape;
    const placed = shapeAt(shape, r.box.xPercent, r.box.yPercent);
    expect(Math.min(...placed.map(p => p.top))).toBeGreaterThanOrEqual(headlineSafeBand('reel').top - 1e-9);
  });

  it('goes back to the full width once full width is clear again', () => {
    const empty = rowsGrid(20, 40, 0, 0);
    const narrowBox = { xPercent: 24, yPercent: 32, widthPercent: 40 };
    const r = placeHeadline({
      grid: empty, box: narrowBox, preset: 'reel',
      layouts: {
        current: block(4, 0.06, 0.02, 0.18),
        byWidth: [{ widthPercent: 88, shape: block(2, 0.06, 0.02, 0.42) }],
      },
    });
    expect(r.box).toEqual({ xPercent: 50, yPercent: 32, widthPercent: 88 });
  });

  it('leaves the grid-visible band only when that is the one clear place', () => {
    const grid = rowsGrid(20, 40, 8, 40); // everything below y 0.2 is subject
    const r = placeHeadline({ grid, box, preset: 'reel', layouts: { current: oneLine, byWidth: [] } });
    expect(r.coverage).toBe(0);
    expect(r.box.yPercent).toBe(17); // the nearest clear height: the line ends right where the subject starts
  });

  it('is stable: placing again from its own result changes nothing', () => {
    const grid = colsGrid(40, 40, 17, 23);
    const narrow = block(4, 0.06, 0.02, 0.18);
    const layouts = { current: block(2, 0.06, 0.02, 0.42), byWidth: [{ widthPercent: 40, shape: narrow }] };
    const first = placeHeadline({ grid, box, preset: 'reel', layouts });
    const again = placeHeadline({
      grid, box: first.box, preset: 'reel',
      layouts: { current: narrow, byWidth: [{ widthPercent: 88, shape: block(2, 0.06, 0.02, 0.42) }, { widthPercent: 40, shape: narrow }] },
    });
    expect(again.box).toEqual(first.box);
  });
});

describe('auto placement settings + measurement identity', () => {
  it('is on by default, survives a restore, and is off only when stored off', () => {
    expect(defaultCoverSettings('reel').boxAuto).toBe(true);
    expect(sanitizeCoverSettings({}).boxAuto).toBe(true);
    expect(sanitizeCoverSettings({ boxAuto: false }).boxAuto).toBe(false);
  });

  it('treats a measurement as stale once the box moves', () => {
    const k = (y: number) => coverHeadlineKey({ text: 'Hi', styleId: 'mrbeast', fontScale: 1.9, box: { ...box, yPercent: y }, preset: 'reel' });
    expect(k(28)).toBe(k(28));
    expect(k(28)).not.toBe(k(40));
  });

  it('probes the preset default width plus two columns', () => {
    expect(coverProbeWidths('reel')).toEqual([88, 52, 40]);
    expect(coverProbeWidths('youtube')[0]).toBe(90);
  });
});
