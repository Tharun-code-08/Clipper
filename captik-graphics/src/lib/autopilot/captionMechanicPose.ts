// The shared pure(time) brain for the measured caption mechanics.
//
// ONE evaluator drives the live preview and both export compositions, so a caption
// can never render differently across surfaces (the same discipline as motionPose /
// bespokePose). Feed it a chunk of words with their spoken times and a mechanic
// spec; it returns exactly what to draw at tMs — nothing else decides.

import type { CaptionMechanicSpec } from './captionMechanics';

export interface MechWord { text: string; startMs: number; endMs: number }

/** How a single word should render right now. */
export interface WordPose {
  text: string;
  /** 'pending' = not yet spoken, 'active' = being spoken, 'past' = already spoken. */
  state: 'pending' | 'active' | 'past';
  /** 0..1 entry progress (mechanics that pop are 1 immediately). */
  enter: number;
  /** Mechanic-driven flags the renderer maps to CSS. */
  accent: boolean;
  dim: boolean;
  italic: boolean;
  chip: boolean;
  underline: number; // 0..1 wipe progress
  scale: number;
}

export interface ChunkPose {
  words: WordPose[];
  /** Set when the mechanic promotes a word to a full-screen solo card. */
  promoted?: { text: string; scale: number };
  visible: boolean;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Pure(time) chunk state.
 *
 * Universal laws encoded here (measured across 24 reference styles, no exceptions):
 *  · entry is a POP of spec.enterMs (0-133ms); nothing slides or scales in
 *  · exit is a HARD CUT — a chunk simply stops existing after its last word
 *  · a word is 'active' from its own start until the next word starts
 */
export function chunkPose(
  words: readonly MechWord[],
  spec: CaptionMechanicSpec,
  tMs: number,
): ChunkPose {
  if (!words.length) return { words: [], visible: false };
  const first = words[0].startMs;
  const last = words[words.length - 1].endMs;
  // Hard cut out: the chunk is gone the instant it ends. No fade, ever.
  if (tMs < first - spec.enterMs || tMs >= last) return { words: [], visible: false };
  // (the blank beat itself is produced by chunk boundaries — see CHUNK_CLEAR_MS)

  const activeIdx = words.reduce((acc, w, i) => (tMs >= w.startMs ? i : acc), -1);

  const out: WordPose[] = words.map((w, i) => {
    const spoken = i <= activeIdx;
    const state: WordPose['state'] = i === activeIdx ? 'active' : spoken ? 'past' : 'pending';
    // Entry: measured styles pop (enterMs 0-133). A 0 spec means same-frame.
    const enter = spec.enterMs <= 0 ? 1 : clamp01((tMs - w.startMs) / spec.enterMs);

    switch (spec.mechanic) {
      case 'karaoke-color':
        /**
         * Active word takes the accent AND the size.
         *
         * `heroScale` was declared on every preset — 2.3 on one, 1.4 on another — and read by
         * nothing: every branch here returned `scale: 1`, so the picked word only ever differed
         * in colour. The measured styles pick one word out of two to four by making it BIGGER
         * as well as brighter, and that difference is most of what makes a caption read as a
         * design instead of a subtitle.
         */
        return { text: w.text, state, enter: spoken ? enter : 0, accent: state === 'active', dim: false, italic: false, chip: false, underline: 0, scale: state === 'active' ? (spec.heroScale || 1) : 1 };
      case 'ghost-fill':
        // Whole chunk is present immediately in grey; words solidify as spoken.
        return { text: w.text, state, enter: 1, accent: false, dim: !spoken, italic: false, chip: false, underline: 0, scale: 1 };
      case 'front-loaded': {
        // Leading half ink, trailing half grey — FIXED for the hold, not sequential.
        const lead = Math.max(1, Math.ceil(words.length / 2));
        return { text: w.text, state, enter: 1, accent: false, dim: i >= lead, italic: false, chip: false, underline: 0, scale: 1 };
      }
      case 'chip-highlight':
        // Only the newest word wears the chip; older words revert to plain.
        return { text: w.text, state, enter: spoken ? enter : 0, accent: false, dim: false, italic: false, chip: state === 'active', underline: 0, scale: state === 'active' ? (spec.heroScale || 1) : 1 };
      case 'underline-wipe': {
        const u = state === 'active' ? clamp01((tMs - w.startMs) / 150) : 0;
        return { text: w.text, state, enter: spoken ? enter : 0, accent: false, dim: false, italic: false, chip: false, underline: u, scale: state === 'active' ? (spec.heroScale || 1) : 1 };
      }
      case 'italic-swap':
        // Emphasis by slant only — colour never changes.
        return { text: w.text, state, enter: spoken ? enter : 0, accent: false, dim: false, italic: state === 'active', chip: false, underline: 0, scale: 1 };
      case 'word-promotion':
        // The promoted word is drawn separately; the line hides while it is up.
        return { text: w.text, state, enter: spoken ? enter : 0, accent: false, dim: false, italic: false, chip: false, underline: 0, scale: 1 };
      case 'atomic':
      default:
        // The chunk is one object: everything visible for the whole hold.
        return { text: w.text, state, enter: 1, accent: false, dim: false, italic: false, chip: false, underline: 0, scale: 1 };
    }
  });

  return { words: out, visible: true };
}

/** Split a word stream into chunks that respect the mechanic's word cap and gaps. */
export function chunkWords(words: readonly MechWord[], spec: CaptionMechanicSpec): MechWord[][] {
  // Measured across every reference: at most ~4 words are ever on screen, and the
  // line goes fully EMPTY between statements. Ours accumulated indefinitely, which is
  // why our captions read as subtitles while theirs read as design.
  const cap = Math.min(spec.maxWords, 4);
  const chunks: MechWord[][] = [];
  let cur: MechWord[] = [];
  for (const w of words) {
    const gap = cur.length ? w.startMs - cur[cur.length - 1].endMs : 0;
    // A real pause ends a chunk even under the cap — measured styles clear on breath.
    if (cur.length >= cap || (cur.length && gap > 420)) { chunks.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** The blank beat between statements: 0.2-0.4s of empty frame, measured on all 8
 *  references. Without it captions cross-fade into one another and never land. */
export const CHUNK_CLEAR_MS = 260;

/** Which word (if any) this mechanic promotes to a solo card, by emphasis flags. */
export function promotionFor(
  chunk: readonly MechWord[],
  spec: CaptionMechanicSpec,
  emphasised: ReadonlySet<string>,
): MechWord | null {
  if (spec.mechanic !== 'word-promotion') return null;
  return chunk.find((w) => emphasised.has(w.text.toLowerCase().replace(/[^a-z0-9]/gi, ''))) ?? null;
}
