// Fonts a graphics template is allowed to use.
//
// HARD RULE: every family listed here must already be registered in BOTH
//   1. src/app/globals.css              — the editor PREVIEW
//   2. buildFontsCss() in src/remotion/KineticCaptionComposition.tsx — every EXPORT surface
// so graphics add zero new font plumbing. registry.spec.ts reads both files off disk and fails
// with the exact family name if you add an entry here without registering the face.
//
// Deliberately NOT used as a font source:
//   - GOOGLE_FONTS (FontsPanel.tsx) — fetched at preview time by a blanket <link> and absent from
//     buildFontsCss(). A template using one looks right in the preview and falls back to a system
//     face in the export. That is exactly the bug the caption system already had to fix.
//   - SLOT_FONT_CHOICES (kineticSlots.ts) — caption-slot CSS stacks carrying caption semantics,
//     not stable ids.
//   - System stacks (ui-monospace, …) — nothing guarantees the family exists in Lambda's Chromium,
//     and a silent per-surface substitution is the failure mode this whole module exists to avoid.
//     Need a monospace? Drop the .woff2/.ttf in public/fonts, add the @font-face to the two files
//     above, then add the entry here. The spec will tell you if you miss one.

export const GRAPHICS_FONTS = [
  { id: 'inter',      label: 'Inter',           family: 'Inter',            stack: `'Inter', system-ui, sans-serif` },
  { id: 'monasans',   label: 'Mona Sans',       family: 'MonaSans',         stack: `'MonaSans', 'Inter', sans-serif` },
  { id: 'montserrat', label: 'Montserrat',      family: 'Montserrat',       stack: `'Montserrat', 'Inter', sans-serif` },
  { id: 'opensans',   label: 'Open Sans',       family: 'Open Sans',        stack: `'Open Sans', 'Inter', sans-serif` },
  { id: 'instrument', label: 'Instrument Sans', family: 'InstrumentSans',   stack: `'InstrumentSans', 'Inter', sans-serif` },
  { id: 'poppins',    label: 'Poppins',         family: 'Poppins',          stack: `'Poppins', 'Inter', sans-serif` },
  { id: 'anton',      label: 'Anton',           family: 'Anton',            stack: `'Anton', Impact, sans-serif` },
  { id: 'thebold',    label: 'The Bold Font',   family: 'TheBoldFont',      stack: `'TheBoldFont', 'Anton', sans-serif` },
  { id: 'clash',      label: 'Clash Display',   family: 'ClashDisplay',     stack: `'ClashDisplay', 'Anton', sans-serif` },
  { id: 'druk',       label: 'Druk Wide',       family: 'DrukWide',         stack: `'DrukWide', 'Anton', sans-serif` },
  { id: 'rubik',      label: 'Rubik Black',     family: 'RubikBlack',       stack: `'RubikBlack', 'Inter', sans-serif` },
  { id: 'luckiest',   label: 'Luckiest Guy',    family: 'LuckiestGuy',      stack: `'LuckiestGuy', 'Anton', cursive` },
  { id: 'komika',     label: 'Komika Axis',     family: 'KomikaAxis',       stack: `'KomikaAxis', 'Anton', sans-serif` },
  { id: 'playfair',   label: 'Playfair',        family: 'Playfair Display', stack: `'Playfair Display', Georgia, serif` },
  { id: 'pixel',      label: 'Pixel',           family: 'VPPixel',          stack: `'VPPixel', 'Courier New', monospace` },
] as const;

export type GraphicsFontId = (typeof GRAPHICS_FONTS)[number]['id'];

export const GRAPHICS_FONT_IDS: readonly string[] = GRAPHICS_FONTS.map((f) => f.id);

const BY_ID = new Map<string, (typeof GRAPHICS_FONTS)[number]>(GRAPHICS_FONTS.map((f) => [f.id, f]));

/** CSS font-family stack for a font id. Unknown ids fall back to Inter rather than throwing —
 *  a retired font in an old project must not break the render. */
export function fontStack(id: string): string {
  return (BY_ID.get(id) ?? GRAPHICS_FONTS[0]).stack;
}

/** The bare @font-face family name for a font id, for the export font-warm gate. */
export function fontFamilyName(id: string): string | undefined {
  return BY_ID.get(id)?.family;
}
