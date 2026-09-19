import { describe, it, expect } from 'vitest';
import type { TranscriptWord } from '@/types/transcript';
import { activeSegmentWindowAt, resolveSegments } from '@/lib/captionSegments';
import {
  COVER_PRESETS, coverPreset, coverLogical, coverFitRect, defaultCoverBox, clampCoverBox,
  isCoverStyleSupported, coverStyleFor, cleanCoverText, coverHeadlineWords, coverSeedText,
  coverWatermarked, sanitizeCoverSettings, defaultCoverSettings, coverFileName, COVER_MAX_WORDS,
  coverRenderPasses,
} from './coverLayout';

const w = (id: string, text: string, startMs: number, endMs: number): TranscriptWord =>
  ({ id, text, startMs, endMs, styleOverride: {} });

describe('presets + logical canvas', () => {
  it('ships the three sizes', () => {
    expect(COVER_PRESETS.map(p => [p.id, p.width, p.height])).toEqual([
      ['reel', 1080, 1920], ['grid', 1080, 1350], ['youtube', 1280, 720],
    ]);
  });

  it('unknown id falls back to Reels', () => {
    expect(coverPreset('nope').id).toBe('reel');
    expect(coverPreset(undefined).id).toBe('reel');
  });

  it('logical canvas scales EXACTLY onto the output pixels', () => {
    for (const p of COVER_PRESETS) {
      const l = coverLogical(p);
      expect(Math.round(l.w * l.scale)).toBe(p.width);
      expect(Math.round(l.h * l.scale)).toBe(p.height);
    }
    expect(coverLogical(coverPreset('reel'))).toEqual({ w: 270, h: 480, scale: 4, rs: 1 });
    expect(coverLogical(coverPreset('youtube'))).toEqual({ w: 640, h: 360, scale: 2, rs: 1 });
    const grid = coverLogical(coverPreset('grid'));
    expect(grid.w).toBe(384);
    expect(grid.rs).toBeCloseTo(384 / 270, 6);
  });
});

describe('coverFitRect — fill + crop, never letterbox', () => {
  it('landscape source into portrait crops the sides, centred', () => {
    const r = coverFitRect(1920, 1080, 1080, 1920);
    expect(r.dh).toBeCloseTo(1920);
    expect(r.dw).toBeCloseTo(3413.33, 1);
    expect(r.dy).toBe(0);
    expect(r.dx).toBeCloseTo((1080 - 3413.33) / 2, 1);
    // visible source strip: full height, 607.5 px wide centred
    expect(r.sh).toBeCloseTo(1080);
    expect(r.sw).toBeCloseTo(607.5, 1);
    expect(r.sx).toBeCloseTo((1920 - 607.5) / 2, 1);
  });

  it('always covers the destination for any pan', () => {
    for (const pan of [0, 0.25, 0.5, 1]) {
      const r = coverFitRect(1080, 1920, 1280, 720, pan, pan);
      expect(r.dx).toBeLessThanOrEqual(0);
      expect(r.dy).toBeLessThanOrEqual(0);
      expect(r.dx + r.dw).toBeGreaterThanOrEqual(1280 - 1e-6);
      expect(r.dy + r.dh).toBeGreaterThanOrEqual(720 - 1e-6);
    }
  });

  it('pan 0 shows the left/top edge, pan 1 the right/bottom edge', () => {
    const left = coverFitRect(1920, 1080, 1080, 1920, 0, 0.5);
    expect(left.sx).toBeCloseTo(0);
    const right = coverFitRect(1920, 1080, 1080, 1920, 1, 0.5);
    expect(right.sx + right.sw).toBeCloseTo(1920);
  });

  it('zoom enlarges and is clamped to [1,3]; out-of-range pan is clamped', () => {
    const z2 = coverFitRect(1080, 1920, 1080, 1920, 0.5, 0.5, 2);
    expect(z2.dw).toBeCloseTo(2160);
    expect(z2.sw).toBeCloseTo(540);
    expect(coverFitRect(1080, 1920, 1080, 1920, 0.5, 0.5, 0.2).dw).toBeCloseTo(1080);
    expect(coverFitRect(1080, 1920, 1080, 1920, 0.5, 0.5, 99).dw).toBeCloseTo(3240);
    expect(coverFitRect(1920, 1080, 1080, 1920, -5, 9)).toEqual(coverFitRect(1920, 1080, 1080, 1920, 0, 1));
  });

  it('degenerate sizes do not produce NaN', () => {
    const r = coverFitRect(0, 0, 1080, 1920);
    expect(Object.values(r).every(Number.isFinite)).toBe(true);
  });
});

