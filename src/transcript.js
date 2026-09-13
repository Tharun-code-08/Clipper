// Sentence-ish end: Latin punctuation, Devanagari danda, ellipsis — optionally followed by a closing quote/bracket.
const EOS = /[.?!।॥…]["'”’)\]]*$/;
const BOUNDARY_GAP = 0.35;

const endsSentence = (words, i) => Boolean(words[i]?.eos) || EOS.test(words[i]?.w || '');

/** Group words into short phrases: break on long pauses, sentence ends, or maxWords. */
export function buildPhrases(words, { maxWords = 14, gapSec = 0.6 } = {}) {
  const phrases = [];
  let i0 = 0;
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1];
    const gapBreak = next && next.s - words[i].e > gapSec;
    if (!next || gapBreak || endsSentence(words, i) || i - i0 + 1 >= maxWords) {
      const slice = words.slice(i0, i + 1);
      phrases.push({ i0, i1: i, s: slice[0].s, e: slice[slice.length - 1].e, text: slice.map((w) => w.w).join(' ') });
      i0 = i + 1;
    }
  }
  return phrases;
}

function levelOf(sortedSpeechDb, value) {
  if (!sortedSpeechDb.length) return 3;
  let n = 0;
  while (n < sortedSpeechDb.length && sortedSpeechDb[n] < value) n++;
  return Math.min(5, 1 + Math.floor((n / sortedSpeechDb.length) * 5));
}

/**
 * Compact transcript for the curator: one phrase per line.
 *   [312.4 e4] text          e1-e5 = loudness quintile of that phrase vs the whole video
 *   ✂ before a line          a camera/scene cut happened since the previous line
 *   (pause 2.1s)             silence before the line
 */
export function formatTranscript(phrases, { loudness, scenes = [] }) {
  const speechDb = loudness.db.filter((d) => d > -45).sort((a, b) => a - b);
  const lines = [];
  let sceneIdx = 0;
  let prevEnd = 0;
  for (const ph of phrases) {
    const a = Math.floor(ph.s / loudness.stepSec);
    const b = Math.max(a + 1, Math.ceil(ph.e / loudness.stepSec));
    const slice = loudness.db.slice(a, b);
    const mean = slice.length ? slice.reduce((x, y) => x + y, 0) / slice.length : -60;
    let cut = false;
    while (sceneIdx < scenes.length && scenes[sceneIdx] <= ph.s) { cut = true; sceneIdx++; }
    const pause = ph.s - prevEnd;
    const pre = `${cut ? '✂ ' : ''}${pause >= 1.5 && lines.length ? `(pause ${pause.toFixed(1)}s) ` : ''}`;
    lines.push(`${pre}[${ph.s.toFixed(1)} e${levelOf(speechDb, mean)}] ${ph.text}`);
    prevEnd = ph.e;
  }
  return lines.join('\n');
}

export const isStartBoundary = (words, i) => i === 0 || endsSentence(words, i - 1) || words[i].s - words[i - 1].e >= BOUNDARY_GAP;
export const isEndBoundary = (words, i) => i === words.length - 1 || endsSentence(words, i) || words[i + 1].s - words[i].e >= BOUNDARY_GAP;

/**
 * Snap a proposed start time onto the first word of a sentence/breath group near it.
 * Non-boundary words cost a 1.2 s distance penalty, so a real sentence start up to ~1 s away wins.
 */
export function snapStart(t, words, { window = 2.5, preRoll = 0.12 } = {}) {
  let best = -1;
  let bestCost = Infinity;
  for (let i = 0; i < words.length; i++) {
    const d = Math.abs(words[i].s - t);
    if (words[i].s > t + window) break;
    if (d > window) continue;
    const cost = d + (isStartBoundary(words, i) ? 0 : 1.2);
    if (cost < bestCost) { bestCost = cost; best = i; }
  }
  if (best < 0) return { t: Math.max(0, t), index: -1 };
  const floor = best > 0 ? words[best - 1].e + 0.02 : 0;
  return { t: Math.max(0, floor, words[best].s - preRoll), index: best };
}

/** Snap a proposed end time onto the last word of a sentence near it, with a short tail. */
export function snapEnd(t, words, { window = 2.5, tail = 0.3 } = {}) {
  let best = -1;
  let bestCost = Infinity;
  for (let i = 0; i < words.length; i++) {
    if (words[i].e > t + window) break;
    const d = Math.abs(words[i].e - t);
    if (d > window) continue;
    const cost = d + (isEndBoundary(words, i) ? 0 : 1.2);
    if (cost < bestCost) { bestCost = cost; best = i; }
  }
  if (best < 0) return { t, index: -1 };
  const ceil = best < words.length - 1 ? words[best + 1].s - 0.02 : Infinity;
  return { t: Math.min(ceil, words[best].e + tail), index: best };
}

/** Plain text of the words fully inside [start, end]. */
export const textBetween = (words, start, end) =>
  words.filter((w) => w.s >= start - 0.05 && w.e <= end + 0.05).map((w) => w.w).join(' ');
