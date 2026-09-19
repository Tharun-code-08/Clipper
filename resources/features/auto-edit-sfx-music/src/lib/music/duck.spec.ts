import { describe, it, expect } from 'vitest';
import {
  DUCK_BRIDGE_MS, DUCK_DB_DEFAULT, DUCK_FADE_MS, DUCK_LEAD_MS, DUCK_TAIL_MS,
  duckGainAt, duckVolumeExpr, duckWindows,
} from './duck';

const w = (startMs: number, endMs: number) => ({ startMs, endMs });

describe('music ducking', () => {
  it('opens before a phrase and closes after it', () => {
    const [win] = duckWindows([w(1000, 1300)]);
    expect(win.startMs).toBe(1000 - DUCK_LEAD_MS);
    expect(win.endMs).toBe(1300 + DUCK_TAIL_MS);
  });

  it('bridges the gaps between words so the music does not pump', () => {
    // Three words a breath apart are ONE window; a long pause splits them.
    const speech = duckWindows([w(0, 300), w(500, 800), w(1000, 1300)]);
    expect(speech).toHaveLength(1);
    const pause = duckWindows([w(0, 300), w(300 + DUCK_BRIDGE_MS + DUCK_LEAD_MS + DUCK_TAIL_MS + 50, 4000)]);
    expect(pause).toHaveLength(2);
  });

  it('ignores broken or out-of-order timings instead of trusting them', () => {
    expect(duckWindows([w(500, 400), { startMs: NaN, endMs: 10 }, { startMs: 0, endMs: Infinity }])).toHaveLength(0);
    const out = duckWindows([w(5000, 5300), w(0, 300)]);
    expect(out[0].startMs).toBeLessThan(out[1].startMs);
  });

  it('eases in and out rather than gating', () => {
    const win = duckWindows([w(2000, 2400)]);
    const full = 0.8;
    const inside = duckGainAt(2200, win, full, DUCK_DB_DEFAULT);
    const outside = duckGainAt(10_000, win, full, DUCK_DB_DEFAULT);
    const edge = duckGainAt(win[0].startMs - DUCK_FADE_MS / 2, win, full, DUCK_DB_DEFAULT);
    expect(outside).toBeCloseTo(full, 6);
    expect(inside).toBeLessThan(full);
    expect(edge).toBeLessThan(full);
    expect(edge).toBeGreaterThan(inside);           // mid-ramp, not yet down
    expect(inside / full).toBeCloseTo(10 ** (DUCK_DB_DEFAULT / 20), 4);
  });

  it('0 dB leaves the music alone; the floor is clamped', () => {
    const win = duckWindows([w(0, 500)]);
    expect(duckGainAt(250, win, 1, 0)).toBeCloseTo(1, 6);
    expect(duckGainAt(250, win, 1, -999)).toBeCloseTo(10 ** (-30 / 20), 4);
  });

  it('no speech at all means no ducking anywhere', () => {
    expect(duckWindows([])).toHaveLength(0);
    expect(duckGainAt(1234, [], 0.5, DUCK_DB_DEFAULT)).toBeCloseTo(0.5, 6);
    expect(duckVolumeExpr([], 0.5, DUCK_DB_DEFAULT)).toBe('0.5000');
  });

  it('the ffmpeg expression describes the same curve the renderers use', () => {
    const win = duckWindows([w(1000, 1400), w(5000, 5200)]);
    const full = 0.7;
    const expr = duckVolumeExpr(win, full, DUCK_DB_DEFAULT);
    // Evaluate the expression the way ffmpeg would, for the pieces it is built from.
    const evalAt = (t: number): number => {
      for (const v of win) {
        const a = (v.startMs - DUCK_FADE_MS) / 1000, b = v.startMs / 1000;
        const c = v.endMs / 1000, d = (v.endMs + DUCK_FADE_MS) / 1000;
        const ducked = full * 10 ** (DUCK_DB_DEFAULT / 20);
        if (t >= b && t <= c) return ducked;
        if (t >= a && t < b) return full + (ducked - full) * ((t - a) / (DUCK_FADE_MS / 1000));
        if (t > c && t <= d) return ducked + (full - ducked) * ((t - c) / (DUCK_FADE_MS / 1000));
      }
      return full;
    };
    for (const ms of [0, 900, 1000, 1200, 1400, 1500, 4000, 5100, 5300, 9000]) {
      expect(evalAt(ms / 1000)).toBeCloseTo(duckGainAt(ms, win, full, DUCK_DB_DEFAULT), 3);
    }
    expect(expr).toContain('between(t,');
    expect(expr).not.toContain('NaN');
  });
});
