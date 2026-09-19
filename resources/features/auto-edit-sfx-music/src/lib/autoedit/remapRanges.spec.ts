import { describe, it, expect } from 'vitest';
import { cutToSourceMs, remapPointsForCut, remapRangesForCut, sourceToCutMs } from './remap';

// Keep 1–2 s and 4–6 s (cut 0–1, 2–4, 6–end).
const KEEPS = [{ start: 1, end: 2 }, { start: 4, end: 6 }];

describe('remapRangesForCut (bleeps)', () => {
  it('shifts a range inside a keep onto the cut clock', () => {
    expect(remapRangesForCut([{ startMs: 4200, endMs: 4500 }], KEEPS)).toEqual([{ startMs: 1200, endMs: 1500 }]);
  });

  it('a range straddling a cut becomes two touching pieces', () => {
    expect(remapRangesForCut([{ startMs: 1800, endMs: 4300 }], KEEPS)).toEqual([
      { startMs: 800, endMs: 1000 },
      { startMs: 1000, endMs: 1300 },
    ]);
  });

  it('a fully cut range vanishes; extra fields ride along', () => {
    expect(remapRangesForCut([{ startMs: 2500, endMs: 3500, tag: 'x' }], KEEPS)).toEqual([]);
    expect(remapRangesForCut([{ startMs: 1100, endMs: 1200, tag: 'y' }], KEEPS)).toEqual([{ startMs: 100, endMs: 200, tag: 'y' }]);
  });
});

describe('remapPointsForCut (sound effects)', () => {
  it('shifts kept sounds onto the cut clock and drops sounds whose moment was cut', () => {
    const sfx = [
      { id: 'a', sfxId: 'boom', atMs: 4500, gain: 1 },
      { id: 'b', sfxId: 'pop', atMs: 3000, gain: 0.5 },   // inside the 2–4 s cut
      { id: 'c', sfxId: 'whoosh', atMs: 1250, gain: 0.8 },
    ];
    expect(remapPointsForCut(sfx, KEEPS)).toEqual([
      { id: 'c', sfxId: 'whoosh', atMs: 250, gain: 0.8 },
      { id: 'a', sfxId: 'boom', atMs: 1500, gain: 1 },
    ]);
  });
});

describe('sourceToCutMs / cutToSourceMs', () => {
  it('maps kept instants both ways', () => {
    expect(sourceToCutMs(KEEPS, 1500)).toBe(500);
    expect(sourceToCutMs(KEEPS, 4500)).toBe(1500);
    expect(cutToSourceMs(KEEPS, 500)).toBe(1500);
    expect(cutToSourceMs(KEEPS, 1500)).toBe(4500);
  });

  it('a cut instant has no place on the cut clock', () => {
    expect(sourceToCutMs(KEEPS, 3000)).toBeNull();
    expect(sourceToCutMs(KEEPS, 500)).toBeNull();
    expect(sourceToCutMs(KEEPS, 6500)).toBeNull();
  });

  it('past the end clamps to the last kept instant', () => {
    expect(cutToSourceMs(KEEPS, 99_000)).toBe(6000);
  });
});
