import { describe, it, expect } from 'vitest';
import { detectLocal, isExactFiller, normToken, type DetectLocalInput, type LocalRemoval } from './detectLocal';
import { deriveKeepSegments, totalDuration } from './segments';
import { DEFAULT_EDIT_OPTIONS, type EditOptions } from './types';

type Wd = DetectLocalInput['words'][number];

/** Lay words out from a script: numbers are pauses in ms, strings are words (each 300 ms
 *  unless written "word:ms"). Returns words + the end time. */
function lay(script: (string | number)[], startMs = 500): { words: Wd[]; end: number } {
  const words: Wd[] = [];
  let t = startMs;
  for (const item of script) {
    if (typeof item === 'number') { t += item; continue; }
    const [text, dur] = item.split(':');
    const d = dur ? Number(dur) : 300;
    words.push({ text, startMs: t, endMs: t + d });
    t += d;
  }
  return { words, end: t };
}

const opts = (patch: Partial<EditOptions> = {}): EditOptions => ({ ...DEFAULT_EDIT_OPTIONS, ...patch });
const only = (patch: Partial<EditOptions>): EditOptions =>
  opts({ removeSilences: false, removeFillers: false, removeRepetitions: false, ...patch });

function unionSec(rs: LocalRemoval[]): number {
  const s = [...rs].sort((a, b) => a.start - b.start);
  let total = 0;
  let curS = -1;
  let curE = -1;
  for (const r of s) {
    if (r.start > curE) { if (curE > curS) total += curE - curS; curS = r.start; curE = r.end; }
    else curE = Math.max(curE, r.end);
  }
  if (curE > curS) total += curE - curS;
  return total;
}

/** The audit invariant: reported total == Σ records == union == what the keeps remove. */
function expectHonestTotal(out: ReturnType<typeof detectLocal>, durationMs: number) {
  const sum = out.removals.reduce((a, r) => a + (r.end - r.start), 0);
  expect(out.totalSec).toBeCloseTo(sum, 6);
  expect(unionSec(out.removals)).toBeCloseTo(sum, 6);
  const keeps = deriveKeepSegments(out.removals, durationMs / 1000);
  if (out.removals.length) expect(durationMs / 1000 - totalDuration(keeps)).toBeCloseTo(sum, 1);
  for (const r of out.removals) {
    expect(r.end).toBeGreaterThan(r.start);
    expect(typeof r.detail).toBe('string');
    expect(r.detail.length).toBeGreaterThan(0);
  }
}

describe('normalisation + filler lexicon', () => {
  it('keeps Devanagari marks and strips punctuation', () => {
    expect(normToken('हम्म,')).toBe('हम्म');
    expect(normToken('Umm...')).toBe('umm');
    expect(normToken("Don't")).toBe('dont');
  });
  it('recognises hesitations but never real words', () => {
    for (const f of ['um', 'umm', 'ummmm', 'uh', 'uhh', 'erm', 'er', 'hmm', 'mm', 'amm', 'aaa', 'उम्म', 'अं', 'हम्म']) {
      expect(isExactFiller(normToken(f))).toBe(true);
    }
    for (const real of ['hum', 'हम', 'हाँ', 'aa', 'me', 'main', 'mummy', 'summer', 'her', 'erase']) {
      expect(isExactFiller(normToken(real))).toBe(false);
    }
  });
});

