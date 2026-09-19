// CAPTION MECHANICS — the measured grammar of premium auto-edit captions.
//
// Decoded frame-by-frame from 24 competitor style videos (~8,000 frames). The
// headline finding: THE CAPTION SYSTEM IS THE PRODUCT. Graphics are rare (1-3 per
// 10s) and simple; what makes a style feel like itself is the typography, the
// emphasis mechanic and the timing. This table is the deterministic definition —
// treatments pick a mechanic, the renderer obeys these numbers exactly.
//
// UNIVERSAL CONSTANTS (held across all 24 styles, no exceptions):
//  · entry is a POP: 0-133ms (1-4 frames). Nothing slides in. Nothing scales in.
//  · exit is a HARD CUT: 0ms. Captions never fade out. This asymmetry is the snap.
//  · 1-5 words on screen, 2 lines maximum, then a hard clear.
//  · word cadence 125-458ms (~290ms typical); chunk hold 280-1533ms (~700-1000ms).
//  · a style commits to ONE emphasis mechanic — never karaoke AND static colour.
//  · scene cuts are rare (1-3 per 10s) and belong to one family: all-crossfade or
//    all-hard-cut. The caption churn drives perceived rhythm, not the cutting.

export type EmphasisMechanic =
  /** Sequential karaoke: the spoken word takes the accent, previous words demote. */
  | 'karaoke-color'
  /** Whole chunk appears greyed, each word solidifies to full ink as spoken. */
  | 'ghost-fill'
  /** Leading words dark, trailing words grey — FIXED for the hold, not sequential. */
  | 'front-loaded'
  /** The key word leaves the line and takes the screen as a giant solo card. */
  | 'word-promotion'
  /** A chip/box sits behind the active word only. */
  | 'chip-highlight'
  /** An underline wipes in under the active word (133-167ms, left to right). */
  | 'underline-wipe'
  /** Emphasis by slant only — never colour, never scale. */
  | 'italic-swap'
  /** No per-word emphasis: the whole chunk is atomic, one look. */
  | 'atomic';

export interface CaptionMechanicSpec {
  mechanic: EmphasisMechanic;
  /** Cap-height as % of frame height for the normal line. */
  sizePct: number;
  /** Multiplier applied to a promoted/hero word (1 = no promotion tier). */
  heroScale: number;
  case: 'upper' | 'sentence' | 'lower';
  align: 'left' | 'center';
  /** Vertical anchor, % of frame height (baseline band). */
  yPct: number;
  /** Backing: none, a solid box behind the line, or a pill/chip per word. */
  backing: 'none' | 'box' | 'chip';
  /** Entry duration in ms (0 = same-frame pop). Exit is ALWAYS 0. */
  enterMs: number;
  /** Typical per-word cadence and chunk hold, in ms. */
  wordMs: [number, number];
  holdMs: [number, number];
  /** Max words on screen before a hard clear. */
  maxWords: number;
}

/** The measured library. Each entry is one real, working caption system. */
export const CAPTION_MECHANICS: Record<string, CaptionMechanicSpec> = {
  // Cyan phrase → giant white solo word → cyan phrase. The most quotable mechanic.
  promote: { mechanic: 'word-promotion', sizePct: 4.05, heroScale: 2.3, case: 'upper', align: 'center', yPct: 45, backing: 'none', enterMs: 42, wordMs: [250, 400], holdMs: [292, 1333], maxWords: 4 },
  // Whole chunk pre-rendered grey, words solidify as spoken — reads ahead of the voice.
  ghost: { mechanic: 'ghost-fill', sizePct: 7.4, heroScale: 1, case: 'upper', align: 'center', yPct: 50, backing: 'none', enterMs: 0, wordMs: [300, 400], holdMs: [900, 1600], maxWords: 6 },
  // Leading words ink, trailing grey, fixed for the hold. Calm, editorial.
  frontLoaded: { mechanic: 'front-loaded', sizePct: 3.38, heroScale: 1, case: 'sentence', align: 'left', yPct: 84, backing: 'box', enterMs: 80, wordMs: [280, 1080], holdMs: [280, 1080], maxWords: 4 },
  // Active word takes the accent colour, previous words go white. The workhorse.
  karaoke: { mechanic: 'karaoke-color', sizePct: 6.08, heroScale: 1, case: 'upper', align: 'left', yPct: 48, backing: 'none', enterMs: 42, wordMs: [125, 208], holdMs: [400, 1100], maxWords: 4 },
  // Gradient chip behind the newest word only; older words revert to plain.
  chip: { mechanic: 'chip-highlight', sizePct: 6.35, heroScale: 1, case: 'upper', align: 'center', yPct: 57, backing: 'chip', enterMs: 50, wordMs: [130, 300], holdMs: [400, 733], maxWords: 5 },
  // Underline wipes in under the active word. Technical, precise.
  underline: { mechanic: 'underline-wipe', sizePct: 6.08, heroScale: 1.4, case: 'upper', align: 'left', yPct: 55, backing: 'none', enterMs: 84, wordMs: [500, 700], holdMs: [600, 900], maxWords: 7 },
  // Italic on the stressed word, colour never changes. Literary.
  italic: { mechanic: 'italic-swap', sizePct: 5.94, heroScale: 1, case: 'sentence', align: 'center', yPct: 65, backing: 'none', enterMs: 0, wordMs: [300, 500], holdMs: [625, 1600], maxWords: 5 },
  // Poster: the line accumulates and holds; only the spoken word takes the accent,
  // on a solid plate. Measured off band-and-plate reference styles.
  poster: { mechanic: 'karaoke-color', sizePct: 6.4, heroScale: 1, case: 'sentence', align: 'center', yPct: 62, backing: 'box', enterMs: 40, wordMs: [130, 300], holdMs: [600, 1300], maxWords: 5 },
  // Atomic chunks, one look, no per-word anything. Cinematic restraint.
  atomic: { mechanic: 'atomic', sizePct: 5.4, heroScale: 1, case: 'sentence', align: 'left', yPct: 78, backing: 'box', enterMs: 83, wordMs: [292, 1833], holdMs: [292, 1833], maxWords: 4 },
};

/** Push a mechanic's caption band clear of the speaker's face.
 *  The measured yPct values come from the reference framing; on a real upload the
 *  face sits wherever it sits, so the band is nudged below it (or above, if the
 *  speaker is framed low) while keeping the style's relative position feel. */
export function safeCaptionY(spec: CaptionMechanicSpec, faceYPct: number | undefined): number {
  const face = Number.isFinite(faceYPct) ? (faceYPct as number) : 42;
  const band = spec.yPct;
  const clearsBelow = face + 22;
  const clearsAbove = face - 24;
  if (band > clearsBelow || band < clearsAbove) return band;   // already clear
  return face < 55 ? Math.min(88, clearsBelow) : Math.max(8, clearsAbove);
}

/** Treatment family → its caption mechanic. A style commits to exactly one. */
export const FAMILY_MECHANIC: Record<string, keyof typeof CAPTION_MECHANICS> = {
  bold: 'promote',
  business: 'underline',
  premium: 'italic',
  soft: 'chip',
  creative: 'karaoke',
  retro: 'poster',
};

/** Scene-cut family — styles never mix these (measured: all-crossfade or all-cut). */
export const FAMILY_CUTS: Record<string, 'hard' | 'dissolve'> = {
  bold: 'hard', business: 'hard', premium: 'dissolve',
  soft: 'dissolve', creative: 'hard', retro: 'dissolve',
};
