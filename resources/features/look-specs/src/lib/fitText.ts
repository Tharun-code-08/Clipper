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
// The estimate only works if it never UNDER-counts: the fit shrinks the font until the estimate
// exactly fills the box, so any under-count is clipped verbatim. Every width and factor below is
// MEASURED in Chrome (2026-09-16) against the bundled caption fonts, not guessed.
//
// Keep this file pure — it runs on every phrase change in the preview AND per-frame in the
// Remotion export, and it is unit-tested in fitText.spec.ts.

// Indic advance widths in em, per script. Measured on ~40 words per script (real words plus
// generated consonant + vowel-sign combinations) at every caption font stack and weight 400–900,
// both inside the template's Latin stack (glyphs from the system's Indic fallback) and inside the
// script's own Noto face. Least-squares units for base letters, SPACING vowel signs (Unicode Mc)
// and non-spacing marks (Mn), scaled to cover the 90th-percentile word — a caption row sums
// several words, so the row total stays covered. The old flat table (0.72 per letter, 0.18 per
// mark) under-counted Tamil by up to 1.8× and Malayalam by 2.4×: their spacing vowel signs are
// full glyphs, not accents. These units already cover the heaviest weights, and the glyphs come
// from the Indic fallback whatever the Latin family is, so the Latin font/weight factors do NOT
// apply to them (see estTextWidth).
interface ScriptUnits { lo: number; hi: number; letter: number; spacingSign: number; mark: number }
const INDIC_UNITS: ScriptUnits[] = [
  { lo: 0x0900, hi: 0x097F, letter: 0.79, spacingSign: 0.32, mark: 0.06 },   // Devanagari
  { lo: 0x0980, hi: 0x09FF, letter: 1.00, spacingSign: 0.46, mark: 0.00 },   // Bengali
  { lo: 0x0A00, hi: 0x0A7F, letter: 0.80, spacingSign: 0.29, mark: 0.00 },   // Gurmukhi
  { lo: 0x0A80, hi: 0x0AFF, letter: 0.74, spacingSign: 0.39, mark: 0.05 },   // Gujarati
  { lo: 0x0B00, hi: 0x0B7F, letter: 0.74, spacingSign: 0.60, mark: 0.05 },   // Odia
  { lo: 0x0B80, hi: 0x0BFF, letter: 1.30, spacingSign: 0.84, mark: 0.61 },   // Tamil
  { lo: 0x0C00, hi: 0x0C7F, letter: 1.11, spacingSign: 0.60, mark: 0.16 },   // Telugu
  { lo: 0x0C80, hi: 0x0CFF, letter: 0.89, spacingSign: 0.60, mark: 0.15 },   // Kannada
  { lo: 0x0D00, hi: 0x0D7F, letter: 1.31, spacingSign: 1.18, mark: 0.63 },   // Malayalam
];
const INDIC_LO = 0x0900, INDIC_HI = 0x0D7F;
// Viramas fuse consonants into a conjunct (or draw a dot above) — no advance of their own.
const VIRAMAS = new Set(['्', '্', '੍', '્', '୍', '்', '్', '್', '്']);

/**
 * Approximate advance width of one codepoint in em units. The Latin rows are Inter at CAPTION
 * sizes: rows render at ~11–20px on the 270px logical canvas (then scale up), and Inter's optical
 * sizing draws small text ~9% wider than at 100px — the old 100px-calibrated rows under-counted
 * exactly the captions that clipped. Covers every measured word at weight 400 (heavier cuts:
 * fontWeightFactor).
 */
export function charUnit(ch: string): number {
  if (/[mwMW@]/.test(ch))      return 1.00;
  if (/[A-Z0-9]/.test(ch))     return 0.72;
  if (/[ilIjt.,'!|]/.test(ch)) return 0.33;
  if (/[fr]/.test(ch))         return 0.46;
  if (/[a-z]/.test(ch))        return 0.59;
  if (/\s/.test(ch))           return 0.35;
  const cp = ch.codePointAt(0) ?? 0;
  if (cp === 0x0964 || cp === 0x0965) return 0.30;   // danda / double danda (shared by the scripts below)
  for (const s of INDIC_UNITS) {
    if (cp < s.lo || cp > s.hi) continue;
    if (VIRAMAS.has(ch))       return 0;
    if (/\p{Mc}/u.test(ch))    return s.spacingSign;
    if (/\p{Mn}/u.test(ch))    return s.mark;
    return s.letter;
  }
  if (/\p{M}/u.test(ch))       return 0.18;   // other scripts' combining marks
  return 0.72;                                // other full letters
}

/**
 * Estimated rendered width (px) of `text` at `fontPx`. `factor` (font family × weight) scales the
 * Latin/other glyphs only — Indic glyphs come from the script's fallback face whatever the Latin
 * family, and their measured units already cover every family and weight.
 */
export function estTextWidth(text: string, fontPx: number, factor = 1): number {
  let other = 0, indic = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= INDIC_LO && cp <= INDIC_HI) indic += charUnit(ch);
    else other += charUnit(ch);
  }
  return (other * factor + indic) * fontPx;
}

