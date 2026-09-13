// Port of captik-app's editor line builder (src/app/editor/page.tsx: chunkAdaptive + sentence split),
// so clips group caption lines exactly the way the Captik editor does.
const CHUNK_MIN_WORDS = 2;
const CHUNK_CHARS_PER_WORD = 6;
const CHUNK_MAX_CHARS = 18;
const PHRASE_GAP_MS = 350;
const MAX_WORDS = 4;

const SENTENCE_END = /[.!?।]["'”’)\]]*$/;
const EDGE_PUNCT = /^[“"'(\[]+|[.,!?;:।"”’)\]]+$/g;

/** Flush at maxWords or the character budget, never below CHUNK_MIN_WORDS unless a pause forces it. */
export function chunkAdaptive(words, maxWords = MAX_WORDS) {
  const maxChars = Math.max(CHUNK_MAX_CHARS, maxWords * CHUNK_CHARS_PER_WORD);
  const out = [];
  let current = [];
  let charCount = 0;
  let prevEnd = -1;
  for (const w of words) {
    const len = w.text.length;
    const newChars = charCount + (current.length > 0 ? 1 : 0) + len;
    const bigGap = prevEnd >= 0 && w.startMs - prevEnd > PHRASE_GAP_MS;
    if (current.length > 0 && (bigGap || (current.length >= CHUNK_MIN_WORDS && (current.length >= maxWords || newChars > maxChars)))) {
      out.push(current);
      current = [w.id];
      charCount = len;
    } else {
      current.push(w.id);
      charCount = newChars;
    }
    prevEnd = w.endMs;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Clip words (seconds, from Whisper, may carry punctuation) → Captik TranscriptWords (ms, clip-relative,
 * punctuation stripped like Captik's STT words) + captionSegments (string[][] of word ids).
 * Sentences are split on the original punctuation first, then chunked, as the editor does.
 */
export function toCaptikWords(sourceWords, { start, end, idPrefix = 'w' }) {
  const inClip = sourceWords.filter((w) => w.s >= start - 0.05 && w.e <= end + 0.05);
  const sentences = [];
  let sentence = [];
  const words = [];
  inClip.forEach((w, i) => {
    const text = w.w.replace(EDGE_PUNCT, '') || w.w;
    const tw = {
      id: `${idPrefix}${i}`,
      text,
      startMs: Math.max(0, Math.round((w.s - start) * 1000)),
      endMs: Math.max(1, Math.round((w.e - start) * 1000)),
      styleOverride: {},
    };
    words.push(tw);
    sentence.push(tw);
    if (SENTENCE_END.test(w.w) || w.eos) {
      sentences.push(sentence);
      sentence = [];
    }
  });
  if (sentence.length) sentences.push(sentence);
  const captionSegments = sentences.length > 1 ? sentences.flatMap((s) => chunkAdaptive(s)) : chunkAdaptive(words);
  return { words, captionSegments };
}
