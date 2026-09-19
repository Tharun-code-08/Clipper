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
import { FaceTrackBuilder, faceBoxFromMasks, EMPTY_FACE_TRACK, type FaceTrack } from './faceTrack';

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

/** Stable signature for cache reuse/invalidation (source + fps + windows [+ face-only windows]). */
export function matteSourceSig(sourceSig: string, fps: number, windows: MatteWindow[], faceWindows: MatteWindow[] = []): string {
  const fmt = (ws: MatteWindow[]) => ws.map(x => `${Math.round(x.startMs)}-${Math.round(x.endMs)}`).join(',');
  const base = `${sourceSig}|fps${Math.round(fps * 100) / 100}|${fmt(windows)}`;
  return faceWindows.length ? `${base}|face:${fmt(faceWindows)}` : base;
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

  /** Where the speaker's face is, from the same model pass (see faceTrack.ts). Plain data, so the
   *  cloud and in-browser exports can carry it as props. */
  readonly faceTrack: FaceTrack;

  constructor(blobs: Map<number, Blob>, fps: number, width: number, height: number, faceTrack: FaceTrack = EMPTY_FACE_TRACK) {
    this.blobs = blobs; this.fps = fps; this.frameDurMs = 1000 / fps; this.width = width; this.height = height;
    this.faceTrack = faceTrack;
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

export interface GenerateMatteOptions {
  videoSrc:   string;
  fps:        number;
  durationMs: number;
  windows:    MatteWindow[];
  maxDim?:    number;       // longer side cap; aspect preserved. Default 1080.
  /** Windows that need only the FACE position, not a cut-out — lines of a face-anchored look that
   *  are not behind the subject. Sampled at `faceFps`; no cut-out is encoded for them. */
  faceWindows?: MatteWindow[];
  faceFps?:   number;
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
  const faceWindows = opts.faceWindows ?? [];
  const faceEvery = Math.max(1, Math.round(fps / Math.max(1, opts.faceFps ?? 6)));
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
  let maskCanvas: OffscreenCanvas | null = null;
  let mctx: OffscreenCanvasRenderingContext2D | null = null;

  const frameDurMs = 1000 / fps;
  const lastEnd = Math.max(windows.length ? windows[windows.length - 1].endMs : 0,
                           faceWindows.length ? faceWindows[faceWindows.length - 1].endMs : 0);
  const endMs = Math.min(durationMs, lastEnd + frameDurMs);
  const totalFrames = Math.max(1, Math.ceil((endMs / 1000) * fps));
  const inWindow = (ms: number) => windows.some(w => ms >= w.startMs && ms <= w.endMs);
  const inFaceWindow = (ms: number) => faceWindows.some(w => ms >= w.startMs && ms <= w.endMs);
  const faces = new FaceTrackBuilder();

  const seekTo = (tSec: number) => new Promise<void>((res) => {
    const t = Math.min(tSec, Math.max(0, (video.duration || tSec + 1) - 1e-3));
    const done = () => { video.removeEventListener('seeked', done); res(); };
    video.addEventListener('seeked', done);
    try { video.currentTime = t; } catch { video.removeEventListener('seeked', done); res(); }
  });

  let segTs = 0;
  // The multiclass model separates hair (1) and face skin (3); the face box is read from the same
  // pass that makes the cut-out, so tracking the face costs no second model.
  const readFace = (tMs: number, masks: { width: number; height: number; getAsFloat32Array(): Float32Array }[] | undefined) => {
    if (!masks || masks.length < 4) return;
    const fm = masks[3];
    faces.add(tMs, faceBoxFromMasks(fm.getAsFloat32Array(), masks[1].getAsFloat32Array(), fm.width, fm.height));
  };
  const faceOnly = (tMs: number) => {
    segTs += Math.max(1, Math.round(frameDurMs));
    let result: import('@mediapipe/tasks-vision').ImageSegmenterResult | undefined;
    try { result = segmenter?.segmentForVideo(video, segTs); } catch { result = undefined; }
    try { readFace(tMs, result?.confidenceMasks); } finally { result?.close?.(); }
  };
  const composite = (tMs: number) => {
    fctx.globalCompositeOperation = 'source-over';
    fctx.imageSmoothingEnabled = true;
    fctx.clearRect(0, 0, outW, outH);
    fctx.drawImage(video, 0, 0, outW, outH);
    segTs += Math.max(1, Math.round(frameDurMs));
    let result: import('@mediapipe/tasks-vision').ImageSegmenterResult | undefined;
    try { result = segmenter?.segmentForVideo(video, segTs); } catch { result = undefined; }
    try {
      const masks = result?.confidenceMasks;
      readFace(tMs, masks);
      if (masks && masks.length) {
        const bg = masks[0]; const mw = bg.width, mh = bg.height;
        const data = bg.getAsFloat32Array(); const multiclass = masks.length > 1;
        if (!maskCanvas || maskCanvas.width !== mw || maskCanvas.height !== mh) {
          maskCanvas = new OffscreenCanvas(mw, mh);
          mctx = maskCanvas.getContext('2d', { alpha: true }) as OffscreenCanvasRenderingContext2D;
        }
        const img = mctx!.createImageData(mw, mh);
        for (let i = 0; i < data.length; i++) {
          let a = multiclass ? 1 - data[i] : data[i];
          a = a <= 0.30 ? 0 : a >= 0.70 ? 1 : (a - 0.30) / 0.40;
          const o = i * 4;
          img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = Math.round(a * 255);
        }
        mctx!.putImageData(img, 0, 0);
        fctx.save();
        fctx.globalCompositeOperation = 'destination-in';
        fctx.imageSmoothingEnabled = true;
        fctx.drawImage(maskCanvas, 0, 0, outW, outH);
        fctx.restore();
      } else {
        // No mask → no subject this frame; drop the drawn video so we never bake an opaque frame.
        fctx.clearRect(0, 0, outW, outH);
      }
    } finally { result?.close?.(); }
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
        composite(tMs);
        // alpha WebP: ~5× smaller than PNG, so a whole window of frames stays light in memory.
        const blob = await frame.convertToBlob({ type: 'image/webp', quality: 0.9 });
        if (blob && blob.size > 0) blobs.set(i, blob);
        await yieldToBrowser();   // keep the editor responsive during a long whole-video pass
      } else if (i % faceEvery === 0 && inFaceWindow(tMs)) {
        await seekTo(tMs / 1000);
        faceOnly(tMs);
        await yieldToBrowser();
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
  return new SubjectMatte(blobs, fps, outW, outH, faces.size ? faces.build() : EMPTY_FACE_TRACK);
}
