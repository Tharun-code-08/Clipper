'use client';

// "Behind the subject" — client-side subject cut-out (matte) generation.
//
// Produces per-frame cut-outs of the person (transparent elsewhere) for the behind-subject caption
// windows, then exposes them as decode-on-demand ImageBitmaps. A canvas overlay in BOTH the live
// preview and the Element-Capture export draws the cut-out for the current frame ON TOP of the
// captions, so the text reads as behind the person. preview ≡ export by construction.
//
// Why no matte VIDEO: encoding a transparent video in-browser is not reliable — WebCodecs can't
// encode alpha ("Alpha encoding is not currently supported"), ffmpeg.wasm OOMs on real clips, and
// MediaRecorder dropped/empty-encoded frames. So we keep the per-frame cut-outs (cheap, alpha WebP)
// and blit them directly — no video container at all.
//
// Mask: MediaPipe ImageSegmenter (WASM/GPU, self-hosted from /public/mediapipe), seeked per frame.
// Heavy deps are dynamically imported so they never hit SSR or the CEP bundle.

import type { TranscriptWord, LineOverride } from '@/types/transcript';
import { segmentKeyOf } from '@/lib/captionSegments';

const WASM_BASE  = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/selfie_multiclass_256x256.tflite';

export interface MatteWindow { startMs: number; endMs: number }

/** Pad, sort and merge raw caption spans into non-overlapping cut-out windows. */
function mergeWindows(raw: MatteWindow[]): MatteWindow[] {
  raw.sort((a, b) => a.startMs - b.startMs);
  const merged: MatteWindow[] = [];
  for (const w of raw) {
    const last = merged[merged.length - 1];
    if (last && w.startMs <= last.endMs) last.endMs = Math.max(last.endMs, w.endMs);
    else merged.push({ ...w });
  }
  return merged;
}

/**
 * Merged time windows that need a subject cut-out: spans of every caption whose `behindSubject`
 * override is on, padded + merged. PURE + unit-tested.
 */
export function subjectMatteWindows(
  segments:      string[][] | null | undefined,
  words:         TranscriptWord[],
  lineOverrides: Record<string, LineOverride>,
  padMs = 120,
): MatteWindow[] {
  if (!segments?.length || !words.length) return [];
  const map = new Map(words.map(w => [w.id, w]));
  const raw: MatteWindow[] = [];
  for (const seg of segments) {
    if (!seg?.length) continue;
    if (!lineOverrides[segmentKeyOf(seg)]?.behindSubject) continue;
    const sw = seg.map(id => map.get(id)).filter((w): w is TranscriptWord => !!w);
    if (!sw.length) continue;
    raw.push({ startMs: Math.max(0, sw[0].startMs - padMs), endMs: sw[sw.length - 1].endMs + padMs });
  }
  return mergeWindows(raw);
}

/**
 * Cut-out windows for EVERY caption (the whole video wherever captions exist), padded + merged.
 * Used by the "Big Reveal" template, which cuts the subject out across all captions rather than
 * only the ones a user flagged. PURE + unit-tested.
 */
export function allCaptionWindows(
  segments: string[][] | null | undefined,
  words:    TranscriptWord[],
  padMs = 120,
): MatteWindow[] {
  if (!segments?.length || !words.length) return [];
  const map = new Map(words.map(w => [w.id, w]));
  const raw: MatteWindow[] = [];
  for (const seg of segments) {
    if (!seg?.length) continue;
    const sw = seg.map(id => map.get(id)).filter((w): w is TranscriptWord => !!w);
    if (!sw.length) continue;
    raw.push({ startMs: Math.max(0, sw[0].startMs - padMs), endMs: sw[sw.length - 1].endMs + padMs });
  }
  return mergeWindows(raw);
}

/** Stable signature for cache reuse/invalidation (source + fps + windows). */
export function matteSourceSig(sourceSig: string, fps: number, windows: MatteWindow[]): string {
  const w = windows.map(x => `${Math.round(x.startMs)}-${Math.round(x.endMs)}`).join(',');
  return `${sourceSig}|fps${Math.round(fps * 100) / 100}|${w}`;
}

/** Capability gate: WASM (MediaPipe) + OffscreenCanvas + DOM. No video encoder needed anymore. */
export function canGenerateMatte(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof WebAssembly !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof createImageBitmap === 'function'
    && typeof document !== 'undefined';
}

export async function isMatteSupported(): Promise<boolean> { return canGenerateMatte(); }

