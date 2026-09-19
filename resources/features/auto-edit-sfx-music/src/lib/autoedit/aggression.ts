// ─────────────────────────────────────────────────────────────────────────────
// Aggression presets — 4 discrete snap points the user steps through.
// Each point maps to a silence-detection threshold (seconds) and says in plain
// language exactly what it removes. The local detector (./detectLocal) reads
// `silenceThreshold` and `contextFillers` — nothing here is sent to a model.
// ─────────────────────────────────────────────────────────────────────────────

export interface AggressionLevel {
  /** index 0..3 */
  value: number;
  label: string;
  /** short headline shown next to the slider */
  short: string;
  /** full sentence describing what gets removed at this level */
  desc: string;
  /** Silences longer than this (s) are removed completely. Shorter ones kept. */
  silenceThreshold: number;
  /** Also cut context fillers ("like", "so", "matlab", "toh", "basically") when they sit
   *  against a pause. Only the two strongest levels — these words are often real speech. */
  contextFillers: boolean;
}

export const AGGRESSION_LEVELS: AggressionLevel[] = [
  {
    value: 0,
    label: 'Light',
    short: 'Long silences only',
    desc: 'Removes only long pauses (over ~1.2s) and trims silence at the very start & end. Cuts only unmistakable filler like "umm".',
    silenceThreshold: 1.2,
    contextFillers: false,
  },
  {
    value: 1,
    label: 'Balanced',
    short: 'Clean & natural',
    desc: 'Removes pauses longer than ~0.8s, keeping shorter natural ones; trims start & end. Cuts clear filler ("umm", "uh", "हम्म").',
    silenceThreshold: 0.8,
    contextFillers: false,
  },
  {
    value: 2,
    label: 'Strong',
    short: 'Punchy',
    desc: 'Removes pauses over ~0.5s, clear filler, and "like / so / matlab / toh" when they hang on a pause. Noticeably tighter.',
    silenceThreshold: 0.5,
    contextFillers: true,
  },
  {
    value: 3,
    label: 'Max',
    short: 'Tightest edit',
    desc: 'Removes almost all silence (gaps over ~0.35s) plus every filler it recognises. Tightest possible edit — review the result.',
    silenceThreshold: 0.35,
    contextFillers: true,
  },
];

/** Clamp + fetch a level. */
export function getAggressionLevel(idx: number): AggressionLevel {
  const i = Math.max(0, Math.min(AGGRESSION_LEVELS.length - 1, Math.round(Number.isFinite(idx) ? idx : 1)));
  return AGGRESSION_LEVELS[i];
}
