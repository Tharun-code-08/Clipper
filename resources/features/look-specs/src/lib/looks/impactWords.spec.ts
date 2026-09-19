import { describe, it, expect } from 'vitest';
import { isContentWord, pickImpactWords, collapseImpact, timedImpactGroup, planImpact } from './impactWords';

type W = { id: string; text: string; startMs: number; endMs: number; hero?: boolean; score?: number };
const ws = (...texts: string[]): W[] => texts.map((t, i) => ({ id: `w${i}`, text: t, startMs: i * 300, endMs: i * 300 + 250 }));
const none = () => 0;
const marked = (w: W) => !!w.hero;
const score = (w: W) => w.score ?? 0;

describe('content words', () => {
  it('drops function words in English, romanised Hindi and Devanagari', () => {
    expect(isContentWord('the')).toBe(false);
    expect(isContentWord('ten')).toBe(true);
    expect(isContentWord("don't")).toBe(true);
    expect(isContentWord('hai')).toBe(false);
    expect(isContentWord('का')).toBe(false);
    expect(isContentWord('साफ')).toBe(true);
    expect(isContentWord('—')).toBe(false);
    expect(isContentWord('The,')).toBe(false);
  });
});

describe('picking the impact words', () => {
  it('marked words take the role, every one of them, whatever the cap', () => {
    const p = ws('one', 'two', 'three'); p[0].hero = true; p[2].hero = true;
    expect(pickImpactWords(p, { marked, score, maxPerClip: 1 })).toEqual([0, 2]);
  });

  it('else the strongest content words, by score then order, up to the cap', () => {
    const p = ws('one', 'two', 'three', 'four'); p[1].score = 2; p[2].score = 5; p[3].score = 2;
    expect(pickImpactWords(p, { marked, score, maxPerClip: 2 })).toEqual([1, 2]);
    expect(pickImpactWords(p, { marked, score, maxPerClip: 1 })).toEqual([2]);
  });

  it('leading-by-length: the first content word, paired when it is short in a phrase of three', () => {
    expect(pickImpactWords(ws('ten', 'years', 'into', 'editing'), { marked, score: none, select: 'leading', maxPerClip: 2 })).toEqual([0, 1]);
    expect(pickImpactWords(ws('ten', 'years'), { marked, score: none, select: 'leading', maxPerClip: 2 })).toEqual([0]);
    expect(pickImpactWords(ws('subtitles', 'made', 'by', 'hand'), { marked, score: none, select: 'leading', maxPerClip: 2 })).toEqual([0]);
    expect(pickImpactWords(ws('the', 'quick', 'fox'), { marked, score: none, select: 'leading', maxPerClip: 2 })).toEqual([1]);
    // the pair only when the neighbour is a content word
    expect(pickImpactWords(ws('one', 'of', 'them', 'here'), { marked, score: none, select: 'leading', maxPerClip: 2 })).toEqual([0]);
    // and never past maxChars
    expect(pickImpactWords(ws('ten', 'years', 'into', 'editing'), { marked, score: none, select: 'leading', maxPerClip: 2, maxChars: 5 })).toEqual([0]);
    // a cap of one never pairs
    expect(pickImpactWords(ws('ten', 'years', 'into'), { marked, score: none, select: 'leading', maxPerClip: 1 })).toEqual([0]);
  });

  it('trailing-by-length: the last content word, paired backwards', () => {
    expect(pickImpactWords(ws('into', 'everyone', 'progress'), { marked, score: none, select: 'trailing', maxPerClip: 1 })).toEqual([2]);
    expect(pickImpactWords(ws('make', 'it', 'pop', 'now'), { marked, score: none, select: 'trailing', maxPerClip: 2 })).toEqual([2, 3]);
    expect(pickImpactWords(ws('make', 'it', 'pop', 'now'), { marked, score: none, select: 'trailing', maxPerClip: 2, maxChars: 4 })).toEqual([3]);
  });

  it('tied scores break towards the design end: last for trailing, first otherwise', () => {
    const p = ws('into', 'everyone', 'progress'); p[1].score = 3; p[2].score = 3;
    expect(pickImpactWords(p, { marked, score, select: 'trailing', maxPerClip: 1 })).toEqual([2]);
    expect(pickImpactWords(p, { marked, score, select: 'leading', maxPerClip: 1 })).toEqual([1]);
    expect(pickImpactWords(p, { marked, score, maxPerClip: 1 })).toEqual([1]);
  });

  it('scores outrank the by-length rule; marks outrank scores', () => {
    const p = ws('ten', 'years', 'into', 'editing'); p[3].score = 3;
    expect(pickImpactWords(p, { marked, score, select: 'leading', maxPerClip: 2 })).toEqual([3]);
    p[1].hero = true;
    expect(pickImpactWords(p, { marked, score, select: 'leading', maxPerClip: 2 })).toEqual([1]);
  });

  it('with nothing to go on, only an always-impact design invents one', () => {
    const p = ws('the', 'of', 'a');
    expect(pickImpactWords(p, { marked, score: none })).toEqual([]);
    expect(pickImpactWords(p, { marked, score: (w) => (w.text === 'of' ? 1 : 0), always: true })).toEqual([1]);
  });
});