/**
 * The generated cut-out set: per-frame alpha WebP blobs keyed by frame index, decoded to
 * ImageBitmaps on demand (with a small cache around the playhead so it stays light).
 */
export class SubjectMatte {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly frameDurMs: number;
  private blobs: Map<number, Blob>;
  private cache = new Map<number, ImageBitmap>();
  private decoding = new Set<number>();
  private onDecoded?: () => void;

  constructor(blobs: Map<number, Blob>, fps: number, width: number, height: number) {
    this.blobs = blobs; this.fps = fps; this.frameDurMs = 1000 / fps; this.width = width; this.height = height;
  }
  get frameCount(): number { return this.blobs.size; }
  /**
   * Pack the matte into ONE blob for upload to the RunPod worker (which composites the cut-out over
   * the cloud render — making behind-subject export work on every device, not just desktop Chrome).
   * Layout: [4-byte LE manifest length][manifest JSON][concatenated WebP bytes, in frame order].
   * Manifest = { v, fps, width, height, frames:[{idx,len}] }. Mirror of the worker's parser.
   */
  async serialize(clearBelowFrac?: number): Promise<Blob> {
    // `clearBelowFrac` (Big Reveal): erase the subject from the band BELOW this fraction of the
    // frame height, so the box's cut-out overlay does NOT cover the lower caption — it must read in
    // FRONT of the person (the cloud render can't layer the caption above the matte the way the
    // preview does, so we bake the "hole" into the matte pack instead). Undefined = full cut-out.
    const clip = (clearBelowFrac != null && clearBelowFrac > 0 && clearBelowFrac < 1) ? clearBelowFrac : null;
    const idxs = [...this.blobs.keys()].sort((a, b) => a - b);
    const bufs: ArrayBuffer[] = [];
    const frames: { idx: number; len: number }[] = [];
    for (const i of idxs) {
      // Re-encode each cut-out webp → PNG: the worker composites a PNG sequence (ffmpeg's webp alpha
      // decode is unreliable across builds; PNG alpha is rock-solid). The browser's webp decoder is
      // correct, so this round-trip preserves the cut-out + its transparency exactly.
      const bmp = await createImageBitmap(this.blobs.get(i)!);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const cx = c.getContext('2d')!;
      cx.drawImage(bmp, 0, 0);
      bmp.close?.();
      if (clip != null) {
        const y = Math.round(clip * c.height);
        cx.clearRect(0, y, c.width, c.height - y);   // drop the subject below the lower caption
      }
      const ab = await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer();
      bufs.push(ab);
      frames.push({ idx: i, len: ab.byteLength });
    }
    const manifest = new TextEncoder().encode(JSON.stringify({ v: 1, fps: this.fps, width: this.width, height: this.height, frames }));
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, manifest.byteLength, true);
    return new Blob([header, manifest, ...bufs], { type: 'application/octet-stream' });
  }
  /** Register a callback fired when a frame finishes decoding (so the preview can repaint). */
  setOnDecoded(cb?: () => void) { this.onDecoded = cb; }
  private idxFor(tMs: number): number { return Math.round(tMs / this.frameDurMs); }
  /** True if a cut-out exists at this time (i.e. inside a behind-subject window). */
  has(tMs: number): boolean { return this.blobs.has(this.idxFor(tMs)); }
  /** Synchronous: the decoded cut-out for tMs if already cached, else null. */
  peek(tMs: number): ImageBitmap | null { return this.cache.get(this.idxFor(tMs)) ?? null; }
  /** Decode the exact frame for tMs (awaitable) — used by the export's sequential loop. */
  async getFrame(tMs: number): Promise<ImageBitmap | null> {
    const i = this.idxFor(tMs);
    await this.decodeIdx(i);
    return this.cache.get(i) ?? null;
  }
  /** Decode a small window around tMs + evict far frames — keeps the preview smooth and bounded. */
  async warm(tMs: number, radius = 2): Promise<void> {
    const i = this.idxFor(tMs);
    for (const k of [...this.cache.keys()]) if (Math.abs(k - i) > radius + 6) { this.cache.get(k)!.close(); this.cache.delete(k); }
    for (let k = i - radius; k <= i + radius; k++) await this.decodeIdx(k);
  }
  private async decodeIdx(idx: number): Promise<void> {
    if (this.cache.has(idx) || this.decoding.has(idx)) return;
    const b = this.blobs.get(idx); if (!b) return;
    this.decoding.add(idx);
    try { const bmp = await createImageBitmap(b); this.cache.set(idx, bmp); this.onDecoded?.(); }
    catch { /* skip bad frame */ }
    finally { this.decoding.delete(idx); }
  }
  close() { for (const b of this.cache.values()) { try { b.close(); } catch {} } this.cache.clear(); this.blobs.clear(); this.onDecoded = undefined; }
}

