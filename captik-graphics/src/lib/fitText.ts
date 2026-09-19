// Fit-to-box text guard — shared by every CaptionOverlay template row.
//
// THE BUG THIS FIXES: caption rows render `flexWrap:'nowrap'` (single-line mode) inside a
// box whose width is fixed by the dotted box (`captionWidthPercent` of the canvas). The font,
// however, scales freely with `captionFontScale` (box resize handles / pinch). When the scaled
// text gets wider than the box, the row's `overflow:'hidden'` CLIPS glyphs (or, for layouts
// without overflow, the canvas/video edge cuts them off in the export). The user sees captions
// "cut out".
//
// THE FIX: estimate the rendered width of a row from a per-codepoint width table (the exact
// technique the Aura packer already uses — no DOM/canvas measurement, so preview and every
// export surface compute the IDENTICAL number) and return a ≤1 multiplier that shrinks the
// font just enough to fit. It never grows text and is a no-op (returns 1) whenever the text
// already fits, so templates look byte-identical for every caption that fits today.
//
// Keep this file pure — it runs on every phrase change in the preview AND per-frame in the
// Remotion export, and it is unit-tested in fitText.spec.ts.

/** Approximate advance width of one codepoint in em units (~Inter/system sans at weight 600+). */
export function charUnit(ch: string): number {
  if (/[mwMW@]/.test(ch))      return 0.92;
  if (/[A-Z0-9]/.test(ch))     return 0.66;
  if (/[ilIjt.,'!|]/.test(ch)) return 0.30;
  if (/[fr]/.test(ch))         return 0.42;
  if (/[a-z]/.test(ch))        return 0.54;
  if (/\s/.test(ch))           return 0.32;
  if (/\p{M}/u.test(ch))       return 0.18;   // combining marks (Indic matras) are zero/narrow width
  return 0.72;                                // Indic/other full letters (Noto Sans Devanagari ≈ 0.72em)
}

/** Estimated rendered width (px) of `text` at `fontPx`, with an optional per-font width factor. */
export function estTextWidth(text: string, fontPx: number, factor = 1): number {
  let u = 0;
  for (const ch of text) u += charUnit(ch);
  return u * fontPx * factor;
}

export interface FitItem {
  text: string;
  fontPx: number;
  /** Per-font width factor (heavy display faces run wider than the table's ~Inter baseline). Default 1. */
  factor?: number;
  /** Letter-spacing in em (adds lsEm × fontPx per character). Default 0. */
  lsEm?: number;
}

/**
 * Rough width factor for a CSS font-family stack relative to the char table's ~Inter baseline.
 * Deliberately coarse — it only has to keep the ≤1 fit multiplier honest, not typeset.
 */
export function fontWidthFactor(fontFamily?: string): number {
  if (!fontFamily) return 1;
  const f = fontFamily.toLowerCase();
  if (f.includes('anton') || f.includes('theboldfont')) return 0.92;   // condensed display caps
  if (f.includes('montserrat') || f.includes('poppins') || f.includes('monasans')) return 1.2;
  if (f.includes('komika')) return 1.15;
  if (f.includes('rubik') || f.includes('futura') || f.includes('luckiest')) return 1.1;
  return 1;
}

function itemWidth(it: FitItem): number {
  const ls = (it.lsEm ?? 0) * it.fontPx * [...it.text].length;
  return estTextWidth(it.text, it.fontPx, it.factor ?? 1) + ls;
}

/**
 * Multiplier (≤1) that makes a single nowrap row of `items` (word chips separated by `gapPx`)
 * fit inside `boxPx`. Returns exactly 1 when the row already fits — the common case — so
 * applying it is always safe.
 *
 * The gaps (flex gap + per-word chip padding folded into `gapPx` by callers) are FIXED pixels
 * that do NOT shrink with the font, so the multiplier applies to the text portion only:
 * `k = (box − gaps) / textWidth` — not `box / (text + gaps)`, which under-shrinks whenever the
 * fixed portion is a large share of the box (e.g. bubble's pills).
 */
export function fitRowScale(items: FitItem[], gapPx: number, boxPx: number): number {
  if (!items.length || boxPx <= 0) return 1;
  let text = 0;
  for (const it of items) text += itemWidth(it);
  const gaps = Math.max(0, items.length - 1) * gapPx;
  if (text + gaps <= boxPx) return 1;
  const budget = boxPx - gaps;
  // Fixed gaps alone (nearly) fill the box — no font shrink can truly fit; floor the scale so
  // text stays legible instead of collapsing to 1px.
  if (budget <= text * 0.15) return 0.15;
  return budget / text;
}

/**
 * Multiplier (≤1) that makes the WIDEST single word of `items` fit inside `boxPx`.
 * Used in wrap mode (rows re-wrap, but one long word can still exceed the box) and for
 * single-hero layouts (spotlight / emphasis / Big Reveal title).
 */
export function fitWordScale(items: FitItem[], boxPx: number): number {
  if (!items.length || boxPx <= 0) return 1;
  let max = 0;
  for (const it of items) max = Math.max(max, itemWidth(it));
  return max > boxPx ? boxPx / max : 1;
}