describe('a pair that does not fit collapses to one word', () => {
  const p = ws('ten', 'years', 'into');
  it('keeps the pair at 78% of the design size or better', () => {
    expect(collapseImpact(p, [0, 1], 0.8, none, 'leading')).toEqual([0, 1]);
    expect(collapseImpact(p, [0, 1], 0.78, none, 'leading')).toEqual([0, 1]);
  });
  it('below that, the strongest word survives, else the first (leading) or last (trailing)', () => {
    expect(collapseImpact(p, [0, 1], 0.5, none, 'leading')).toEqual([0]);
    expect(collapseImpact(p, [0, 1], 0.5, none, 'trailing')).toEqual([1]);
    expect(collapseImpact(p, [0, 1], 0.5, (w) => (w.text === 'years' ? 2 : 1), 'leading')).toEqual([1]);
  });
  it('a single word is never touched', () => {
    expect(collapseImpact(p, [2], 0.1, none)).toEqual([2]);
  });
});

describe('several impact groups take the hero in turn', () => {
  const p = ws('hook', 'breaks', 'in', 'seconds');       // hook 0-250, seconds 900-1150
  it('switches halfway through the silence between groups', () => {
    expect(timedImpactGroup(p, [0, 3], 0)).toEqual([0]);
    expect(timedImpactGroup(p, [0, 3], 574)).toEqual([0]);
    expect(timedImpactGroup(p, [0, 3], 575)).toEqual([3]);
    expect(timedImpactGroup(p, [0, 3], 5000)).toEqual([3]);
  });
  it('adjacent impact words are one group', () => {
    expect(timedImpactGroup(p, [0, 1], 2000)).toEqual([0, 1]);
    expect(timedImpactGroup(p, [], 0)).toEqual([]);
  });
});

describe('the whole plan', () => {
  it('a pair that fits is the hero; a pair that does not leaves its second word in the row as a keyword', () => {
    const p = ws('ten', 'years', 'into', 'editing');
    const fits = planImpact(p, 0, { marked, score: none, select: 'leading', maxPerClip: 2, fitRatio: () => 1 });
    expect(fits.hero.map((w) => w.text)).toEqual(['ten', 'years']);
    expect(fits.row.map((w) => w.text)).toEqual(['into', 'editing']);
    expect(fits.keywords.size).toBe(0);
    const tight = planImpact(p, 0, { marked, score: none, select: 'leading', maxPerClip: 2, fitRatio: () => 0.4 });
    expect(tight.hero.map((w) => w.text)).toEqual(['ten']);
    expect([...tight.keywords].map((w) => w.text)).toEqual(['years']);
    expect(tight.row.map((w) => w.text)).toEqual(['years', 'into', 'editing']);
  });

  it('two impact words apart in the phrase still collapse to one hero for the whole phrase', () => {
    const p = ws('hook', 'breaks', 'in', 'seconds'); p[0].hero = true; p[3].hero = true;
    for (const t of [0, 600, 2000]) {
      const plan = planImpact(p, t, { marked, score, fitRatio: () => 0.3 });
      expect(plan.hero.map((w) => w.text)).toEqual(['hook']);
      expect([...plan.keywords].map((w) => w.text)).toEqual(['seconds']);
    }
    // a pair that fits, apart in the phrase, takes the hero in turn
    expect(planImpact(p, 2000, { marked, score, fitRatio: () => 1 }).hero.map((w) => w.text)).toEqual(['seconds']);
    // a marked pair ties, and a tie among scored words goes to the first whatever the design
    expect(planImpact(p, 0, { marked, score, select: 'trailing', fitRatio: () => 0.3 }).hero.map((w) => w.text)).toEqual(['hook']);
    // only an unscored pair falls back to the design end
    const q = ws('make', 'it', 'pop', 'now');
    expect(planImpact(q, 0, { marked, score: none, select: 'trailing', maxPerClip: 2, fitRatio: () => 0.3 }).hero.map((w) => w.text)).toEqual(['now']);
  });

  it('the fit is only asked about a real pair', () => {
    let asked = 0;
    planImpact(ws('subtitles', 'made'), 0, { marked, score: none, select: 'leading', maxPerClip: 2, fitRatio: () => { asked++; return 0.1; } });
    expect(asked).toBe(0);
  });
});
