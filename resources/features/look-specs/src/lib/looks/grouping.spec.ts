import { describe, it, expect } from 'vitest';
import { captionCost, focuslineBreaksBefore, groupCaptions, splitRun, type GroupWord } from './grouping';

/** Words spoken evenly, `each` ms apart, starting at 0. */
const speak = (text: string, each = 300, gapMs = 0, from = 0): GroupWord[] =>
  text.split(' ').map((t, i) => ({ id: `w${i}`, text: t, startMs: from + i * (each + gapMs), endMs: from + i * (each + gapMs) + each }));
const texts = (groups: GroupWord[][]) => groups.map((g) => g.map((w) => w.text).join(' '));

describe('caption grouping (their planner)', () => {
  it('a run ends at a sentence end, a pause of 350ms, or a speaker change', () => {
    const ws = speak('we tried. it worked');
    expect(texts(groupCaptions(ws, { maxWords: 4 }))).toEqual(['we tried.', 'it worked']);
    const paused = speak('a b c d');
    paused[2].startMs += 400; paused[2].endMs += 400; paused[3].startMs += 400; paused[3].endMs += 400;
    expect(texts(groupCaptions(paused, { maxWords: 4 }))).toEqual(['a b', 'c d']);
    const voices = speak('one two three four').map((w, i) => ({ ...w, speaker: i < 2 ? 'A' : 'B' }));
    expect(texts(groupCaptions(voices, { maxWords: 4 }))).toEqual(['one two', 'three four']);
  });

  it('a run longer than maxWords splits at the least cost: even halves beat a lone last word', () => {
    // five words, max four: [4,1] pays 4 for the lone word; [3,2] and [2,3] tie on the break plus
    // one short caption, and a tie goes to the SHORTER first caption (their strict-less update)
    expect(texts(groupCaptions(speak('one two three four five'), { maxWords: 4 }))).toEqual(['one two', 'three four five']);
    // eight words, max four: two fours
    expect(texts(groupCaptions(speak('a b c d e f g h'), { maxWords: 4 }))).toEqual(['a b c d', 'e f g h']);
  });

  it('breaks before a conjunction for free, and after a clause mark with time behind it for a bonus', () => {
    // "we kept going, but nothing worked": the comma after .65s of speech is the cheapest break
    const ws = speak('we kept going, but nothing worked', 300);
    expect(texts(groupCaptions(ws, { maxWords: 4 }))).toEqual(['we kept going,', 'but nothing worked']);
  });

  it('will not end a caption on an article or preposition when it can help it', () => {
    const ws = speak('take a look at the results now', 300);
    const got = texts(groupCaptions(ws, { maxWords: 4 }));
    for (const g of got.slice(0, -1)) expect(/\b(a|the|at)$/.test(g)).toBe(false);
    expect(got.join(' ')).toBe('take a look at the results now');
  });

  it('a very short caption is expensive: quick words are kept together', () => {
    // six words at 120ms each: three-and-three would give two 0.36s captions (short penalty x2)
    // against one 0.72s caption of six when six are allowed
    expect(texts(groupCaptions(speak('a b c d e f', 120), { maxWords: 6 }))).toEqual(['a b c d e f']);
  });

  it('a rows design only takes candidates that fit its rows', () => {
    const fits = (ws: GroupWord[]) => ws.map((w) => w.text).join(' ').length <= 9;
    // "then a" would fit, but a caption ending on "a" costs 4 more than a lone "then"
    expect(texts(groupCaptions(speak('short words then a longer stretch'), { maxWords: 4, fits }))).toEqual(
      ['short', 'words', 'then', 'a longer', 'stretch']);
    expect(splitRun(speak('one two'), 4, () => false)).toEqual([[expect.objectContaining({ text: 'one' })], [expect.objectContaining({ text: 'two' })]]);
  });

  it('Focusline ends a run at clause punctuation and at max(3, min(7, maxWords)) words', () => {
    expect(texts(groupCaptions(speak('one two three four five six seven eight nine'), { maxWords: 7, focusline: true })))
      .toEqual(['one two three four five six seven', 'eight nine']);
    expect(texts(groupCaptions(speak('wait, then go on'), { maxWords: 7, focusline: true }))).toEqual(['wait,', 'then go on']);
    // runs of three (the floor), each split under two words: [1,2] ties [2,1] and the shorter first wins
    expect(texts(groupCaptions(speak('one two three four five'), { maxWords: 2, focusline: true }))).toEqual(['one', 'two three', 'four five']);
  });

  it("Focusline's own break rule: openers, verbs after a plain start, hyphens, 'only', a second hero", () => {
    const run = speak('the biggest mistake');
    expect(focuslineBreaksBefore(run, { id: 'x', text: 'when', startMs: 900, endMs: 1200 })).toBe(true);     // an opener after 3 words
    expect(focuslineBreaksBefore(run.slice(0, 2), { id: 'x', text: 'when', startMs: 600, endMs: 900 })).toBe(false);
    expect(focuslineBreaksBefore(run, { id: 'x', text: 'day-to-day', startMs: 900, endMs: 1200 })).toBe(true);
    expect(focuslineBreaksBefore(run, { id: 'x', text: 'only', startMs: 900, endMs: 1200 })).toBe(true);
    expect(focuslineBreaksBefore(run.slice(0, 2), { id: 'x', text: 'makes', startMs: 600, endMs: 900 })).toBe(true);   // a verb after a plain start
    expect(focuslineBreaksBefore(speak('makes people'), { id: 'x', text: 'work', startMs: 600, endMs: 900 })).toBe(false); // a verb already in the run
    expect(focuslineBreaksBefore(speak('when you'), { id: 'x', text: 'need', startMs: 600, endMs: 900 })).toBe(false);   // an opener start needs 4 words
    expect(focuslineBreaksBefore(speak('when you really'), { id: 'x', text: 'need', startMs: 900, endMs: 1200 })).toBe(false);
    expect(focuslineBreaksBefore(speak('when you really do'), { id: 'x', text: 'need', startMs: 1200, endMs: 1500 })).toBe(true);
    const hero = speak('The biggest').map((w, i) => ({ ...w, tier: i === 1 ? 2 : 0 }));
    expect(focuslineBreaksBefore(hero, { id: 'x', text: 'mistake', startMs: 600, endMs: 900, tier: 2 })).toBe(false);   // heroes that pair short
    expect(focuslineBreaksBefore(hero, { id: 'x', text: 'misunderstanding', startMs: 600, endMs: 900, tier: 2 })).toBe(true);
    expect(focuslineBreaksBefore([{ id: 'a', text: 'a', startMs: 0, endMs: 300 }], { id: 'x', text: 'when', startMs: 300, endMs: 600 })).toBe(false);
  });

  it('the cost of a caption, term by term', () => {
    // a run of five, evenly 300ms each: "we kept going, but nothing"
    const run = speak('we kept going, but nothing', 300);
    const base = 2.5;
    // words 0-1 (0.6s): short 9 x .25 = 2.25; the break after "kept" is plain: +2
    expect(captionCost(run, 0, 2, 4)).toBeCloseTo(base + 2.25 + 2, 6);
    // words 0-3 (0.9s) end on the clause mark with .65s behind: -2
    expect(captionCost(run, 0, 3, 4)).toBeCloseTo(base - 2, 6);
    // words 0-4 end on "but" (an article/conjunction): +4, plain break +2, and the clause mark
    // now sits INSIDE the caption with .9s behind it: +4 (it should have broken there)
    expect(captionCost(run, 0, 4, 4)).toBeCloseTo(base + 4 + 2 + 4, 6);
    // the whole run: no break cost at the end, but the clause mark inside it still costs 4
    expect(captionCost(run, 0, 5, 5)).toBeCloseTo(base + 4, 6);
    // a lone word when more are allowed: +4 (and short 9 x .55); "going," ends a clause but with
    // only .3s behind it there is no bonus, and before "but" the break is free
    expect(captionCost(run, 2, 3, 4)).toBeCloseTo(base + 4 + 9 * 0.55, 6);
  });

  it('the cost of a caption: the clause bonus needs time behind it; an inner clause mark costs; "of" next costs', () => {
    const quick = speak('we kept going, but', 150);                               // "going," at 0.45s: no bonus
    expect(captionCost(quick, 0, 3, 4)).toBeCloseTo(2.5 + 9 * (0.85 - 0.45) + 0, 6);   // before "but": free break
    const run = speak('one two, three four five', 300);
    // "one two, three": the comma sits inside after .6s... an inner clause needs .65s from the start
    expect(captionCost(run, 0, 3, 4)).toBeCloseTo(2.5 + 2, 6);
    const slow = speak('one two, three four five', 400);                          // "two," ends at .8s inside "one two, three"
    expect(captionCost(slow, 0, 3, 4)).toBeCloseTo(2.5 + 4 + 2, 6);
    const of = speak('the best of times', 300);
    expect(captionCost(of, 0, 2, 4)).toBeCloseTo(2.5 + 2.25 + 2 + 4, 6);           // next word "of": +4
    expect(captionCost(of, 0, 3, 4)).toBeCloseTo(2.5 + 2 + 4, 6);                  // ends on "of": +4
    const gap = speak('hold on now', 300, 200);
    expect(captionCost(gap, 0, 1, 3)).toBeCloseTo(2.5 + 4 + 9 * 0.55 + 0, 6);      // a 200ms gap makes the break free
  });

  it('empty in, empty out; a single word is its own caption', () => {
    expect(groupCaptions([], { maxWords: 4 })).toEqual([]);
    expect(texts(groupCaptions(speak('hello'), { maxWords: 4 }))).toEqual(['hello']);
  });
});
