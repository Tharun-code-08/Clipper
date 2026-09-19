// The property reels' planner — their planPropertyMoment, number reading and dimension beats, read
// from the public planner their site ships and re-implemented here. Times in seconds. Pure.
//
// A reel caption is one MOMENT with a TREATMENT: 'counter' (a figure counts up), 'outline' (a lakh /
// crore figure outlined), 'glow' / 'banner' (Gradient Estate's magenta moments), 'headline' (a
// keyword huge behind the head) or 'spoken' (the words alone). Dimension Story instead plays the
// caption as BEATS — groups of words alternating behind and in front of the person, each with a
// hero word in its own colour.

import type { StoryWord } from './plan';

export type ReelPreset = 'reach-counter' | 'magenta-estate' | 'dimension-story';
export type ReelTreatment = 'counter' | 'outline' | 'glow' | 'banner' | 'headline' | 'spoken';
export type ReelIcon = 'home' | 'eye' | 'cube' | 'pin';

export interface ReelMoment {
  id: string;
  wordIds: string[];
  headlineIds: string[];
  numberIds: string[];
  treatment: ReelTreatment;
  entrance?: 'rise' | 'fall' | 'settle';
  icon?: ReelIcon;
  accentMotion?: 'jitter';
  anchorIds?: string[];
  replacementGroups?: { wordIds: string[] }[];
  captionLayout?: { leadIds?: string[]; tailIds?: string[]; heroItalic?: boolean; heroRotation?: number; foregroundTreatment?: 'glow' };
  flash?: 'white' | 'magenta';
}

export const isPropertyReel = (preset: string): preset is ReelPreset => preset === 'reach-counter' || preset === 'magenta-estate' || preset === 'dimension-story';

const normReel = (s: string): string => s.toLowerCase().replace(/^[^\p{L}\p{N}₹$£€-]+|[^\p{L}\p{N}%+]+$/gu, '');

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, bees: 20, das: 10,
};
const SCALE: Record<string, number> = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9, lakh: 1e5, lakhs: 1e5, crore: 1e7, crores: 1e7 };
const isNumberWord = (x: string): boolean =>
  /^[-₹$£€]?\d[\d,.]*(?:[km%]|\+)?$/i.test(x) || x in SMALL || x in SCALE || /^(point|percent|percentage|rupees|dollars)$/.test(x);

export interface ReelNumber { value: number; prefix: string; suffix: string; precision: number; indian: boolean }

/** Read a figure out of number words ("two point five lakh", "1,800,000", "40 percent"). */
export function parseReelNumber(words: { text: string }[], preset?: string): ReelNumber | null {
  if (!words.length) return null;
  const r = words.map((w) => normReel(w.text));
  if (r.some((x) => !isNumberWord(x) && x !== 'and')) return null;
  const prefix = r.join(' ').match(/[₹$£€]/)?.[0] ?? (r.includes('rupees') ? '₹' : r.includes('dollars') ? '$' : '');
  const indian = r.some((x) => /^(lakhs?|crores?|rupees)$/.test(x)) || prefix === '₹';
  const suffix0 = r.some((x) => x.includes('%') || x === 'percent' || x === 'percentage') ? '%' : r.some((x) => x.endsWith('+')) ? '+' : '';
  const o = r.filter((x) => !/^(rupees|dollars|percent|percentage|and)$/.test(x));
  let total = 0, group = 0, decimal = false, place = 0.1, seen = false, unitWord = '', lastScale = Infinity;
  for (let i = 0; i < o.length; i++) {
    const x = o[i];
    if (x === 'point') { if (!seen || decimal) return null; decimal = true; continue; }
    const sc = SCALE[x];
    if (sc) {
      if (sc >= 1e3) { if (sc >= lastScale) return null; lastScale = sc; }
      if (preset === 'magenta-estate' && total === 0 && i === o.length - 1 && /^(lakhs?|crores?|million)$/.test(x)) { unitWord = x; continue; }
      if (sc === 100) group = (seen ? group : 1) * 100;
      else { total += (seen ? group : 1) * sc; group = 0; }
      decimal = false; seen = true;
      continue;
    }
    let v = SMALL[x];
    if (v === undefined) {
      const bare = x.replace(/[₹$£€,%+]/g, '');
      const mul = /k$/i.test(bare) ? 1e3 : /m$/i.test(bare) ? 1e6 : 1;
      v = Number(bare.replace(/[km]$/i, '')) * mul;
    }
    if ((i > 0 && /^[-₹$£€]?\d/.test(x) && /^[-₹$£€]?\d/.test(o[i - 1])) || !Number.isFinite(v)) return null;
    if (decimal) { if (v < 0 || v > 9) return null; group += v * place; place /= 10; }
    else group += v;
    seen = true;
  }
  const value = Number((total + group).toPrecision(15));
  if (o[o.length - 1] === 'point' || !seen || !Number.isFinite(value) || /e/i.test(String(value)) || Math.abs(value) > 1e12) return null;
  return { value, prefix, suffix: unitWord ? ` ${unitWord}` : suffix0, precision: (String(value).split('.')[1] ?? '').length, indian };
}

