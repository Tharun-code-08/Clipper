import { describe, it, expect } from 'vitest';
import {
  DEPTH_FX_DEFAULT, DEPTH_GRID_BYTES, DEPTH_GRID_W, composeInline, depthGridFrame, depthPxScale, depthWordTreatment,
  downsampleAlphaGrid, headTopFromGrid, sampleGridRect, smoothstep,
} from './depth';
import { LOOK_SPECS } from './lookSpec';

const gridOf = (fill: (r: number, c: number) => number) => {
  const g = new Uint8Array(DEPTH_GRID_BYTES);
  for (let r = 0; r < 24; r++) for (let c = 0; c < 24; c++) g[24 * r + c] = fill(r, c);
  return g;
};

describe('depth treatment (their depthFx)', () => {
  it('ramps on a smoothstep from 5% to 90% overlap, and does nothing under 6.5% of the ramp', () => {
    expect(smoothstep(0.05, 0.9, 0.475)).toBeCloseTo(0.5, 6);
    expect(depthWordTreatment(0.05, DEPTH_FX_DEFAULT, 1)).toEqual({ amount: 0 });
    expect(depthWordTreatment(0.1, DEPTH_FX_DEFAULT, 1).amount).toBeLessThan(0.065);
    expect(depthWordTreatment(0.1, DEPTH_FX_DEFAULT, 1).filter).toBeUndefined();
    const half = depthWordTreatment(0.475, DEPTH_FX_DEFAULT, 1);
    expect(half.amount).toBeCloseTo(0.5, 6);
    expect(half.filter).toBe('blur(3.00px) brightness(0.800)');
    expect(half.transform).toBe('scale(0.9700)');
    const full = depthWordTreatment(0.95, DEPTH_FX_DEFAULT, 1920 / 1080);
    expect(full.amount).toBe(1);
    expect(full.filter).toBe(`blur(${(6 * 1920 / 1080).toFixed(2)}px) brightness(0.600)`);
    expect(full.transform).toBe('scale(0.9400)');
  });

  it("Deep Focus's own strengths, and the blur in surface px per 1080 of height", () => {
    expect(depthWordTreatment(1, { blurPx: 7, dim: 0.45, shrink: 0.07 }, depthPxScale(1080))).toEqual({
      amount: 1, filter: 'blur(7.00px) brightness(0.550)', transform: 'scale(0.9300)' });
    expect(depthPxScale(480)).toBeCloseTo(480 / 1080, 9);
    expect(depthPxScale(0)).toBe(1);
  });

  it('samples a rect area-weighted over the cells it crosses; outside the frame counts as clear', () => {
    const solid = gridOf(() => 255);
    expect(sampleGridRect(solid, { x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.3 })).toBeCloseTo(1, 9);
    // the left half of the frame is the subject: a rect straddling the middle is half covered
    const half = gridOf((_, c) => (c < 12 ? 255 : 0));
    expect(sampleGridRect(half, { x0: 0.25, y0: 0.2, x1: 0.75, y1: 0.4 })).toBeCloseTo(0.5, 9);
    // a rect a quarter of a cell into the subject
    expect(sampleGridRect(half, { x0: 0.5 - 1 / 96, y0: 0.2, x1: 0.5 + 3 / 96, y1: 0.4 })).toBeCloseTo(0.25, 9);
    // half the rect hangs outside the frame: that half is clear
    expect(sampleGridRect(solid, { x0: -0.2, y0: 0.2, x1: 0.2, y1: 0.4 })).toBeCloseTo(0.5, 9);
    expect(sampleGridRect(solid, { x0: 1.1, y0: 0.2, x1: 1.4, y1: 0.4 })).toBe(0);
    expect(sampleGridRect(solid, { x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.6 })).toBe(0);
  });

  it('finds the head top as the first row that reaches the threshold, interpolated', () => {
    expect(headTopFromGrid(gridOf(() => 0))).toBeNull();
    // an abrupt subject from row 8: the crossing interpolates halfway into row 7
    expect(headTopFromGrid(gridOf((r) => (r >= 8 ? 255 : 0)))).toBeCloseTo(7.5 / 24, 9);
    // a soft edge: row 7 at 0.25, row 8 at 0.75 -> crossing halfway between
    expect(headTopFromGrid(gridOf((r) => (r === 7 ? 64 : r >= 8 ? 191 : 0)))).toBeCloseTo((7 + (0.5 - 64 / 255) / (191 / 255 - 64 / 255)) / 24, 6);
    expect(headTopFromGrid(gridOf((r, c) => (r === 3 && c === 20 ? 255 : 0)))).toBeCloseTo(2.5 / 24, 9);
  });

  it('downsamples an alpha plane (or the alpha of RGBA) to cell means', () => {
    const w = 48, h = 48;
    const plane = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plane[y * w + x] = x < 24 ? 255 : (x < 25 ? 255 : 0);
    const g = downsampleAlphaGrid(plane, w, h);
    expect(g[0]).toBe(255);
    expect(g[11]).toBe(255);
    expect(g[12]).toBe(128);        // cell 12 spans source x 24..25: one column lit of two
    expect(g[13]).toBe(0);
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = plane[i];
    expect(Array.from(downsampleAlphaGrid(rgba, w, h, 4, 3))).toEqual(Array.from(g));
  });

  it('a track of grids is read by frame, and runs out a quarter second past its end', () => {
    const track = new Uint8Array(DEPTH_GRID_BYTES * 3);
    track.fill(1, 0, DEPTH_GRID_BYTES); track.fill(2, DEPTH_GRID_BYTES, 2 * DEPTH_GRID_BYTES); track.fill(3, 2 * DEPTH_GRID_BYTES);
    expect(depthGridFrame(track, 0)![0]).toBe(1);
    expect(depthGridFrame(track, 1000 / 30)![0]).toBe(2);
    expect(depthGridFrame(track, 3 * 1000 / 30)![0]).toBe(3);         // clamped to the last
    expect(depthGridFrame(track, 9 * 1000 / 30)![0]).toBe(3);         // still inside the grace
    expect(depthGridFrame(track, 11 * 1000 / 30)).toBeNull();
    expect(depthGridFrame(new Uint8Array(0), 0)).toBeNull();
  });

  it('composes onto the inline value React set, and follows a new base', () => {
    let r = composeInline(undefined, 'translateY(2px)', 'scale(0.97)');
    expect(r.next).toBe('translateY(2px) scale(0.97)');
    r = composeInline(r.rec, r.next, 'scale(0.95)');                    // ours still in place
    expect(r.next).toBe('translateY(2px) scale(0.95)');
    r = composeInline(r.rec, 'translateY(0px)', 'scale(0.95)');          // React wrote a new base
    expect(r.next).toBe('translateY(0px) scale(0.95)');
    r = composeInline(r.rec, r.next, undefined);                         // treatment gone: base only
    expect(r.next).toBe('translateY(0px)');
    expect(composeInline(undefined, '', 'scale(0.9)').next).toBe('scale(0.9)');
  });

  it('the eighteen looks their registry gives depthFx carry it; Deep Focus (Hawser) its own', () => {
    const withDepth = LOOK_SPECS.filter((l) => l.depth).map((l) => l.id).sort();
    expect(withDepth).toEqual([
      'look_abbey', 'look_beacon', 'look_belfry', 'look_cloister', 'look_cove', 'look_driftwood', 'look_ellis', 'look_ferrier',
      'look_font', 'look_garnet', 'look_hawser', 'look_ibis', 'look_lintel', 'look_mullion', 'look_underway', 'look_vang',
      'look_windlass', 'look_yawl']);
    for (const l of LOOK_SPECS.filter((x) => x.depth)) expect(l.behindSubject, l.id).toBe(true);
    expect(LOOK_SPECS.find((l) => l.id === 'look_hawser')!.depth).toEqual({ blurPx: 7, dim: 0.45, shrink: 0.07 });
    for (const l of LOOK_SPECS.filter((x) => x.depth && x.id !== 'look_hawser')) expect(l.depth, l.id).toEqual(DEPTH_FX_DEFAULT);
    expect(DEPTH_GRID_W).toBe(24);
  });
});

