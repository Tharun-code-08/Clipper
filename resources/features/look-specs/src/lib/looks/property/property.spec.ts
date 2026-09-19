import { describe, it, expect } from 'vitest';
import { cinematicJitter, cinematicMotion, phraseSlotFrames, storyReplacementBeats, storySlideFrames, storyHeadlineLeadAtTime, supportingWordMotion } from './motion';
import { agentStoryBreakBefore, cinematicReadingEnd, phraseChoreography, phraseRoles, planAgentStory, readableAnchorGroups, readableGroups, readingTime, replacementHasReadingRoom, type StoryWord } from './plan';
import { clearFaceY, fitPropertyHeadline, propertyHeadlineWidth, propertyLeadAtTime, rearCaptionGeometry } from './geometry';

const speak = (text: string, each = 0.3, from = 0): StoryWord[] =>
  text.split(' ').map((t, i) => ({ id: `w${i}`, text: t, start: from + i * each, end: from + (i + 1) * each }));
const texts = (ws: { text: string }[]) => ws.map((w) => w.text).join(' ');

describe('agent story plan (their planAgentStory)', () => {
  it('a keyword (or the marked word) becomes the headline, a figure with its unit the amount, the rest support', () => {
    // "price" is not on their keyword list: it headlines because the transcript marks it (tier 2)
    const ws = speak('Imagine the asking price is $800,000');
    expect(planAgentStory(ws).headline).toEqual([]);
    ws[3].emphasisTier = 2;
    const p = planAgentStory(ws);
    expect(texts(p.headline)).toBe('price');
    expect(texts(p.amount)).toBe('$800,000');
    expect(texts(p.support)).toBe('Imagine the asking is');
    expect(p.headlineMode).toBe('hold');
    expect(p.icon).toBeNull();
    expect(p.focus).toBe(false);
    expect(p.italic).toBe(false);
    expect(p.numberStyle).toBe('outline');
  });

  it('a unit word rides with the figure; equity / income / worth make the number solid', () => {
    const p = planAgentStory(speak('you paid 40 percent under asking'));
    expect(texts(p.amount)).toBe('40 percent');
    expect(planAgentStory(speak('your equity is 120 thousand now')).numberStyle).toBe('solid');
  });

  it('an icon word picks the icon and clears the headline; "degree" keeps one', () => {
    const p = planAgentStory(speak('the seller kept calling my phone'));
    expect(p.icon).toBe('phone');
    expect(p.headline).toEqual([]);
    const d = planAgentStory(speak('no bachelor degree needed for this deal'));
    expect(d.icon).toBe('degree');
    expect(texts(d.headline)).toBe('bachelor');
    expect(d.italic).toBe(true);
  });

  it('focus: an agent who stops, counters or offers, with no buyer around', () => {
    const p = planAgentStory(speak('the agent will counter your offer'));
    expect(p.focus).toBe(true);
    expect(p.headline).toEqual([]);
    expect(planAgentStory(speak('the buyer and the agent counter')).focus).toBe(false);
    expect(planAgentStory(speak('the seller will counter your offer')).focus).toBe(false);   // no agent in it
  });

  it('"moved in" and "my own" take the headline; a short "my own" or "lying" phrase plays as replacement', () => {
    expect(texts(planAgentStory(speak('we finally moved in last week')).headline)).toBe('moved in');
    const own = planAgentStory(speak('I wanted my own place'));
    expect(own.headlineMode).toBe('replace');
    expect(texts(own.headline)).toBe('I wanted my own place');
    expect(own.support).toEqual([]);
    const lie = planAgentStory(speak('they were lying to you'));
    expect(lie.headlineMode).toBe('replace');
    expect(lie.italic).toBe(false);
    // a long "my own" phrase holds instead
    expect(planAgentStory(speak('I always wanted my own place with a big yard and a pool for the kids')).headlineMode).toBe('hold');
  });

  it('a marked word stands in for a keyword; a figure never becomes the headline', () => {
    const ws = speak('the market moves fast');
    ws[1].emphasisTier = 2;
    expect(texts(planAgentStory(ws).headline)).toBe('market');
    expect(texts(planAgentStory(speak('you paid 900 for the home')).headline)).toBe('home');
    const both = speak('the seller and the market');
    both[4].emphasisTier = 2;
    expect(texts(planAgentStory(both).headline)).toBe('seller');                    // a keyword outranks the mark
  });

  it('a run breaks before a conjunction, before a different icon, or past 4.2s — never under three words', () => {
    const run = speak('the seller kept calling');
    expect(agentStoryBreakBefore(run, { id: 'x', text: 'and', start: 1.2, end: 1.5 })).toBe(true);
    expect(agentStoryBreakBefore(run, { id: 'x', text: 'door', start: 1.2, end: 1.5 })).toBe(true);        // door vs phone
    expect(agentStoryBreakBefore(run, { id: 'x', text: 'telephone', start: 1.2, end: 1.5 })).toBe(false);  // the same icon
    expect(agentStoryBreakBefore(run, { id: 'x', text: 'again', start: 4.3, end: 4.6 })).toBe(true);
    expect(agentStoryBreakBefore(run, { id: 'x', text: 'again', start: 1.2, end: 1.5 })).toBe(false);
    expect(agentStoryBreakBefore(run, { id: 'x', text: 'again', start: 3.5, end: 3.8 })).toBe(false);   // under 4.2s
    expect(agentStoryBreakBefore(run.slice(0, 2), { id: 'x', text: 'and', start: 0.6, end: 0.9 })).toBe(false);
  });
});

