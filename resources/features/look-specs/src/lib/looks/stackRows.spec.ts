import { describe, it, expect } from 'vitest';
import { buildStackRows, stackRowScale } from './stackRows';

const w = (id: string, text: string, tier = 0) => ({ id, text, tier });
const tier = (x: { tier: number }) => x.tier;
const texts = (rows: { words: { text: string }[]; tier: number }[]) => rows.map((r) => r.words.map((x) => x.text).join(' '));

describe('stack rows (their buildStackRows)', () => {
  it('a hero stands alone; the plain words chunk by maxPerRow — "makes people / stop / scrolling"', () => {
    const rows = buildStackRows([w('a', 'makes'), w('b', 'people'), w('c', 'stop', 2), w('d', 'scrolling')], tier, 2);
    expect(texts(rows)).toEqual(['makes people', 'stop', 'scrolling']);
    expect(rows.map((r) => r.tier)).toEqual([0, 2, 0]);
  });

  it('the row scale is BY TIER, not by row index: the hero row is the big one wherever it lands', () => {
    const scale = [1.08, 1.65, 2.75];
    const rows = buildStackRows([w('a', 'makes'), w('b', 'people'), w('c', 'stop', 2), w('d', 'scrolling')], tier, 2);
    expect(rows.map((r) => stackRowScale(scale, r.tier))).toEqual([1.08, 2.75, 1.08]);
    expect(stackRowScale([1.2], 2)).toBe(1.2);          // past the table: the last entry
    expect(stackRowScale([], 0)).toBe(1);
  });

  it('a hero first, or last, still gets its own row', () => {
    expect(texts(buildStackRows([w('a', 'stop', 2), w('b', 'the'), w('c', 'scroll')], tier, 2))).toEqual(['stop', 'the scroll']);
    expect(texts(buildStackRows([w('a', 'the'), w('b', 'scroll'), w('c', 'stop', 2)], tier, 2))).toEqual(['the scroll', 'stop']);
  });

  it('two heroes in a row each stand alone', () => {
    expect(texts(buildStackRows([w('a', 'one', 2), w('b', 'two', 2), w('c', 'three')], tier, 3))).toEqual(['one', 'two', 'three']);
  });

  it('a full row breaks at maxPerRow', () => {
    const ws = ['a', 'b', 'c', 'd', 'e'].map((t) => w(t, t));
    expect(texts(buildStackRows(ws, tier, 2))).toEqual(['a b', 'c d', 'e']);
    expect(texts(buildStackRows(ws, tier, 4))).toEqual(['a b c d', 'e']);
    expect(texts(buildStackRows(ws, tier, 0))).toEqual(['a', 'b', 'c', 'd', 'e']);   // floored at 1 per row
  });

  it('a pop word (tier 1) breaks from plain words as a class change, and joins a lone hero only under heroPair when short', () => {
    const ws = [w('a', 'The'), w('b', 'biggest', 2), w('c', 'one', 1), w('d', 'mistake')];
    expect(texts(buildStackRows(ws, tier, 2))).toEqual(['The', 'biggest', 'one', 'mistake']);
    expect(texts(buildStackRows(ws, tier, 2, { heroPair: true }))).toEqual(['The', 'biggest one', 'mistake']);
    // the pair must fit 11 characters
    const long = [w('a', 'The'), w('b', 'biggest', 2), w('c', 'mistakes', 1)];
    expect(texts(buildStackRows(long, tier, 2, { heroPair: true }))).toEqual(['The', 'biggest', 'mistakes']);
  });

  it('hyphenSplit breaks a long hyphenated hero at its hyphen, into two rows', () => {
    const ws = [w('a', 'fits'), w('b', 'day-to-day', 2), w('c', 'life')];
    expect(texts(buildStackRows(ws, tier, 2, { hyphenSplit: true }))).toEqual(['fits', 'day-', 'to-day', 'life']);
    // short, or plain, hyphenated words stay whole
    expect(texts(buildStackRows([w('a', 'co-op', 2)], tier, 2, { hyphenSplit: true }))).toEqual(['co-op']);
    expect(texts(buildStackRows([w('a', 'day-to-day')], tier, 2, { hyphenSplit: true }))).toEqual(['day-to-day']);
    expect(texts(buildStackRows(ws, tier, 2))).toEqual(['fits', 'day-to-day', 'life']);
  });

  it('an empty phrase gives no rows', () => {
    expect(buildStackRows([], tier, 2)).toEqual([]);
  });
});