export interface FitItem {
  text: string;
  fontPx: number;
  /** Per-font width factor (display faces run wider or narrower than the Inter baseline). Default 1. */
  factor?: number;
  /** Letter-spacing in em (adds lsEm × fontPx per character). Default 0. */
  lsEm?: number;
  /** CSS font-weight, when the caller knows it — heavy cuts run wider (fontWeightFactor). */
  weight?: number | string;
}

/**
 * Width factor for a CSS font-family stack relative to the table's Inter baseline. MEASURED: each
 * factor covers the widest of 20 Latin words in that face (at the weight its templates use).
 */
export function fontWidthFactor(fontFamily?: string): number {
  if (!fontFamily) return 1;
  const f = fontFamily.toLowerCase();
  if (f.includes('drukwide')) return 1.52;     // MEASURED 1.524 vs Inter (spread 1.50-1.54); checked
                                               // before Anton because the DrukWide stack falls back to it
  if (f.includes('theboldfont')) return 1.17;  // checked before Anton: its stack falls back to Anton, but the face is not condensed
  if (f.includes('anton')) return 0.84;        // condensed display caps
  if (f.includes('clashdisplay')) return 1.11; // MEASURED 1.111 vs Inter (spread 1.08-1.14)
  if (f.includes('abrilfatface')) return 0.99; // MEASURED against THIS estimator with the face verifiably loaded:
                                               // 0.88-0.98 on lowercase words (median 0.93); 0.99 covers every
                                               // measured word, the table's no-clip rule. Two wrong readings came
                                               // first — a harness whose file:// font never loaded (0.79, drew the
                                               // word 16% too wide and clipped both ends) and one relative to
                                               // rendered Inter (1.0).
  // The behind-the-speaker faces, MEASURED the way Abril was (inlined, load forced, fallback
  // control; Anton and Abril reproduced their table values in the same run): the widest of 33
  // lower- and upper-case words, net of the weight factor.
  if (f.includes('pressstart2p')) return 1.99;     // monospaced pixel caps; lowercase is the widest case
  if (f.includes('rubikspraypaint')) return 1.15;  // checked before 'rubik'
  if (f.includes('archivoblack')) return 1.16;
  if (f.includes('alexbrush')) return 0.86;      // DECLARED from their advance table (script .5/.42 per glyph against Inter); a script coda, never fitted tight
  if (f.includes('specialelite')) return 1.13;
  if (f.includes('gloock')) return 1.13;           // capitals run wide (0.97 lowercase)
  if (f.includes('bagelfatone')) return 0.99;
  if (f.includes('unna')) return 0.93;
  if (f.includes('baloo2')) return 0.91;
  if (f.includes('instrumentserif') && !f.includes('instrumentserifitalic')) return 0.74;
  if (f.includes('bbhbartle')) return 2.59;        // a very wide slab; lowercase runs widest
  if (f.includes('blackhansans')) return 1.19;
  if (f.includes('gloriahallelujah')) return 1.08;
  if (f.includes('fredokaone')) return 1.02;
  if (f.includes('bebasneue')) return 0.75;        // condensed caps (its lowercase is caps too)
  if (f.includes('komika')) return 1.3;
  if (f.includes('montserrat')) return 1.15;   // also covers 'MonaSans, Montserrat' stacks (MonaSans alone measures 1.05)
  if (f.includes('rubik')) return 1.15;
  if (f.includes('luckiest')) return 1.12;
  if (f.includes('poppins')) return 1.1;
  if (f.includes('open sans')) return 1.06;
  if (f.includes('monasans')) return 1.05;
  if (f.includes('futura')) return 1.03;
  return 1;
}

/**
 * Heavier cuts run wider than the table's weight-400 baseline. MEASURED on Inter at caption sizes
 * (widest word ÷ its weight-400 width): 600 ≈ 1.03, 800 ≈ 1.07, 900 ≈ 1.09.
 */
export function fontWeightFactor(weight?: number | string): number {
  const w = typeof weight === 'string' ? (weight === 'bold' ? 700 : parseInt(weight, 10)) : weight;
  if (!w || !Number.isFinite(w)) return 1;
  if (w >= 850) return 1.1;
  if (w >= 750) return 1.07;
  if (w >= 550) return 1.03;
  return 1;
}

function itemWidth(it: FitItem): number {
  const ls = (it.lsEm ?? 0) * it.fontPx * [...it.text].length;
  return estTextWidth(it.text, it.fontPx, (it.factor ?? 1) * fontWeightFactor(it.weight)) + ls;
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