describe('silence', () => {
  it('cuts gaps above the level threshold, keeps shorter pauses, trims both edges', () => {
    const { words, end } = lay(['aaj', 'hum', 1000, 'baat', 600, 'karenge'], 1000);
    const duration = end + 2000;
    const out = detectLocal({ words, durationMs: duration, options: only({ removeSilences: true, aggressionLevel: 1 }) });
    const kinds = out.removals.map((r) => r.detail.split(' ')[0]);
    expect(kinds).toEqual(['leading', 'pause', 'trailing']);
    // Leading: 0 → first word − guard.
    expect(out.removals[0].start).toBe(0);
    expect(out.removals[0].end).toBeCloseTo(0.96, 3);
    // Gap between "hum" (ends 1.6s) and "baat" (starts 2.6s), minus 40ms guards.
    expect(out.removals[1].start).toBeCloseTo(1.64, 3);
    expect(out.removals[1].end).toBeCloseTo(2.56, 3);
    // Trailing runs to the very end.
    expect(out.removals[2].end).toBeCloseTo(duration / 1000, 6);
    expectHonestTotal(out, duration);
  });

  it('the 600ms pause is cut at Strong (0.5s) but not at Balanced (0.8s)', () => {
    const { words, end } = lay(['aaj', 600, 'karenge'], 0);
    const bal = detectLocal({ words, durationMs: end, options: only({ removeSilences: true, aggressionLevel: 1 }) });
    const strong = detectLocal({ words, durationMs: end, options: only({ removeSilences: true, aggressionLevel: 2 }) });
    expect(bal.removals.filter((r) => r.detail.startsWith('pause'))).toHaveLength(0);
    expect(strong.removals.filter((r) => r.detail.startsWith('pause'))).toHaveLength(1);
  });

  it('never measures a gap against a lowConfidence (unverified-timing) word', () => {
    const { words, end } = lay(['aaj', 2000, 'karenge'], 0);
    words[1] = { ...words[1], lowConfidence: true };
    const out = detectLocal({ words, durationMs: end, options: only({ removeSilences: true }) });
    expect(out.removals.filter((r) => r.detail.startsWith('pause'))).toHaveLength(0);
  });

  it('with speech regions, only cuts where the audio is actually silent', () => {
    // 2 s word-gap, but the VAD hears 800 ms of (untranscribed) speech in the middle.
    const { words, end } = lay(['aaj', 2000, 'karenge'], 0);
    const speechRegions = [
      { startMs: 0, endMs: 300 },
      { startMs: 900, endMs: 1700 },
      { startMs: 2300, endMs: 2600 },
    ];
    const bal = detectLocal({ words, durationMs: end, speechRegions, options: only({ removeSilences: true, aggressionLevel: 1 }) });
    expect(bal.removals).toHaveLength(0); // two 600 ms silences — natural pauses at Balanced
    const max = detectLocal({ words, durationMs: end, speechRegions, options: only({ removeSilences: true, aggressionLevel: 3 }) });
    const pauses = max.removals.filter((r) => r.detail.startsWith('pause'));
    expect(pauses).toHaveLength(2);
    for (const p of pauses) {
      // Never overlaps the region the VAD heard.
      expect(p.end <= 0.9 || p.start >= 1.7).toBe(true);
    }
    expectHonestTotal(max, end);
  });
});

describe('fillers', () => {
  it('cuts the filler word ±30ms, English + Devanagari, and leaves "हम" (we) alone', () => {
    const { words, end } = lay(['so', 150, 'umm', 150, 'today', 'हम', 150, 'हम्म', 150, 'चलते', 'हैं'], 0);
    const out = detectLocal({ words, durationMs: end, options: only({ removeFillers: true }) });
    expect(out.removals.map((r) => r.text)).toEqual(['umm', 'हम्म']);
    const umm = words[1];
    expect(out.removals[0].start).toBeCloseTo((umm.startMs - 30) / 1000, 6);
    expect(out.removals[0].end).toBeCloseTo((umm.endMs + 30) / 1000, 6);
    expect(out.removals.every((r) => r.reason === 'filler')).toBe(true);
    expectHonestTotal(out, end);
  });

  it('context fillers only at Strong/Max, and only when they hang on a pause', () => {
    const { words, end } = lay(['I', 'like', 'pizza', 400, 'like', 400, 'matlab', 'kya', 'toh', 'yeh', 300, 'toh', 300, 'suno'], 0);
    const bal = detectLocal({ words, durationMs: end, options: only({ removeFillers: true, aggressionLevel: 1 }) });
    expect(bal.removals).toHaveLength(0);
    const max = detectLocal({ words, durationMs: end, options: only({ removeFillers: true, aggressionLevel: 3 }) });
    // "I like pizza" and "kya toh yeh" (no pause) survive; the pause-bound ones go.
    expect(max.removals.map((r) => r.text)).toEqual(['like', 'matlab', 'toh']);
    expect(max.removals[1].detail).toContain('context filler');
    expectHonestTotal(max, end);
  });

  it('fillers are removed BEFORE gaps are measured (two half-gaps become one real pause)', () => {
    // 500ms + "umm"(300) + 500ms: each half is below Balanced's 0.8s, together 1.0s.
    const { words, end } = lay(['aaj', 500, 'umm', 500, 'karenge'], 0);
    const out = detectLocal({ words, durationMs: end, options: opts({ removeRepetitions: false, aggressionLevel: 1 }) });
    const reasons = out.removals.map((r) => r.reason);
    expect(reasons).toContain('filler');
    expect(reasons).toContain('silence');
    // Everything between the two kept words (minus guards) is gone, and counted once.
    const cutStart = Math.min(...out.removals.map((r) => r.start));
    const cutEnd = Math.max(...out.removals.map((r) => r.end));
    expect(cutStart).toBeCloseTo(0.34, 3);
    expect(cutEnd).toBeCloseTo(1.56, 3);
    expect(out.totalSec).toBeCloseTo(1.22, 3);
    expectHonestTotal(out, end);
  });
});