export function formatReelNumber(n: ReelNumber, value = n.value): string {
  const v = Object.is(value, -0) ? 0 : value;
  return n.prefix + v.toLocaleString(n.indian ? 'en-IN' : 'en-US', { minimumFractionDigits: n.precision, maximumFractionDigits: n.precision }) + n.suffix;
}

/** The figure a counter shows `t` seconds in: eased up over `dur`, truncated to its precision. */
export function reelCountValue(n: ReelNumber, t: number, dur = 0.65): number {
  if (t >= dur) return n.value;
  const p = Math.max(0, Math.min(1, t / dur));
  const scale = 10 ** n.precision;
  return Math.trunc(n.value * (1 - (1 - p) ** 3) * scale) / scale;
}

const HEADLINE = /^(market|project|projects|strategic|commitment|landmark|collaboration|builder|units|home|views|already|more|listing|listings|investment|income|rental|returns|possible|upfront|omaxe|kahun|kahoon|milta|height|prime|punjab|limited|fit-out)$/;
const STOP = /^(i|a|an|the|and|or|but|my|your|our|is|are|to|of|in|on|for|at|if|you|it|this|that|me|hai|ki|ka|ke|ye|aur)$/;

function numberRun<W extends StoryWord>(words: W[], preset?: string): W[] {
  for (let i = 0; i < words.length; i++) {
    if (!isNumberWord(normReel(words[i].text))) continue;
    let n = i + 1;
    while (n < words.length && n - i < 10 && (isNumberWord(normReel(words[n].text)) || (normReel(words[n].text) === 'and' && isNumberWord(normReel(words[n + 1]?.text ?? ''))))) n++;
    const run = words.slice(i, n);
    const parsed = parseReelNumber(run, preset);
    const lone = run.length === 1 && !/\d/.test(run[0].text) && parsed && parsed.value < 10
      && !/^(views|days|months|years|homes|properties|offers|clients)$/.test(normReel(words[n]?.text ?? ''));
    if (parsed && !lone) return [...run];
  }
  return [];
}

