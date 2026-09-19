// Local, dependency-free "hero word" picker for viral Hinglish/Hindi/English short-form
// captions — the replacement for the old Gemini /api/emphasis call. Gemini kept 429-ing on a
// depleted-credits balance and spamming the server logs on every transcription; this runs
// instantly client-side, costs nothing, and can never fail. It emphasises the words a viewer's
// eye should land on — the embedded ENGLISH words (brand / app / feature names, tech terms),
// numbers, proper nouns and acronyms — and skips function words, verbs and filler in BOTH Hindi
// (romanised) and English.

// Non-Latin Indic + Arabic/Urdu block (same range the editor's isLatin test uses). If any word
// in the transcript contains one of these, the caption is code-mixed and the Latin-script tokens
// ARE the English hero words the creator meant to pop.
const NON_LATIN = /[ऀ-෿؀-ۿ]/;

// Words that must NEVER be the hero: Hindi/Hinglish grammar (romanised) + English grammar +
// generic verbs/fillers. Compared lower-cased with punctuation stripped.
const STOP = new Set([
  // ── Hindi / Hinglish grammar (romanised) ──
  'hai', 'hain', 'tha', 'thi', 'the', 'ho', 'hoga', 'hogi', 'hota', 'hoti', 'hua', 'hue',
  'raha', 'rahi', 'rahe', 'rha', 'rhi', 'gaya', 'gayi', 'gaye',
  'ka', 'ki', 'ke', 'ko', 'ne', 'se', 'mein', 'me', 'par', 'pe', 'tak', 'bina', 'liye',
  'wala', 'wali', 'wale', 'yeh', 'yah', 'ye', 'wo', 'woh', 'vo', 'is', 'us', 'in', 'un',
  'iska', 'uska', 'inka', 'unka', 'isko', 'usko',
  'aur', 'ya', 'toh', 'to', 'bhi', 'hi', 'na', 'naa', 'nahi', 'nahin', 'nai', 'mat',
  'kya', 'kyun', 'kyu', 'kyunki', 'kaise', 'kaisa', 'kaisi',
  'ek', 'do', 'teen', 'koi', 'kuch', 'kuchh', 'sab', 'saara', 'saari', 'sara', 'sari',
  'bahut', 'kaafi', 'kafi', 'sirf', 'bas', 'abhi', 'ab', 'jab', 'tab',
  'agar', 'lekin', 'magar', 'phir', 'fir', 'jo', 'jis', 'matlab', 'yaani', 'waise',
  'aisa', 'aise', 'jaise', 'jese', 'aap', 'hum', 'tum', 'main', 'mai', 'mera', 'meri', 'mere',
  'tera', 'teri', 'apna', 'apni', 'apne', 'uske', 'iske', 'yahan', 'wahan', 'yaha', 'waha',
  'karo', 'kar', 'karna', 'karne', 'karta', 'karti', 'karte', 'kiya', 'kiye',
  'diya', 'dena', 'lena', 'hona',
  // ── English grammar ──
  'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'have', 'has', 'had', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'shall', 'must', 'can', 'cant', 'wont', 'dont',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'mine', 'we', 'our', 'ours',
  'us', 'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
  'they', 'them', 'their', 'theirs', 'who', 'whom', 'whose', 'which', 'what', 'where',
  'when', 'why', 'how', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'of', 'off',
  'up', 'down', 'out', 'into', 'onto', 'over', 'under', 'as', 'if', 'but',
  'or', 'nor', 'and', 'not', 'no', 'yes', 'so', 'than', 'then', 'just', 'very', 'too',
  'also', 'here', 'there', 'now', 'well', 'after', 'before', 'between', 'through', 'during',
  'about', 'around', 'again', 'all', 'any', 'some', 'more', 'most', 'much', 'such', 'each', 'every',
  // ── Generic verbs / fillers — read as filler, never as the hero ──
  'add', 'show', 'shows', 'showed', 'make', 'makes', 'made', 'get', 'gets', 'got',
  'use', 'uses', 'used', 'using', 'see', 'seen', 'look', 'looks', 'looking',
  'go', 'goes', 'going', 'went', 'come', 'comes', 'came', 'give', 'gives', 'gave',
  'want', 'wants', 'need', 'needs', 'like', 'likes', 'know', 'knows', 'think', 'thinks',
  'tell', 'say', 'says', 'said', 'saying', 'take', 'takes', 'took', 'put', 'set', 'let',
  'keep', 'turn', 'open', 'opens', 'close', 'click', 'clicks', 'tap', 'taps', 'try', 'tries',
  'really', 'actually', 'basically', 'literally', 'simply', 'maybe', 'okay', 'ok',
  'yeah', 'yep', 'guys', 'bhai', 'bro', 'dude',
  'thing', 'things', 'way', 'ways', 'lot', 'lots', 'bit', 'kind', 'sort', 'stuff',
  'one', 'two', 'three', 'type',
]);

