// How a look breaks the transcript into captions — their caption grouping, read from the public
// planner their site ships and re-implemented here.
//
// Two stages. First the words are walked into RUNS, which end at a speaker change, a pause of
// 350ms or more, or a sentence end (. ! ? । ॥); Focusline also ends a run at clause punctuation,
// at its own break rule (a conjunction, a verb after a plain opening, a hyphenated word, "only",
// a second hero that does not pair short), and at max(3, min(7, maxWords)) words. Then each run is
// split into captions of at most maxWords by a dynamic programme that minimises a cost:
//
//   2.5 per caption                                   (fewer captions, all else equal)
//   9 x max(0, .85 - seconds)                         (a caption under 0.85s is expensive)
//   4 for a lone word (when more are allowed)
//   the break after it: -2 on clause punctuation with .65s behind it; 0 before a conjunction or
//     after a 180ms gap; 2 otherwise; 0 at the run's end
//   4 for ending on a / an / the / and / but / of / to / for / with; 4 for a next word "of"
//   4 when a clause mark sits inside the caption with .65s already elapsed (it should have broken)
//
// A rows design (a plain karaoke line) also requires each candidate to FIT its rows: at most
// maxLines rows of wordsPerLine, each within the row budget — `fits` is the caller's estimate.
// Authored designs (a stack, a lockup, a curve, a dynamic layout) lay their own rows and skip it.
//
// Pure, and shared by whoever regroups: picking a look, and rebuilding after a translation.

export interface GroupWord { id: string; text: string; startMs: number; endMs: number; speaker?: string; tier?: number }

import { agentStoryBreakBefore } from './property/plan';
import { propertyBreakBefore } from './property/reel';

export interface GroupingOptions {
  /** Most words in one caption. */
  maxWords: number;
  /** A property scene: runs end at its own breaks (see property/plan.ts) and are never split by cost. */
  story?: 'agent' | 'reel';
  /** Their Focusline's own run breaks. */
  focusline?: boolean;
  /** Whether a candidate caption fits the design's rows; omitted for an authored design. */
  fits?: (ws: GroupWord[]) => boolean;
}

const CONJ_NEXT = /^(and|but|because|while|although|so)$/i;
const NO_END_ON = /^(a|an|the|and|but|of|to|for|with)$/i;
const CLAUSE_END = /[,;:—.!?।॥]$/;
const CLAUSE_MARK = /[,;:—]$/;
const SENTENCE_END = /[.!?।॥]$/;

const FOCUS_OPENERS = new Set(['and', 'but', 'because', 'how', 'if', 'when', 'where', 'what', 'why']);
const FOCUS_VERBS = new Set([
  'become', 'becomes', 'build', 'builds', 'buy', 'buys', 'change', 'changes', 'choose', 'chooses', 'create', 'creates',
  'fit', 'fits', 'focus', 'focuses', 'get', 'gets', 'give', 'gives', 'keep', 'keeps', 'look', 'looks', 'make', 'makes',
  'need', 'needs', 'pay', 'pays', 'show', 'shows', 'start', 'starts', 'take', 'takes', 'use', 'uses', 'want', 'wants',
  'work', 'works',
]);
const norm = (text: string) => text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}-]+$/gu, '').toLowerCase();

/** Focusline: does the next word open a new caption on its own account? */
export function focuslineBreaksBefore(run: GroupWord[], next: GroupWord): boolean {
  if (run.length < 2) return false;
  const r = norm(next.text), first = norm(run[0].text);
  const hasHero = run.some((w) => w.tier === 2);
  if (next.tier === 2 && hasHero) {
    const last = run[run.length - 1];
    if (!(last.tier === 2 && norm(last.text).length + r.length + 1 <= 18)) return true;
  }
  if (r.includes('-') && run.length >= 3) return true;
  if (r === 'only' && run.length >= 3) return true;
  if (FOCUS_OPENERS.has(r) && run.length >= 3) return true;
  if (FOCUS_VERBS.has(r)) {
    if (FOCUS_OPENERS.has(first) && run.length >= 4) return true;
    if (!FOCUS_OPENERS.has(first) && !FOCUS_VERBS.has(first) && !run.some((w) => FOCUS_VERBS.has(norm(w.text)))) return true;
  }
  return false;
}