export function planPropertyMoment<W extends StoryWord>(words: W[], preset: string): ReelMoment {
  const numbers = numberRun(words, preset);
  const key = words.find((w) => HEADLINE.test(normReel(w.text)))
    ?? words.find((w) => w.emphasisTier === 2 && !STOP.test(normReel(w.text)))
    ?? (preset === 'dimension-story' ? words.find((w) => /^(amazing|deal|deals|loan|buyers|chesterfield|place|approved)$/i.test(normReel(w.text))) : undefined);
  let headline: W[] = key ? [key] : [];
  const ki = key ? words.findIndex((w) => w.id === key.id) : -1;
  if (key && /^(home|listing|listings)$/.test(normReel(key.text)) && ki > 0 && /^(your|most|my)$/.test(normReel(words[ki - 1].text))) headline = [words[ki - 1], key];
  const r = words.map((w) => normReel(w.text));
  const icon: ReelIcon | undefined = r.includes('home') ? 'home' : r.includes('eyes') ? 'eye' : r.includes('showings') ? 'cube' : r.includes('location') ? 'pin' : undefined;
  const parsed = numbers.length ? parseReelNumber(numbers, preset) : null;
  const treatment: ReelTreatment = numbers.length
    ? (preset === 'reach-counter' ? 'counter' : parsed && /lakh|crore/.test(parsed.suffix.trim()) ? 'outline' : 'counter')
    : preset === 'magenta-estate' && r.some((x) => /^(investment|possible|upfront)$/.test(x)) ? 'glow'
    : preset === 'magenta-estate' && r.some((x) => /^(punjab|limited)$/.test(x)) ? 'banner'
    : headline.length ? 'headline' : 'spoken';
  if (numbers.length) headline = [];
  return {
    id: `reel-${words[0]?.id}`, wordIds: words.map((w) => w.id), headlineIds: headline.map((w) => w.id), numberIds: numbers.map((w) => w.id), treatment,
    ...(preset === 'dimension-story' ? { entrance: 'rise' as const } : {}), ...(icon ? { icon } : {}),
  };
}

/** A reel run ends before and / but / aur / when / because, or once it has crossed 3.8s — never under three words. */
export function propertyBreakBefore<W extends StoryWord>(run: W[], next: W): boolean {
  return run.length >= 3 && (next.start - run[0].start > 3.8 || /^(and|but|aur|when|because)$/.test(normReel(next.text)));
}

// ── Dimension Story: beats ─────────────────────────────────────────────────────────────────
export const DIMENSION_ACCENTS = ['#AF48F4', '#47D8EC', '#61E85C', '#ED48C5', '#626CFF', '#EFE676', '#32D9A9', '#F47E5C'];
export const DIMENSION_READ_TAIL = 0.42;
const tight = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const BEAT_STOP = /^(i|a|an|the|and|or|but|my|your|our|is|are|was|to|of|in|on|for|at|if|you|it|this|that|with|from|me|we|has|have|its|hai|ki|ka|ke|ye|aur|mein|lekin|jo|sirf|ek|har)$/;
const BEAT_KEY = /^(market|project|projects|strategic|commitment|qualified|leads|landmark|collaboration|builder|builders|units|home|investment|income|story|buyers|approved|loan|deals|amazing|place|chesterfield|down)$/;

export interface DimensionBeat { wordIds: string[]; heroId: string; plane: 'behind' | 'front'; accent: string; ordinal: number; start: number; end: number;
  leadIds?: string[]; tailIds?: string[]; replacementGroups?: { wordIds: string[] }[]; direction?: 'right' | 'left' | 'up'; heroItalic?: boolean; leadStack?: boolean }

/** The caption as beats: runs break at a 550ms gap or a sentence end, then chunk into 3-5 words
 *  by their timing; each beat's hero is its best-scoring word, planes alternate behind / front,
 *  accents cycle, and a beat holds through a close neighbour or .42s. */
