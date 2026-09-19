import { describe, it, expect } from 'vitest';
import { clampFrameTimeSec } from './frameCapture';

describe('clampFrameTimeSec', () => {
  it('converts ms to seconds inside the playable range', () => {
    expect(clampFrameTimeSec(1500, 10)).toBe(1.5);
    expect(clampFrameTimeSec(0, 10)).toBe(0);
  });

  it('never seeks to or past the end (a seek to duration shows no frame)', () => {
    expect(clampFrameTimeSec(10_000, 10)).toBeCloseTo(9.999, 6);
    expect(clampFrameTimeSec(99_000, 10)).toBeCloseTo(9.999, 6);
  });

  it('negative / non-finite times clamp to 0; unknown duration leaves the time alone', () => {
    expect(clampFrameTimeSec(-50, 10)).toBe(0);
    expect(clampFrameTimeSec(NaN, 10)).toBe(0);
    expect(clampFrameTimeSec(2500, NaN)).toBe(2.5);
    expect(clampFrameTimeSec(2500, Infinity)).toBe(2.5);
    expect(clampFrameTimeSec(2500, 0)).toBe(2.5);
  });
});
