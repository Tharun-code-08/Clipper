import { describe, it, expect } from 'vitest';
import {
  DIMENSION_ACCENTS, dimensionBeats, dimensionHeroMotion, dimensionMotion, dimensionTravel, formatReelNumber, isPropertyReel, parseReelNumber,
  planPropertyMoment, propertyBreakBefore, reelCountValue,
} from './reel';
import type { StoryWord } from './plan';

const speak = (text: string, each = 0.3, from = 0): StoryWord[] =>
  text.split(' ').map((t, i) => ({ id: `w${i}`, text: t, start: from + i * each, end: from + (i + 1) * each }));
const texts = (ws: { text: string }[]) => ws.map((w) => w.text).join(' ');

describe('reel numbers', () => {
  it('reads figures, number words, decimals and Indian units', () => {
    expect(parseReelNumber(speak('1,800,000'))).toEqual({ value: 1800000, prefix: '', suffix: '', precision: 0, indian: false });
    expect(parseReelNumber(speak('two point five lakh'))).toEqual({ value: 250000, prefix: '', suffix: '', precision: 0, indian: true });
    expect(parseReelNumber(speak('40 percent'))).toEqual({ value: 40, prefix: '', suffix: '%', precision: 0, indian: false });
    expect(parseReelNumber(speak('twenty five thousand'))?.value).toBe(25000);
    expect(parseReelNumber(speak('$2.5m'))).toEqual({ value: 2500000, prefix: '$', suffix: '', precision: 0, indian: false });
    expect(parseReelNumber(speak('three hundred and twenty'))?.value).toBe(320);
    expect(parseReelNumber(speak('ninety rupees'))).toEqual({ value: 90, prefix: '₹', suffix: '', precision: 0, indian: true });
    expect(parseReelNumber(speak('500 plus'))).toBeNull();                       // "plus" is not a number word
    expect(parseReelNumber(speak('500+'))?.suffix).toBe('+');
    expect(parseReelNumber(speak('the price'))).toBeNull();
    expect(parseReelNumber(speak('five point'))).toBeNull();
    expect(parseReelNumber(speak('20 30'))).toBeNull();                          // two bare figures in a row
  });
  it('Gradient Estate keeps a trailing lakh / crore as the unit word', () => {
    expect(parseReelNumber(speak('20 lakh'), 'magenta-estate')).toEqual({ value: 20, prefix: '', suffix: ' lakh', precision: 0, indian: true });
    expect(parseReelNumber(speak('20 lakh'), 'reach-counter')?.value).toBe(2000000);
  });
  it('formats by locale, and counts up on a cubic ease', () => {
    const n = parseReelNumber(speak('two point five lakh'))!;
    expect(formatReelNumber(n)).toBe('2,50,000');
    expect(formatReelNumber(parseReelNumber(speak('1,800,000'))!)).toBe('1,800,000');
    expect(formatReelNumber(parseReelNumber(speak('40 percent'))!)).toBe('40%');
    expect(reelCountValue(n, 0)).toBe(0);
    expect(reelCountValue(n, 0.65)).toBe(250000);
    expect(reelCountValue(n, 0.325)).toBe(Math.trunc(250000 * (1 - 0.5 ** 3)));
    expect(reelCountValue({ value: 2.5, prefix: '', suffix: '', precision: 1, indian: false }, 0.325)).toBe(Math.trunc(2.5 * 0.875 * 10) / 10);
  });
});

describe('property moments (their planPropertyMoment)', () => {
  it('a figure is a counter (outlined when it carries lakh / crore), and clears the headline', () => {
    const m = planPropertyMoment(speak('this listing reached 1,800,000 views'), 'reach-counter');
    expect(m.treatment).toBe('counter');
    expect(m.numberIds).toEqual(['w3']);
    expect(m.headlineIds).toEqual([]);
    expect(m.icon).toBeUndefined();
    const o = planPropertyMoment(speak('listed at 20 lakh'), 'magenta-estate');
    expect(o.treatment).toBe('outline');
    expect(planPropertyMoment(speak('listed at 20 lakh'), 'dimension-story').treatment).toBe('counter');
    expect(planPropertyMoment(speak('listed at 20 lakh'), 'dimension-story').entrance).toBe('rise');
  });
  it('a keyword headlines; "your home" keeps its possessive; Gradient Estate glows and banners', () => {
    const h = planPropertyMoment(speak('buyers are already watching your listing'), 'reach-counter');
    expect(h.treatment).toBe('headline');
    expect(h.headlineIds).toEqual(['w2']);                                       // "already" is on the list
    const home = planPropertyMoment(speak('a place to call your home'), 'magenta-estate');
    expect(home.headlineIds).toEqual(['w4', 'w5']);
    expect(home.icon).toBe('home');
    expect(planPropertyMoment(speak('a great investment possible'), 'magenta-estate').treatment).toBe('glow');
    expect(planPropertyMoment(speak('a great investment possible'), 'reach-counter').treatment).toBe('headline');   // glow is Gradient Estate's alone
    expect(planPropertyMoment(speak('only in punjab today'), 'magenta-estate').treatment).toBe('banner');
    expect(planPropertyMoment(speak('only in punjab today'), 'reach-counter').treatment).toBe('headline');   // punjab is a keyword for every reel
    const marked = speak('those numbers get your attention');
    marked[4].emphasisTier = 2;
    expect(planPropertyMoment(marked, 'magenta-estate').headlineIds).toEqual(['w4']);
    expect(planPropertyMoment(speak('an amazing place'), 'dimension-story').headlineIds).toEqual(['w1']);
    expect(planPropertyMoment(speak('an amazing place'), 'reach-counter').treatment).toBe('spoken');
  });
  it('a lone small number word is not a counter unless a count noun follows', () => {
    expect(planPropertyMoment(speak('one great listing'), 'reach-counter').treatment).toBe('headline');
    expect(planPropertyMoment(speak('two offers came in'), 'reach-counter').treatment).toBe('counter');
  });
  it('a reel run breaks before and / but / aur / when / because, or past 3.8s, never under three words', () => {
    const run = speak('this listing reached');
    expect(propertyBreakBefore(run, { id: 'x', text: 'and', start: 0.9, end: 1.2 })).toBe(true);
    expect(propertyBreakBefore(run, { id: 'x', text: 'views', start: 0.9, end: 1.2 })).toBe(false);
    expect(propertyBreakBefore(run, { id: 'x', text: 'views', start: 3.9, end: 4.2 })).toBe(true);
    expect(propertyBreakBefore(run, { id: 'x', text: 'views', start: 3.0, end: 3.3 })).toBe(false);   // under 3.8s
    expect(propertyBreakBefore(run.slice(0, 2), { id: 'x', text: 'and', start: 0.6, end: 0.9 })).toBe(false);
    expect(isPropertyReel('reach-counter')).toBe(true);
    expect(isPropertyReel('agent-story')).toBe(false);
  });
});

