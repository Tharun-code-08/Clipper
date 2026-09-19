// Depth treatment: a word behind the subject goes soft, dark and a touch smaller by how much of it
// the person covers — their depthFx, read from the public depth chunk their site ships and seen on
// their footage (Deep Focus's "FEEL" and Butter's "make" behind the head). The subject is sampled
// as a 24x24 grid of alpha (0-255) over the SOURCE frame, one grid per video frame; a word's
// overlap is the mean alpha under its box, and the treatment ramps on a smoothstep from 5% to 90%:
//
//   blur = blurPx * a * (surfaceHeight / 1080)     brightness = 1 - dim * a     scale = 1 - shrink * a
//
// Pure: the preview and the Element Capture export share it; a render route with a grid track
// could too.

export const DEPTH_GRID_W = 24;
export const DEPTH_GRID_H = 24;
export const DEPTH_GRID_BYTES = DEPTH_GRID_W * DEPTH_GRID_H;

export interface DepthFx { blurPx: number; dim: number; shrink: number }
/** Their `P`: what every depthFx design but Deep Focus declares. */
export const DEPTH_FX_DEFAULT: DepthFx = { blurPx: 6, dim: 0.4, shrink: 0.06 };

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Blur in their surface px per 1080 of height. */
export const depthPxScale = (surfaceHeightPx: number): number => (surfaceHeightPx > 0 ? surfaceHeightPx / 1080 : 1);

export interface DepthTreatment { amount: number; filter?: string; transform?: string }

export function depthWordTreatment(overlap: number, fx: DepthFx, pxScale: number): DepthTreatment {
  const a = smoothstep(0.05, 0.9, overlap);
  if (a < 0.065) return { amount: 0 };
  const blur = fx.blurPx * a * pxScale;
  const brightness = 1 - fx.dim * a;
  const scale = 1 - fx.shrink * a;
  return { amount: a, filter: `blur(${blur.toFixed(2)}px) brightness(${brightness.toFixed(3)})`, transform: `scale(${scale.toFixed(4)})` };
}

/** Mean alpha per cell of a w x h alpha plane (or the alpha channel of RGBA with stride 4, offset 3). */
export function downsampleAlphaGrid(
  src: ArrayLike<number>, w: number, h: number, stride = 1, offset = 0, out?: Uint8Array,
): Uint8Array {
  const grid = out && out.length === DEPTH_GRID_BYTES ? out : new Uint8Array(DEPTH_GRID_BYTES);
  const sums = new Float64Array(DEPTH_GRID_BYTES);
  const counts = new Float64Array(DEPTH_GRID_BYTES);
  for (let y = 0; y < h; y++) {
    const row = DEPTH_GRID_W * Math.min(DEPTH_GRID_H - 1, Math.floor((DEPTH_GRID_H * y) / h));
    const base = y * w;
    for (let x = 0; x < w; x++) {
      const cell = row + Math.min(DEPTH_GRID_W - 1, Math.floor((DEPTH_GRID_W * x) / w));
      sums[cell] += src[(base + x) * stride + offset];
      counts[cell] += 1;
    }
  }
  for (let i = 0; i < DEPTH_GRID_BYTES; i++) grid[i] = counts[i] > 0 ? Math.round(sums[i] / counts[i]) : 0;
  return grid;
}

export interface NormRect { x0: number; y0: number; x1: number; y1: number }

/** The subject's mean alpha (0..1) under a rect given in fractions of the frame: area-weighted over
 *  the cells it crosses, with the part of the rect outside the frame counting as clear. */
export function sampleGridRect(grid: ArrayLike<number>, rect: NormRect): number {
  const x0 = DEPTH_GRID_W * Math.max(0, rect.x0), x1 = DEPTH_GRID_W * Math.min(1, rect.x1);
  const y0 = DEPTH_GRID_H * Math.max(0, rect.y0), y1 = DEPTH_GRID_H * Math.min(1, rect.y1);
  if (x1 <= x0 || y1 <= y0) return 0;
  let sum = 0, area = 0;
  const r0 = Math.floor(y0), r1 = Math.min(DEPTH_GRID_H - 1, Math.ceil(y1) - 1);
  const c0 = Math.floor(x0), c1 = Math.min(DEPTH_GRID_W - 1, Math.ceil(x1) - 1);
  for (let r = r0; r <= r1; r++) {
    const dy = Math.min(r + 1, y1) - Math.max(r, y0);
    if (dy <= 0) continue;
    for (let c = c0; c <= c1; c++) {
      const dx = Math.min(c + 1, x1) - Math.max(c, x0);
      if (dx <= 0) continue;
      sum += grid[DEPTH_GRID_W * r + c] * dx * dy;
      area += dx * dy;
    }
  }
  const full = Math.max(area, (rect.x1 - rect.x0) * DEPTH_GRID_W * ((rect.y1 - rect.y0) * DEPTH_GRID_H));
  return full > 0 ? sum / 255 / full : 0;
}

/** Where the subject's top is, as a fraction of the frame height: the first grid row whose peak
 *  alpha reaches `threshold`, interpolated against the row above. Null when no row does. */
export function headTopFromGrid(grid: ArrayLike<number>, threshold = 0.5): number | null {
  let prev = 0;
  for (let r = 0; r < DEPTH_GRID_H; r++) {
    let peak = 0;
    const base = DEPTH_GRID_W * r;
    for (let c = 0; c < DEPTH_GRID_W; c++) if (grid[base + c] > peak) peak = grid[base + c];
    const o = peak / 255;
    if (o >= threshold) {
      const rise = o - prev;
      const f = rise > 1e-6 ? (threshold - prev) / rise : 0;
      return Math.max(0, r - 1 + Math.min(1, Math.max(0, f))) / DEPTH_GRID_H;
    }
    prev = o;
  }
  return null;
}

/** The grid for a moment of a track of consecutive per-frame grids; null once the track has run
 *  out by more than a quarter second. */
export function depthGridFrame(track: Uint8Array, tMs: number, fps = 30): Uint8Array | null {
  const n = Math.floor(track.length / DEPTH_GRID_BYTES);
  const at = Math.round((tMs / 1000) * fps);
  if (n === 0 || at >= n + Math.round(fps / 4)) return null;
  const i = Math.max(0, Math.min(n - 1, at));
  return track.subarray(DEPTH_GRID_BYTES * i, DEPTH_GRID_BYTES * (i + 1));
}

/** Compose a treatment value onto the inline value React set, remembering what was ours: a value
 *  that is not the last one we wrote is a new base from a render (an entrance transform, say),
 *  and the treatment is appended to it rather than replacing it. Pure over the record. */
export interface ComposeRec { base: string; applied: string }
export function composeInline(rec: ComposeRec | undefined, current: string, add: string | undefined): { next: string; rec: ComposeRec } {
  const base = rec && current === rec.applied ? rec.base : current;
  const next = add ? (base ? `${base} ${add}` : add) : base;
  return { next, rec: { base, applied: next } };
}
