// The live subject grid, and the DOM side of the depth treatment (see depth.ts for the maths).
//
// Whoever draws the cut-out for a frame — the preview's VideoCanvas, the Element Capture export's
// frame loop — publishes that frame's 24x24 alpha grid here; every mounted overlay that carries a
// depth look on a behind layer applies the treatment to its words, imperatively, so a new frame
// costs no React render. A word's box is read from the DOM and normalised against the overlay's
// own box (which is the frame), so it holds under any preview scale.
import { DEPTH_GRID_BYTES, composeInline, depthPxScale, depthWordTreatment, downsampleAlphaGrid, sampleGridRect, type ComposeRec, type DepthFx } from './depth';
import type { SubjectMatte } from '@/lib/matte/subjectMatte';

const live = { grid: null as Uint8Array | null, subs: new Set<() => void>() };

export function publishDepthGrid(grid: Uint8Array | null): void {
  live.grid = grid;
  for (const cb of live.subs) cb();
}
export const currentDepthGrid = (): Uint8Array | null => live.grid;
export function subscribeDepthGrid(cb: () => void): () => void {
  live.subs.add(cb);
  return () => { live.subs.delete(cb); };
}

// The grid from a cut-out bitmap: drawn at 96x96 (the browser's box filter) and averaged 4x4 into
// the cells, so a cell is the mean alpha of its patch as their downsample defines it.
const MID = 96;
let scratch: { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; grid: Uint8Array } | null | undefined;
export function depthGridFromBitmap(bmp: CanvasImageSource): Uint8Array | null {
  if (scratch === undefined) {
    if (typeof document === 'undefined') scratch = null;
    else {
      const cv = document.createElement('canvas');
      cv.width = MID; cv.height = MID;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      scratch = ctx ? { cv, ctx, grid: new Uint8Array(DEPTH_GRID_BYTES) } : null;
    }
  }
  if (!scratch) return null;
  const { ctx, grid } = scratch;
  ctx.clearRect(0, 0, MID, MID);
  ctx.drawImage(bmp, 0, 0, MID, MID);
  const data = ctx.getImageData(0, 0, MID, MID).data;
  // a fresh array each frame: subscribers may hold the previous one
  return downsampleAlphaGrid(data, MID, MID, 4, 3, new Uint8Array(grid.length));
}

const recs = new WeakMap<Element, { transform?: ComposeRec; filter?: ComposeRec }>();

/** Treat every [data-depth] word under `root` for the given grid (null: no subject, every word
 *  restored). Reads each word's box before writing, so a treatment never feeds its own sample. */
export function applyDepthTreatment(root: HTMLElement, grid: Uint8Array | null, fx: DepthFx): void {
  const words = root.querySelectorAll<HTMLElement>('[data-depth]');
  if (!words.length) return;
  const rr = root.getBoundingClientRect();
  if (rr.width <= 0 || rr.height <= 0) return;
  const pxScale = depthPxScale(root.offsetHeight);
  const boxes = Array.from(words, (el) => {
    const r = el.getBoundingClientRect();
    return { el, rect: { x0: (r.left - rr.left) / rr.width, y0: (r.top - rr.top) / rr.height, x1: (r.right - rr.left) / rr.width, y1: (r.bottom - rr.top) / rr.height } };
  });
  for (const { el, rect } of boxes) {
    const overlap = grid ? sampleGridRect(grid, rect) : 0;
    const t = depthWordTreatment(overlap, fx, pxScale);
    const rec = recs.get(el) ?? {};
    const tr = composeInline(rec.transform, el.style.transform, t.transform);
    if (tr.next !== el.style.transform) el.style.transform = tr.next;
    const fl = composeInline(rec.filter, el.style.filter, t.filter);
    if (fl.next !== el.style.filter) el.style.filter = fl.next;
    recs.set(el, { transform: tr.rec, filter: fl.rec });
  }
}

// ── a grid track for the render routes, which draw no cut-out of their own ──────────────────
// Every frame's grid in one buffer (DEPTH_GRID_BYTES each, frames without a cut-out zero), built
// from the matte in the browser before a cloud render is submitted, carried as base64 in the
// composition's props, and read back per frame with depthGridFrame(). A 60s clip at 30fps is a
// megabyte: the same order as the face track's arrays, and far under what the routes carry.

export async function buildDepthGridTrack(matte: SubjectMatte, durationMs: number): Promise<Uint8Array> {
  const frames = Math.max(1, Math.ceil(durationMs / matte.frameDurMs));
  const track = new Uint8Array(frames * DEPTH_GRID_BYTES);
  for (let i = 0; i < frames; i++) {
    const tMs = i * matte.frameDurMs;
    if (!matte.has(tMs)) continue;
    const bmp = await matte.getFrame(tMs);
    const grid = bmp ? depthGridFromBitmap(bmp) : null;
    if (grid) track.set(grid, i * DEPTH_GRID_BYTES);
    await matte.warm(tMs, 0);   // evicts the frames well behind: a whole clip decoded at once would not fit
  }
  return track;
}

export function depthTrackToBase64(track: Uint8Array): string {
  let s = '';
  for (let i = 0; i < track.length; i += 0x8000) s += String.fromCharCode(...track.subarray(i, i + 0x8000));
  return btoa(s);
}

export function depthTrackFromBase64(b64: string | null | undefined): Uint8Array | null {
  if (!b64) return null;
  try {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch { return null; }
}