describe('headline box', () => {
  it('clamps and fills missing fields from the fallback', () => {
    const fb = defaultCoverBox('reel');
    expect(clampCoverBox({ xPercent: -10, yPercent: 140, widthPercent: 5 }, fb)).toEqual({ xPercent: 0, yPercent: 100, widthPercent: 20 });
    expect(clampCoverBox(null, fb)).toEqual(fb);
    expect(clampCoverBox({ yPercent: NaN }, fb)).toEqual(fb);
  });
});

describe('styles', () => {
  it('excludes the html-in-canvas-mangled templates', () => {
    for (const s of ['hormozi', 'captik_shadow', 'liquid_glass', 'illusion', 'editor_masala', 'aura', 'aura_helvetica', 'big_reveal', 'big_red']) {
      expect(isCoverStyleSupported(s)).toBe(false);
    }
    expect(isCoverStyleSupported('mrbeast')).toBe(true);
    // one-word-at-a-time templates would show a single word of the headline
    expect(isCoverStyleSupported('pixelated')).toBe(false);
    expect(isCoverStyleSupported('')).toBe(false);
  });

  it('coverStyleFor prefers the pick, then the project style, then the default', () => {
    expect(coverStyleFor('boxed', 'mrbeast')).toBe('boxed');
    expect(coverStyleFor('hormozi', 'boxed')).toBe('boxed');
    expect(coverStyleFor(null, 'aura')).toBe('mrbeast');
  });
});

describe('headline words', () => {
  it('cleanCoverText collapses whitespace, strips wrapping quotes, caps length', () => {
    expect(cleanCoverText('  "Stop   doing\nthis"  ')).toBe('Stop doing this');
    expect(cleanCoverText(42)).toBe('');
    expect(cleanCoverText('x'.repeat(200)).length).toBe(90);
  });

  it('builds one segment that is ACTIVE at currentTimeMs with every word already spoken', () => {
    const { words, segments, currentTimeMs } = coverHeadlineWords('Nobody tells you this');
    expect(words.map(x => x.text)).toEqual(['Nobody', 'tells', 'you', 'this']);
    expect(segments).toEqual([words.map(x => x.id)]);
    const win = activeSegmentWindowAt(resolveSegments(segments, words), currentTimeMs);
    expect(win?.index).toBe(0);
    for (const x of words) expect(x.startMs).toBeLessThan(currentTimeMs - 5_000);
    // far from the line's exit: the window ends ≥ 1s after the sample
    expect(win!.winEnd - currentTimeMs).toBeGreaterThanOrEqual(1_000);
  });

  it('caps words and handles empty text', () => {
    expect(coverHeadlineWords(Array(30).fill('a').join(' ')).words).toHaveLength(COVER_MAX_WORDS);
    expect(coverHeadlineWords('   ')).toMatchObject({ words: [], segments: [] });
  });
});