describe('phrase roles and reading room', () => {
  it('an anchor from a cue word, its lead before it, the tail in pairs after prepositions', () => {
    const r = phraseRoles(speak('you deserve to work with my agent'));
    expect(texts(r.anchor)).toBe('deserve');                                   // no cue word: the first content word
    const s = phraseRoles(speak('we are paying full price for the home'));
    expect(texts(s.anchor)).toBe('paying');
    expect(texts(s.lead)).toBe('we are');
    expect(s.groups.map(texts)).toEqual(['full price', 'for the', 'home']);
  });
  it('without a cue, the first content word anchors (a marked one first); autoAnchor off leaves none', () => {
    const ws = speak('the buyers keep walking');
    expect(texts(phraseRoles(ws).anchor)).toBe('buyers');
    ws[2].emphasisTier = 2;
    expect(texts(phraseRoles(ws).anchor)).toBe('keep');
    expect(phraseRoles(ws, undefined, false).anchor).toEqual([]);
    expect(phraseRoles(speak('one two'), undefined, true).anchor).toEqual([]);
  });
  it('no anchor: words group up to three, breaking at a 220ms gap or clause punctuation', () => {
    const ws = speak('one two three four five six', 0.3);
    expect(phraseRoles(ws, undefined, false).groups.map(texts)).toEqual(['one two three', 'four five six']);
    const gap = speak('one two. three four', 0.3);
    expect(phraseRoles(gap, undefined, false).groups.map(texts)).toEqual(['one two.', 'three four']);
  });
  it('choreography by the phrase: loud settles and bounces, long falls and slides, short rises', () => {
    expect(phraseChoreography(speak('go now!'))).toEqual({ hero: 'settle', support: 'bounce', name: 'settle-bounce' });
    expect(phraseChoreography(speak('one two three four five'))).toEqual({ hero: 'fall', support: 'slide', name: 'fall-slide' });
    expect(phraseChoreography(speak('one two'))).toEqual({ hero: 'rise', support: 'fade', name: 'rise-fade' });
    expect(phraseChoreography(speak('one two three'), 'settle').hero).toBe('settle');
  });
  it('reading time and the groups that get it', () => {
    expect(readingTime(speak('a'))).toBe(0.85);
    expect(readingTime(speak('twenty characters here'))).toBeCloseTo(22 / 20 + 0.2, 6);
    const fast = speak('a b c d', 0.1).map((w) => [w]);
    expect(readableGroups(fast, 2).map(texts)).toEqual(['a b c d']);
    const slow = speak('a b', 1).map((w) => [w]);
    expect(readableGroups(slow, 3).map(texts)).toEqual(['a', 'b']);
    expect(readableAnchorGroups(fast, 2).map(texts)).toEqual(['a b c d']);
    expect(replacementHasReadingRoom(slow, 3)).toBe(true);
    expect(replacementHasReadingRoom(fast, 2)).toBe(false);
    expect(cinematicReadingEnd(speak('one two'), speak('one two three four', 0.3))).toBeCloseTo(0.6, 6);   // the next word is on it
    expect(cinematicReadingEnd(speak('one two'), speak('one two'))).toBeCloseTo(1.1, 6);
  });
});