describe('dimension beats', () => {
  it('beats alternate behind / front, cycle accents, and pick a hero by score', () => {
    const ws = speak('when you list with a great agent buyers are already watching', 0.3);
    const beats = dimensionBeats(ws);
    expect(beats.map((b) => b.plane)).toEqual(beats.map((_, i) => (i % 2 ? 'front' : 'behind')));
    expect(beats.map((b) => b.accent)).toEqual(beats.map((_, i) => DIMENSION_ACCENTS[i % DIMENSION_ACCENTS.length]));
    const heroes = beats.map((b) => ws.find((w) => w.id === b.heroId)!.text);
    expect(heroes).not.toContain('a');
    expect(heroes).not.toContain('with');
    expect(beats[0].wordIds.length).toBeGreaterThanOrEqual(3);
    expect(beats[0].wordIds.length).toBeLessThanOrEqual(5);
    // a beat holds through a close neighbour, never past the one after
    for (let i = 0; i < beats.length - 2; i++) expect(beats[i].end).toBeLessThanOrEqual(beats[i + 2].start);
  });
  it('a pinned word, a marked word or a figure wins the hero', () => {
    const ws = speak('the market moves fast today');
    expect(dimensionBeats(ws)[0].heroId).toBe('w1');                             // "market" is on the key list
    expect(dimensionBeats(ws, ['w3'])[0].heroId).toBe('w3');
    const num = speak('we sold 40 homes here');
    expect(dimensionBeats(num)[0].heroId).toBe('w2');
  });
  it('runs break at a 550ms gap or a sentence end', () => {
    const ws = speak('one two three. four five six', 0.3);
    const beats = dimensionBeats(ws);
    expect(beats[0].wordIds).toEqual(['w0', 'w1', 'w2']);
    expect(beats[1].wordIds).toEqual(['w3', 'w4', 'w5']);
    const gap = speak('a b c d e f', 0.3).map((w, i) => (i >= 3 ? { ...w, start: w.start + 1, end: w.end + 1 } : w));
    expect(dimensionBeats(gap).map((b) => b.wordIds.length)).toEqual([3, 3]);
  });
  it('dimension motion: a rise easing past 1.035 and settling, opacity over the first 35%', () => {
    expect(dimensionMotion(-0.1).opacity).toBe(0);
    expect(dimensionMotion(0.64)).toEqual({ opacity: 1, y: 0, scale: 1 });
    const mid = dimensionMotion(0.32, 0.64);
    expect(mid.opacity).toBe(1);
    expect(mid.y).toBeGreaterThan(0);                                             // still rising
    expect(dimensionMotion(0.76 * 0.64, 0.64).y).toBeCloseTo(78 * -0.035, 6);     // the overshoot at 76% of the ramp
    expect(dimensionTravel('behind', 5)).toBe('right');
    expect(dimensionTravel('front', 2)).toBe('up');
    expect(dimensionTravel('front', 1)).toBe('right');
    const hero = dimensionHeroMotion(0.1, 0.4, 'right');
    expect(hero.x).toBeLessThan(0);
    expect(hero.opacity).toBeGreaterThan(0);
    expect(dimensionHeroMotion(1, 0.4, 'right').x).toBe(0);
    expect(dimensionHeroMotion(1, 0.4, 'right', 0.05).opacity).toBeLessThan(0.5);   // leaving
    expect(dimensionHeroMotion(0.2, 0.4, 'up').x).toBe(0);
  });
});
