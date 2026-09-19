// "Letter mask": for one or two MOMENTS of a video the frame goes black and the phrase's letters are
// cut out of it, so the footage shows through the type — their Cutout opening ("One / sharp /
// visual" over a black frame, 0.2s in), read at 30fps. Which phrases get it comes from their
// registry's letterMask block:
//
//   maxMoments 2 — one in the OPENING window (the first caption that starts inside the first
//   openingWindowSec seconds), and a PAYOFF (the first caption that starts inside the last
//   payoffTailFraction of the video), only for a video at least secondMomentMinDurationSec long and
//   only if the two are minGapSec apart.
//
// Pure: the preview and every render route pick the same moments.

export interface LetterMaskSpec {
  maxMoments: number;
  openingWindowSec: number;
  payoffTailFraction: number;
  secondMomentMinDurationSec: number;
  minGapSec: number;
}

export function letterMaskMoments(
  segments: { key: string; startMs: number }[], durationMs: number, spec: LetterMaskSpec,
): Set<string> {
  const out = new Set<string>();
  if (spec.maxMoments <= 0 || !segments.length) return out;
  const segs = [...segments].sort((a, b) => a.startMs - b.startMs);
  const opening = segs.find((s) => s.startMs <= spec.openingWindowSec * 1000);
  if (opening) out.add(opening.key);
  if (out.size >= spec.maxMoments) return out;
  if (durationMs < spec.secondMomentMinDurationSec * 1000) return out;
  const tailFrom = durationMs * (1 - spec.payoffTailFraction);
  const after = opening ? opening.startMs + spec.minGapSec * 1000 : -Infinity;
  const payoff = segs.find((s) => s.startMs >= tailFrom && s.startMs >= after && s.key !== opening?.key);
  if (payoff) out.add(payoff.key);
  return out;
}

// The plate's own geometry, MEASURED on their Cutout footage at 30fps (540x960) and solved with
// Archivo Black's real metrics (cap .688, tracking -.065em per glyph):
//   "One" / "sharp": both rows at ONE size, F = 203px; "sharp" advances 1.027W — it OVERFLOWS the
//     frame and is clipped, as the ink at x 0..0.998 shows. "One sharp" / "visual": F = 111px,
//     "One sharp" advances 1.022W. So the widest row is sized to ~1.025 of the frame width.
//   "One" alone: F = 268px = 0.496W, though the width rule would give 281 — a lone short word
//     hits a size cap of half the frame width.
//   Rows pitch .92em (their lineHeightEm). A lone row is centred on the frame: its baseline where
//   an HTML line box puts it by the hhea metrics, (asc - desc)/2 = .334em below the row's centre,
//   which is half the cap (.344em) less .010em. Their two-row blocks sit 0.8% of the frame lower.
export const LETTER_MASK_WIDTH_FRAC = 1.025;
export const LETTER_MASK_MAX_PX_OF_WIDTH = 0.5;
export const LETTER_MASK_LINE_HEIGHT = 0.92;
export const LETTER_MASK_CAP_SHIFT_EM = -0.010;
export const LETTER_MASK_MULTI_ROW_SHIFT_PCT = 0.8;

/** The plate's rows for the words shown so far: a lone word takes one row; more words take the
 *  two-row split whose widest row is narrowest, so the type (sized to that row) is as big as it can
 *  be. Ties keep the earlier, front-loaded split. */
export function letterMaskRows<W>(words: W[], widthEm: (ws: W[]) => number): W[][] {
  if (words.length <= 1) return words.length ? [words] : [];
  let best: W[][] = [[words[0]], words.slice(1)];
  let bestW = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k), b = words.slice(k);
    const w = Math.max(widthEm(a), widthEm(b));
    if (w < bestW - 1e-9) { bestW = w; best = [a, b]; }
  }
  return best;
}
