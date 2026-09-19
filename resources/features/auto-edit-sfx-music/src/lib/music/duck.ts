// ─────────────────────────────────────────────────────────────────────────────
// Background music — where it has to get out of the way of the voice.
//
// The duck windows come from the WORD TIMINGS, which every project already has and which are
// remapped onto the export clock with the cut. That means no second audio analysis, nothing that
// depends on the VAD regions (those only exist when the PCM was decoded this session), and the
// preview, the cloud render, the in-browser render and the Element Capture mux can all derive the
// identical curve from the identical data.
//
// Pure: no DOM, no ffmpeg, no Remotion. Unit-tested in duck.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface DuckWindow {
  /** Export-clock ms where the music starts dropping. */
  startMs: number;
  /** Export-clock ms where it is back to full. */
  endMs: number;
}

/** Music drops this long BEFORE a phrase starts, so the voice never lands on a loud bed. */
export const DUCK_LEAD_MS = 150;
/** …and stays down this long after it, so a short breath between words doesn't pump the music. */
export const DUCK_TAIL_MS = 250;
/** Gaps shorter than this are bridged: the music would otherwise lift for a fraction of a second. */
export const DUCK_BRIDGE_MS = 700;
/** How long the music takes to drop and to come back. */
export const DUCK_FADE_MS = 220;

/** How far the music is turned down under speech, in dB. Its range in the UI. */
export const DUCK_DB_DEFAULT = -14;
export const DUCK_DB_MIN = -30;
export const DUCK_DB_MAX = 0;

const dbToGain = (db: number) => 10 ** (db / 20);

/**
 * Merged, sorted windows where the music should be down, from words already on the export clock.
 * Words out of order or with broken timings are ignored rather than trusted.
 */
export function duckWindows(
  words: readonly { startMs: number; endMs: number }[],
  opts?: { leadMs?: number; tailMs?: number; bridgeMs?: number },
): DuckWindow[] {
  const lead = opts?.leadMs ?? DUCK_LEAD_MS;
  const tail = opts?.tailMs ?? DUCK_TAIL_MS;
  const bridge = opts?.bridgeMs ?? DUCK_BRIDGE_MS;
  const spans = words
    .filter((w) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs) && w.endMs > w.startMs)
    .map((w) => ({ startMs: Math.max(0, w.startMs - lead), endMs: w.endMs + tail }))
    .sort((a, b) => a.startMs - b.startMs);
  const out: DuckWindow[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s.startMs - last.endMs <= bridge) last.endMs = Math.max(last.endMs, s.endMs);
    else out.push({ ...s });
  }
  return out;
}

/**
 * Music gain (0..1) at `ms`, easing over DUCK_FADE_MS at each edge so the drop is heard as the
 * music stepping back rather than as a gate. `full` is the track's own volume.
 */
export function duckGainAt(ms: number, windows: readonly DuckWindow[], full: number, duckDb: number): number {
  const ducked = full * dbToGain(Math.max(DUCK_DB_MIN, Math.min(DUCK_DB_MAX, duckDb)));
  for (const w of windows) {
    if (ms < w.startMs - DUCK_FADE_MS || ms > w.endMs + DUCK_FADE_MS) continue;
    if (ms < w.startMs) return full + (ducked - full) * ((ms - (w.startMs - DUCK_FADE_MS)) / DUCK_FADE_MS);
    if (ms <= w.endMs) return ducked;
    return ducked + (full - ducked) * ((ms - w.endMs) / DUCK_FADE_MS);
  }
  return full;
}

/**
 * An ffmpeg `volume` expression for the same curve, for the Element Capture mux (which muxes with
 * ffmpeg rather than rendering the composition). Evaluated per frame; `t` is seconds.
 * Falls back to a plain constant when there is nothing to duck under.
 */
export function duckVolumeExpr(windows: readonly DuckWindow[], full: number, duckDb: number): string {
  const ducked = full * dbToGain(Math.max(DUCK_DB_MIN, Math.min(DUCK_DB_MAX, duckDb)));
  const f = (n: number) => (n / 1000).toFixed(3);
  const g = (n: number) => n.toFixed(4);
  if (!windows.length) return g(full);
  // Nested if(): inside a window → ducked; on an edge → linear ramp; otherwise full.
  return windows.reduce((acc, w) => {
    const a = w.startMs - DUCK_FADE_MS;
    const b = w.startMs;
    const c = w.endMs;
    const d = w.endMs + DUCK_FADE_MS;
    const rampIn = `${g(full)}+(${g(ducked - full)})*((t-${f(a)})/${f(DUCK_FADE_MS)})`;
    const rampOut = `${g(ducked)}+(${g(full - ducked)})*((t-${f(c)})/${f(DUCK_FADE_MS)})`;
    return `if(between(t,${f(b)},${f(c)}),${g(ducked)},`
      + `if(between(t,${f(a)},${f(b)}),${rampIn},`
      + `if(between(t,${f(c)},${f(d)}),${rampOut},${acc})))`;
  }, g(full));
}