export function dimensionBeats<W extends StoryWord>(words: W[], pinned: string[] = []): DimensionBeat[] {
  const runs: W[][] = [];
  for (const w of words) {
    const last = runs[runs.length - 1];
    if (!last || w.start - last[last.length - 1].end > 0.55 || /[.!?]$/.test(last[last.length - 1].text)) runs.push([w]);
    else last.push(w);
  }
  const groups: W[][] = [];
  for (const run of runs) {
    for (let i = 0; i < run.length;) {
      const left = run.length - i;
      let n = left <= 4 ? left : left === 5 || left === 6 ? 3 : 4;
      while (n > 2 && run[i + n - 1].start - run[i].start > 1.7) n--;
      while (n < Math.min(7, left) && run[i + n - 1].end - run[i].start < 0.9) n++;
      if (left - n > 0 && left - n <= 2 && left <= 7 && run[run.length - 1].end - run[i + n].start < 0.65) n = left;
      else if (left > n && run[run.length - 1].end - run[i + n].start < 0.7 && n > 3) n--;
      groups.push(run.slice(i, i + n));
      i += n;
    }
  }
  const score = (w: W) => 12 * +pinned.includes(w.id) + (w.emphasisTier === 2 ? 8 : 4 * +!!w.emphasis) + 10 * +/\d/.test(w.text)
    + 6 * +BEAT_KEY.test(tight(w.text)) + (BEAT_STOP.test(tight(w.text)) ? -10 : 2) + 0.1 * Math.min(9, w.text.length);
  return groups.map((g, i) => {
    const after2 = groups[i + 2];
    const gEnd = g[g.length - 1].end;
    const next = groups[i + 1];
    const near = !!next && !/[.!?]$/.test(g[g.length - 1].text) && next[0].start - gEnd <= 0.55;
    const holdEnd = near ? next[next.length - 1].end : gEnd;
    const following = near ? groups[i + 2] : next;
    const followingStart = following?.[0]?.start ?? Infinity;
    return {
      wordIds: g.map((w) => w.id),
      heroId: g.reduce((best, w) => (score(w) > score(best) ? w : best)).id,
      plane: i % 2 ? 'front' : 'behind',
      accent: DIMENSION_ACCENTS[i % DIMENSION_ACCENTS.length],
      ordinal: i,
      start: g[0].start,
      end: Math.min(near && next && !/[.!?]$/.test(next[next.length - 1].text) && after2 && after2[0].start - holdEnd <= 0.55 ? after2[0].start : Math.min(holdEnd + DIMENSION_READ_TAIL, followingStart), after2?.[0]?.start ?? Infinity),
    };
  });
}

export const dimensionEntranceDuration = (start: number, end: number): number => Math.min(0.6, Math.max(0.2, (end - start) * 0.4));

export function dimensionMotion(t: number, dur = 0.64): { opacity: number; y: number; scale: number } {
  const p = Math.max(0, Math.min(1, t / dur));
  const s = (x: number) => x * x * (3 - 2 * x);
  const a = p < 0.76 ? 1.035 * s(p / 0.76) : 1.035 - 0.035 * s((p - 0.76) / 0.24);
  return { opacity: t < 0 ? 0 : s(Math.min(1, p / 0.35)), y: p >= 1 ? 0 : 78 * (1 - a), scale: p >= 1 ? 1 : 0.96 + 0.04 * a };
}

export const dimensionTravel = (plane: 'behind' | 'front', ordinal: number): 'right' | 'up' => plane === 'behind' ? 'right' : ordinal % 3 === 2 ? 'up' : 'right';

/** A beat's hero: a sideways travel (210px, easing in, -75px on the way out) or the rise, with a
 *  flicker-free opacity that dips twice on the way in. */
export function dimensionHeroMotion(t: number, dur: number, travel: 'right' | 'left' | 'up', remaining = Infinity): { opacity: number; x: number; y: number; scale: number; scaleX: number; skewX: number } {
  const c = (x: number) => Math.max(0, Math.min(1, x));
  const s = (x: number) => { const v = c(x); return v * v * (3 - 2 * v); };
  const p = c(t / dur);
  const m = dimensionMotion(t, dur);
  const ease = s(p);
  const out = s(1 - remaining / 0.16);
  const sideways = travel !== 'up';
  const dir = travel === 'right' ? -1 : 1;
  const flicker = (tt: number, d = 0.48) => {
    if (tt < 0) return 0;
    const q = c(tt / d);
    const dip = (at: number, w: number, depth: number) => depth * s(1 - Math.abs(q - at) / w);
    return s(q / 0.13) * (1 - dip(0.28, 0.105, 0.22) - dip(0.61, 0.095, 0.18));
  };
  return {
    opacity: (dur < 0.3 ? m.opacity : flicker(t, Math.min(0.48, Math.max(0.4, dur)))) * (1 - out),
    x: sideways && (p < 1 || out > 0) ? 210 * dir * (1 - ease) - 75 * dir * out : 0,
    y: sideways ? 0 : m.y - 45 * out,
    scale: sideways ? 1 : m.scale,
    scaleX: 1, skewX: 0,
  };
}