describe('retakes (conservative)', () => {
  it('cuts the abandoned attempt, keeps the restart', () => {
    const { words, end } = lay([
      'hey', 'guys', 'aaj', 'hum', 'baat', 'karenge', 800,
      'hey', 'guys', 'aaj', 'hum', 'baat', 'karenge', 'crypto', 'ke', 'baare', 'mein',
    ], 0);
    const out = detectLocal({ words, durationMs: end, options: only({ removeRepetitions: true }) });
    expect(out.removals).toHaveLength(1);
    const r = out.removals[0];
    expect(r.reason).toBe('repetition');
    expect(r.start).toBe(0);
    // Up to (restart onset − 30ms pad).
    expect(r.end).toBeCloseTo((words[6].startMs - 30) / 1000, 6);
    expect(r.text).toBe('hey guys aaj hum baat karenge');
    expect(r.detail).toMatch(/^retake: "hey guys aaj hum baat karenge" \(6 words\)/);
    expectHonestTotal(out, end);
  });

  it('Devanagari: 5 matched tokens with 2 content words is a retake', () => {
    const { words, end } = lay(['यह', 'वीडियो', 'बहुत', 'ज़रूरी', 'है', 900, 'यह', 'वीडियो', 'बहुत', 'ज़रूरी', 'है', 'दोस्तों'], 200);
    const out = detectLocal({ words, durationMs: end, options: only({ removeRepetitions: true }) });
    expect(out.removals).toHaveLength(1);
    expect(out.removals[0].text).toBe('यह वीडियो बहुत ज़रूरी है');
  });

  it('NEVER cuts on 3 matching words (the 7-second Hindi deletion)', () => {
    const { words, end } = lay([
      'main', 'aapko', 'bataunga', 'ki', 'kaise', 'paise', 'kamaye', 'jaate', 'hain', 500,
      'main', 'aapko', 'bataunga', 'ki', 'kya', 'galti', 'mat', 'karna',
    ], 0);
    // "main aapko bataunga ki" is 4 tokens but only ONE content word ("bataunga").
    const out = detectLocal({ words, durationMs: end, options: only({ removeRepetitions: true }) });
    expect(out.removals).toHaveLength(0);
    const three = lay(['doston', 'bahut', 'zaroori', 'baat', 'hai', 400, 'doston', 'bahut', 'zaroori', 'cheez'], 0);
    expect(detectLocal({ words: three.words, durationMs: three.end, options: only({ removeRepetitions: true }) }).removals).toHaveLength(0);
  });

  it('a spoken marker carries a retake that has only ONE content word', () => {
    // Same 4 tokens as above ("main aapko bataunga ki" — only "bataunga" is content), which stay
    // when nothing marks them. Saying "sorry" and starting again is the evidence that they were a
    // false start. Measured: this is what a real restart in the founder's recordings looked like.
    const { words, end } = lay([
      'main', 'aapko', 'bataunga', 'ki', 'sorry', 400,
      'main', 'aapko', 'bataunga', 'ki', 'kya', 'galti', 'mat', 'karna',
    ], 0);
    const out = detectLocal({ words, durationMs: end, options: only({ removeRepetitions: true }) });
    expect(out.removals).toHaveLength(1);
    expect(out.removals[0].reason).toBe('repetition');
    expect(out.removals[0].detail).toMatch(/marker "sorry"/);
    expectHonestTotal(out, end);
  });

  it('requires a bounded interruption (≤3.5s) and a 12s forward window', () => {
    const phrase = ['crypto', 'market', 'crash', 'hone', 'wala'];
    const longGap = lay([...phrase, 4000, ...phrase, 'hai'], 0);
    expect(detectLocal({ words: longGap.words, durationMs: longGap.end, options: only({ removeRepetitions: true }) }).removals).toHaveLength(0);
    // Interruption of spoken words that pushes the restart past 3.5s.
    const talky = lay([...phrase, ...Array.from({ length: 12 }, (_, i) => `beech${i}`), ...phrase, 'hai'], 0);
    expect(detectLocal({ words: talky.words, durationMs: talky.end, options: only({ removeRepetitions: true }) }).removals).toHaveLength(0);
    const ok = lay([...phrase, 3000, ...phrase, 'hai'], 0);
    expect(detectLocal({ words: ok.words, durationMs: ok.end, options: only({ removeRepetitions: true }) }).removals).toHaveLength(1);
  });

  it('never cuts across unverified (lowConfidence) timing', () => {
    const { words, end } = lay(['crypto', 'market', 'crash', 'hone', 'wala', 600, 'crypto', 'market', 'crash', 'hone', 'wala', 'hai'], 0);
    words[2] = { ...words[2], lowConfidence: true };
    expect(detectLocal({ words, durationMs: end, options: only({ removeRepetitions: true }) }).removals).toHaveLength(0);
  });

  it('markers are boundaries: cut with the abandoned attempt and named in the audit', () => {
    const { words, end } = lay([
      'aaj', 'main', 'aapko', 'iphone', 'review', 'dikhane', 'sorry', 300, 'phir', 'se', 300,
      'aaj', 'main', 'aapko', 'iphone', 'review', 'dikhane', 'wala', 'hoon',
    ], 0);
    const out = detectLocal({ words, durationMs: end, options: only({ removeRepetitions: true }) });
    expect(out.removals).toHaveLength(1);
    expect(out.removals[0].text).toBe('aaj main aapko iphone review dikhane sorry phir se');
    expect(out.removals[0].detail).toContain('marker "sorry", "phir se"');
  });

  it('a marker alone never cuts speech', () => {
    const { words, end } = lay(['I', 'am', 'so', 'sorry', 'for', 'your', 'loss', 'phir', 'se', 'milenge'], 0);
    expect(detectLocal({ words, durationMs: end, options: only({ removeRepetitions: true }) }).removals).toHaveLength(0);
  });

  it('a triple take keeps only the last attempt', () => {
    const p = ['sabse', 'pehle', 'settings', 'kholo'];
    const { words, end } = lay([...p, 500, ...p, 500, ...p, 'aur', 'phone'], 0);
    const out = detectLocal({ words, durationMs: end, options: only({ removeRepetitions: true }) });
    expect(unionSec(out.removals)).toBeCloseTo((words[8].startMs - 30) / 1000, 6);
    expectHonestTotal(out, end);
  });
});

