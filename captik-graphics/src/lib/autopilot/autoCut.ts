/**
 * AUTO-CUT — raw footage in, tight cut out.
 *
 * A shortform edit is mostly SUBTRACTION. Before anything is animated, the take has to lose
 * its dead air, its stumbles and its retakes. This does that from word timings alone, so the
 * result is a deterministic list of source ranges to keep — replayable, testable, and exact
 * enough to drive both a preview and a render.
 *
 * Four passes, in this order (order matters — fillers must go before gaps are measured, or a
 * dropped "umm" leaves two half-gaps that each look too small to close):
 *
 *   1. RETAKES   the same phrase said twice → drop everything from the first attempt up to
 *                the second. This is the single biggest win on real footage and nothing else
 *                can do it: energy-based tools cannot tell a retake from a sentence.
 *   2. FILLERS   "um", "uh", isolated crutch words → dropped with their surrounding air.
 *   3. GAPS      any remaining silence over the threshold collapses to one breath.
 *   4. EDGES     lead-in and tail trimmed to a short pad.
 *
 * Everything is pure. No audio is touched here; the caller applies `cuts` to media.
 */

export interface CutWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** A kept slice of the source, and where it lands on the timeline. */
export interface Cut {
  srcInMs: number;
  srcOutMs: number;
  tlInMs: number;
  tlOutMs: number;
}

export type DropReason = 'retake' | 'filler' | 'gap' | 'lead' | 'tail';

export interface Drop {
  srcInMs: number;
  srcOutMs: number;
  reason: DropReason;
  /** What was removed, for the audit list the UI shows. */
  detail: string;
}

export interface AutoCutResult {
  cuts: Cut[];
  drops: Drop[];
  /** Words with timings remapped onto the CUT timeline. Dropped words are gone. */
  words: CutWord[];
  sourceMs: number;
  timelineMs: number;
  removedMs: number;
}

export interface AutoCutOpts {
  /** Silence longer than this is cut. 350ms keeps natural phrasing; below ~250 it sounds clipped. */
  maxGapMs?: number;
  /** What a cut gap becomes. Not zero — back-to-back words with no air sound robotic. */
  breathMs?: number;
  /** Air left before the first word and after the last. */
  padMs?: number;
  /** How far apart two attempts at the same phrase can be and still count as a retake. */
  retakeWindowMs?: number;
  /**
   * Minimum matching words for a retake, counted as raw tokens. Must ALSO clear
   * `retakeMinContent` — length alone matched "अपने video में" on the reference reel and
   * deleted real speech.
   */
  retakeMinWords?: number;
  /** Minimum CONTENT words (non-stopword) in the match. */
  retakeMinContent?: number;
  /** How much speech may sit between the two attempts. Longer = deliberate reuse, not a retake. */
  retakeMaxInterruptMs?: number;
  removeFillers?: boolean;
  removeRetakes?: boolean;
}

const DEFAULTS: Required<AutoCutOpts> = {
  maxGapMs: 350,
  breathMs: 120,
  padMs: 150,
  retakeWindowMs: 12_000,
  retakeMinWords: 4,
  retakeMinContent: 2,
  retakeMaxInterruptMs: 3500,
  removeFillers: true,
  removeRetakes: true,
};

/**
 * Hard fillers — sounds, not words. Always safe to drop.
 * Devanagari included because a Hinglish take stumbles in both scripts.
 */
const HARD_FILLER = new Set([
  'um', 'umm', 'ummm', 'uh', 'uhh', 'uhm', 'er', 'err', 'hmm', 'hmmm', 'mmm', 'ah', 'ahh',
  'eh', 'aa', 'aaa', 'ummhmm', 'huh',
  'अं', 'अम', 'हम्म', 'उम', 'आं', 'एं',
]);

/**
 * Soft fillers — real words that are crutches WHEN ISOLATED (bracketed by pauses).
 * Dropped only in that case: "matlab" mid-sentence is meaningful, "matlab …" alone is a stall.
 * "like" and "so" are deliberately here and not in HARD_FILLER for the same reason.
 */
const SOFT_FILLER = new Set([
  'like', 'so', 'basically', 'actually', 'literally', 'right', 'okay', 'ok', 'yeah', 'yaar',
  'matlab', 'yaani', 'bas', 'toh', 'na', 'haan', 'achha', 'accha', 'arre',
  'मतलब', 'यानी', 'बस', 'तो', 'ना', 'हाँ', 'हां', 'अच्छा', 'अरे',
]);

/** Strip punctuation and case so "Value," and "value" compare equal. Marks kept — see scriptPlan. */
const norm = (s: string): string =>
  s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '').trim();

