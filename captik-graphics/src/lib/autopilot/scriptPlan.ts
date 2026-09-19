// SCRIPT → EDIT PLAN.
//
// The template could place beats but had nothing to say about them: every marked moment got
// the same treatment. This decides WHAT KIND of moment each one is, because the kind is what
// determines the visual — a figure wants promoting, a list wants building, a mechanism wants
// representing. Same animation on all of them is decoration; the right animation per kind is
// an explanation.
//
// Structure comes from six measured reference reels (Hinglish creator content):
//   duration 65.5s mean · 3.2 words/sec · 0.22 cuts/sec · FIRST CUT at 0.79s mean
//   hooks are one of five shapes; CTAs are one of three asks, never a bare "follow for more"
//
// HINGLISH IS FIRST-CLASS. motionPlan's word weighting is English-only, so on a Devanagari
// or romanised-Hindi transcript every word scored zero and the plan fell back to fractions —
// i.e. it ignored the script entirely. The vocabularies below carry both scripts.

export interface ScriptWord { text: string; startMs: number; endMs: number }

export type MomentKind =
  | 'figure'      // a number or result      → promote it, hero scale, frame clears
  | 'list'        // items to remember       → build one at a time, previous persist
  | 'comparison'  // before/after, wrong/right → place both
  | 'mechanism'   // how something works     → represent the parts and their order
  | 'warning'     // a mistake to avoid      → mark it, strike or cross
  | 'concept';    // something new           → name it, held long enough to read

export type Section = 'hook' | 'body' | 'cta';

export interface Moment {
  atMs: number;
  endMs: number;
  kind: MomentKind;
  section: Section;
  /** The words this moment covers. */
  text: string;
  /** The single word the visual anchors to. */
  anchor: string;
  /** Why it was marked — shown in the plan so a human can audit it. */
  reason: string;
  score: number;
}

export interface ScriptPlan {
  hook: { atMs: number; endMs: number; text: string; shape: string } | null;
  cta: { atMs: number; endMs: number; text: string; ask: string } | null;
  moments: Moment[];
  durationMs: number;
}

// ── vocabularies ─────────────────────────────────────────────────────────────
const has = (t: string, list: readonly string[]) => list.some((k) => t.includes(k));

/** A spoken figure in either script. Numbers are the strongest signal there is. */
const FIGURE = /(\d[\d,.]*\s*(k|m|cr|%)?)|(हज़ार|हजार|लाख|करोड़|सौ)|\b(hazaar|lakh|crore|thousand|million|percent)\b/i;

const LIST_MARK = ['पहला', 'पहली', 'दूसरा', 'दूसरी', 'तीसरा', 'सबसे पहले', 'स्टेप', 'चीज़', 'चीज',
  'pehla', 'pehli', 'dusra', 'teesra', 'step', 'steps', 'cheez', 'first', 'second', 'third',
  'number one', 'point'];
const COMPARE = ['लेकिन', 'बट', 'बजाय', 'से बेहतर', 'पहले', 'अब', 'instead', 'versus', ' vs ',
  'better than', 'worse', 'difference', 'compare', 'but ', 'lekin', 'bajaye'];
const MECHANISM = ['क्योंकि', 'कैसे', 'मतलब', 'तब ही', 'तभी', 'इसलिए', 'process', 'kaise',
  'kyunki', 'matlab', 'because', 'so that', 'how it works', 'the way', 'method', 'tarika', 'तरीका'];
const WARNING = ['मत ', 'गलती', 'नहीं करना', 'बंद करो', 'killing', 'mistake', 'stop ', "don't",
  'dont ', 'avoid', 'galti', 'mat karo', 'never'];

/** Words that carry nothing, in both scripts. Marking these is what makes stock-slop. */
const FILLER = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'is', 'was', 'are', 'be', 'to', 'of', 'in', 'on',
  'at', 'for', 'with', 'as', 'it', 'this', 'that', 'i', 'you', 'we', 'they', 'me', 'my', 'your',
  'have', 'has', 'do', 'does', 'will', 'can', 'just', 'like', 'um', 'uh', 'ok', 'okay', 'yeah',
  'really', 'very', 'about', 'know', 'think', 'go', 'get', 'got',
  'है', 'हैं', 'का', 'की', 'के', 'को', 'में', 'से', 'पे', 'पर', 'और', 'तो', 'ये', 'वो', 'यह',
  'मैं', 'तुम', 'आप', 'हम', 'कि', 'ही', 'भी', 'था', 'थी', 'थे', 'हूँ', 'हो', 'गया', 'रहा', 'रहे',
  'ka', 'ki', 'ke', 'ko', 'mein', 'se', 'aur', 'to', 'ye', 'wo', 'hai', 'hain', 'bhi', 'hi',
]);

