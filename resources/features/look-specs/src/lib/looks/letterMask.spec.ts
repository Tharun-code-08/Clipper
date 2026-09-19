import { describe, it, expect } from 'vitest';
import { letterMaskMoments, letterMaskRows, LETTER_MASK_LINE_HEIGHT, LETTER_MASK_MAX_PX_OF_WIDTH, LETTER_MASK_WIDTH_FRAC } from './letterMask';
import { LOOK_SPECS } from './lookSpec';

const RUDDER = { maxMoments: 2, openingWindowSec: 5, payoffTailFraction: 0.28, secondMomentMinDurationSec: 24, minGapSec: 8 };
const seg = (key: string, startSec: number) => ({ key, startMs: startSec * 1000 });

describe('letter-mask moments (their letterMask block)', () => {
  it('Rudder carries their block verbatim, and no other look has one', () => {
    expect(LOOK_SPECS.find((l) => l.id === 'look_rudder')?.letterMask).toEqual(RUDDER);
    expect(LOOK_SPECS.filter((l) => l.letterMask).map((l) => l.id)).toEqual(['look_rudder']);
  });

  it('the opening moment is the first caption that starts inside the opening window', () => {
    const segs = [seg('a', 0.1), seg('b', 1.2), seg('c', 3)];
    expect([...letterMaskMoments(segs, 7000, RUDDER)]).toEqual(['a']);
    // a caption that starts late still opens if it is inside the window
    expect([...letterMaskMoments([seg('x', 4.9), seg('y', 6)], 7000, RUDDER)]).toEqual(['x']);
    // none inside the window: no opening moment
    expect(letterMaskMoments([seg('x', 5.1)], 7000, RUDDER).size).toBe(0);
  });

  it('a short video gets no payoff: the second moment needs 24s of video', () => {
    const segs = Array.from({ length: 10 }, (_, i) => seg(`s${i}`, i * 2.3));
    expect([...letterMaskMoments(segs, 23900, RUDDER)]).toEqual(['s0']);
  });

  it('the payoff is the first caption in the last 28%, at least 8s after the opening', () => {
    const segs = Array.from({ length: 20 }, (_, i) => seg(`s${i}`, i * 1.5));   // 0..28.5s
    const dur = 30000;
    const got = [...letterMaskMoments(segs, dur, RUDDER)];
    expect(got[0]).toBe('s0');
    // tail starts at 21.6s: s15 starts at 22.5s
    expect(got[1]).toBe('s15');
    // an opening late in its window pushes the payoff out by the gap
    const late = [seg('o', 4.8), ...segs.slice(4)];
    const dur2 = 14000;                                   // tail from 10.08s; gap needs >= 12.8s
    expect([...letterMaskMoments(late, 30000, RUDDER)][1]).toBe('s15');
    expect(letterMaskMoments(late, dur2, RUDDER).size).toBe(1);   // under 24s: no payoff at all
  });

  it('the gap clause: with their constants the tail always starts past it, but a wider gap pushes the payoff out', () => {
    const segs = Array.from({ length: 20 }, (_, i) => seg(`s${i}`, i * 1.5));   // 0..28.5s
    const late = [seg('o', 4.8), ...segs.slice(4)];
    expect([...letterMaskMoments(late, 30000, { ...RUDDER, minGapSec: 20 })]).toEqual(['o', 's17']);   // 4.8 + 20 = 24.8: s17 at 25.5
    expect([...letterMaskMoments(late, 30000, { ...RUDDER, minGapSec: 30 })]).toEqual(['o']);          // nothing far enough
  });

  it('never more than maxMoments, and none when the design asks for none', () => {
    const segs = Array.from({ length: 30 }, (_, i) => seg(`s${i}`, i));
    expect(letterMaskMoments(segs, 40000, RUDDER).size).toBe(2);
    expect(letterMaskMoments(segs, 40000, { ...RUDDER, maxMoments: 1 }).size).toBe(1);
    expect(letterMaskMoments(segs, 40000, { ...RUDDER, maxMoments: 0 }).size).toBe(0);
  });

  it('order of the segment list does not matter', () => {
    const segs = [seg('c', 3), seg('a', 0.1), seg('b', 1.2)];
    expect([...letterMaskMoments(segs, 7000, RUDDER)]).toEqual(['a']);
  });
});

describe('letter-mask rows (their footage: One / One-sharp / One sharp-visual)', () => {
  const em = (ws: string[]) => ws.join(' ').length;   // a stand-in width: characters
  it('a lone word takes one row; two words take two rows', () => {
    expect(letterMaskRows(['One'], em)).toEqual([['One']]);
    expect(letterMaskRows(['One', 'sharp'], em)).toEqual([['One'], ['sharp']]);
  });
  it('three words take the two-row split whose widest row is narrowest', () => {
    expect(letterMaskRows(['One', 'sharp', 'visual'], em)).toEqual([['One', 'sharp'], ['visual']]);
    expect(letterMaskRows(['A', 'gigantic', 'word'], em)).toEqual([['A', 'gigantic'], ['word']]);
    expect(letterMaskRows(['gigantic', 'A', 'B'], em)).toEqual([['gigantic'], ['A', 'B']]);
  });
  it('a tie keeps the front-loaded split', () => {
    expect(letterMaskRows(['ab', 'cd', 'ab', 'cd'], em)).toEqual([['ab', 'cd'], ['ab', 'cd']]);
  });
  it('the measured geometry constants', () => {
    expect(LETTER_MASK_WIDTH_FRAC).toBeCloseTo(1.025, 3);
    expect(LETTER_MASK_MAX_PX_OF_WIDTH).toBe(0.5);
    expect(LETTER_MASK_LINE_HEIGHT).toBe(0.92);
  });
});
