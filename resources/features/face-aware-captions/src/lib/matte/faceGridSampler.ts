'use client';

// "Keep captions off faces" — browser-side face analysis for caption placement.
//
// Uses the SAME self-hosted MediaPipe runtime + selfie-multiclass model as the "Behind the subject"
// cut-out, but deliberately does NOT produce a SubjectMatte. The editor treats any SubjectMatte as
// "draw the person OVER the captions" (VideoCanvas blits every frame it holds) and routes the export
// to the matte-compositing path whenever one exists — so generating a matte just to measure where the
// face is would silently turn every caption into a behind-the-subject caption and change how the
// video exports. Placement only needs a coarse grid at a few instants per caption, so this seeks to
// exactly those instants and keeps a 54×96 float grid per instant: no WebP encode, no decode cache,
// nothing that reaches a render surface.
//
// Heavy deps are dynamically imported so they never hit SSR or the CEP bundle.

import { canGenerateMatte, WASM_BASE, MODEL_PATH } from './subjectMatte';
import {
  downsampleFaceMask, downsampleSubjectMask, emptyGrid, type CoverageGrid,
} from '@/lib/faceAware/faceGrid';

/** Same capability gate as the cut-out (WASM + OffscreenCanvas + DOM). */
export const canSampleFaceGrids = canGenerateMatte;

// selfie_multiclass_256x256 confidence-mask order: 0 background, 1 hair, 2 body-skin, 3 face-skin,
// 4 clothes, 5 others.
const HAIR = 1;
const FACE_SKIN = 3;

export interface SampleFaceGridsOptions {
  videoSrc: string;
  /** Instants to analyse (ms). */
  times:    number[];
  /** Called once per analysed instant, in order. */
  onGrid:   (tMs: number, grid: CoverageGrid) => void;
  signal?:  AbortSignal;
}

function seekTo(video: HTMLVideoElement, tSec: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const t = Math.min(tSec, Math.max(0, (video.duration || tSec + 1) - 1e-3));
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      clearTimeout(timer);
      resolve();
    };
    // A seek to the time the element already shows may not fire 'seeked' on every browser —
    // never let one instant stall the whole analysis.
    const timer = setTimeout(done, 4000);
    video.addEventListener('seeked', done);
    try { video.currentTime = t; } catch { done(); }
  });
}

/** Let the editor paint between instants (rAF in the foreground, timeout when the tab is hidden). */
function yieldToBrowser(): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    setTimeout(finish, 32);
  });
}

export async function sampleFaceGrids(opts: SampleFaceGridsOptions): Promise<void> {
  const { videoSrc, times, onGrid, signal } = opts;
  if (!canGenerateMatte()) throw new Error('matte-unsupported');
  const throwIfAborted = () => { if (signal?.aborted) throw new DOMException('aborted', 'AbortError'); };

  const video = document.createElement('video');
  video.src = videoSrc; video.muted = true; video.preload = 'auto'; video.playsInline = true;
  let segmenter: import('@mediapipe/tasks-vision').ImageSegmenter | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      const ok = () => { cleanup(); resolve(); };
      const no = () => { cleanup(); reject(new Error('face-video-load-failed')); };
      const cleanup = () => { video.removeEventListener('loadeddata', ok); video.removeEventListener('error', no); };
      video.addEventListener('loadeddata', ok);
      video.addEventListener('error', no);
    });
    throwIfAborted();

    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    const make = (delegate: 'GPU' | 'CPU') => vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      // IMAGE mode: instants are sparse and not evenly spaced, so there's no video stream to track.
      runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true,
    });
    try { segmenter = await make('GPU'); } catch { segmenter = await make('CPU'); }

    for (const tMs of times) {
      throwIfAborted();
      await seekTo(video, tMs / 1000);
      throwIfAborted();
      let result: import('@mediapipe/tasks-vision').ImageSegmenterResult | undefined;
      try { result = segmenter.segment(video); } catch { result = undefined; }
      try {
        const masks = result?.confidenceMasks;
        let grid: CoverageGrid;
        if (masks && masks.length > FACE_SKIN) {
          grid = downsampleFaceMask({
            width: masks[0].width, height: masks[0].height,
            face: masks[FACE_SKIN].getAsFloat32Array(), hair: masks[HAIR].getAsFloat32Array(),
          });
        } else if (masks && masks.length === 1) {
          grid = downsampleSubjectMask({ width: masks[0].width, height: masks[0].height, subject: masks[0].getAsFloat32Array() });
        } else {
          grid = emptyGrid();
        }
        onGrid(tMs, grid);
      } finally {
        result?.close?.();
      }
      await yieldToBrowser();
    }
  } finally {
    try { segmenter?.close(); } catch { /* noop */ }
    video.removeAttribute('src');
    try { video.load(); } catch { /* noop */ }
  }
}
