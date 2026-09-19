import { describe, it, expect } from 'vitest';
import { buildCutFilterGraph, snapKeepsToFrames } from './cutGraph';
import { remapForCut } from './remap';

describe('snapKeepsToFrames', () => {
  it('snaps both edges to the frame grid and keeps order', () => {
    const k = snapKeepsToFrames([{ start: 1.012, end: 2.049 }, { start: 0.3, end: 0.61 }], 30);
    expect(k.map((s) => [Math.round(s.start * 30), Math.round(s.end * 30)])).toEqual([[9, 18], [30, 61]]);
  });

  it('drops spans shorter than a frame and merges spans that come to touch', () => {
    // 3.01 s and 3.012 s both snap to frame 75 at 25 fps → the two spans touch and merge.
    const k = snapKeepsToFrames([{ start: 1, end: 1.01 }, { start: 2, end: 3.01 }, { start: 3.012, end: 4 }], 25);
    expect(k).toEqual([{ start: 2, end: 4 }]);
  });

  it('no usable fps → spans pass through (sorted)', () => {
    expect(snapKeepsToFrames([{ start: 2, end: 3 }, { start: 0, end: 1 }], 0)).toEqual([{ start: 0, end: 1 }, { start: 2, end: 3 }]);
  });

  it('caption remap with snapped keeps == the cut file duration (no accumulated drift)', () => {
    const raw = Array.from({ length: 80 }, (_, i) => ({ start: i * 1.013 + 0.017, end: i * 1.013 + 0.531 }));
    const snapped = snapKeepsToFrames(raw, 30);
    const frames = snapped.reduce((a, k) => a + Math.round((k.end - k.start) * 30), 0);
    const cut = remapForCut([], [], snapped);
    expect(Math.abs(cut.durationMs - (frames / 30) * 1000)).toBeLessThanOrEqual(1);
  });
});

describe('buildCutFilterGraph', () => {
  it('trims each kept span (video half a frame early, audio exact) and concats them', () => {
    const g = buildCutFilterGraph([{ start: 0, end: 1 }, { start: 2, end: 3.5 }], 20);
    expect(g).toContain('[0:v]trim=start=0.0000:end=0.9750,setpts=PTS-STARTPTS[v0]');
    expect(g).toContain('[0:a]atrim=start=0.0000:end=1.0000,asetpts=PTS-STARTPTS[a0]');
    expect(g).toContain('[0:v]trim=start=1.9750:end=3.4750,setpts=PTS-STARTPTS[v1]');
    expect(g).toContain('[0:a]atrim=start=2.0000:end=3.5000,asetpts=PTS-STARTPTS[a1]');
    expect(g.endsWith('[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]')).toBe(true);
  });

  it('refuses an empty cut', () => {
    expect(() => buildCutFilterGraph([])).toThrow();
  });
});
