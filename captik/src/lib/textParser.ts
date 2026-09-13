/**
 * Safe Indic grapheme utilities.
 *
 * Standard JS string iteration breaks Indic ligatures and mātrā vowel signs —
 * e.g. "कि" is two code points (क + ि) but one grapheme cluster.
 * Intl.Segmenter always returns the correct cluster boundaries.
 */

/** Split a string into grapheme clusters (safe for Hindi/Urdu/Tamil/Bengali etc.) */
export function splitGraphemes(text: string): string[] {
  if (typeof Intl?.Segmenter === 'undefined') {
    // Fallback: spread operator gives code-point iteration (good enough for ASCII)
    return [...text];
  }
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(seg.segment(text), s => s.segment);
}

/** Split text into word tokens (respects Indic word boundaries). */
export function splitWords(text: string): string[] {
  if (typeof Intl?.Segmenter === 'undefined') {
    return text.trim().split(/\s+/).filter(Boolean);
  }
  const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
  return Array.from(seg.segment(text))
    .filter(s => s.isWordLike)
    .map(s => s.segment);
}

/**
 * Each Indic script Captik transcribes maps to its OWN Noto Sans face — they do NOT share
 * glyphs, so a single "Noto Sans Devanagari" stack rendered Malayalam/Telugu/Kannada/etc. as
 * empty boxes (tofu). The faces are self-hosted under /public/fonts so the export renderers can
 * load them: Remotion Lambda's headless Chromium ships only Latin + CJK Noto, so any non-Latin
 * caption left to the system-font fallback came out as tofu in the exported MP4 even when it
 * looked fine in the editor (the browser falls back to an OS Indic font there).
 *
 * `range` is the script's Unicode block (blocks are disjoint, so detection order is irrelevant).
 * `family` matches the @font-face name (buildIndicFontsCss) AND the Google Fonts name loaded in
 * layout.tsx for the live preview, so preview and export resolve to the same face.
 */
export interface IndicScriptFont {
  id:     string;
  family: string;   // CSS font-family (== @font-face name == Google Fonts name)
  file:   string;   // self-hosted woff2 in /public/fonts
  range:  RegExp;
  /**
   * Whether the Remotion LAMBDA renderer (its headless Chromium) can actually paint this script.
   * Lambda's Chromium only ships a SYSTEM font (+ shaper) for Devanagari and Tamil — it renders
   * everything else as last-resort "NO GLYPH" boxes and IGNORES URL/data-URL web @font-face for
   * those complex scripts (verified by real Lambda renders: tried ttf/woff2/data-URL/official/
   * static/variable, even a bare consonant — all tofu). So a caption containing any
   * `lambdaSafe:false` script must export in the USER's browser instead (see captionNeedsBrowserExport).
   */
  lambdaSafe: boolean;
}

export const INDIC_SCRIPT_FONTS: IndicScriptFont[] = [
  { id: 'devanagari', family: 'Noto Sans Devanagari', file: 'NotoSansDevanagari.woff2', range: /[ऀ-ॿ]/, lambdaSafe: true  },
  { id: 'bengali',    family: 'Noto Sans Bengali',    file: 'NotoSansBengali.woff2',    range: /[ঀ-৿]/, lambdaSafe: false },
  { id: 'gurmukhi',   family: 'Noto Sans Gurmukhi',   file: 'NotoSansGurmukhi.woff2',   range: /[਀-੿]/, lambdaSafe: false },
  { id: 'gujarati',   family: 'Noto Sans Gujarati',   file: 'NotoSansGujarati.woff2',   range: /[઀-૿]/, lambdaSafe: false },
  { id: 'oriya',      family: 'Noto Sans Oriya',      file: 'NotoSansOriya.woff2',      range: /[଀-୿]/, lambdaSafe: false },
  { id: 'tamil',      family: 'Noto Sans Tamil',      file: 'NotoSansTamil.woff2',      range: /[஀-௿]/, lambdaSafe: true  },
  { id: 'telugu',     family: 'Noto Sans Telugu',     file: 'NotoSansTelugu.woff2',     range: /[ఀ-౿]/, lambdaSafe: false },
  { id: 'kannada',    family: 'Noto Sans Kannada',    file: 'NotoSansKannada.woff2',    range: /[ಀ-೿]/, lambdaSafe: false },
  { id: 'malayalam',  family: 'Noto Sans Malayalam',  file: 'NotoSansMalayalam.woff2',  range: /[ഀ-ൿ]/, lambdaSafe: false },
];

/** Indic scripts present in `text` that the Lambda renderer CANNOT paint (→ must export in-browser). */
export function lambdaUnsupportedScriptsIn(text: string): IndicScriptFont[] {
  return INDIC_SCRIPT_FONTS.filter(s => !s.lambdaSafe && s.range.test(text));
}

/** The first Indic script (if any) present in `text`. */
export function indicScriptOf(text: string): IndicScriptFont | null {
  return INDIC_SCRIPT_FONTS.find(s => s.range.test(text)) ?? null;
}

/** Every Indic script present in `text`, in canonical order (usually one — a token is one script). */
export function indicScriptsIn(text: string): IndicScriptFont[] {
  return INDIC_SCRIPT_FONTS.filter(s => s.range.test(text));
}

/** True if the string contains Devanagari / Bengali / Tamil / Telugu / Kannada / Malayalam / Gujarati / Gurmukhi / Odia characters. */
export function containsIndicScript(text: string): boolean {
  return indicScriptOf(text) !== null;
}

/** True if the string contains Arabic / Urdu (Nastaliq) characters. */
export function containsArabicScript(text: string): boolean {
  return /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(text);
}

/**
 * Returns the best-fit CSS font-family string for the given text. Indic text resolves to its
 * SCRIPT-SPECIFIC Noto face (not a one-size Devanagari stack) so Malayalam/Telugu/Kannada/etc.
 * render real glyphs instead of tofu boxes. `sans-serif` tail covers any stray Latin glyph.
 *
 * The `!== 'system-ui, sans-serif'` return is also used as an "is this non-Latin?" sentinel
 * across the caption renderers — every non-Latin branch here keeps returning a Noto stack.
 */
export function getFontFamily(text: string): string {
  if (containsArabicScript(text))  return '"Noto Nastaliq Urdu", "Noto Naskh Arabic", serif';
  const script = indicScriptOf(text);
  if (script)                      return `"${script.family}", sans-serif`;
  return 'system-ui, sans-serif';
}

/**
 * Safely slice `text` by grapheme count (not byte/code-point offset).
 * Used by the typewriter animation so Hindi matras never split mid-cluster.
 */
export function sliceByGraphemes(text: string, count: number): string {
  return splitGraphemes(text).slice(0, count).join('');
}

/**
 * CSS font-family stack for a user-selected font (built-in, Google, or uploaded).
 * The chosen font wins, with Indic/Arabic Noto fonts appended so glyphs missing
 * from a Latin-only font still render (browsers fall back per-glyph through the list).
 * Used by the live preview (CaptionOverlay) and the Lambda export composition so the
 * selected font overrides every style's hard-coded font in captions and export.
 */
export function customFontStack(name: string): string {
  const safe = name.replace(/['"\\]/g, '').trim();
  const noto = INDIC_SCRIPT_FONTS.map(s => `"${s.family}"`).join(', ');
  return `'${safe}', ${noto}, "Noto Nastaliq Urdu", system-ui, sans-serif`;
}
