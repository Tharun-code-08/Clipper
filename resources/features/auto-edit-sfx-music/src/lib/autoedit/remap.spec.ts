import { describe, it, expect } from 'vitest';
import { remapForCut, rekeyOverrides } from './remap';
import type { TranscriptWord } from '@/types/transcript';

const w = (id: string, startMs: number, endMs: number): TranscriptWord =>
  ({ id, text: id, startMs, endMs, styleOverride: {} });

// Source: 10s. Words: a(0.5-1s) b(1.2-1.8s) | c(3-3.5s) d(3.7-4.2s) | e(6-6.5s) f(6.7-7.2s)
const WORDS = [w('a', 500, 1000), w('b', 1200, 1800), w('c', 3000, 3500), w('d', 3700, 4200), w('e', 6000, 6500), w('f', 6700, 7200)];
const SEGS = [['a', 'b'], ['c', 'd'], ['e', 'f']];

describe('remapForCut', () => {
  it('shifts surviving words onto the contiguous cut clock', () => {
    // Keep 0-2s and 3.6-8s (cut 2-3.6 and 8-10). c's midpoint (3.25s) is cut; d survives.
    const cut = remapForCut(WORDS, SEGS, [{ start: 0, end: 2 }, { start: 3.6, end: 8 }]);
    expect(cut.durationMs).toBe(6400);
    const ids = cut.words.map((x) => x.id);
    expect(ids).toEqual(['a', 'b', 'd', 'e', 'f']);
    // d: source 3.7s → edited 2.0 + (3.7 − 3.6) = 2.1s
    expect(cut.words.find((x) => x.id === 'd')!.startMs).toBe(2100);
  });

  it('re-keys a segment whose HEAD word was cut (per-line template override survival)', () => {
    const cut = remapForCut(WORDS, SEGS, [{ start: 0, end: 2 }, { start: 3.6, end: 8 }]);
    // Segment ['c','d'] lost its head 'c' → its key moves c → d.
    expect(cut.headKeyMap).toEqual({ c: 'd' });
    expect(cut.captionSegments).toEqual([['a', 'b'], ['d'], ['e', 'f']]);

    // The five override maps are keyed by the head id — re-keying moves the override with it.
    const styleOverrides = { c: 'aura', e: 'hormozi' };
    const rekeyed = rekeyOverrides(styleOverrides, cut.headKeyMap);
    expect(rekeyed).toEqual({ d: 'aura', e: 'hormozi' });
  });

  it('drops a fully-cut segment without leaking a key mapping', () => {
    // Cut 2.5-4.5s: both c and d midpoints are gone → segment vanishes entirely.
    const cut = remapForCut(WORDS, SEGS, [{ start: 0, end: 2.5 }, { start: 4.5, end: 10 }]);
    expect(cut.captionSegments).toEqual([['a', 'b'], ['e', 'f']]);
    expect(cut.headKeyMap).toEqual({});
    // Overrides for the vanished segment stay under their old (now unused) key — harmless.
    expect(rekeyOverrides({ c: 'aura' }, cut.headKeyMap)).toEqual({ c: 'aura' });
  });

  it('rekeyOverrides returns the SAME object when nothing changed (identity friendly)', () => {
    const map = { a: 1, e: 2 };
    expect(rekeyOverrides(map, {})).toBe(map);
    expect(rekeyOverrides(map, { zzz: 'yyy' })).toBe(map);
  });
});
