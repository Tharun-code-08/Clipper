// Per-word transform keyframes — pure math shared by every render surface.
//
// A keyframe is { t, dx, dy, s?, rot? }: `t` is normalized 0..1 across the
// word's own [startMs, endMs] window (so retiming the word stretches its motion
// path with it), dx/dy are % of canvas WIDTH, `s` is a visual scale multiplier
// and `rot` degrees. Position is captured on every keyframe; scale/rotation are
// per-property optional — a keyframe without `s` has "no opinion" on scale, and
// each property interpolates over only the keyframes that define it (missing
// everywhere → the word's static value applies). Sampling is a pure function of
// time: the renderer evaluates it fresh every frame, which is what keeps
// preview ≡ Lambda ≡ box ≡ Element Capture (CSS animations would drift under
// Remotion's virtual clock).

import type { WordPosKeyframe } from '@/types/transcript';

/** Snap distance when adding/updating a keyframe at the playhead: two keyframes
 *  closer than this in normalized time collapse into one. */
export const KF_EPS = 0.04;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Normalized position of `ms` inside a word's window (0 at start, 1 at end). */
export function kfTimeOf(ms: number, startMs: number, endMs: number): number {
  const span = Math.max(1, endMs - startMs);
  return clamp01((ms - startMs) / span);
}

/** Lerp one optional property over the keyframes that define it. Holds the
 *  first/last defined value beyond the ends; undefined when NO keyframe
 *  defines the property (caller falls back to the static value). */
function sampleProp(kfs: readonly WordPosKeyframe[], t: number, sel: (k: WordPosKeyframe) => number | undefined): number | undefined {
  const pts: { t: number; v: number }[] = [];
  for (const k of kfs) {
    const v = sel(k);
    if (v != null) pts.push({ t: k.t, v });
  }
  if (pts.length === 0) return undefined;
  const tt = clamp01(t);
  if (tt <= pts[0].t) return pts[0].v;
  const last = pts[pts.length - 1];
  if (tt >= last.t) return last.v;
  for (let i = 1; i < pts.length; i++) {
    if (tt <= pts[i].t) {
      const a = pts[i - 1], b = pts[i];
      const span = Math.max(1e-6, b.t - a.t);
      return a.v + (b.v - a.v) * ((tt - a.t) / span);
    }
  }
  return last.v;
}

export interface SampledKf {
  dx: number;
  dy: number;
  /** undefined = no keyframe defines scale → use the static wScale. */
  s?: number;
  /** undefined = no keyframe defines rotation → use the static wRotDeg. */
  rot?: number;
}

/** Sample every keyframed property at `t` (position always defined). */
export function sampleKf(kfs: readonly WordPosKeyframe[], t: number): SampledKf {
  if (kfs.length === 0) return { dx: 0, dy: 0 };
  return {
    dx: sampleProp(kfs, t, k => k.dx) ?? 0,
    dy: sampleProp(kfs, t, k => k.dy) ?? 0,
    s: sampleProp(kfs, t, k => k.s),
    rot: sampleProp(kfs, t, k => k.rot),
  };
}

/** Back-compat position-only sampler (position lives on every keyframe). */
export function samplePosKf(kfs: readonly WordPosKeyframe[], t: number): { dx: number; dy: number } {
  const p = sampleKf(kfs, t);
  return { dx: p.dx, dy: p.dy };
}

/** Add a keyframe at `t`, or update the one within KF_EPS of it — MERGING into
 *  the replaced keyframe, so retouching position never drops a captured scale
 *  or rotation. Only properties passed in `patch` are overwritten.
 *  Returns a NEW sorted array. */
export function upsertKf(
  kfs: readonly WordPosKeyframe[], t: number,
  dx: number, dy: number, s?: number, rot?: number,
): WordPosKeyframe[] {
  const tt = clamp01(t);
  const existing = kfs.find(k => Math.abs(k.t - tt) <= KF_EPS);
  const next = kfs.filter(k => Math.abs(k.t - tt) > KF_EPS);
  const merged: WordPosKeyframe = {
    ...existing,
    t: Math.round(tt * 1000) / 1000,
    dx: Math.round(dx * 10) / 10,
    dy: Math.round(dy * 10) / 10,
  };
  if (s != null) merged.s = Math.round(s * 100) / 100;
  if (rot != null) merged.rot = Math.round(rot * 10) / 10;
  next.push(merged);
  next.sort((a, b) => a.t - b.t);
  return next;
}

/** Move keyframe `index` to a new normalized time (clamped, re-sorted). */
export function moveKf(kfs: readonly WordPosKeyframe[], index: number, newT: number): WordPosKeyframe[] {
  if (index < 0 || index >= kfs.length) return [...kfs];
  const next = kfs.map((k, i) => (i === index ? { ...k, t: Math.round(clamp01(newT) * 1000) / 1000 } : k));
  next.sort((a, b) => a.t - b.t);
  return next;
}

/** Remove keyframe `index`. */
export function removeKf(kfs: readonly WordPosKeyframe[], index: number): WordPosKeyframe[] {
  return kfs.filter((_, i) => i !== index);
}

/** wordId → its caption line's END (max endMs across the segment's words).
 *  In the accumulating templates a spoken word stays on screen until the line
 *  ends, so this is the word's VISIBLE lifetime end — the window keyframes and
 *  the timeline layer clips run over. Falls back to the word's own endMs for
 *  words not in any segment. */
export function buildSegEndMap(
  segments: readonly (readonly string[])[] | undefined,
  words: readonly { id: string; endMs: number }[],
): Map<string, number> {
  const map = new Map<string, number>();
  if (!segments) return map;
  const endOf = new Map(words.map(w => [w.id, w.endMs]));
  for (const seg of segments) {
    let end = 0;
    for (const id of seg) end = Math.max(end, endOf.get(id) ?? 0);
    if (end > 0) for (const id of seg) map.set(id, end);
  }
  return map;
}

/** Index of the keyframe within KF_EPS of `t`, or -1. */
export function kfIndexAt(kfs: readonly WordPosKeyframe[], t: number): number {
  const tt = clamp01(t);
  let best = -1, bestD = KF_EPS;
  kfs.forEach((k, i) => {
    const d = Math.abs(k.t - tt);
    if (d <= bestD) { best = i; bestD = d; }
  });
  return best;
}