/**
 * Function words. A retake has to repeat MEANING, not grammar.
 *
 * Measured on the reference reel: matching on any three consecutive words deleted 7s of
 * perfectly good speech, because "अपने video में" and "है और यही" recur naturally in Hindi
 * the way "and then the" recurs in English. Counting only content words is what separates
 * "I said that twice" from "I used the same preposition twice".
 */
const STOP = new Set([
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'that', 'this', 'it', 'its', 'i', 'you',
  'he', 'she', 'we', 'they', 'my', 'your', 'so', 'if', 'then', 'than', 'as', 'do', 'does',
  'did', 'have', 'has', 'had', 'will', 'would', 'can', 'could', 'not', 'no', 'yes', 'me',
  // Hindi, Devanagari
  'है', 'हैं', 'था', 'थे', 'थी', 'को', 'का', 'के', 'की', 'में', 'से', 'पर', 'और', 'या',
  'तो', 'ये', 'यह', 'वो', 'वह', 'कि', 'जो', 'ना', 'नहीं', 'ही', 'भी', 'अपने', 'अपना',
  'अपनी', 'तुम', 'तुम्हारा', 'तुम्हारे', 'तुम्हारी', 'मैं', 'मेरे', 'मेरा', 'मेरी', 'हम',
  'आप', 'कर', 'करना', 'किया', 'करो', 'रहा', 'रहे', 'रही', 'हो', 'होगा', 'लिए', 'एक',
  'सब', 'कुछ', 'यही', 'वही', 'गया', 'दो', 'ले', 'दे',
  // Hindi, romanised
  'hai', 'hain', 'tha', 'the', 'thi', 'ko', 'ka', 'ke', 'ki', 'mein', 'se', 'par', 'aur',
  'ya', 'yeh', 'wo', 'woh', 'jo', 'nahi', 'nahin', 'bhi', 'apne', 'apna', 'apni', 'tum',
  'tumhara', 'tumhare', 'main', 'mere', 'mera', 'hum', 'aap', 'kar', 'karna', 'kiya',
  'karo', 'raha', 'rahe', 'rahi', 'hoga', 'liye', 'ek', 'sab', 'kuch', 'yahi', 'wahi',
]);

const isContent = (t: string) => t.length > 1 && !STOP.has(t) && !HARD_FILLER.has(t);

/** Words the retake matcher ignores, so "so the algorithm" and "the algorithm" still match. */
const isSkippable = (w: CutWord) => {
  const n = norm(w.text);
  return n.length === 0 || HARD_FILLER.has(n);
};

/**
 * Find retakes: a run of words that repeats later. Returns source ranges to delete —
 * from the START of the first attempt to the START of the second, so the good take survives
 * whole and the flub (plus the "sorry, again" in between) goes.
 */
function findRetakes(words: CutWord[], opts: Required<AutoCutOpts>): Drop[] {
  const drops: Drop[] = [];
  const n = words.length;
  const toks = words.map((w) => norm(w.text));

  let i = 0;
  while (i < n) {
    let best: { j: number; len: number } | null = null;

    // Only look forward inside the window — a phrase legitimately repeated a minute later
    // is a callback, not a stumble.
    for (let j = i + 1; j < n; j++) {
      if (words[j].startMs - words[i].startMs > opts.retakeWindowMs) break;

      // Longest common run starting at i and j, skipping hard fillers on both sides.
      let a = i, b = j, content = 0, tokens = 0, lastA = i;
      while (a < j && b < n) {
        while (a < j && isSkippable(words[a])) a++;
        while (b < n && isSkippable(words[b])) b++;
        if (a >= j || b >= n || !toks[a] || toks[a] !== toks[b]) break;
        if (isContent(toks[a])) content++;
        tokens++;
        lastA = a;
        a++; b++;
      }
      // BOTH bars. Length without substance matched function words and cut real speech;
      // substance without length matches a single reused noun.
      if (tokens < opts.retakeMinWords || content < opts.retakeMinContent) continue;

      // IMMEDIACY. A retake happens straight away: you fluff it, you go again. What sits
      // between the two attempts is at most a beat of dead air and a "sorry, again" — so
      // the INTERRUPTION is the signal, not the distance between the two starts (which
      // grows with the length of the phrase and says nothing about intent).
      // A phrase reused a whole clause later is deliberate emphasis; deleting it would
      // delete what the speaker actually said, which is the worst thing this can do.
      const interruptMs = words[j].startMs - words[lastA].endMs;
      if (interruptMs > opts.retakeMaxInterruptMs) continue;

      if (!best || tokens > best.len) best = { j, len: tokens };
    }

    if (best) {
      drops.push({
        srcInMs: words[i].startMs,
        srcOutMs: words[best.j].startMs,
        reason: 'retake',
        detail: words.slice(i, best.j).map((w) => w.text).join(' ').slice(0, 70),
      });
      i = best.j;                        // resume at the surviving take
    } else {
      i++;
    }
  }
  return drops;
}

