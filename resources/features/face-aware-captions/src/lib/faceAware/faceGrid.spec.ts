import { describe, it, expect } from 'vitest';
import { downsampleFaceMask, downsampleSubjectMask, maskRamp, emptyGrid, HAIR_WEIGHT, GRID_COLS, GRID_ROWS } from './faceGrid';

/** width×height mask with `value` inside [x0,x1)×[y0,y1) (pixels), 0 elsewhere. */
function mask(width: number, height: number, x0: number, y0: number, x1: number, y1: number, value = 1): Float32Array {
  const m = new Float32Array(width * height);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * width + x] = value;
  return m;
}

describe('maskRamp', () => {
  it('matches the cut-out threshold: 0 below 0.30, 1 above 0.70, linear between', () => {
    expect(maskRamp(0.1)).toBe(0);
    expect(maskRamp(0.3)).toBe(0);
    expect(maskRamp(0.5)).toBeCloseTo(0.5);
    expect(maskRamp(0.7)).toBe(1);
    expect(maskRamp(0.95)).toBe(1);
  });
});

describe('downsampleFaceMask', () => {
  it('averages face probability into the grid cell each pixel falls in', () => {
    const face = mask(4, 4, 0, 0, 2, 2);           // top-left quadrant
    const g = downsampleFaceMask({ width: 4, height: 4, face, cols: 2, rows: 2 });
    expect(Array.from(g.data)).toEqual([1, 0, 0, 0]);
    expect(g.cols).toBe(2);
    expect(g.rows).toBe(2);
  });

  it('counts hair at HAIR_WEIGHT of a face pixel', () => {
    const face = new Float32Array(4);
    const hair = mask(2, 2, 0, 0, 2, 2);
    const g = downsampleFaceMask({ width: 2, height: 2, face, hair, cols: 1, rows: 1 });
    expect(g.data[0]).toBeCloseTo(HAIR_WEIGHT);
  });

  it('thresholds face+hair TOGETHER so a boundary pixel split between the classes still counts', () => {
    const face = new Float32Array([0.4]);
    const hair = new Float32Array([0.4]);             // each alone would ramp to 0.25; head = 0.8 → 1
    const g = downsampleFaceMask({ width: 1, height: 1, face, hair, cols: 1, rows: 1 });
    expect(g.data[0]).toBeCloseTo(1 * ((0.4 + HAIR_WEIGHT * 0.4) / 0.8));
  });

  it('drops low-confidence noise to zero', () => {
    const face = new Float32Array(16).fill(0.2);
    const g = downsampleFaceMask({ width: 4, height: 4, face, cols: 2, rows: 2 });
    expect(Array.from(g.data)).toEqual([0, 0, 0, 0]);
  });

  it('defaults to the 54×96 grid', () => {
    const g = downsampleFaceMask({ width: 8, height: 8, face: new Float32Array(64) });
    expect(g.cols).toBe(GRID_COLS);
    expect(g.rows).toBe(GRID_ROWS);
    expect(g.data.length).toBe(GRID_COLS * GRID_ROWS);
  });
});

describe('downsampleSubjectMask / emptyGrid', () => {
  it('uses the whole person for a single-class model', () => {
    const subject = mask(4, 4, 2, 2, 4, 4);
    const g = downsampleSubjectMask({ width: 4, height: 4, subject, cols: 2, rows: 2 });
    expect(Array.from(g.data)).toEqual([0, 0, 0, 1]);
  });

  it('emptyGrid is all zero', () => {
    expect(emptyGrid(3, 2).data.every(v => v === 0)).toBe(true);
  });
});