// ── confidence mask → alpha (shared by the per-frame matte and the single-frame cover cut-out) ──

/** Soft edge: confidence ≤ LO is fully transparent, ≥ HI fully opaque, linear in between. */
export const MATTE_RAMP_LO = 0.30;
export const MATTE_RAMP_HI = 0.70;

/**
 * Subject alpha (0..1) from one mask sample. The multiclass selfie model's mask[0] is BACKGROUND
 * confidence, so subject = 1 − it; a single-class model's mask already is the subject. PURE.
 */
export function confidenceToAlpha(c: number, multiclass: boolean): number {
  const a = multiclass ? 1 - c : c;
  return a <= MATTE_RAMP_LO ? 0 : a >= MATTE_RAMP_HI ? 1 : (a - MATTE_RAMP_LO) / (MATTE_RAMP_HI - MATTE_RAMP_LO);
}

/** White RGBA bytes whose alpha is the subject mask. PURE (no canvas). */
export function maskAlphaBytes(data: ArrayLike<number>, multiclass: boolean, out?: Uint8ClampedArray): Uint8ClampedArray {
  const px = out && out.length === data.length * 4 ? out : new Uint8ClampedArray(data.length * 4);
  for (let i = 0; i < data.length; i++) {
    const o = i * 4;
    px[o] = 255; px[o + 1] = 255; px[o + 2] = 255;
    px[o + 3] = Math.round(confidenceToAlpha(data[i], multiclass) * 255);
  }
  return px;
}

/** Fraction of pixels whose alpha is ≥ `threshold` (0..255). PURE. */
export function alphaCoverage(rgba: ArrayLike<number>, threshold = 128): number {
  const n = Math.floor(rgba.length / 4);
  if (!n) return 0;
  let hit = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] >= threshold) hit++;
  return hit / n;
}

/** Structural subset of MediaPipe's MPMask that the compositor reads. */
export interface ConfidenceMaskLike { width: number; height: number; getAsFloat32Array(): Float32Array }

export interface MaskScratch { canvas: OffscreenCanvas | null; ctx: OffscreenCanvasRenderingContext2D | null }
export const newMaskScratch = (): MaskScratch => ({ canvas: null, ctx: null });

/**
 * Keep only the subject on `ctx` (which already holds the frame, `outW`×`outH`): builds the alpha
 * mask from the confidence masks and composites it `destination-in`. With NO mask the frame is
 * cleared, so an opaque frame is never baked as a "cut-out". Returns the mask's subject coverage
 * (0..1) so callers can tell an empty cut-out from a real one. The caller still owns
 * `result.close()`.
 */
export function applyConfidenceMask(
  ctx:     OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  masks:   readonly ConfidenceMaskLike[] | undefined,
  outW:    number,
  outH:    number,
  scratch: MaskScratch,
): number {
  if (!masks || !masks.length) { ctx.clearRect(0, 0, outW, outH); return 0; }
  const bg = masks[0]; const mw = bg.width, mh = bg.height;
  if (!scratch.canvas || scratch.canvas.width !== mw || scratch.canvas.height !== mh) {
    scratch.canvas = new OffscreenCanvas(mw, mh);
    scratch.ctx = scratch.canvas.getContext('2d', { alpha: true }) as OffscreenCanvasRenderingContext2D;
  }
  const img = scratch.ctx!.createImageData(mw, mh);
  maskAlphaBytes(bg.getAsFloat32Array(), masks.length > 1, img.data);
  scratch.ctx!.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scratch.canvas, 0, 0, outW, outH);
  ctx.restore();
  return alphaCoverage(img.data);
}

// ── single-frame cut-out (covers) ──────────────────────────────────────────

export type StillCutoutFailure = 'unsupported' | 'load_failed' | 'segment_failed' | 'no_subject';

export class StillCutoutError extends Error {
  readonly reason: StillCutoutFailure;
  constructor(reason: StillCutoutFailure, message?: string) {
    super(message ?? reason);
    this.name = 'StillCutoutError';
    this.reason = reason;
  }
}

