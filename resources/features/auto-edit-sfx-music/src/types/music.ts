// Background music a creator adds to their own video: one track, its level, and how far it steps
// back under the voice. The AUDIO never lives here — the file sits in IndexedDB beside the source
// video (see lib/music/musicStore), and only this description is persisted in the project snapshot
// and sent to a renderer.

import { DUCK_DB_DEFAULT, DUCK_DB_MAX, DUCK_DB_MIN } from '@/lib/music/duck';

export interface MusicTrack {
  /** Stable id for the stored file (also its key in the blob store). */
  id: string;
  /** The file's own name, for the panel. */
  name: string;
  /** Track volume before ducking, 0..1.5. */
  gain: number;
  /** How far the music drops under speech, in dB (0 = never duck). */
  duckDb: number;
  /** Where the track starts against the video, SOURCE-clock ms (0 = with the video). */
  startMs: number;
  /** Fade in at the start and out at the end of the video, ms. */
  fadeInMs: number;
  fadeOutMs: number;
}

export const MUSIC_DEFAULT_GAIN = 0.35;
export const MUSIC_MAX_GAIN = 1.5;
export const MUSIC_DEFAULT_FADE_MS = 800;
/** A track over this size is refused in the browser: it has to ride in an export payload. */
export const MUSIC_MAX_BYTES = 20 * 1024 ** 2;

export const clampMusicGain = (g: number): number =>
  Math.max(0, Math.min(MUSIC_MAX_GAIN, Number.isFinite(g) ? g : MUSIC_DEFAULT_GAIN));

export const clampDuckDb = (db: number): number =>
  Math.max(DUCK_DB_MIN, Math.min(DUCK_DB_MAX, Number.isFinite(db) ? db : DUCK_DB_DEFAULT));

export const newMusicTrack = (id: string, name: string, extra?: Partial<MusicTrack>): MusicTrack => ({
  id,
  name: name.slice(0, 80) || 'Music',
  gain: MUSIC_DEFAULT_GAIN,
  duckDb: DUCK_DB_DEFAULT,
  startMs: 0,
  fadeInMs: MUSIC_DEFAULT_FADE_MS,
  fadeOutMs: MUSIC_DEFAULT_FADE_MS,
  ...extra,
});

/** Trusts nothing from a persisted snapshot; returns null when there is no usable track. */
export function sanitizeMusic(raw: unknown): MusicTrack | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    id: r.id,
    name: typeof r.name === 'string' && r.name ? r.name.slice(0, 80) : 'Music',
    gain: clampMusicGain(num(r.gain, MUSIC_DEFAULT_GAIN)),
    duckDb: clampDuckDb(num(r.duckDb, DUCK_DB_DEFAULT)),
    startMs: Math.max(0, Math.round(num(r.startMs, 0))),
    fadeInMs: Math.max(0, Math.round(num(r.fadeInMs, MUSIC_DEFAULT_FADE_MS))),
    fadeOutMs: Math.max(0, Math.round(num(r.fadeOutMs, MUSIC_DEFAULT_FADE_MS))),
  };
}
