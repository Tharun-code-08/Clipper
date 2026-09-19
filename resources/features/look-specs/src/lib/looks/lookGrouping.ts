// A look's caption grouping: their planner (grouping.ts) fed with the look's own limits — its
// maxWords (their maxWordsPerLine, per preset), Focusline's run breaks, and for a plain rows
// design the fit of a candidate to its rows (an authored design — a stack, a lockup, a curve, a
// dynamic layout — lays its own rows and skips the fit, as theirs do).
//
// Their rows fit also rejects a candidate whose row would run past the box in THEIR width
// estimate at THEIR size. Ours checks the row count only: our estimator over-counts a condensed
// face by a third (Anton caps: "BUILT INTO" estimates 255 of a 213 budget and measures 185), so
// a width test here would cut Deep Focus to one-word captions where their footage has two rows
// of two — and our row renderer fits a wide row by shrinking, never by refusing it.
import type { TranscriptWord } from '@/types/transcript';
import { groupCaptions, type GroupWord, type GroupingOptions } from './grouping';
import type { LookSpec } from './lookSpec';

export const DEFAULT_MAX_WORDS = 4;

export function lookIsAuthored(spec: LookSpec): boolean {
  return !!(spec.stack || spec.impact || spec.curve || spec.dynamic || spec.popoff || spec.focusline || spec.family === 'emphasis' || spec.family === 'story');
}

export function lookGroupingOptions(spec: LookSpec): GroupingOptions {
  const maxWords = Math.max(1, Math.floor(spec.maxWords ?? DEFAULT_MAX_WORDS));
  const opts: GroupingOptions = { maxWords, focusline: !!spec.focusline };
  if (spec.family === 'story' && spec.story) return { ...opts, story: spec.story };
  if (lookIsAuthored(spec)) return opts;
  const perLine = Math.max(1, Math.floor(spec.wordsPerLine ?? maxWords));
  const maxLines = Math.max(1, Math.ceil(maxWords / perLine));
  opts.fits = (ws) => ws.length <= 1 || Math.ceil(ws.length / perLine) <= maxLines;
  return opts;
}

const tierOf = (w: TranscriptWord): number => (w.styleOverride?.scale && w.styleOverride.scale > 1) || w.styleOverride?.color ? 2 : 0;

/** The look's captions for these words, as segment id lists. */
export function segmentsForLook(words: TranscriptWord[], spec: LookSpec): string[][] {
  const gws: GroupWord[] = words.map((w) => ({ id: w.id, text: w.text, startMs: w.startMs, endMs: w.endMs, tier: tierOf(w) }));
  return groupCaptions(gws, lookGroupingOptions(spec)).map((g) => g.map((w) => w.id));
}
