// ─────────────────────────────────────────────────────────────────────────────
// Captik Auto-Edit — shared domain types.
//
// All times here are SECONDS to match HTMLVideoElement.currentTime and the edit
// math. Captik's transcript lives in milliseconds, so callers convert at the
// boundary (see ./adapt and ./detectLocal).
//
// Detection is LOCAL and deterministic (./detectLocal): no model call, no API key,
// no DB table. The removed list is the single source of truth; keep segments are
// always derived from it.
// ─────────────────────────────────────────────────────────────────────────────

/** Reason a segment was cut from the timeline. Drives colour + label everywhere.
 *  'offtopic' is kept in the union so older persisted results still type-check;
 *  the local detector never emits it. */
export type RemovalReason = 'silence' | 'filler' | 'repetition' | 'offtopic' | 'manual';

/** A single transcribed word with second-precision timing. */
export interface WordToken {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

/** A contiguous span of the source video, in seconds. */
export interface Segment {
  start: number;
  end: number;
}

/**
 * A span the pipeline proposes to remove. `restored` flips it back to "kept"
 * without losing the record (the "recycle bin" behaviour).
 */
export interface RemovedSegment extends Segment {
  id: string;
  reason: RemovalReason;
  /** Transcript snippet of what was said during this span. */
  text: string;
  restored: boolean;
  /** Human-readable audit line: WHY the detector cut this span (optional for manual cuts
   *  and for results persisted before the field existed). */
  detail?: string;
}

/** A span that survives into the final edit. Derived from removed segments. */
export interface KeepSegment extends Segment {
  id: string;
}

/** Toggleable cleanup passes the user can enable. */
export interface EditOptions {
  removeSilences: boolean;
  removeFillers: boolean;
  /** Conservative retake removal (a restarted sentence — the earlier attempt is cut). */
  removeRepetitions: boolean;
  /** Discrete aggression preset 0..3 (Light → Max). See ./aggression. */
  aggressionLevel: number;
  /** Clean up audio: reduce background noise on export (./audioCleanup). Independent of the cuts. */
  denoiseAudio: boolean;
  /** Clean up audio: bring the export to a consistent -16 LUFS. Independent of the cuts. */
  levelAudio: boolean;
}

export const DEFAULT_EDIT_OPTIONS: EditOptions = {
  removeSilences: true,
  removeFillers: true,
  removeRepetitions: true,
  aggressionLevel: 1,
  denoiseAudio: false,
  levelAudio: false,
};

/**
 * The persisted result of one Auto-Edit run. Stored in ProjectSnapshot so the
 * edit survives reopen. `removed` is the single source of truth (recycle bin);
 * keep segments are always DERIVED from the non-restored removals.
 */
export interface AutoEditResult {
  removed: RemovedSegment[];
  /** Detector that produced the cuts ('local-v1'), for display/debug. */
  detector: string | null;
  /** Source video duration (seconds) the cuts were computed against. */
  durationSec: number;
  /** ms epoch when generated (stamped by the caller — no Date.now() in libs). */
  generatedAt: number;
}