describe('story motion', () => {
  it('cinematic motion: opacity over the first 28%, a 62px fall easing out, a 7% grow, a blur early', () => {
    const before = cinematicMotion(-0.1);
    expect(before.opacity).toBe(0); expect(before.y).toBe(-62); expect(before.scale).toBeCloseTo(0.93, 9); expect(before.blur).toBe(0);
    const half = cinematicMotion(0.21, 0.42);
    expect(half.opacity).toBe(1);
    expect(half.y).toBeCloseTo(-62 * 0.5, 6);
    expect(half.scale).toBeCloseTo(1 - 0.07 * 0.5, 6);
    expect(half.blur).toBe(0);
    expect(cinematicMotion(0.42, 0.42)).toEqual({ opacity: 1, y: 0, scale: 1, blur: 0 });
    expect(cinematicMotion(0.05, 0.42).blur).toBeCloseTo(3 * (1 - (0.05 / 0.42) / 0.34), 6);
    expect(cinematicMotion(0.21, 0.42, 'rise').y).toBeCloseTo(31, 6);
    expect(cinematicMotion(0.21, 0.42, 'settle').y).toBeCloseTo(-8, 6);
  });
  it('jitter for .36s, zero after; slot frames hold a group until the next and let it go over 8-16%', () => {
    expect(cinematicJitter(0.5)).toEqual({ x: 0, rotation: 0 });
    expect(cinematicJitter(0).x).toBe(0);
    expect(Math.abs(cinematicJitter(0.03).x)).toBeGreaterThan(0);
    const groups = speak('a b c', 1).map((w) => [w]);
    const f = phraseSlotFrames(groups, 1.05, 3);
    expect(f.map((x) => [texts(x.words), x.outgoing])).toEqual([['a', true], ['b', false]]);
    expect(f[0].opacity).toBeLessThan(1);
    expect(phraseSlotFrames(groups, 0.5, 3).map((x) => texts(x.words))).toEqual(['a']);
  });
  it('supporting words slide from a direction and fade over 45% of their ramp', () => {
    const w = { start: 1, text: 'hello' };
    expect(supportingWordMotion(w, 0.9, 2, 'slide').opacity).toBe(0);
    const m = supportingWordMotion(w, 1.1, 2, 'slide', 'tail', { direction: 'down', distanceEm: 0.6 });
    expect(m.opacity).toBeGreaterThan(0);
    expect(m.y).toBeLessThan(0);
    expect(supportingWordMotion(w, 3, 2, 'slide').y).toBe(0);
    expect(supportingWordMotion(w, 1.05, 2, 'type').clipPath).toMatch(/^inset\(/);
  });
  it('replacement beats pair an opening pronoun and keep "my own" whole; slides come from the left', () => {
    const beats = storyReplacementBeats(speak('I wanted my own'), 2);
    expect(beats.map((b) => texts(b.words))).toEqual(['I wanted', 'my own']);
    expect(storyReplacementBeats(speak('I wanted my own place'), 2).map((b) => texts(b.words))).toEqual(['I wanted', 'my', 'own', 'place']);
    const s = storySlideFrames(beats, 0.05, 2);
    expect(s).toHaveLength(1);
    expect(s[0].xEm).toBeLessThan(0);
    expect(s[0].blur).toBeGreaterThan(0);
    expect(storyHeadlineLeadAtTime(speak('if you wait'), 1, 0.5).map((w) => w.text)).toEqual(['you', 'wait']);
    expect(storyHeadlineLeadAtTime(speak('if you wait'), 0.2, 0.5).map((w) => w.text)).toEqual(['if', 'you', 'wait']);
  });
});

describe('property geometry', () => {
  it('the headline sits under the head top: at least 8% down, its size capped by the room above', () => {
    expect(rearCaptionGeometry(300, 0.27, 1000)).toEqual({ size: 300, y: 270 + 72 });
    // a low head top caps the size: (80 - 25) / .42 = 131
    const low = rearCaptionGeometry(300, 0.05, 1000);
    expect(low.size).toBeCloseTo(130.952, 2);
    expect(low.y).toBeCloseTo(80 + 0.24 * 130.952, 2);
    expect(rearCaptionGeometry(20, 0.02, 1000)).toEqual({ size: 20, y: 80 + 0.24 * 20 });   // a small fit stays small
    expect(rearCaptionGeometry(300, 0.02, 1000).size).toBeCloseTo((80 - 25) / 0.42, 6);
  });
  it('a row clears the face band: under it by default, over it when under would pass 90%', () => {
    const band = { top: 0.3, bottom: 0.5 };
    expect(clearFaceY(100, 20, 20, 1000, band)).toBe(100);                    // above the band already
    expect(clearFaceY(400, 20, 20, 1000, band)).toBe(525 + 20);               // pushed under: bottom + margin + above
    expect(clearFaceY(400, 20, 20, 1000, band, true)).toBe(275 - 20);         // preferred above: top - margin - below
    expect(clearFaceY(400, 20, 400, 1000, band)).toBe(545);                   // over has no room either: under it stays
    expect(clearFaceY(700, 20, 300, 1000, { top: 0.6, bottom: 0.8 })).toBe(575 - 300);   // under would pass 90%: over
    expect(clearFaceY(400, 20, 20, 1000, null)).toBe(400);
  });
  it('fits a headline to a width by its measured (or estimated) advance, and reads the lead', () => {
    const font = { family: 'Poppins', weight: 900, italic: false, letterSpacingEm: -0.045 };
    // no canvas here: 0.7em a character, .24em between words, tracking off each character
    const one = fitPropertyHeadline(speak('price'), font, 224, 500);
    expect(one).toBeCloseTo(Math.min(224, 500 / (5 * 0.7 - 5 * 0.045)), 6);
    expect(fitPropertyHeadline([], font, 224, 500)).toBe(224);
    expect(propertyHeadlineWidth(speak('price'), font, 100)).toBeCloseTo(100 * (5 * 0.7 - 5 * 0.045), 3);
    const lead = speak('imagine the asking price of', 0.3);
    expect(texts(propertyLeadAtTime(lead, 1.5))).toBe('asking price of');
    expect(texts(propertyLeadAtTime(lead, 0.5))).toBe('imagine the');
    expect(texts(propertyLeadAtTime(speak('extraordinarily overwhelmingly long', 0.3), 1))).toBe('overwhelmingly long');
  });
});
