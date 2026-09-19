// GOOGLE-FONTS SHIM for imported templates.
//
// The imported library calls @remotion/google-fonts at module scope:
//     import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
//     const { fontFamily } = loadInter();
// 65 distinct families across 823 files. Installing that package would pull a font module per
// family into the editor bundle AND fire hundreds of stylesheet loads on boot, for faces our app
// mostly already ships. The importer rewrites those imports to `makeLoadFont("Inter")` here.
//
// Families our app genuinely loads resolve to the REAL stack (so imported text renders exactly
// as authored). Anything else falls back through a same-genre stack — a serif stays a serif, a
// mono stays mono — which is the honest degradation rather than silently rendering Times.

import { fontStack } from '../fonts';
import type { GraphicsFontId } from '../fonts';

/** Google family name → the font id our app actually loads. */
const MAPPED: Record<string, GraphicsFontId> = {
  Inter: 'inter',
  Montserrat: 'montserrat',
  Anton: 'anton',
  PlayfairDisplay: 'playfair',
  Poppins: 'poppins',
  OpenSans: 'opensans',
  Rubik: 'rubik',
  LuckiestGuy: 'luckiest',
};

/** Families we do not ship — genre-correct fallbacks so nothing lands on a default serif. */
const FALLBACK: Record<string, string> = {
  SpaceGrotesk: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  RobotoMono: "'Roboto Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
  Oswald: "'Oswald', 'Anton', 'Arial Narrow', sans-serif",
  BebasNeue: "'Bebas Neue', 'Anton', 'Arial Narrow', sans-serif",
  Caveat: "'Caveat', 'Segoe Script', cursive",
  PermanentMarker: "'Permanent Marker', 'Segoe Script', cursive",
  Cinzel: "'Cinzel', 'Playfair Display', Georgia, serif",
  Lora: "'Lora', Georgia, serif",
  Orbitron: "'Orbitron', 'Inter', system-ui, sans-serif",
  DMSans: "'DM Sans', 'Inter', system-ui, sans-serif",
  PlusJakartaSans: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
  Outfit: "'Outfit', 'Inter', system-ui, sans-serif",
};

const GENERIC_SANS = "'Inter', system-ui, -apple-system, Segoe UI, sans-serif";

export function familyFor(name: string): string {
  const mapped = MAPPED[name];
  if (mapped) return fontStack(mapped);
  if (FALLBACK[name]) return FALLBACK[name];
  if (/mono/i.test(name)) return "ui-monospace, 'SFMono-Regular', Menlo, monospace";
  if (/serif|playfair|lora|cinzel|merriweather|georgia/i.test(name)) return "Georgia, 'Times New Roman', serif";
  if (/script|marker|caveat|dancing|pacifico/i.test(name)) return "'Segoe Script', cursive";
  return GENERIC_SANS;
}

/** The font id (if any) our app loads for this family — drives the EXPORT font-warm set so an
 *  imported template's first frames never paint a fallback face. */
export function fontIdFor(name: string): GraphicsFontId | undefined {
  return MAPPED[name];
}

/** Drop-in for @remotion/google-fonts' loadFont(). The imported code destructures `fontFamily`;
 *  the other fields exist so a template that reads them still type-checks. */
export function makeLoadFont(name: string) {
  const fontFamily = familyFor(name);
  return () => ({
    fontFamily,
    fonts: {} as Record<string, Record<string, string>>,
    unicodeRanges: {} as Record<string, string>,
    waitUntilDone: () => Promise.resolve(),
  });
}
