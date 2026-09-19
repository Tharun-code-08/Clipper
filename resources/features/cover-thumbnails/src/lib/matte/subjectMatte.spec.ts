import { describe, it, expect } from 'vitest';
import { subjectMatteWindows, allCaptionWindows, matteSourceSig, confidenceToAlpha, maskAlphaBytes, alphaCoverage } from './subjectMatte';
import type { TranscriptWord, LineOverride } from '@/types/transcript';

// Minimal word factory — only the fields subjectMatteWindows reads matter.
const w = (id: string, startMs: number, endMs: number): TranscriptWord =>
  ({ id, text: id, startMs, endMs, styleOverride: {} } as unknown as TranscriptWord);

// Three captions at 0-1s, 2-3s, 4-5s.
const words: TranscriptWord[] = [
  w('a0', 0, 500), w('a1', 500, 1000),
  w('b0', 2000, 2500), w('b1', 2500, 3000),
  w('c0', 4000, 4500), w('c1', 4500, 5000),
];
const segments = [['a0', 'a1'], ['b0', 'b1'], ['c0', 'c1']];

describe('subjectMatteWindows', () => {
  it('returns nothing when no caption has behindSubject', () => {
    expect(subjectMatteWindows(segments, words, {})).toEqual([]);
  });

  it('returns the (padded) window for a single enabled caption, keyed by seg[0]', () => {
    const ov: Record<string, LineOverride> = { b0: { behindSubject: true } };
    expect(subjectMatteWindows(segments, words, ov, 100)).toEqual([{ startMs: 1900, endMs: 3100 }]);
  });

  it('clamps the start at 0 and never goes negative', () => {
    const ov: Record<string, LineOverride> = { a0: { behindSubject: true } };
    expect(subjectMatteWindows(segments, words, ov, 200)).toEqual([{ startMs: 0, endMs: 1200 }]);
  });

  it('keeps disjoint windows separate', () => {
    const ov: Record<string, LineOverride> = { a0: { behindSubject: true }, c0: { behindSubject: true } };
    expect(subjectMatteWindows(segments, words, ov, 50)).toEqual([
      { startMs: 0, endMs: 1050 },
      { startMs: 3950, endMs: 5050 },
    ]);
  });

  it('merges windows that overlap after padding', () => {
    // a (0-1000) and b (2000-3000) with 600ms padding → 0..1600 and 1400..3600 overlap → merge.
    const ov: Record<string, LineOverride> = { a0: { behindSubject: true }, b0: { behindSubject: true } };
    expect(subjectMatteWindows(segments, words, ov, 600)).toEqual([{ startMs: 0, endMs: 3600 }]);
  });

  it('ignores stale segments whose words were all pruned', () => {
    const ov: Record<string, LineOverride> = { gone: { behindSubject: true } };
    expect(subjectMatteWindows([['gone', 'missing']], words, ov)).toEqual([]);
  });

  it('handles empty / missing inputs', () => {
    expect(subjectMatteWindows([], words, {})).toEqual([]);
    expect(subjectMatteWindows(segments, [], {})).toEqual([]);
    expect(subjectMatteWindows(null, words, {})).toEqual([]);
  });
});

describe('allCaptionWindows', () => {
  it('covers EVERY caption (no behindSubject flag needed) — disjoint windows stay separate', () => {
    expect(allCaptionWindows(segments, words, 50)).toEqual([
      { startMs: 0, endMs: 1050 },
      { startMs: 1950, endMs: 3050 },
      { startMs: 3950, endMs: 5050 },
    ]);
  });

  it('clamps the start at 0 and merges windows that overlap after padding', () => {
    // With 600ms padding all three captions chain into one continuous window.
    expect(allCaptionWindows(segments, words, 600)).toEqual([{ startMs: 0, endMs: 5600 }]);
  });

  it('ignores stale segments whose words were all pruned', () => {
    expect(allCaptionWindows([['gone', 'missing']], words)).toEqual([]);
  });

  it('handles empty / missing inputs', () => {
    expect(allCaptionWindows([], words)).toEqual([]);
    expect(allCaptionWindows(segments, [])).toEqual([]);
    expect(allCaptionWindows(null, words)).toEqual([]);
  });
});

describe('matteSourceSig', () => {
  it('changes when windows change', () => {
    const a = matteSourceSig('src1', 30, [{ startMs: 0, endMs: 1000 }]);
    const b = matteSourceSig('src1', 30, [{ startMs: 0, endMs: 2000 }]);
    expect(a).not.toBe(b);
  });
  it('is stable for identical inputs', () => {
    const a = matteSourceSig('src1', 30, [{ startMs: 0, endMs: 1000 }]);
    const b = matteSourceSig('src1', 30, [{ startMs: 0, endMs: 1000 }]);
    expect(a).toBe(b);
  });
  it('changes when the source or fps changes', () => {
    const base = matteSourceSig('src1', 30, [{ startMs: 0, endMs: 1000 }]);
    expect(matteSourceSig('src2', 30, [{ startMs: 0, endMs: 1000 }])).not.toBe(base);
    expect(matteSourceSig('src1', 25, [{ startMs: 0, endMs: 1000 }])).not.toBe(base);
  });
});

describe('confidence → alpha ramp (shared by the matte and the cover cut-out)', () => {
  it('multiclass: alpha = 1 − background confidence, ramped 0.30 → 0.70', () => {
    expect(confidenceToAlpha(1, true)).toBe(0);        // pure background
    expect(confidenceToAlpha(0.7, true)).toBeCloseTo(0, 10); // subject 0.30 → edge of transparent (float: 1−0.7 ≈ 0.30000000000000004)
    expect(confidenceToAlpha(0.5, true)).toBeCloseTo(0.5, 10);
    expect(confidenceToAlpha(0.3, true)).toBe(1);      // subject 0.70 → fully opaque
    expect(confidenceToAlpha(0, true)).toBe(1);
  });

  it('single-class: the mask already is the subject', () => {
    expect(confidenceToAlpha(0.1, false)).toBe(0);
    expect(confidenceToAlpha(0.6, false)).toBeCloseTo(0.75, 10);
    expect(confidenceToAlpha(0.95, false)).toBe(1);
  });

  it('is monotonic across the ramp', () => {
    let prev = -1;
    for (let s = 0; s <= 100; s++) {
      const a = confidenceToAlpha(s / 100, false);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });

  it('maskAlphaBytes writes white pixels with the ramped alpha, reusing a right-sized buffer', () => {
    const buf = new Uint8ClampedArray(12);
    const px = maskAlphaBytes([1, 0.5, 0], true, buf);
    expect(px).toBe(buf);
    expect(Array.from(px)).toEqual([255, 255, 255, 0, 255, 255, 255, 128, 255, 255, 255, 255]);
    expect(maskAlphaBytes([0.5], true, new Uint8ClampedArray(3))).toHaveLength(4);
  });

  it('alphaCoverage counts pixels at or above the threshold', () => {
    expect(alphaCoverage([255, 255, 255, 0, 255, 255, 255, 128, 255, 255, 255, 255])).toBeCloseTo(2 / 3, 10);
    expect(alphaCoverage([255, 255, 255, 127])).toBe(0);
    expect(alphaCoverage([])).toBe(0);
  });
});
