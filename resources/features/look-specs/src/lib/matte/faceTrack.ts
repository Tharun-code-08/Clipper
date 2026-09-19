// Where the speaker's face is, over time — a small, serialisable track that every export route can
// carry as plain props, so face-anchored layouts render the same in the preview, the Element
// Capture export, the in-browser export and the cloud render.
//
// The boxes come from the model the subject cut-out already runs (MediaPipe selfie_multiclass):
// its confidence masks separate hair (class 1) and face skin (class 3), so no second model is
// needed. Everything here is pure; the extraction is fed the two masks by the matte generator.

/** One face box, as fractions of the frame (0..1). */
export interface FaceBox {
  /** Horizontal centre of the face. */
  cx: number;
  /** Top of the head — hair included — so text can sit ABOVE it. */
  headTop: number;
  /** Top and bottom of the face skin (forehead to chin). */
  faceTop: number;
  faceBottom: number;
}

/** Parallel arrays keep the track small enough to ride along in a cloud render's props. */
export interface FaceTrack {
  v: 1;
  /** Sample times in ms, ascending. */
  t: number[];
  cx: number[];
  headTop: number[];
  faceTop: number[];
  faceBottom: number[];
}

export const EMPTY_FACE_TRACK: FaceTrack = { v: 1, t: [], cx: [], headTop: [], faceTop: [], faceBottom: [] };

/** A sample further than this from the asked time is not evidence of where the face is now. */
const MAX_GAP_MS = 400;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The face box from one frame's masks (row-major Float32 confidences, `w` by `h`). Returns null when
 * there is too little face skin to trust — a turned head or an empty frame.
 */
export function faceBoxFromMasks(
  face: ArrayLike<number>, hair: ArrayLike<number> | null, w: number, h: number, thr = 0.5,
): FaceBox | null {
  if (w <= 0 || h <= 0 || face.length < w * h) return null;
  let n = 0, sx = 0, top = h, bottom = -1, left = w, right = -1;
  // a row counts only if it carries a real run of skin, so a stray pixel cannot stretch the box
  const minRow = Math.max(2, Math.round(w * 0.01));
  for (let y = 0; y < h; y++) {
    let cnt = 0, rowL = w, rowR = -1;
    for (let x = 0; x < w; x++) {
      if (face[y * w + x] >= thr) { cnt++; sx += x; if (x < rowL) rowL = x; if (x > rowR) rowR = x; }
    }
    n += cnt;
    if (cnt >= minRow) {
      if (y < top) top = y;
      bottom = y;
      if (rowL < left) left = rowL;
      if (rowR > right) right = rowR;
    }
  }
  if (bottom < 0 || n < w * h * 0.002) return null;
  const cxPx = sx / n;
  // Head top: hair directly above the face (within half a face-width either side), else the face.
  let headTopPx = top;
  if (hair && hair.length >= w * h) {
    const half = Math.max(1, (right - left) / 2);
    const x0 = Math.max(0, Math.floor(left - half)), x1 = Math.min(w - 1, Math.ceil(right + half));
    outer: for (let y = 0; y < top; y++) {
      let cnt = 0;
      for (let x = x0; x <= x1; x++) if (hair[y * w + x] >= thr) cnt++;
      if (cnt >= minRow) { headTopPx = y; break outer; }
    }
  }
  return { cx: r3(cxPx / w), headTop: r3(headTopPx / h), faceTop: r3(top / h), faceBottom: r3((bottom + 1) / h) };
}

