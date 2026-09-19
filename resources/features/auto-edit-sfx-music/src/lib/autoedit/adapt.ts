// ─────────────────────────────────────────────────────────────────────────────
// Auto-Edit — boundary adapter between captik's transcript (milliseconds) and the
// Auto-Edit edit math (seconds). Captik already transcribes every upload, so the
// detector reuses those words instead of re-transcribing.
// ─────────────────────────────────────────────────────────────────────────────

import type { TranscriptWord } from '@/types/transcript';
import { r2 } from './util';
import type { WordToken } from './types';

/** Convert captik's ms-based TranscriptWord[] into seconds-based WordToken[].
 *  Ordering is preserved 1:1. */
export function tokensFromTranscript(words: TranscriptWord[]): WordToken[] {
  return words.map((w) => ({
    word: w.text,
    start: r2(w.startMs / 1000),
    end: r2(w.endMs / 1000),
  }));
}
