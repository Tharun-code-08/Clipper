/** A sound effect the user placed on the video.
 *
 *  Times are on the SOURCE clock — the same clock as TranscriptWord — so a placed sound stays put
 *  when captions are edited, and an Auto-Edit cut moves it (or drops it, when its instant was cut)
 *  at export time rather than rewriting the project. */
export interface SfxInstance {
  /** 'sx_<base36>'. Stable for the life of the placement. */
  id: string;
  /** A bank id (see src/lib/sfx/sfxIds.ts). */
  sfxId: string;
  /** SOURCE-clock ms. */
  atMs: number;
  /** 0..SFX_GAIN_MAX. */
  gain: number;
  /** Optional display label; defaults to the bank label. */
  label?: string;
}

export const SFX_GAIN_MAX = 1.5;
export const SFX_DEFAULT_GAIN = 0.8;

export const clampSfxGain = (g: number): number =>
  Number.isFinite(g) ? Math.max(0, Math.min(SFX_GAIN_MAX, g)) : SFX_DEFAULT_GAIN;

export const newSfxInstance = (sfxId: string, atMs: number, extra?: Partial<SfxInstance>): SfxInstance => ({
  id: `sx_${Math.random().toString(36).slice(2, 10)}`,
  sfxId,
  atMs: Math.max(0, Math.round(Number.isFinite(atMs) ? atMs : 0)),
  gain: SFX_DEFAULT_GAIN,
  ...extra,
});

/** Defensive read of a persisted / posted list: drops malformed entries, clamps the numbers,
 *  keeps only `known` bank ids when a set is given, and sorts by time. */
export function sanitizeSfxList(list: unknown, known?: ReadonlySet<string>): SfxInstance[] {
  if (!Array.isArray(list)) return [];
  const out: SfxInstance[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.sfxId !== 'string') continue;
    if (known && !known.has(r.sfxId)) continue;
    const atMs = typeof r.atMs === 'number' && Number.isFinite(r.atMs) ? Math.max(0, Math.round(r.atMs)) : null;
    if (atMs === null) continue;
    out.push({
      id: r.id.slice(0, 40),
      sfxId: r.sfxId,
      atMs,
      gain: clampSfxGain(typeof r.gain === 'number' ? r.gain : SFX_DEFAULT_GAIN),
      ...(typeof r.label === 'string' ? { label: r.label.slice(0, 60) } : {}),
    });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}
