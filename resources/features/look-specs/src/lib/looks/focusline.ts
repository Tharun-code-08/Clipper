// "Focusline": the phrase's lockup takes one of four bands, chosen from the phrase's OWN TEXT — its
// opener, its length and whether it carries a hero. Their Focusline planner's rule, read from the
// public planner their site ships; it accounts for the three bands MEASURED on their footage
// (block bottoms at 22%, 34% and 68% of the frame), which no face-relative rule reproduced.
//
//   media caption     — a photo / card is on screen                              → bottom at 82%
//   lower story       — a b-roll cutaway, an opener like "and / but / when / what", or six words
//                       or more; also a phrase of 4-5 words with no hero            → bottom at 68%
//   split cluster     — a phrase with a hero: three words not opened by an article, or 4-5 words
//                                                                                → bottom at 34%
//   headline stack    — any other short phrase (up to three words)               → bottom at 22%
//
// Rows justify by band: lower bands set every row flush left; a split cluster sets the rows before
// the hero flush right and the rows after it flush left; a headline stack centres. The lower story
// band (52%-76%) is the one drawn BEHIND the speaker; the others sit in front.
//
// Pure: the preview, the editor's behind-the-speaker routing and every render route share it.

export type FocuslineArchetype = 'headline-stack' | 'split-cluster' | 'lower-story' | 'media-caption';
export type FocuslineScene = 'talking-head' | 'media' | 'broll';
export type FocuslineRole = 'pre' | 'hero' | 'trailing';

/** Band anchors, as fractions of the frame: the block's BOTTOM edge sits at `y`. */
export const FOCUSLINE_BANDS: Record<FocuslineArchetype, { x: number; y: number; heroScale: number }> = {
  'headline-stack': { x: 0.5, y: 0.22, heroScale: 1.22 },
  'split-cluster':  { x: 0.5, y: 0.34, heroScale: 1.22 },
  'lower-story':    { x: 0.5, y: 0.68, heroScale: 1.22 },
  'media-caption':  { x: 0.5, y: 0.82, heroScale: 1.22 },
};

const OPENERS = new Set(['and', 'but', 'because', 'how', 'if', 'when', 'where', 'what', 'why']);
const ARTICLES = new Set(['the', 'a', 'an']);

const tokens = (text: string) =>
  text.trim().split(/\s+/).map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}-]+$/gu, '').toLowerCase()).filter(Boolean);

export function focuslineArchetype(text: string, hasHero: boolean, scene: FocuslineScene = 'talking-head'): FocuslineArchetype {
  if (scene === 'media') return 'media-caption';
  if (scene === 'broll') return 'lower-story';
  const words = tokens(text);
  const first = words[0] ?? '';
  if (OPENERS.has(first) || words.length >= 6) return 'lower-story';
  if (words.length <= 3) {
    return hasHero && words.length === 3 && !ARTICLES.has(first) ? 'split-cluster' : 'headline-stack';
  }
  return hasHero ? 'split-cluster' : 'lower-story';
}

export function focuslineRowJustify(arch: FocuslineArchetype, role: FocuslineRole): 'flex-start' | 'flex-end' | 'center' {
  if (arch === 'lower-story' || arch === 'media-caption') return 'flex-start';
  if (arch === 'split-cluster') {
    if (role === 'pre') return 'flex-end';
    if (role === 'trailing') return 'flex-start';
  }
  return 'center';
}

/** Whether a block whose bottom sits at `yPct` (0-1) is drawn behind the speaker. */
export function focuslineBehind(yPct: number): boolean {
  return yPct >= 0.52 && yPct < 0.76;
}

/** The caption keys a Focusline look sets behind the speaker: the phrases in the lower story band. */
export function focuslineBehindKeys<W extends { text: string }>(
  segments: { key: string; sw: W[] }[], isHero: (w: W) => boolean,
): string[] {
  return segments
    .filter((s) => focuslineBehind(FOCUSLINE_BANDS[focuslineArchetype(s.sw.map((w) => w.text).join(' '), s.sw.some(isHero))].y))
    .map((s) => s.key);
}