describe('the grid track for the render routes', () => {
  it('round-trips through base64, and each route reads its frame from it', async () => {
    const { depthTrackFromBase64, depthTrackToBase64 } = await import('./depthLive');
    const track = new Uint8Array(DEPTH_GRID_BYTES * 2);
    track.fill(7, 0, DEPTH_GRID_BYTES); track.fill(200, DEPTH_GRID_BYTES);
    const back = depthTrackFromBase64(depthTrackToBase64(track))!;
    expect(Array.from(back)).toEqual(Array.from(track));
    expect(depthTrackFromBase64(undefined)).toBeNull();
    expect(depthTrackFromBase64('%%%')).toBeNull();
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    for (const rel of ['../../remotion/CaptionExportComposition.tsx', '../../remotion/LambdaCaptionComposition.tsx']) {
      const t = src(rel);
      expect(t, rel).toContain('const depthGrid = depthTrack ? depthGridFrame(depthTrack, currentMs, fps) : null;');
      expect(t, rel).toContain('depthGrid={depthGrid}');
    }
    const page = src('../../app/editor/page.tsx');
    expect((page.match(/depthTrackToBase64\(await buildDepthGridTrack\(subjectMatte\.matte, durationMs\)\)/g) ?? []).length).toBe(2);
    const overlay = src('../../components/editor/CaptionOverlay.tsx');
    expect(overlay).toContain('applyDepthTreatment(root, props.depthGrid ?? currentDepthGrid(), depthFx)');
  });
});
