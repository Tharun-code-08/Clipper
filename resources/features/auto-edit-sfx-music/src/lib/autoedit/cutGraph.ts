// ─────────────────────────────────────────────────────────────────────────────
// Auto-Edit — pure cut geometry for the exporter: frame-snapped keep spans and the
// ffmpeg trim/concat filter graph that concatenates them. No ffmpeg import here, so
// it is unit-testable in node.
// ─────────────────────────────────────────────────────────────────────────────

export interface Span {
  start: number; // seconds
  end: number;   // seconds
}

/**
 * Snap kept spans to whole frames at `fps`, dropping spans that collapse and merging
 * spans that come to touch. The cut FILE and the remapped CAPTIONS are both built from
 * this output, so they cannot drift apart: un-snapped, every splice rounds by up to a
 * frame and the error accumulates across dozens of cuts (captions late by a second at
 * the end of a heavily cut take).
 */
export function snapKeepsToFrames(keeps: readonly Span[], fps: number): Span[] {
  const sorted = [...keeps].filter((k) => k.end > k.start).sort((a, b) => a.start - b.start);
  if (!(fps > 0) || !Number.isFinite(fps)) return sorted.map((k) => ({ start: k.start, end: k.end }));
  const out: { a: number; b: number }[] = [];
  for (const k of sorted) {
    const a = Math.max(0, Math.round(k.start * fps));
    const b = Math.round(k.end * fps);
    if (b <= a) continue;
    const last = out[out.length - 1];
    if (last && a <= last.b) last.b = Math.max(last.b, b);
    else out.push({ a, b });
  }
  return out.map(({ a, b }) => ({ start: a / fps, end: b / fps }));
}

/**
 * -filter_complex that keeps `keeps` (frame-snapped, sorted) and concatenates them.
 * Video trims sit HALF a frame before each boundary so a boundary never lands exactly on
 * a frame timestamp (where float rounding decides whether that frame is in or out); audio
 * trims are sample-exact on the boundary. Both give (b − a) frames' worth per span, so A/V
 * stay locked at every splice.
 *
 * `audioChain` (Clean up audio, ./audioCleanup) runs on the JOINED audio, so noise tracking and
 * the loudness gain see one continuous track instead of restarting at every splice.
 */
export function buildCutFilterGraph(keeps: readonly Span[], fps?: number, audioChain?: string | null): string {
  if (keeps.length === 0) throw new Error('No kept spans to cut.');
  const half = fps && fps > 0 && Number.isFinite(fps) ? 0.5 / fps : 0;
  const parts: string[] = [];
  const maps: string[] = [];
  keeps.forEach((k, i) => {
    const vs = Math.max(0, k.start - half);
    const ve = Math.max(vs, k.end - half);
    parts.push(`[0:v]trim=start=${vs.toFixed(4)}:end=${ve.toFixed(4)},setpts=PTS-STARTPTS[v${i}]`);
    parts.push(`[0:a]atrim=start=${k.start.toFixed(4)}:end=${k.end.toFixed(4)},asetpts=PTS-STARTPTS[a${i}]`);
    maps.push(`[v${i}][a${i}]`);
  });
  const tail = audioChain ? `[outv][cuta];[cuta]${audioChain}[outa]` : '[outv][outa]';
  return `${parts.join(';')};${maps.join('')}concat=n=${keeps.length}:v=1:a=1${tail}`;
}