/**
 * Pick which word indices to emphasise ("hero words") in a caption transcript.
 *
 * Pure, synchronous, dependency-free. Emphasises ~18% of content words, English/specific words
 * first, and never two adjacent words (keeps the "one hero per phrase" rhythm). Accepts any list
 * of `{ text }` tokens, so both the editor (client) and the /api/emphasis route (server) share it.
 */
const strip = (t: string) => t.replace(/[^A-Za-z0-9ऀ-෿؀-ۿ]/g, ''); // keep letters/digits of any supported script
const isLatin = (t: string) => /[A-Za-z]/.test(t) && !NON_LATIN.test(t);

/**
 * One word's importance: -1 for a function word or filler, else 1 plus what makes it specific.
 * `i` is its index in the phrase (a capital mid-sentence is a proper noun); `mixedScript` says the
 * caption carries a non-Latin script, where the Latin words are the ones that pop.
 */
export function emphasisScore(text: string, i: number, mixedScript: boolean): number {
  const txt = strip(text ?? '');
  if (!txt || STOP.has(txt.toLowerCase())) return -1;
  let score = 1;                                        // any content word starts at 1
  if (/\d/.test(txt)) score += 8;                       // numbers, versions, stats ("2026", "5x")
  if (mixedScript && isLatin(txt)) score += 6;          // English word inside Hindi = the hero
  if (/^[A-Z]/.test(txt) && i > 0) score += 4;          // proper noun mid-sentence
  if (/[A-Z].*[A-Z]/.test(txt)) score += 3;             // acronym / CamelCase (iOS, YouTube, AI)
  if (txt.length >= 6) score += 2;                      // longer ⇒ more specific
  if (txt.length >= 9) score += 1;
  return score;
}

export function computeEmphasisIndices(words: readonly { text: string }[]): number[] {
  if (!words?.length) return [];

  const mixedScript = words.some((w) => NON_LATIN.test(w.text));
  const scored = words.map((w, i) => ({ i, score: emphasisScore(w.text, i, mixedScript) }));

  const scoreOf = new Map(scored.map((s) => [s.i, s.score]));
  const target = Math.max(1, Math.round(words.length * 0.18)); // ~1 in 6 words

  const picked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, target)
    .map((s) => s.i)
    .sort((a, b) => a - b);

  // De-cluster: never emphasise two adjacent words. When a run of picks sits together, keep the
  // higher-scored one so the strongest hero survives and the phrase rhythm stays clean.
  const chosen: number[] = [];
  for (const idx of picked) {
    const last = chosen[chosen.length - 1];
    if (last === idx - 1) {
      if ((scoreOf.get(idx) ?? 0) > (scoreOf.get(last) ?? 0)) chosen[chosen.length - 1] = idx;
    } else {
      chosen.push(idx);
    }
  }
  return chosen;
}