describe('audit total', () => {
  it('overlapping passes are subtracted: the reported total equals the real removal', () => {
    const { words, end } = lay([
      'hey', 'guys', 'aaj', 'hum', 'baat', 'karenge', 1200, 'umm', 1200,
      'hey', 'guys', 'aaj', 'hum', 'baat', 'karenge', 900, 'uh', 900, 'crypto', 'ke', 'baare', 'mein',
    ], 1500);
    const duration = end + 1800;
    const out = detectLocal({ words, durationMs: duration, options: opts({ aggressionLevel: 1 }) });
    // Retake swallowed the pause + "umm" after it; the "umm" must not be counted again.
    expect(out.removals.filter((r) => r.text === 'umm')).toHaveLength(0);
    expect(new Set(out.removals.map((r) => r.reason))).toEqual(new Set(['repetition', 'filler', 'silence']));
    expectHonestTotal(out, duration);
  });

  it('toggles off → nothing of that kind; no words → nothing at all', () => {
    const { words, end } = lay(['aaj', 2000, 'umm', 'karenge'], 1000);
    const none = detectLocal({ words, durationMs: end, options: only({}) });
    expect(none.removals).toHaveLength(0);
    expect(detectLocal({ words: [], durationMs: 10_000, options: opts() }).totalSec).toBe(0);
  });
});
