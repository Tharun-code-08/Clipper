// Built-in SAMPLE imagery for the PICKER CARDS only.
//
// A template with photo slots previews with empty image params, so its card showed the drawn
// gray placeholders — the card never demonstrated that this template holds YOUR photos. The
// picker injects these samples into the card's preview params; a PLACED instance still starts
// empty on purpose (placeholders prompt the user's own photo — auto-filling real instances
// would end with sample imagery inside exported videos).
//
// Hand-authored SVG data URIs, not binary photos: self-contained (no network, no bundle
// assets, license-free), ~700 bytes each, crisp at any card scale, and tonally in-brand
// (warm dusk palette) so a wall of cards reads premium rather than stock-photo random.

const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' ${body}</svg>`)}`;

/** Rim-lit portrait silhouette — first in the cycle, so single-slot templates (avatars) get it. */
const PERSON = svg(
  `viewBox='0 0 400 520'><defs>` +
  `<linearGradient id='b' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2E2416'/><stop offset='1' stop-color='#0D0B08'/></linearGradient>` +
  `<linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#D9A868'/><stop offset='1' stop-color='#77572F'/></linearGradient>` +
  `<radialGradient id='g' cx='0.5' cy='0.26' r='0.55'><stop offset='0' stop-color='#F5B34D' stop-opacity='0.35'/><stop offset='1' stop-color='#F5B34D' stop-opacity='0'/></radialGradient>` +
  `</defs><rect width='400' height='520' fill='url(#b)'/><rect width='400' height='520' fill='url(#g)'/>` +
  `<circle cx='200' cy='192' r='80' fill='url(#s)'/>` +
  `<path d='M56 520 C56 384 138 342 200 342 C262 342 344 384 344 520 Z' fill='url(#s)'/>`,
);

/** Dusk mountains with a low sun. */
const MOUNTAINS = svg(
  `viewBox='0 0 400 400'><defs>` +
  `<linearGradient id='k' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#232741'/><stop offset='0.62' stop-color='#8A4F3A'/><stop offset='1' stop-color='#C97E3F'/></linearGradient>` +
  `</defs><rect width='400' height='400' fill='url(#k)'/>` +
  `<circle cx='262' cy='212' r='44' fill='#F5B34D'/>` +
  `<path d='M0 400 L0 302 L92 190 L172 302 L204 262 L262 330 L400 238 L400 400 Z' fill='#171B26'/>` +
  `<path d='M0 400 L64 328 L148 400 Z' fill='#0D1017'/><path d='M182 400 L264 318 L400 400 Z' fill='#0D1017'/>`,
);

/** City skyline at golden hour, a few windows lit. */
const CITY = svg(
  `viewBox='0 0 400 400'><defs>` +
  `<linearGradient id='c' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#33203B'/><stop offset='1' stop-color='#C96F3A'/></linearGradient>` +
  `</defs><rect width='400' height='400' fill='url(#c)'/>` +
  `<circle cx='118' cy='206' r='30' fill='#F2A24B'/>` +
  `<path d='M0 400 L0 250 L46 250 L46 218 L88 218 L88 400 Z' fill='#12141D'/>` +
  `<path d='M104 400 L104 176 L156 176 L156 400 Z' fill='#0C0E15'/>` +
  `<path d='M170 400 L170 262 L224 262 L224 234 L262 234 L262 400 Z' fill='#12141D'/>` +
  `<path d='M278 400 L278 200 L336 200 L336 400 Z' fill='#0C0E15'/><path d='M348 400 L348 282 L400 282 L400 400 Z' fill='#12141D'/>` +
  `<g fill='#F5B34D' opacity='0.85'><rect x='116' y='196' width='7' height='9'/><rect x='132' y='222' width='7' height='9'/>` +
  `<rect x='118' y='250' width='7' height='9'/><rect x='294' y='226' width='7' height='9'/><rect x='312' y='254' width='7' height='9'/></g>`,
);

/** Abstract amber waves — the brand-gradient "album art" fallback. */
const WAVES = svg(
  `viewBox='0 0 400 400'>` +
  `<rect width='400' height='400' fill='#14110B'/>` +
  `<circle cx='318' cy='92' r='44' fill='#F59E0B' opacity='0.22'/>` +
  `<path d='M0 262 C92 198 152 322 252 250 C322 198 362 232 400 202 L400 400 L0 400 Z' fill='#F59E0B' opacity='0.5'/>` +
  `<path d='M0 322 C112 258 192 382 302 300 C352 264 382 286 400 272 L400 400 L0 400 Z' fill='#D97706' opacity='0.8'/>`,
);

export const SAMPLE_PHOTOS: readonly string[] = [PERSON, MOUNTAINS, CITY, WAVES];

/** What kind of imagery a slot wants, guessed from its key + label. A portrait cover-cropped
 *  into a wide laptop screen reads as a giant abstract blob; scenery in an avatar disc reads
 *  as a missing person. Unmatched slots cycle the whole set for variety. */
function slotSample(key: string, label: string): string | undefined {
  const s = `${key} ${label}`.toLowerCase();
  if (/icon|logo/.test(s)) return WAVES;                          // app chips want a mark, not a face
  if (/avatar|profile|contact|attr|headshot/.test(s)) return PERSON;
  if (/screen|shot|page|wall|display|browser/.test(s)) return MOUNTAINS;
  return undefined;
}

/** Card-preview params: every EMPTY image param gets a sample — slot-aware where the key/label
 *  says what belongs there, cycling through the set otherwise so multi-photo templates
 *  (polaroids, story cards) show variety. Deterministic — same template, same fill — and
 *  non-destructive: only keys that are still '' are touched. */
export function withSampleImages<P extends Record<string, unknown>>(
  tpl: { params: readonly { type: string; key: string; label?: string }[] },
  params: P,
): P {
  let i = 0;
  for (const d of tpl.params) {
    if (d.type !== 'image') continue;
    const key = d.key as keyof P;
    if (!params[key]) {
      params[key] = (slotSample(d.key, d.label ?? '') ?? SAMPLE_PHOTOS[i % SAMPLE_PHOTOS.length]) as P[keyof P];
    }
    i += 1;
  }
  return params;
}
