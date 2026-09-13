import { callStructured } from './llm.js';
import { mapLimit } from './util.js';

// Sarvam's codemix transcript writes Hindi in Devanagari. Reels caption Hinglish in Roman script the way
// creators type it, so each clip's words are romanized ONE-FOR-ONE: word i stays word i, keeping the
// ElevenLabs timing, emphasis and every per-word style untouched.
const DEVANAGARI = /[ऀ-ॿ]/;
const GROUP_WORDS = 1500;

export const needsRoman = (words) => words.some((w) => DEVANAGARI.test(w.text));

const SYSTEM = `You write romanized Hinglish captions for Indian short-form video (Reels, Shorts).
Convert each word to Roman script the way Hindi/Hinglish creators actually type it: natural, readable, no diacritics.
Examples: नहीं→nahi · क्या→kya · है→hai · हूं→hoon · बर्बाद→barbaad · भाई→bhai · ज़्यादा→zyada · लड़कियों→ladkiyon · दिमाग→dimaag · ₹50→₹50.
English words, names, numbers and symbols stay exactly as they are (keep the speaker's casing).
Return exactly one output word for every input word, in the same order — never merge, split, drop or add words.
Keep trailing punctuation; the Devanagari full stop । becomes a period.`;

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['clips'],
  properties: {
    clips: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'words'],
        properties: { id: { type: 'string' }, words: { type: 'array', items: { type: 'string' } } },
      },
    },
  },
};

/** Put romanized spellings onto the original words; anything unusable keeps the original text. */
export function applyRoman(words, romanTexts) {
  if (!Array.isArray(romanTexts) || romanTexts.length !== words.length) return null;
  return words.map((w, i) => {
    const text = String(romanTexts[i] ?? '').replace(/[।॥]/g, '.').replace(/\s+/g, '').trim();
    return { ...w, text: text || w.text };
  });
}

function groupClips(clips) {
  const groups = [];
  let cur = [];
  let n = 0;
  for (const c of clips) {
    if (cur.length && n + c.words.length > GROUP_WORDS) { groups.push(cur); cur = []; n = 0; }
    cur.push(c);
    n += c.words.length;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * clips: [{id, words:[TranscriptWord]}]. Resolves {words: Map(id → romanized words), failed: [ids], usage, model}.
 * A clip whose output does not line up word-for-word is retried once on its own, then left in its original script.
 */
export async function romanizeClips(clips, { model } = {}) {
  const usage = { input_tokens: 0, output_tokens: 0 };
  let served = model;
  const call = async (group) => {
    const text = group.map((c) => `CLIP ${c.id} (${c.words.length} words): ${JSON.stringify(c.words.map((w) => w.text))}`).join('\n\n');
    const r = await callStructured({
      system: SYSTEM,
      content: [{ type: 'text', text: `${text}\n\nReturn every clip with exactly as many words as it was given.` }],
      schema,
      model,
      effort: 'low',
      maxTokens: 32000,
    });
    usage.input_tokens += r.msg.usage?.input_tokens || 0;
    usage.output_tokens += r.msg.usage?.output_tokens || 0;
    served = r.model;
    return new Map((r.data.clips || []).map((c) => [c.id, c.words]));
  };

  const out = new Map();
  const retry = [];
  const results = await mapLimit(groupClips(clips), 3, call);
  for (const c of clips) {
    const got = results.map((m) => m.get(c.id)).find(Boolean);
    const applied = applyRoman(c.words, got);
    if (applied) out.set(c.id, applied);
    else retry.push(c);
  }
  const failed = [];
  for (const c of retry) {
    const applied = applyRoman(c.words, (await call([c]).catch(() => new Map())).get(c.id));
    if (applied) out.set(c.id, applied);
    else failed.push(c.id);
  }
  return { words: out, failed, usage, model: served };
}