type Segmenter = import('@mediapipe/tasks-vision').ImageSegmenter;
type Delegate = 'GPU' | 'CPU';
const stillSegmenters: Partial<Record<Delegate, Promise<Segmenter>>> = {};

/** Lazily create (once per delegate) an IMAGE-mode segmenter — `segment()` refuses VIDEO mode. */
function stillSegmenter(delegate: Delegate): Promise<Segmenter> {
  let p = stillSegmenters[delegate];
  if (!p) {
    p = (async () => {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      return vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true,
      });
    })();
    stillSegmenters[delegate] = p;
    // A failed load must not poison the cache — the next tap retries.
    p.catch(() => { if (stillSegmenters[delegate] === p) delete stillSegmenters[delegate]; });
  }
  return p;
}

/** Release the cached still segmenters (GPU context + wasm heap). Safe to call anytime. */
export function disposeStillSegmenter(): void {
  for (const d of ['GPU', 'CPU'] as const) {
    const p = stillSegmenters[d];
    delete stillSegmenters[d];
    p?.then(s => { try { s.close(); } catch { /* noop */ } }).catch(() => {});
  }
}

/**
 * Cut the subject out of ONE captured frame. Returns a canvas the size of `source` holding the frame's
 * pixels with everything but the person transparent — segmenting the captured canvas (not the live
 * video) guarantees frame and mask pixels match.
 *
 * Unlike the per-frame matte (which swallows segmenter exceptions into an empty frame), an empty
 * result here is an ERROR: GPU first, then one CPU retry (the GPU delegate can fail to create or return
 * an empty mask on some drivers), then a typed StillCutoutError the UI can explain.
 */
export async function segmentStill(
  source: HTMLCanvasElement,
  opts: { minCoverage?: number } = {},
): Promise<HTMLCanvasElement> {
  if (!canGenerateMatte()) throw new StillCutoutError('unsupported');
  const w = source.width, h = source.height;
  if (!w || !h) throw new StillCutoutError('segment_failed', 'empty-source');
  const minCoverage = opts.minCoverage ?? 0.005;
  const scratch = newMaskScratch();

  const attempt = async (delegate: Delegate): Promise<HTMLCanvasElement> => {
    let seg: Segmenter;
    try { seg = await stillSegmenter(delegate); }
    catch (e) { throw new StillCutoutError('load_failed', e instanceof Error ? e.message : String(e)); }
    let result: import('@mediapipe/tasks-vision').ImageSegmenterResult | undefined;
    try { result = seg.segment(source); }
    catch (e) { throw new StillCutoutError('segment_failed', e instanceof Error ? e.message : String(e)); }
    try {
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const ctx = out.getContext('2d');
      if (!ctx) throw new StillCutoutError('segment_failed', 'canvas-unavailable');
      ctx.drawImage(source, 0, 0, w, h);
      const coverage = applyConfidenceMask(ctx, result?.confidenceMasks, w, h, scratch);
      if (coverage < minCoverage) throw new StillCutoutError('no_subject');
      return out;
    } finally {
      result?.close?.();
    }
  };

  try {
    return await attempt('GPU');
  } catch (gpuErr) {
    try {
      return await attempt('CPU');
    } catch (cpuErr) {
      // Prefer the more informative reason: a real "no person" beats a GPU load failure.
      const a = gpuErr instanceof StillCutoutError ? gpuErr : null;
      const b = cpuErr instanceof StillCutoutError ? cpuErr : null;
      if (b?.reason === 'no_subject' || a?.reason === 'no_subject') throw new StillCutoutError('no_subject');
      throw b ?? a ?? new StillCutoutError('segment_failed', String(cpuErr));
    }
  }
}