const overlaps = (aIn: number, aOut: number, drops: Drop[]) =>
  drops.some((d) => aIn < d.srcOutMs && aOut > d.srcInMs);

/**
 * Record a removal MINUS whatever is already being removed.
 *
 * Without this the audit lies: a retake that swallows the lead-in gets counted twice, and
 * the panel claims 14s were cut from a clip that only lost 7s. The ranges are merged before
 * they are applied either way, so the only thing at stake is whether the number the user
 * reads is true — which is exactly why it matters.
 */
function pushRange(drops: Drop[], a: number, b: number, reason: DropReason, detail: string): void {
  let segs: Array<[number, number]> = [[a, b]];
  for (const d of drops) {
    const next: Array<[number, number]> = [];
    for (const [s, e] of segs) {
      if (d.srcOutMs <= s || d.srcInMs >= e) { next.push([s, e]); continue; }
      if (d.srcInMs > s) next.push([s, d.srcInMs]);
      if (d.srcOutMs < e) next.push([d.srcOutMs, e]);
    }
    segs = next;
  }
  for (const [s, e] of segs) if (e - s > 1) drops.push({ srcInMs: s, srcOutMs: e, reason, detail });
}

export function autoCut(
  wordsIn: readonly CutWord[],
  durationMs: number,
  options: AutoCutOpts = {},
): AutoCutResult {
  const o = { ...DEFAULTS, ...options };
  const words = [...wordsIn]
    .filter((w) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs) && w.endMs > w.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  if (words.length === 0) {
    return {
      cuts: durationMs > 0 ? [{ srcInMs: 0, srcOutMs: durationMs, tlInMs: 0, tlOutMs: durationMs }] : [],
      drops: [], words: [], sourceMs: durationMs, timelineMs: durationMs, removedMs: 0,
    };
  }

  const drops: Drop[] = [];

  // ── 1. RETAKES ──────────────────────────────────────────────────────────────
  if (o.removeRetakes) drops.push(...findRetakes(words, o));

  // ── 2. FILLERS ──────────────────────────────────────────────────────────────
  // A filler is dropped along with the air on either side of it, otherwise removing the
  // word just leaves the pause it was filling.
  if (o.removeFillers) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const n = norm(w.text);
      if (!n) continue;
      if (overlaps(w.startMs, w.endMs, drops)) continue;   // already inside a retake

      const prevEnd = i > 0 ? words[i - 1].endMs : 0;
      const nextStart = i < words.length - 1 ? words[i + 1].startMs : durationMs;
      const isolated = w.startMs - prevEnd > 180 || nextStart - w.endMs > 180;

      const hard = HARD_FILLER.has(n);
      const soft = SOFT_FILLER.has(n) && isolated;
      if (!hard && !soft) continue;

      pushRange(drops,
        Math.max(prevEnd, w.startMs - 60),
        Math.min(nextStart, w.endMs + 60),
        'filler', w.text);
    }
  }

  // Words that survive the content drops. Gaps are measured on THESE, so a gap that only
  // exists because a filler was removed is measured once, correctly.
  const kept = words.filter((w) => !overlaps(w.startMs, w.endMs, drops));

  // ── 3. GAPS ─────────────────────────────────────────────────────────────────
  for (let i = 1; i < kept.length; i++) {
    const gapIn = kept[i - 1].endMs;
    const gapOut = kept[i].startMs;
    const gap = gapOut - gapIn;
    if (gap <= o.maxGapMs) continue;
    // A "gap" that is really the hole a retake or filler removal just left is not a new
    // drop. Recording it again would double-count it in the audit the user reads.
    if (overlaps(gapIn, gapOut, drops)) continue;
    // Keep a breath, split evenly so neither word is butted right up against the cut.
    const removeMs = gap - o.breathMs;
    const half = o.breathMs / 2;
    pushRange(drops, gapIn + half, gapIn + half + removeMs, 'gap', `${(gap / 1000).toFixed(1)}s pause`);
  }

  // ── 4. EDGES ────────────────────────────────────────────────────────────────
  const first = kept[0] ?? words[0];
  const last = kept[kept.length - 1] ?? words[words.length - 1];
  if (first.startMs > o.padMs) {
    pushRange(drops, 0, first.startMs - o.padMs, 'lead', 'lead-in');
  }
  if (durationMs - last.endMs > o.padMs) {
    pushRange(drops, last.endMs + o.padMs, durationMs, 'tail', 'tail');
  }

  // ── ASSEMBLE ────────────────────────────────────────────────────────────────
  // Merge the drops (they can overlap — a filler inside a long pause, say) then invert.
  const merged: Array<{ a: number; b: number }> = [];
  for (const d of [...drops].sort((x, y) => x.srcInMs - y.srcInMs)) {
    const a = Math.max(0, d.srcInMs), b = Math.min(durationMs, d.srcOutMs);
    if (b <= a) continue;
    const tailSeg = merged[merged.length - 1];
    if (tailSeg && a <= tailSeg.b) tailSeg.b = Math.max(tailSeg.b, b);
    else merged.push({ a, b });
  }

  const cuts: Cut[] = [];
  let cursor = 0, tl = 0;
  for (const m of merged) {
    if (m.a > cursor) {
      const len = m.a - cursor;
      cuts.push({ srcInMs: cursor, srcOutMs: m.a, tlInMs: tl, tlOutMs: tl + len });
      tl += len;
    }
    cursor = Math.max(cursor, m.b);
  }
  if (cursor < durationMs) {
    const len = durationMs - cursor;
    cuts.push({ srcInMs: cursor, srcOutMs: durationMs, tlInMs: tl, tlOutMs: tl + len });
    tl += len;
  }

  // Remap surviving words onto the cut timeline.
  const toTl = (srcMs: number): number | null => {
    for (const c of cuts) {
      if (srcMs >= c.srcInMs && srcMs <= c.srcOutMs) return c.tlInMs + (srcMs - c.srcInMs);
    }
    return null;
  };
  const outWords: CutWord[] = [];
  for (const w of kept) {
    const s = toTl(w.startMs);
    if (s === null) continue;
    const e = toTl(w.endMs) ?? s + (w.endMs - w.startMs);
    outWords.push({ text: w.text, startMs: Math.round(s), endMs: Math.round(Math.max(e, s + 40)) });
  }

  return {
    cuts,
    drops: drops.sort((a, b) => a.srcInMs - b.srcInMs),
    words: outWords,
    sourceMs: durationMs,
    timelineMs: tl,
    removedMs: durationMs - tl,
  };
}

