import { describe, it, expect } from 'vitest';
import { faceBoxFromMasks, faceAt, faceOverSpan, FaceTrackBuilder, type FaceTrack } from './faceTrack';

/** A w×h mask with 1s inside [x0,x1)×[y0,y1). */
function rect(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Float32Array {
  const m = new Float32Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1;
  return m;
}

describe('faceBoxFromMasks', () => {
  it('reads the face skin box and the hair above it, as frame fractions', () => {
    const W = 100, H = 200;
    const face = rect(W, H, 40, 60, 60, 90);     // face skin: x 40-60, y 60-90
    const hair = rect(W, H, 35, 40, 65, 70);     // hair starts higher, at y 40
    const b = faceBoxFromMasks(face, hair, W, H)!;
    expect(b.faceTop).toBeCloseTo(60 / H, 3);
    expect(b.faceBottom).toBeCloseTo(90 / H, 3);
    expect(b.headTop).toBeCloseTo(40 / H, 3);
    expect(b.cx).toBeCloseTo(49.5 / W, 2);
  });

  it('ignores hair that is not above the face', () => {
    const W = 100, H = 200;
    const face = rect(W, H, 40, 60, 60, 90);
    const hair = rect(W, H, 0, 10, 5, 20);       // a dark object in the corner is not the head
    expect(faceBoxFromMasks(face, hair, W, H)!.headTop).toBeCloseTo(60 / H, 3);
  });

  it('returns null when there is too little face to trust', () => {
    const W = 100, H = 100;
    expect(faceBoxFromMasks(rect(W, H, 10, 10, 12, 12), null, W, H)).toBeNull();
    expect(faceBoxFromMasks(new Float32Array(W * H), null, W, H)).toBeNull();
  });

  it('a single stray pixel cannot stretch the box', () => {
    const W = 100, H = 200;
    const face = rect(W, H, 40, 60, 60, 90);
    face[5 * W + 50] = 1;                        // one speck near the top
    expect(faceBoxFromMasks(face, null, W, H)!.faceTop).toBeCloseTo(60 / H, 3);
  });
});

describe('the track', () => {
  const box = (y: number) => ({ cx: 0.5, headTop: y - 0.05, faceTop: y, faceBottom: y + 0.15 });

  it('interpolates between samples', () => {
    const b = new FaceTrackBuilder();
    b.add(0, box(0.2)); b.add(200, box(0.3));
    const f = faceAt(b.build(0), 100)!;
    expect(f.faceTop).toBeCloseTo(0.25, 3);
  });

  it('knows nothing far from any sample', () => {
    const b = new FaceTrackBuilder();
    b.add(0, box(0.2)); b.add(5000, box(0.3));
    const tr = b.build(0);
    expect(faceAt(tr, 2500)).toBeNull();
    expect(faceAt(tr, 9000)).toBeNull();
    expect(faceAt(null, 0)).toBeNull();
  });

  it('smooths a one-frame detection glitch away', () => {
    const b = new FaceTrackBuilder();
    [0.25, 0.25, 0.25, 0.9, 0.25, 0.25, 0.25].forEach((y, i) => b.add(i * 100, box(y)));
    const tr = b.build(2);
    expect(tr.faceTop[3]).toBeCloseTo(0.25, 3);
  });

  it('holds one face for a whole line', () => {
    const tr: FaceTrack = { v: 1, t: [0, 100, 200, 300], cx: [0.5, 0.5, 0.5, 0.5],
      headTop: [0.1, 0.1, 0.1, 0.1], faceTop: [0.2, 0.3, 0.25, 0.26], faceBottom: [0.4, 0.4, 0.4, 0.4] };
    expect(faceOverSpan(tr, 0, 300)!.faceTop).toBeCloseTo(0.26, 3);
  });

  it('serialises as plain JSON, so it can ride in a cloud render', () => {
    const b = new FaceTrackBuilder();
    b.add(0, box(0.2)); b.add(250, box(0.21));
    const tr = b.build();
    expect(JSON.parse(JSON.stringify(tr))).toEqual(tr);
  });
});

describe('shipping the track to a cloud render', () => {
  it('thins to at most maxHz samples a second', async () => {
    const { downsampleFaceTrack } = await import('./faceTrack');
    const n = 300;                                   // 30fps for 10s
    const tr: FaceTrack = { v: 1, t: Array.from({ length: n }, (_, i) => Math.round(i * 1000 / 30)),
      cx: Array(n).fill(0.5), headTop: Array(n).fill(0.2), faceTop: Array(n).fill(0.25), faceBottom: Array(n).fill(0.4) };
    const d = downsampleFaceTrack(tr, 6)!;
    expect(d.t.length).toBeLessThanOrEqual(61);
    expect(d.t.length).toBeGreaterThanOrEqual(50);
    expect(downsampleFaceTrack(null)).toBeUndefined();
  });

  it('the render route validates it, bounded and consistent', async () => {
    const { renderBodySchema } = await import('../apiSchemas');
    const base = { width: 1080, height: 1920, durationMs: 1000 };
    const good: FaceTrack = { v: 1, t: [0, 200], cx: [0.5, 0.5], headTop: [0.2, 0.2], faceTop: [0.25, 0.25], faceBottom: [0.4, 0.4] };
    expect(renderBodySchema.safeParse({ ...base, faceTrack: good }).success).toBe(true);
    expect(renderBodySchema.safeParse({ ...base, faceTrack: null }).success).toBe(true);
    expect(renderBodySchema.safeParse({ ...base, faceTrack: { ...good, cx: [0.5] } }).success).toBe(false);
    expect(renderBodySchema.safeParse({ ...base, faceTrack: { ...good, faceTop: [0.25, 9] } }).success).toBe(false);
    expect(renderBodySchema.safeParse({ ...base, faceTrack: 'x' }).success).toBe(false);
    const huge = 6 * 3600 * 6 + 10;
    expect(renderBodySchema.safeParse({ ...base, faceTrack: { v: 1, t: Array(huge).fill(0), cx: Array(huge).fill(0.5),
      headTop: Array(huge).fill(0.2), faceTop: Array(huge).fill(0.2), faceBottom: Array(huge).fill(0.4) } }).success).toBe(false);
  });
});