export interface GenerateMatteOptions {
  videoSrc:   string;
  fps:        number;
  durationMs: number;
  windows:    MatteWindow[];
  maxDim?:    number;       // longer side cap; aspect preserved. Default 1080.
  onProgress?: (p: number) => void;
  signal?:    AbortSignal;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Generate the subject cut-outs for the given windows. Returns a SubjectMatte (per-frame alpha
 * WebP blobs). Frame-accurate: frame i corresponds to t = i/fps.
 */
export async function generateSubjectMatte(opts: GenerateMatteOptions): Promise<SubjectMatte> {
  const { videoSrc, fps, durationMs, windows, maxDim = 1080, onProgress, signal } = opts;
  if (!canGenerateMatte()) throw new Error('matte-unsupported');
  const throwIfAborted = () => { if (signal?.aborted) throw new DOMException('aborted', 'AbortError'); };

  const video = document.createElement('video');
  video.src = videoSrc; video.muted = true; video.preload = 'auto'; video.playsInline = true;
  await new Promise<void>((res, rej) => {
    const ok = () => { cleanup(); res(); }; const no = () => { cleanup(); rej(new Error('matte-video-load-failed')); };
    const cleanup = () => { video.removeEventListener('loadeddata', ok); video.removeEventListener('error', no); };
    video.addEventListener('loadeddata', ok); video.addEventListener('error', no);
  });

  const srcW = video.videoWidth || 1280, srcH = video.videoHeight || 720;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const outW = even(srcW * scale), outH = even(srcH * scale);

  const vision = await import('@mediapipe/tasks-vision');
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  const makeSeg = (delegate: 'GPU' | 'CPU') => vision.ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
  });
  let segmenter: import('@mediapipe/tasks-vision').ImageSegmenter | null;
  try { segmenter = await makeSeg('GPU'); } catch { segmenter = await makeSeg('CPU'); }

  const frame = new OffscreenCanvas(outW, outH);
  const fctx = frame.getContext('2d', { alpha: true }) as OffscreenCanvasRenderingContext2D;
  const scratch = newMaskScratch();

  const frameDurMs = 1000 / fps;
  const lastEnd = windows.length ? windows[windows.length - 1].endMs : 0;
  const endMs = Math.min(durationMs, lastEnd + frameDurMs);
  const totalFrames = Math.max(1, Math.ceil((endMs / 1000) * fps));
  const inWindow = (ms: number) => windows.some(w => ms >= w.startMs && ms <= w.endMs);

  const seekTo = (tSec: number) => new Promise<void>((res) => {
    const t = Math.min(tSec, Math.max(0, (video.duration || tSec + 1) - 1e-3));
    const done = () => { video.removeEventListener('seeked', done); res(); };
    video.addEventListener('seeked', done);
    try { video.currentTime = t; } catch { video.removeEventListener('seeked', done); res(); }
  });

  let segTs = 0;
  const composite = () => {
    fctx.globalCompositeOperation = 'source-over';
    fctx.imageSmoothingEnabled = true;
    fctx.clearRect(0, 0, outW, outH);
    fctx.drawImage(video, 0, 0, outW, outH);
    segTs += Math.max(1, Math.round(frameDurMs));
    let result: import('@mediapipe/tasks-vision').ImageSegmenterResult | undefined;
    try { result = segmenter?.segmentForVideo(video, segTs); } catch { result = undefined; }
    // No mask → no subject this frame; applyConfidenceMask clears the drawn video so we never bake
    // an opaque frame.
    try { applyConfidenceMask(fctx, result?.confidenceMasks, outW, outH, scratch); }
    finally { result?.close?.(); }
  };

  // Yield a frame back to the browser so the editor's playback/overlay RAF and paints can run
  // between cut-out frames. Whole-video mattes (Big Reveal) generate thousands of frames; without
  // this the seek+segment burst monopolises the main thread and the preview visibly stutters.
  const yieldToBrowser = () => new Promise<void>((res) => {
    let done = false;
    const finish = () => { if (!done) { done = true; res(); } };
    // rAF (foreground) lets a paint happen between frames; the setTimeout fallback keeps generation
    // progressing when the tab is hidden (rAF is paused there) instead of stalling.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    setTimeout(finish, 32);
  });

  const blobs = new Map<number, Blob>();
  try {
    for (let i = 0; i < totalFrames; i++) {
      throwIfAborted();
      const tMs = i * frameDurMs;
      if (inWindow(tMs)) {
        await seekTo(tMs / 1000);
        composite();
        // alpha WebP: ~5× smaller than PNG, so a whole window of frames stays light in memory.
        const blob = await frame.convertToBlob({ type: 'image/webp', quality: 0.9 });
        if (blob && blob.size > 0) blobs.set(i, blob);
        await yieldToBrowser();   // keep the editor responsive during a long whole-video pass
      }
      onProgress?.((i + 1) / totalFrames);
    }
  } finally {
    try { segmenter?.close(); } catch { /* noop */ }
    segmenter = null;
    video.removeAttribute('src');
    try { video.load(); } catch { /* noop */ }
  }

  onProgress?.(1);
  return new SubjectMatte(blobs, fps, outW, outH);
}