/** The cost of making run[o..l) one caption (the run has n words; at most `maxWords` per caption). */
export function captionCost(run: GroupWord[], o: number, l: number, maxWords: number): number {
  const n = run.length;
  const t = Math.max(1, Math.floor(maxWords));
  const s = run.slice(o, l);
  const secs = (run[l - 1].endMs - run[o].startMs) / 1000;
  const endsClause = CLAUSE_END.test(run[l - 1].text);
  const nextConj = l < n && CONJ_NEXT.test(run[l].text);
  const gap = l < n ? (run[l].startMs - run[l - 1].endMs) / 1000 : 0;
  const short = 9 * Math.max(0, 0.85 - secs);
  const lone = s.length === 1 && t > 1 ? 4 : 0;
  const brk = l === n ? 0 : endsClause && secs >= 0.65 ? -2 : nextConj || gap >= 0.18 ? 0 : 2;
  const innerClause = s.slice(0, -1).some((w, i) => i >= 1 && CLAUSE_MARK.test(w.text) && w.endMs - s[0].startMs >= 650);
  return 2.5 + short + lone + brk
    + (l < n && NO_END_ON.test(run[l - 1].text) ? 4 : 0)
    + (l < n && /^of$/i.test(run[l].text) ? 4 : 0)
    + (innerClause ? 4 : 0);
}

/** Split one run into captions of at most `maxWords`, at the least cost. */
export function splitRun(run: GroupWord[], maxWords: number, fits: (ws: GroupWord[]) => boolean = () => true): GroupWord[][] {
  const n = run.length;
  if (!n) return [];
  const t = Math.max(1, Math.floor(maxWords));
  const best = new Array<number>(n + 1).fill(Infinity);
  const cut = new Array<number>(n).fill(0);
  best[n] = 0;
  for (let o = n - 1; o >= 0; o--) {
    for (let l = o + 1; l <= Math.min(n, o + t); l++) {
      if (!fits(run.slice(o, l))) continue;
      const cost = captionCost(run, o, l, t) + best[l];
      if (cost < best[o]) { best[o] = cost; cut[o] = l; }
    }
  }
  const out: GroupWord[][] = [];
  for (let i = 0; i < n;) {
    const j = cut[i] || i + 1;
    out.push(run.slice(i, j));
    i = j;
  }
  return out;
}

export function groupCaptions(words: GroupWord[], opts: GroupingOptions): GroupWord[][] {
  const maxWords = Math.max(1, Math.floor(opts.maxWords));
  const out: GroupWord[][] = [];
  let run: GroupWord[] = [];
  const story = (ws: GroupWord[]) => ws.map((w) => ({ id: w.id, text: w.text, start: w.startMs / 1000, end: w.endMs / 1000, emphasisTier: w.tier }));
  const flush = () => {
    if (!run.length) return;
    if (opts.story) out.push(run);
    else for (const g of splitRun(run, maxWords, opts.fits)) out.push(g);
    run = [];
  };
  for (const w of words) {
    const last = run[run.length - 1];
    if (last && (last.speaker !== w.speaker || w.startMs - last.endMs >= 350)) flush();
    else if (opts.story === 'agent' && agentStoryBreakBefore(story(run), story([w])[0])) flush();
    else if (opts.story === 'reel' && propertyBreakBefore(story(run), story([w])[0])) flush();
    else if (opts.focusline && focuslineBreaksBefore(run, w)) flush();
    run.push(w);
    const full = opts.story ? run.length >= maxWords
      : opts.focusline && (CLAUSE_END.test(w.text.trim()) || run.length >= Math.max(3, Math.min(7, maxWords)));
    if (full || SENTENCE_END.test(w.text)) flush();
  }
  flush();
  return out;
}

/** Their minimum on-screen time for a caption: one under 0.9s holds until 0.9s (never past the
 *  next caption, which the display window clamps at anyway). */
export const MIN_CAPTION_MS = 900;
