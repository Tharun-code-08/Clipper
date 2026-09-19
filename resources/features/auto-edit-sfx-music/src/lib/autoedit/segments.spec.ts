import { describe, it, expect } from 'vitest';
import { deriveKeepSegments, skipTarget, sourceToEdited, totalDuration } from './segments';

describe('deriveKeepSegments', () => {
  it('keeps the complement of the cuts, to the millisecond', () => {
    const keeps = deriveKeepSegments(
      [{ start: 0, end: 0.961 }, { start: 1.642, end: 2.558 }, { start: 9.5, end: 10 }],
      10,
    );
    expect(keeps.map((k) => [k.start, k.end])).toEqual([[0.961, 1.642], [2.558, 9.5]]);
    expect(totalDuration(keeps)).toBeCloseTo(7.62, 2);
  });

  it('everything cut → the whole clip survives (safety net)', () => {
    expect(deriveKeepSegments([{ start: 0, end: 10 }], 10).map((k) => [k.start, k.end])).toEqual([[0, 10]]);
  });
});

describe('skipTarget (edited-view playback)', () => {
  const keeps = [{ start: 1, end: 2 }, { start: 3, end: 4.5 }];

  it('inside a keep → keep playing', () => {
    expect(skipTarget(keeps, 1.5)).toBeNull();
    expect(skipTarget(keeps, 0.99)).toBeNull(); // seek landed a hair early
  });

  it('in a removed span → jump to the next kept start', () => {
    expect(skipTarget(keeps, 0)).toBe(1);
    expect(skipTarget(keeps, 2.5)).toBe(3);
    // The last 30ms of a keep already jumps, so no removed frame flashes.
    expect(skipTarget(keeps, 1.98)).toBe(3);
  });

  it('past the last keep → end (pause)', () => {
    expect(skipTarget(keeps, 4.49)).toBe('end');
    expect(skipTarget(keeps, 9)).toBe('end');
  });

  it('the jump target is itself inside a keep (no seek loop)', () => {
    const t = skipTarget(keeps, 2.2) as number;
    expect(skipTarget(keeps, t)).toBeNull();
    expect(sourceToEdited(keeps.map((k, i) => ({ ...k, id: String(i) })), t)).toBe(1);
  });
});