/** CTA asks, in the order they convert: a trigger beats a bare follow. */
const CTA_ASKS: [string, readonly string[]][] = [
  ['comment trigger', ['comment', 'कमेंट']],
  ['DM trigger', [' dm', 'डीएम', 'inbox', 'message', 'भेज दूँगा', 'भेजूंगा', 'send it to you']],
  ['link / bio', ['link', 'लिंक', 'bio', 'बायो', 'description']],
  ['follow', ['follow', 'फॉलो', 'subscribe', 'सब्सक्राइब']],
  ['check it', ['check', 'चेक', 'दे' + 'खो', 'देख लेना']],
];

/** Hook shapes, all five observed across the reference set. */
const HOOK_SHAPES: [string, (t: string) => boolean][] = [
  ['question', (t) => /\?/.test(t) || has(t, ['क्या ', 'kya ', 'do you', 'have you', 'why do'])],
  ['pain callout', (t) => has(t, ['नहीं बढ़', 'नहीं कर', 'not growing', 'not working', 'struggling',
    'नहीं हो', 'problem', 'दिक्कत'])],
  ['mistake callout', (t) => has(t, WARNING)],
  ['offer', (t) => has(t, ['फ्री', 'free', 'मुफ्त', 'muft', 'बिल्कुल फ्री'])],
  ['promise / reveal', (t) => has(t, ['आज', 'aaj', 'today', 'दिखाने', 'dikhane', 'going to show',
    'show you how', 'बताऊंगा', 'सिखाऊंगा'])],
  ['audience callout', (t) => has(t, ['भाई', 'bhai', 'सुनो', 'suno', 'वालो', 'walo', 'guys',
    'you are not ready'])],
];

// \p{M} matters: Devanagari nukta/matra are combining marks, NOT letters. Stripping them
// turned बढ़ into बढ and the pain-callout pattern silently stopped matching.
const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}'\s]/gu, '').trim();

