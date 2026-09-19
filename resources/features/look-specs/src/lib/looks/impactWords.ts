// Which words of a phrase take the IMPACT role — the giant word behind the speaker — and which of
// those stay in the row as keywords. The rules are their behind designs' own, read from the public
// planner their site ships and checked against the 30fps previews:
//
//   1. words the user marked as heroes take the role, all of them;
//   2. else the highest-scored content words, up to `maxPerClip` (their importance scores come from
//      their transcript analysis; ours from the emphasis heuristic, the same one the editor marks
//      heroes with, so a phrase never disagrees with its own marks);
//   3. else, for a design that names it, the FIRST ('leading') or LAST ('trailing') content word —
//      two words when that word is four letters or shorter in a phrase of three or more and its
//      neighbour is a content word, unless the pair runs past `maxChars`.
//
// A two-word impact that cannot be set at 78% of the design's scale collapses to one word; the word
// it drops keeps the impact role and is drawn in the row in the accent style, which is what their
// "YEARS into editing" (hero TEN), "your IDEAS" (hero BEST) and "first SECONDS" (hero HOOK) are.
//
// Pure: no DOM, no React. Every render route shares it, so the preview and the exports choose the
// same word.

/** Their content-word test: letters/digits/marks only, lower-cased, not a function word. The list
 *  covers English, romanised Hindi and Devanagari, as their captions do. */
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'then', 'that', 'this', 'these', 'those', 'of', 'to', 'in', 'on',
  'at', 'for', 'with', 'as', 'by', 'is', 'it', 'its', 'be', 'are', 'was', 'were', 'i', 'you', 'he', 'she', 'we',
  'they', 'my', 'your', 'our', 'their', 'me', 'him', 'her', 'us', 'them', 'do', 'does', 'did', 'not', 'no', 'yes',
  'if', 'up', 'out', 'hai', 'hain', 'tha', 'thi', 'ho', 'hoga', 'hogi', 'hota', 'hoti', 'hua', 'hue', 'raha',
  'rahi', 'rahe', 'rha', 'rhi', 'gaya', 'gayi', 'gaye', 'ka', 'ki', 'ke', 'ko', 'ne', 'se', 'mein', 'par', 'pe',
  'tak', 'bina', 'liye', 'wala', 'wali', 'wale', 'yeh', 'yah', 'ye', 'wo', 'woh', 'vo', 'iska', 'uska', 'inka',
  'unka', 'isko', 'usko', 'aur', 'ya', 'toh', 'bhi', 'nahi', 'nahin', 'nai', 'mat', 'kya', 'kyun', 'kyu', 'kyon',
  'kyunki', 'kaise', 'kaisa', 'kaisi', 'ek', 'koi', 'kuch', 'kuchh', 'sab', 'saara', 'bahut', 'kaafi', 'sirf',
  'bas', 'abhi', 'ab', 'jab', 'tab', 'agar', 'lekin', 'magar', 'phir', 'fir', 'jo', 'jis', 'matlab', 'yaani',
  'waise', 'aisa', 'aise', 'jaise', 'jese', 'aap', 'hum', 'tum', 'main', 'mera', 'meri', 'tera', 'apna', 'apne',
  'yahan', 'wahan', 'kar', 'karo', 'karna', 'karne', 'karta', 'karte', 'kiya', 'diya', 'dena', 'lena', 'hona',
  'yaar', 'bhai', 'bro', 'guys', 'actually', 'basically', 'literally',
  'है', 'हैं', 'था', 'थी', 'थे', 'हो', 'होगा', 'होगी', 'रहा', 'रही', 'रहे', 'गया', 'गयी', 'का', 'की', 'के', 'को',
  'ने', 'से', 'में', 'पर', 'तक', 'लिए', 'वाला', 'वाली', 'यह', 'ये', 'वो', 'वह', 'और', 'या', 'तो', 'भी', 'नहीं',
  'मत', 'क्या', 'क्यों', 'कैसे', 'एक', 'कोई', 'कुछ', 'सब', 'बहुत', 'सिर्फ', 'बस', 'अब', 'जब', 'तब', 'अगर', 'लेकिन',
  'फिर', 'जो', 'मतलब', 'आप', 'हम', 'तुम', 'मैं', 'मेरा', 'मेरी', 'अपना', 'यहां', 'वहां', 'कर', 'करो', 'करना',
  'करने', 'करता', 'करते', 'किया', 'दिया',
]);

const letters = (t: string) => t.replace(/[^\p{L}\p{N}\p{M}]/gu, '');

export function isContentWord(text: string): boolean {
  const t = letters(text).toLowerCase();
  return t.length > 0 && !STOP.has(t);
}

export type ImpactSelect = 'emphasis' | 'leading' | 'trailing';

export interface ImpactPickOpts<W> {
  /** A word the user (or the emphasis engine) marked as a hero. */
  marked: (w: W) => boolean;
  /** Importance of a word, > 0 for a candidate. */
  score: (w: W) => number;
  select?: ImpactSelect;
  /** How many impact words a phrase may carry. */
  maxPerClip?: number;
  /** A two-word impact longer than this (letters, space excluded) drops to one. */
  maxChars?: number;
  /** With nothing marked or scored and no by-length rule, take the strongest word anyway. */
  always?: boolean;
}