/** Collects boxes as frames are processed, then smooths them into a track. */
export class FaceTrackBuilder {
  private rows: { t: number; b: FaceBox }[] = [];
  add(tMs: number, box: FaceBox | null) { if (box) this.rows.push({ t: Math.round(tMs), b: box }); }
  get size() { return this.rows.length; }
  build(smoothRadius = 2): FaceTrack {
    const rows = [...this.rows].sort((a, b) => a.t - b.t);
    const out: FaceTrack = { v: 1, t: [], cx: [], headTop: [], faceTop: [], faceBottom: [] };
    // A running median: detection noise would otherwise make every caption tied to the face jitter.
    const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    for (let i = 0; i < rows.length; i++) {
      const lo = Math.max(0, i - smoothRadius), hi = Math.min(rows.length, i + smoothRadius + 1);
      const win = rows.slice(lo, hi).filter((r) => Math.abs(r.t - rows[i].t) <= MAX_GAP_MS);
      out.t.push(rows[i].t);
      out.cx.push(r3(med(win.map((r) => r.b.cx))));
      out.headTop.push(r3(med(win.map((r) => r.b.headTop))));
      out.faceTop.push(r3(med(win.map((r) => r.b.faceTop))));
      out.faceBottom.push(r3(med(win.map((r) => r.b.faceBottom))));
    }
    return out;
  }
}

/** The face at `tMs`, interpolated between samples; null where the track has no nearby evidence. */
export function faceAt(track: FaceTrack | null | undefined, tMs: number): FaceBox | null {
  if (!track || !track.t.length) return null;
  const t = track.t;
  let lo = 0, hi = t.length - 1;
  if (tMs <= t[0]) return Math.abs(t[0] - tMs) <= MAX_GAP_MS ? pick(track, 0) : null;
  if (tMs >= t[hi]) return Math.abs(tMs - t[hi]) <= MAX_GAP_MS ? pick(track, hi) : null;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= tMs) lo = mid; else hi = mid; }
  if (t[hi] - t[lo] > MAX_GAP_MS * 2) {
    const near = tMs - t[lo] <= t[hi] - tMs ? lo : hi;
    return Math.abs(t[near] - tMs) <= MAX_GAP_MS ? pick(track, near) : null;
  }
  const k = (tMs - t[lo]) / Math.max(1, t[hi] - t[lo]);
  const mix = (a: number[]) => a[lo] + (a[hi] - a[lo]) * k;
  return { cx: mix(track.cx), headTop: mix(track.headTop), faceTop: mix(track.faceTop), faceBottom: mix(track.faceBottom) };
}

function pick(tr: FaceTrack, i: number): FaceBox {
  return { cx: tr.cx[i], headTop: tr.headTop[i], faceTop: tr.faceTop[i], faceBottom: tr.faceBottom[i] };
}

/** The face that holds for a whole line: the median over its span, so a line never slides. */
export function faceOverSpan(track: FaceTrack | null | undefined, startMs: number, endMs: number): FaceBox | null {
  if (!track || !track.t.length) return null;
  const idx: number[] = [];
  for (let i = 0; i < track.t.length; i++) if (track.t[i] >= startMs - 1 && track.t[i] <= endMs + 1) idx.push(i);
  if (!idx.length) return faceAt(track, (startMs + endMs) / 2);
  const med = (a: number[]) => { const s = idx.map((i) => a[i]).sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return { cx: med(track.cx), headTop: med(track.headTop), faceTop: med(track.faceTop), faceBottom: med(track.faceBottom) };
}

/** At most `maxHz` samples a second — what a cloud render needs, at a fraction of the payload. */
export function downsampleFaceTrack(track: FaceTrack | null | undefined, maxHz = 6): FaceTrack | undefined {
  if (!track || !track.t.length) return undefined;
  const gap = 1000 / Math.max(0.1, maxHz);
  const out: FaceTrack = { v: 1, t: [], cx: [], headTop: [], faceTop: [], faceBottom: [] };
  let last = -Infinity;
  for (let i = 0; i < track.t.length; i++) {
    if (track.t[i] - last < gap) continue;
    last = track.t[i];
    out.t.push(track.t[i]); out.cx.push(track.cx[i]); out.headTop.push(track.headTop[i]);
    out.faceTop.push(track.faceTop[i]); out.faceBottom.push(track.faceBottom[i]);
  }
  return out;
}
