'use client';

// Exact single-frame capture for covers.
//
// The editor's scrub path uses fastSeek (lands on a KEYFRAME) — fine for scrubbing, wrong for a
// thumbnail: the frame you download would not be the frame you picked. Here we set currentTime
// exactly, wait for `seeked`, then wait for the frame to actually be presented
// (requestVideoFrameCallback, raced with a short timeout because a hidden/offscreen element may
// never present), and draw at the SOURCE resolution.
//
// Sources are always same-origin blob: URLs, so the canvas is never tainted.

/** Clamp a requested frame time into the playable range (a seek to `duration` shows nothing). */
export function clampFrameTimeSec(tMs: number, durationSec: number): number {
  const t = Number.isFinite(tMs) ? Math.max(0, tMs / 1000) : 0;
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) return t;
  return Math.min(t, Math.max(0, durationSec - 0.001));
}

type VfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (h: number) => void;
};

function waitEvent(el: HTMLMediaElement, ok: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('video-error')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`${ok}-timeout`)); }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener(ok, done);
      el.removeEventListener('error', fail);
    };
    el.addEventListener(ok, done, { once: true });
    el.addEventListener('error', fail, { once: true });
  });
}

/** Resolve after the next presented frame, or after `timeoutMs` if the element never presents. */
function waitPresented(video: HTMLVideoElement, timeoutMs = 250): Promise<void> {
  const v = video as VfcVideo;
  if (typeof v.requestVideoFrameCallback !== 'function') return new Promise(r => setTimeout(r, 30));
  return new Promise((resolve) => {
    let handle = 0;
    const timer = setTimeout(() => { if (handle) v.cancelVideoFrameCallback?.(handle); resolve(); }, timeoutMs);
    handle = v.requestVideoFrameCallback!(() => { clearTimeout(timer); resolve(); });
  });
}

/** Seek EXACTLY (never fastSeek) and wait until the frame at that time is decoded. */
export async function seekExact(video: HTMLVideoElement, tMs: number, timeoutMs = 8_000): Promise<void> {
  if (video.readyState < 1) await waitEvent(video, 'loadedmetadata', timeoutMs);
  const t = clampFrameTimeSec(tMs, video.duration);
  if (Math.abs(video.currentTime - t) > 0.0005 || video.seeking) {
    const seeked = waitEvent(video, 'seeked', timeoutMs);
    video.currentTime = t;
    await seeked;
  }
  if (video.readyState < 2) await waitEvent(video, 'loadeddata', timeoutMs).catch(() => {});
  await waitPresented(video);
}

/** Draw the current frame at the source's intrinsic resolution. Throws if nothing is decodable. */
export function drawVideoFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h || video.readyState < 2) throw new Error('frame-unavailable');
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  ctx.drawImage(video, 0, 0, w, h);
  return canvas;
}

/** Capture one exact frame from a src using a private offscreen <video> (does not touch the player). */
export async function captureFrameFromSrc(src: string, tMs: number): Promise<HTMLCanvasElement> {
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  const meta = waitEvent(video, 'loadeddata', 15_000);
  video.src = src;
  try {
    await meta;
    await seekExact(video, tMs);
    return drawVideoFrame(video);
  } finally {
    video.removeAttribute('src');
    try { video.load(); } catch { /* noop */ }
  }
}

/** True when a blob:/same-origin URL can still be read (a reopened project can hold a revoked one). */
export async function isSrcReadable(src: string): Promise<boolean> {
  if (!src) return false;
  try { const r = await fetch(src); return r.ok; } catch { return false; }
}

export interface CaptureWithRecoveryOpts {
  tMs:  number;
  src:  string;
  /** Capture from the visible player (VideoCanvasHandle.captureFrame). Optional. */
  live?: (tMs: number) => Promise<HTMLCanvasElement>;
  /** Stored source bytes for a stale blob: URL (IndexedDB project record). */
  loadStoredBlob?: () => Promise<Blob | null>;
}

/**
 * Live player first; if that fails, the offscreen path — rebuilding a fresh blob: URL from the stored
 * project bytes when the current URL is stale (same recovery the video export uses).
 */
export async function captureFrameWithRecovery(o: CaptureWithRecoveryOpts): Promise<HTMLCanvasElement> {
  if (o.live) {
    try { return await o.live(o.tMs); } catch { /* fall through to the offscreen path */ }
  }
  let src = o.src;
  let made = false;
  if (!(await isSrcReadable(src))) {
    const blob = o.loadStoredBlob ? await o.loadStoredBlob().catch(() => null) : null;
    if (!blob || blob.size === 0) throw new Error('source-unavailable');
    src = URL.createObjectURL(blob);
    made = true;
  }
  try {
    return await captureFrameFromSrc(src, o.tMs);
  } finally {
    // The canvas already holds the pixels; the temporary URL is no longer needed.
    if (made) URL.revokeObjectURL(src);
  }
}