/** Indices of the phrase's impact words, in phrase order. */
export function pickImpactWords<W extends { text: string }>(phrase: W[], o: ImpactPickOpts<W>): number[] {
  const max = o.maxPerClip ?? 1;
  if (max <= 0 || !phrase.length) return [];
  const marked = phrase.map((w, i) => (o.marked(w) ? i : -1)).filter((i) => i >= 0);
  if (marked.length) return marked;
  // Ties break towards the design's own end: the last word for a trailing design, else the first.
  const sel = o.select ?? 'emphasis';
  const tie = sel === 'trailing' ? -1 : 1;
  const scored = phrase.map((w, i) => ({ i, s: o.score(w) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.i - b.i) * tie).slice(0, max).map((x) => x.i).sort((a, b) => a - b);
  if (scored.length) return scored;
  if (sel === 'leading' || sel === 'trailing') {
    const lead = sel === 'leading';
    let at = lead ? phrase.findIndex((w) => isContentWord(w.text)) : -1;
    if (!lead) for (let i = phrase.length - 1; i >= 0; i--) if (isContentWord(phrase[i].text)) { at = i; break; }
    if (at < 0) at = lead ? 0 : phrase.length - 1;
    const first = phrase[at];
    const short = letters(first.text).length <= 4;
    const count = Math.min(max, phrase.length >= 3 && short ? 2 : 1);
    const next = lead ? phrase[at + 1] : phrase[at - 1];
    let ids = count > 1 && next && isContentWord(next.text) ? (lead ? [at, at + 1] : [at - 1, at]) : [at];
    if (o.maxChars != null && ids.length > 1 && ids.map((i) => letters(phrase[i].text)).join(' ').length > o.maxChars) {
      ids = lead ? ids.slice(0, 1) : ids.slice(-1);
    }
    return ids;
  }
  if (o.always && phrase.length) {
    let best = 0;
    for (let i = 1; i < phrase.length; i++) if (o.score(phrase[i]) > o.score(phrase[best])) best = i;
    return [best];
  }
  return [];
}

/**
 * A multi-word impact collapses to one word when it cannot be set at `minPhraseScale` of the design
 * scale. `fitRatio` is the size the words fit at over the size asked for (≤ 1). The survivor is the
 * highest-scored word, else the last for a trailing design and the first otherwise.
 */
export function collapseImpact<W>(
  phrase: W[], ids: number[], fitRatio: number, score: (w: W) => number,
  select: ImpactSelect = 'emphasis', minPhraseScale = 0.78,
): number[] {
  if (ids.length <= 1 || fitRatio >= minPhraseScale) return ids;
  let best = -1;
  for (const i of ids) if (score(phrase[i]) > 0 && (best < 0 || score(phrase[i]) > score(phrase[best]))) best = i;
  if (best < 0) best = select === 'trailing' ? ids[ids.length - 1] : ids[0];
  return [best];
}

/**
 * The impact group showing at `tMs`: contiguous impact words form one group; with several groups
 * the next takes over halfway through the silence between them. Their timing rule, phrase mode.
 */
export function timedImpactGroup<W extends { startMs: number; endMs: number }>(
  phrase: W[], ids: number[], tMs: number,
): number[] {
  const set = new Set(ids);
  const groups: number[][] = [];
  let run: number[] = [];
  phrase.forEach((_, i) => {
    if (set.has(i)) run.push(i);
    else if (run.length) { groups.push(run); run = []; }
  });
  if (run.length) groups.push(run);
  if (!groups.length) return [];
  let cur = groups[0];
  for (let g = 1; g < groups.length; g++) {
    const prev = groups[g - 1], next = groups[g];
    const prevEnd = phrase[prev[prev.length - 1]].endMs, nextStart = phrase[next[0]].startMs;
    if (tMs < (prevEnd + nextStart) / 2) break;
    cur = next;
  }
  return cur;
}

export interface ImpactPlan<W> {
  /** The words drawn as the hero right now, in phrase order (one, or a fitted pair). */
  hero: W[];
  /** Impact words not in the hero: drawn in the row, in the accent role. */
  keywords: Set<W>;
  /** Everything but the hero, in phrase order. */
  row: W[];
}

/** The whole choice for one phrase at one time. `fitRatio(words)` is the fit for a candidate hero. */
export function planImpact<W extends { text: string; startMs: number; endMs: number }>(
  phrase: W[], tMs: number, o: ImpactPickOpts<W> & { fitRatio: (ws: W[]) => number; minPhraseScale?: number },
): ImpactPlan<W> {
  const picked = pickImpactWords(phrase, o);
  // The collapse runs over EVERY impact word before any timing, so a phrase whose two impact words
  // cannot share the hero keeps ONE hero throughout, the other a keyword in the row: their THREE
  // stays up over "breaks in the first SECONDS". Marked words tie, so the first (or last, for a
  // trailing design) of a marked pair survives, as their manual marks do.
  const collapseScore = (w: W) => (o.marked(w) ? Number.MAX_SAFE_INTEGER : o.score(w));
  const kept = collapseImpact(phrase, picked, picked.length > 1 ? o.fitRatio(picked.map((i) => phrase[i])) : 1,
    collapseScore, o.select, o.minPhraseScale);
  const group = timedImpactGroup(phrase, kept, tMs);
  const heroSet = new Set(group);
  const hero = group.map((i) => phrase[i]);
  const keywords = new Set(picked.filter((i) => !heroSet.has(i)).map((i) => phrase[i]));
  return { hero, keywords, row: phrase.filter((_, i) => !heroSet.has(i)) };
}
