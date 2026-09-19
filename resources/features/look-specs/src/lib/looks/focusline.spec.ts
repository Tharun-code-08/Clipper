import { describe, it, expect } from 'vitest';
import { focuslineArchetype, focuslineRowJustify, focuslineBehind, focuslineBehindKeys, FOCUSLINE_BANDS } from './focusline';

describe('focusline: the band a phrase takes comes from its own text', () => {
  it('their measured phrases land in their measured bands', () => {
    // "The biggest mistake" — three words opened by an article, hero 'biggest': the headline stack (22%)
    expect(focuslineArchetype('The biggest mistake', true)).toBe('headline-stack');
    // "fits your day-to-day life." — five words with a hero: the split cluster (34%)
    expect(focuslineArchetype('fits your day-to-day life.', true)).toBe('split-cluster');
    // "What you should really be paying" — opened by 'what': the lower story (68%)
    expect(focuslineArchetype('What you should really be paying', true)).toBe('lower-story');
  });

  it('the opener, the length and the hero decide', () => {
    expect(focuslineArchetype('and then some', true)).toBe('lower-story');
    expect(focuslineArchetype('one two three four five six', true)).toBe('lower-story');
    expect(focuslineArchetype('make it count', true)).toBe('split-cluster');
    expect(focuslineArchetype('make it count', false)).toBe('headline-stack');
    expect(focuslineArchetype('a bold move', true)).toBe('headline-stack');
    expect(focuslineArchetype('four words right here', false)).toBe('lower-story');
    expect(focuslineArchetype('four words right here', true)).toBe('split-cluster');
    // punctuation and case do not change the reading
    expect(focuslineArchetype('WHY? you, ask.', false)).toBe('lower-story');
  });

  it('a cutaway or a card on screen overrides the text', () => {
    expect(focuslineArchetype('make it count', true, 'broll')).toBe('lower-story');
    expect(focuslineArchetype('make it count', true, 'media')).toBe('media-caption');
  });

  it('rows justify by band', () => {
    expect(focuslineRowJustify('lower-story', 'pre')).toBe('flex-start');
    expect(focuslineRowJustify('media-caption', 'hero')).toBe('flex-start');
    expect(focuslineRowJustify('split-cluster', 'pre')).toBe('flex-end');
    expect(focuslineRowJustify('split-cluster', 'trailing')).toBe('flex-start');
    expect(focuslineRowJustify('split-cluster', 'hero')).toBe('center');
    expect(focuslineRowJustify('headline-stack', 'trailing')).toBe('center');
  });

  it('only the lower story band sits behind the speaker', () => {
    expect(focuslineBehind(FOCUSLINE_BANDS['lower-story'].y)).toBe(true);
    expect(focuslineBehind(FOCUSLINE_BANDS['headline-stack'].y)).toBe(false);
    expect(focuslineBehind(FOCUSLINE_BANDS['split-cluster'].y)).toBe(false);
    expect(focuslineBehind(FOCUSLINE_BANDS['media-caption'].y)).toBe(false);
  });
});

describe('routing the behind layer', () => {
  it('names the lower-story phrases, and only those', () => {
    const seg = (key: string, text: string, hero?: string) => ({ key, sw: text.split(' ').map((t) => ({ text: t, hero: t === hero })) });
    const keys = focuslineBehindKeys([
      seg('a', 'The biggest mistake', 'biggest'),
      seg('b', 'What you should really be paying', 'really'),
      seg('c', 'fits your day-to-day life.', 'day-to-day'),
      seg('d', 'one two three four five six seven'),
    ], (w) => w.hero);
    expect(keys).toEqual(['b', 'd']);
  });
});