/** Group words into sentences on real pauses — punctuation is unreliable from STT. */
function sentences(words: readonly ScriptWord[], gapMs = 420): ScriptWord[][] {
  const out: ScriptWord[][] = [];
  let cur: ScriptWord[] = [];
  for (const w of words) {
    const gap = cur.length ? w.startMs - cur[cur.length - 1].endMs : 0;
    if (cur.length && (gap > gapMs || cur.length >= 14)) { out.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** What kind of moment this sentence is, and why. Order matters: a figure beats everything. */
function classify(text: string): { kind: MomentKind; reason: string; score: number } | null {
  const t = ' ' + clean(text) + ' ';
  if (FIGURE.test(text)) return { kind: 'figure', reason: 'states a number', score: 5 };
  if (has(t, WARNING)) return { kind: 'warning', reason: 'warns against a mistake', score: 4 };
  if (has(t, LIST_MARK)) return { kind: 'list', reason: 'enumerates items', score: 4 };
  if (has(t, COMPARE)) return { kind: 'comparison', reason: 'contrasts two things', score: 3.5 };
  if (has(t, MECHANISM)) return { kind: 'mechanism', reason: 'explains how it works', score: 3 };
  // Otherwise: only if it carries real content words, and enough of them to be a claim.
  const content = clean(text).split(/\s+/).filter((w) => w.length > 2 && !FILLER.has(w));
  if (content.length >= 3) return { kind: 'concept', reason: 'introduces something new', score: 2 };
  return null;
}

/** Latin script only — anything with a Devanagari codepoint is rejected as on-screen text. */
const isLatin = (s: string) => /^[ -~'’]+$/.test(s) && /[a-z]/i.test(s);

/** A generic English label per kind, for when a sentence carries no Latin word at all. */
const FALLBACK_LABEL: Record<MomentKind, string> = {
  figure: 'the number', list: 'step', comparison: 'before / after',
  mechanism: 'how it works', warning: 'the mistake', concept: 'the point',
};

/**
 * The word a visual anchors to — and it MUST be renderable as English.
 *
 * The speech is code-mixed: a Hinglish creator says "value provide करना" or "8000 followers
 * बढ़े". Detection reads both scripts (see the vocabularies above) but ANIMATIONS ARE ENGLISH
 * ONLY, so the anchor is chosen from Latin tokens exclusively. That is not a compromise —
 * in code-mixed speech the load-bearing nouns are already English ("value", "followers",
 * "comment", "PDF", "link"), which is exactly what belongs on screen.
 *
 * Order: a figure wins, then the longest Latin content word, then a generic English label
 * for the kind. Devanagari never reaches the frame.
 */
function anchorOf(ws: readonly ScriptWord[], kind: MomentKind): string {
  const fig = ws.find((w) => FIGURE.test(w.text) && isLatin(w.text.trim()));
  if (fig) return clean(fig.text);
  // A figure written in Devanagari digits still yields its Latin digits if present.
  const digits = ws.map((w) => (w.text.match(/\d[\d,.]*\s*(k|m|cr|%)?/i) || [])[0]).find(Boolean);
  if (digits) return digits.trim();

  let best = '';
  for (const w of ws) {
    const raw = w.text.trim();
    if (!isLatin(raw)) continue;                    // reject Devanagari outright
    const c = clean(raw);
    if (!c || FILLER.has(c) || c.length < 3) continue;
    if (c.length > best.length) best = c;
  }
  return best || FALLBACK_LABEL[kind];
}

/**
 * Turn a transcript into an edit plan.
 *
 * `maxMoments` enforces the measured density: a 60s reel carries 4-7 marked moments. Marking
 * more than one every ~6s means filler is being marked, which is the failure this guards.
 */
export function planScript(
  words: readonly ScriptWord[],
  durationMs: number,
  opts: { maxMoments?: number } = {},
): ScriptPlan {
  if (!words.length) return { hook: null, cta: null, moments: [], durationMs };
  const secs = durationMs / 1000;
  const maxMoments = opts.maxMoments ?? Math.max(3, Math.min(8, Math.round(secs / 9)));

  const sents = sentences(words);
  const textOf = (ws: readonly ScriptWord[]) => ws.map((w) => w.text).join(' ').trim();

  // HOOK: everything spoken in the first 3.5s, matched against the five observed shapes.
  const hookWords = words.filter((w) => w.startMs < 3500);
  const hookText = textOf(hookWords);
  const hook = hookWords.length ? {
    atMs: 0,
    endMs: hookWords[hookWords.length - 1].endMs,
    text: hookText,
    shape: HOOK_SHAPES.find(([, test]) => test(' ' + clean(hookText) + ' '))?.[0] ?? 'statement',
  } : null;

  // CTA: the LAST sentence in the closing third that makes an ask. A fixed trailing window
  // missed it — the reference reel opens its CTA 9.2s before the end of a 53s reel.
  let cta: ScriptPlan['cta'] = null;
  const tailStart = Math.max(0, durationMs - Math.max(8000, durationMs * 0.28));
  for (const ws of sents) {
    if (ws[0].startMs < tailStart) continue;
    const t = ' ' + clean(textOf(ws)) + ' ';
    const ask = CTA_ASKS.find(([, keys]) => has(t, keys));
    if (!ask) continue;
    cta = { atMs: ws[0].startMs, endMs: durationMs, text: textOf(ws), ask: ask[0] };
    break;                       // the first ask in the tail opens the CTA
  }

  // BODY moments, ranked, then spaced so the edit breathes.
  const candidates: Moment[] = [];
  for (const ws of sents) {
    const at = ws[0].startMs;
    if (hook && at < hook.endMs) continue;         // the hook is its own beat
    if (cta && at >= cta.atMs) continue;           // so is the CTA
    const text = textOf(ws);
    const c = classify(text);
    if (!c) continue;
    candidates.push({
      atMs: at, endMs: ws[ws.length - 1].endMs, kind: c.kind, section: 'body',
      text, anchor: anchorOf(ws, c.kind), reason: c.reason, score: c.score,
    });
  }

  const MIN_GAP = 2600;
  const picked: Moment[] = [];
  for (const m of [...candidates].sort((a, b) => b.score - a.score || a.atMs - b.atMs)) {
    if (picked.length >= maxMoments) break;
    if (picked.some((p) => Math.abs(p.atMs - m.atMs) < MIN_GAP)) continue;
    picked.push(m);
  }
  picked.sort((a, b) => a.atMs - b.atMs);

  return { hook, cta, moments: picked, durationMs };
}

/** The visual each kind gets. This is the whole point of classifying them. */
export const VISUAL_FOR: Record<MomentKind, string> = {
  figure: 'promote — the number alone at hero scale, everything else clears',
  list: 'build — items arrive one at a time, earlier ones persist',
  comparison: 'place both — two panels, or one replacing the other on the cut',
  mechanism: 'represent — parts and arrows in the order they happen',
  warning: 'mark — a strike or cross in the accent colour',
  concept: 'name — the term lands as an object and holds long enough to read',
};