describe('coverSeedText', () => {
  const words = [w('a', 'yeh', 0, 300), w('b', 'dekho', 300, 600), w('c', 'next', 900, 1200)];
  const segments = [['a', 'b'], ['c']];

  it('hook overlay[0] wins', () => {
    expect(coverSeedText({ overlays: ['“Paisa Kahan Gaya?”', 'x'], rewrittenScript: 'long script' }, words, segments))
      .toEqual({ text: 'Paisa Kahan Gaya?', source: 'hook_overlay' });
  });

  it('then the rewritten script (word-capped)', () => {
    const script = Array.from({ length: 15 }, (_, i) => `w${i}`).join(' ');
    const r = coverSeedText({ overlays: ['   '], rewrittenScript: script }, words, segments);
    expect(r.source).toBe('hook_script');
    expect(r.text.split(' ')).toHaveLength(COVER_MAX_WORDS);
  });

  it('then the first caption line; then the first words when there are no segments', () => {
    expect(coverSeedText(null, words, segments)).toEqual({ text: 'yeh dekho', source: 'caption' });
    expect(coverSeedText(undefined, words, [])).toEqual({ text: 'yeh dekho next', source: 'caption' });
  });

  it('empty everything → none', () => {
    expect(coverSeedText({ overlays: 'nope' }, [], null)).toEqual({ text: '', source: 'none' });
  });
});

describe('coverWatermarked', () => {
  it('free without a project unlock is watermarked', () => {
    expect(coverWatermarked('free', false)).toBe(true);
    expect(coverWatermarked(null, false)).toBe(true);
    expect(coverWatermarked('garbage', false)).toBe(true);
  });
  it('any paid plan or the ₹9 project unlock is clean', () => {
    for (const p of ['starter', 'editor', 'pro', 'premiere']) expect(coverWatermarked(p, false)).toBe(false);
    expect(coverWatermarked('free', true)).toBe(false);
  });
});

describe('sanitizeCoverSettings', () => {
  it('garbage → defaults', () => {
    expect(sanitizeCoverSettings(null)).toEqual(defaultCoverSettings('reel'));
    expect(sanitizeCoverSettings('x')).toEqual(defaultCoverSettings('reel'));
  });

  it('keeps valid values, clamps ranges, drops unsupported styles', () => {
    const s = sanitizeCoverSettings({
      preset: 'youtube', frameMs: 1234, panX: 3, panY: 0.2, zoom: 9, text: '  hi  there ',
      styleId: 'hormozi', box: { xPercent: 40, yPercent: 60, widthPercent: 70 }, fontScale: 99,
      subjectInFront: true, format: 'jpeg',
    });
    expect(s).toEqual({
      preset: 'youtube', frameMs: 1234, panX: 1, panY: 0.2, zoom: 3, text: 'hi there', styleId: null,
      box: { xPercent: 40, yPercent: 60, widthPercent: 70 }, boxAuto: true, fontScale: 4, subjectInFront: true, format: 'jpeg',
    });
    expect(sanitizeCoverSettings({ styleId: 'boxed', frameMs: -1, subjectInFront: 'yes' })).toMatchObject({
      styleId: 'boxed', frameMs: null, subjectInFront: false, format: 'png',
    });
  });
});

describe('coverFileName', () => {
  it('names by base + size + format', () => {
    expect(coverFileName(coverPreset('reel'), 'png', 'My Vlog #3.mp4')).toBe('My-Vlog-3-cover-1080x1920.png');
    expect(coverFileName(coverPreset('youtube'), 'jpeg')).toBe('cover-1280x720.jpg');
  });
});

describe('coverRenderPasses — still export layer order', () => {
  it('no cut-out: one overlay carrying whatever is shown', () => {
    expect(coverRenderPasses({ hasText: true, watermarked: true, hasCutout: false }))
      .toEqual([{ kind: 'overlay', headline: true, watermark: true }]);
    expect(coverRenderPasses({ hasText: false, watermarked: false, hasCutout: false })).toEqual([]);
  });

  it('cut-out: headline BELOW the subject, watermark ABOVE it', () => {
    expect(coverRenderPasses({ hasText: true, watermarked: true, hasCutout: true })).toEqual([
      { kind: 'overlay', headline: true, watermark: false },
      { kind: 'cutout' },
      { kind: 'overlay', headline: false, watermark: true },
    ]);
  });

  it('clean cover with a cut-out renders no watermark pass', () => {
    expect(coverRenderPasses({ hasText: true, watermarked: false, hasCutout: true })).toEqual([
      { kind: 'overlay', headline: true, watermark: false },
      { kind: 'cutout' },
    ]);
  });
});
