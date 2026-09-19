import { describe, it, expect } from 'vitest';
import { fnv1a, mulberry32, heroTextScale, heroClipKeys, aroundLayout, impactLayout, dynamicPlacement } from './dynamicLayout';

describe('the seed', () => {
  it('FNV-1a matches the published vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
    expect(new Set(xs).size).toBeGreaterThan(40);
  });
});

describe('hero phrases', () => {
  it('a long hero phrase is set a little smaller', () => {
    expect(heroTextScale('short one')).toBe(1);
    expect(heroTextScale('seventeen letters!')).toBe(0.96);
    expect(heroTextScale('twenty five letters in this one')).toBe(0.9);
  });
  it('count only with a hero and spaced by the intensity gap', () => {
    const clips = [
      { key: 'a', startSec: 0, hasHero: true }, { key: 'b', startSec: 2, hasHero: true },
      { key: 'c', startSec: 5.5, hasHero: true }, { key: 'd', startSec: 9, hasHero: false }, { key: 'e', startSec: 12, hasHero: true },
    ];
    expect([...heroClipKeys(clips, 'subtle')]).toEqual(['a', 'c', 'e']);     // gap 5
    expect([...heroClipKeys(clips, 'wild')]).toEqual(['a', 'c', 'e']);       // gap 2.5: b is 2s after a
    expect([...heroClipKeys(clips, 'balanced')]).toEqual(['a', 'c', 'e']);
    expect([...heroClipKeys([{ key: 'x', startSec: 0, hasHero: true }, { key: 'y', startSec: 1, hasHero: true }], 'balanced')]).toEqual(['x']);
  });
});

describe('around: a zone per phrase', () => {
  const spec = { style: 'around' as const, intensity: 'balanced' as const, placementRegion: 'mostly-lower' as const, consistentScale: true };
  const base = { baseXPct: 0.5, baseYPct: 0.56, text: 'building a visual direction' };

  it('is the same for the same key, frame after frame, and differs between phrases', () => {
    const a = aroundLayout(spec, { ...base, clipKey: 'w1', startSec: 0, isHero: true });
    expect(aroundLayout(spec, { ...base, clipKey: 'w1', startSec: 0, isHero: true })).toEqual(a);
    const picks = new Set(['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].map((k) => aroundLayout(spec, { ...base, clipKey: k, startSec: 0, isHero: true }).yPct.toFixed(3)));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('mostly-lower: hero phrases take the wide lower zones, shifted with the caption box', () => {
    for (const k of ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8']) {
      const p = aroundLayout(spec, { ...base, clipKey: k, startSec: 0, isHero: true });
      expect(p.yPct).toBeGreaterThanOrEqual(0.55 + 0.06 - 0.03);
      expect(p.yPct).toBeLessThanOrEqual(0.81 + 0.06 + 0.03);
      expect(p.xPct).toBeGreaterThanOrEqual(0.38 - 0.03);
      expect(p.xPct).toBeLessThanOrEqual(0.62 + 0.03);
      expect(p.fontScale).toBe(1);
    }
  });

  it('mostly-lower: a plain phrase in the second two-second bucket of every four takes an upper corner', () => {
    for (const k of ['w1', 'w2', 'w3', 'w4']) {
      const p = aroundLayout(spec, { ...base, clipKey: k, startSec: 2.5, isHero: false });   // bucket 1
      expect(p.yPct).toBeLessThan(0.11 + 0.06 + 0.03 + 1e-9);
      expect(Math.abs(p.xPct - 0.5)).toBeGreaterThan(0.2);
    }
    const p = aroundLayout(spec, { ...base, clipKey: 'w1', startSec: 4.5, isHero: false });   // bucket 2: back to the lower zones
    expect(p.yPct).toBeGreaterThan(0.5);
  });

  it('the zone scales the phrase only when the design allows it', () => {
    const free = { ...spec, consistentScale: false };
    expect(aroundLayout(free, { ...base, clipKey: 'w1', startSec: 0, isHero: true }).fontScale).toBeCloseTo(1.2 * 0.96, 6);
    expect(aroundLayout(free, { ...base, text: 'short', clipKey: 'w1', startSec: 0, isHero: true }).fontScale).toBe(1.2);
    expect(aroundLayout(free, { ...base, clipKey: 'w1', startSec: 0, isHero: false }).fontScale).toBe(0.96);   // the text-length scale alone
    expect(aroundLayout(free, { ...base, text: 'short', clipKey: 'w1', startSec: 0, isHero: false }).fontScale).toBe(1);
  });

  it('never leaves the frame', () => {
    const p = aroundLayout({ ...spec, placementRegion: 'upper' }, { ...base, baseXPct: 0.05, baseYPct: 0.02, clipKey: 'w9', startSec: 0, isHero: false });
    expect(p.xPct).toBeGreaterThanOrEqual(0.1);
    expect(p.yPct).toBeGreaterThanOrEqual(0.05);
  });
});

describe('impact: only hero phrases move', () => {
  const spec = { style: 'impact' as const, intensity: 'subtle' as const };
  const base = { baseXPct: 0.5, baseYPct: 0.58, text: 'a plain line', clipKey: 'w1', startSec: 0 };
  it('a plain phrase stays at the caption box at its size', () => {
    expect(impactLayout(spec, { ...base, isHero: false })).toEqual({ xPct: 0.5, yPct: 0.58, fontScale: 1 });
  });
  it('a hero phrase is nudged within the intensity and drawn larger', () => {
    const p = impactLayout(spec, { ...base, isHero: true });
    expect(Math.abs(p.xPct - 0.5)).toBeLessThanOrEqual(0.01 + 1e-9);
    expect(Math.abs(p.yPct - 0.58)).toBeLessThanOrEqual(0.04 + 1e-9);
    expect(p.xPct !== 0.5 || p.yPct !== 0.58).toBe(true);
    expect(p.fontScale).toBeCloseTo(1.1, 6);
    expect(dynamicPlacement(spec, { ...base, isHero: true })).toEqual(p);
  });
});
