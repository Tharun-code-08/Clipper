// Single source of truth for "which @font-face families must be pre-loaded before an export's
// first frame". Every export font gate — the Lambda renderer (KineticCaptionComposition), the
// in-browser WYSIWYG renderer (CaptionExportComposition) and the Element Capture stage
// (elementCaptureExport) — extracts the family names from buildFontsCss() and forces each to
// decode up front. A sparsely-used face (e.g. aura's Playfair-italic, drawn only on a feature
// word) otherwise loses the lazy-load race and swaps in MID-render → the caption jitters/reflows.
//
// Pure string parsing, no imports → safe to call from client, Remotion and test environments,
// and impossible to drift from the real @font-face set (it reads the same CSS the gate injects).

/** Distinct font-family names declared in a buildFontsCss()-style stylesheet, in first-seen order. */
export function fontFamiliesFromCss(css: string): string[] {
  return Array.from(new Set(
    [...css.matchAll(/font-family:\s*"([^"]+)"/g)].map((m) => m[1]),
  ));
}

// Caption fonts can also be selected through channels OTHER than the global custom font: the
// per-word Emphasis font and the Text-tab / per-line typography overrides all carry a fontFamily.
// The preview loads ANY family (FontsPanel injects a blanket Google-Fonts <link>), but an export
// only warms what it's told to — so these must be force-decoded too, or emphasised / overridden
// words paint a fallback in the MP4 while the preview looks right. Structurally typed (no imports)
// so it stays callable from the client, Remotion and tests.
type FontRefSource = {
  emphasisStyle?:     { fontFamily?: string } | null;
  textOverrides?:     { fontFamily?: string } | null;
  lineTextOverrides?: Record<string, { fontFamily?: string } | undefined> | null;
};

/** Every font-family referenced by emphasis + global/per-line text overrides, de-duped. */
export function referencedFontFamilies(src: FontRefSource): string[] {
  const out: string[] = [];
  if (src.emphasisStyle?.fontFamily) out.push(src.emphasisStyle.fontFamily);
  if (src.textOverrides?.fontFamily) out.push(src.textOverrides.fontFamily);
  for (const ov of Object.values(src.lineTextOverrides ?? {})) {
    if (ov?.fontFamily) out.push(ov.fontFamily);
  }
  return Array.from(new Set(out));
}

/** MIME type for a font binary, sniffed from its 4-byte magic number. Used to build the export
 *  data: URL with a truthful type (the encoder previously hardcoded font/ttf for every upload, so
 *  an .otf/.woff/.woff2 custom font relied on the renderer's format sniffing — fine in Chrome, but
 *  a stricter parser could reject it). Unknown/TrueType → font/ttf (the historical default). */
export function fontMimeFromBytes(data: Uint8Array): string {
  if (data.length >= 4) {
    const b0 = data[0], b1 = data[1], b2 = data[2], b3 = data[3];
    if (b0 === 0x77 && b1 === 0x4f && b2 === 0x46 && b3 === 0x32) return 'font/woff2'; // 'wOF2'
    if (b0 === 0x77 && b1 === 0x4f && b2 === 0x46 && b3 === 0x46) return 'font/woff';  // 'wOFF'
    if (b0 === 0x4f && b1 === 0x54 && b2 === 0x54 && b3 === 0x4f) return 'font/otf';   // 'OTTO'
  }
  return 'font/ttf'; // 00 01 00 00 / 'true' / 'ttcf' / unknown
}