/**
 * Chunk plan for STT. Sarvam's sync endpoint rejects anything over 30 SECONDS
 * ("use the batch API") — verified live, so this is a hard constraint, not a tuning knob.
 * Boundaries are placed in the widest silence available so no word is sliced in half.
 */
export interface SttChunk { startMs: number; endMs: number }

export const STT_MAX_CHUNK_MS = 28_000;   // 28s, under Sarvam's 30s wall with headroom

export function planSttChunks(
  regions: ReadonlyArray<{ startMs: number; endMs: number }>,
  durationMs: number,
  maxMs: number = STT_MAX_CHUNK_MS,
): SttChunk[] {
  if (durationMs <= maxMs) return [{ startMs: 0, endMs: durationMs }];

  // Silences between speech regions, as candidate cut points.
  const silences: Array<{ mid: number; width: number }> = [];
  for (let i = 1; i < regions.length; i++) {
    const a = regions[i - 1].endMs, b = regions[i].startMs;
    if (b > a) silences.push({ mid: (a + b) / 2, width: b - a });
  }

  const chunks: SttChunk[] = [];
  let start = 0;
  while (start < durationMs) {
    const hardEnd = Math.min(start + maxMs, durationMs);
    if (hardEnd >= durationMs) { chunks.push({ startMs: start, endMs: durationMs }); break; }

    // Prefer the widest real silence in the window. The lower bound only stops us making
    // uselessly short chunks — it is NOT the back half, because a clean pause at 40% is a
    // far better boundary than a hard slice through a word at 100%. Ties go to the later
    // one, which costs fewer requests.
    const lo = start + maxMs * 0.35;
    const candidates = silences.filter((s) => s.mid >= lo && s.mid <= hardEnd && s.width >= 200);
    const pick = candidates.sort((a, b) => (b.width - a.width) || (b.mid - a.mid))[0];
    const end = pick ? Math.round(pick.mid) : hardEnd;    // unbroken speech → hard cut
    chunks.push({ startMs: start, endMs: end });
    start = end;
  }
  return chunks.filter((c) => c.endMs - c.startMs > 200);
}
