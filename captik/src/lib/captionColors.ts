// Pure colour helpers shared by the caption renderer (CaptionOverlay) — kept in /lib so they can be
// unit-tested without pulling in the heavy client component (see __tests__/captionColors.spec.ts).
//
// Why these exist: most caption templates used to HARDCODE their colours (e.g. hormozi's lime
// gradient, mrbeast's white) and so ignored the editor's global colour pickers. We now let the
// user's chosen colour flow through, but ONLY once they've actually moved off the global default —
// so every template keeps its signature look for existing projects (no silent re-colour on load).

/** The editor's global colour defaults (mirror the useState seeds in app/editor/page.tsx). */
export const DEFAULT_CAPTION_TEXT = '#ffffff';
export const DEFAULT_ACCENT       = '#06b6d4';

/**
 * Returns the colours the user has actually customised. While a control is still at its global
 * default the field is `undefined`, which the template branches read as "keep my signature colour".
 *  - `userText`   ← the Text-tab "Color" control (captionTextColor)
 *  - `userAccent` ← the Templates-tab "Primary" control (accentColor)
 */
export function resolveUserColors(
  captionTextColor: string,
  accentColor: string,
): { userText?: string; userAccent?: string } {
  return {
    userText:   captionTextColor.toLowerCase() !== DEFAULT_CAPTION_TEXT ? captionTextColor : undefined,
    userAccent: accentColor.toLowerCase()      !== DEFAULT_ACCENT       ? accentColor      : undefined,
  };
}

/**
 * Lighten (`pct > 0`, toward white) or darken (`pct < 0`, toward black) a hex colour by a
 * percentage. Used to rebuild a gradient template (hormozi) from a single user-picked colour so it
 * keeps its light↔dark "pop" instead of flattening to a solid fill. Accepts `#rgb` or `#rrggbb`;
 * returns the input unchanged if it isn't a parseable hex (so a bad value can never throw mid-render).
 */
export function shadeHex(hex: string, pct: number): string {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map(c => c + c).join('') : n;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex;
  const amt = Math.max(-100, Math.min(100, pct)) / 100;
  const ch = (i: number): string => {
    const v = parseInt(full.slice(i, i + 2), 16);
    const next = amt >= 0 ? v + (255 - v) * amt : v * (1 + amt);
    return Math.round(Math.max(0, Math.min(255, next))).toString(16).padStart(2, '0');
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}
