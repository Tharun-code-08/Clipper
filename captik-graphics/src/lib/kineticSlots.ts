// Shared per-template "slot" resolver for the three editorial templates
// (editor_masala / illusion / aura).
//
// These templates build their look from MULTIPLE fonts/colours per tier or persona
// plus signature motion, so the flat TextOverrides model can't express them. Each
// exposes named slots (src/types/transcript.ts). This module merges the sparse
// overrides (global Text-tab → per-line) and fills every field with the EXACT
// constant the render rows hardcode today — so "no override" produces byte-identical
// output. Both render surfaces import these resolvers:
//   · preview + WYSIWYG export → src/components/editor/CaptionOverlay.tsx
//   · Lambda / sidecar export  → src/remotion/KineticCaptionComposition.tsx
// Keeping the defaults here (one source) is what stops the two byte-for-byte copies
// from drifting. Pure functions only — safe to import from client + Remotion entries.

import type { IllusionSlots, EditorMasalaSlots, AuraSlots, TemplateSlotOverrides, CaptionInAnimation } from '@/types/transcript';

// ── Defaults — MUST equal the hardcoded constants in the render rows ─────────────
// illusion: ILLUSION_FONT; editor_masala: EDITOR_MASALA_LATIN_FONT + scriptFont +
// gold #FFD700; aura: AURA_CURSIVE / AURA_BOLD / AURA_SANS + AURA_YELLOW.

// NOTE: illusion.baseColor and editor_masala.contextColor have NO default here — when the
// user hasn't overridden them, the rows fall back to the global caption text colour
// (captionTextColor), exactly as the templates did before they became editable. Aura never
// used the global colour (its words were hard-white), so it keeps a concrete default.
export const ILLUSION_DEFAULTS = {
  font: "'Open Sans', sans-serif",
  glitchTarget: 'auto' as const,
  glitchStyle: 'random' as const,
  inAnimation: 'default' as const,
};

export const EDITOR_MASALA_DEFAULTS = {
  contextFont: "'Montserrat', system-ui, sans-serif",
  heroAFont: '"InstrumentSerifItalic", "Playfair Display", "Georgia", serif',
  heroAColor: '#ffffff',
  heroBFont: "'Montserrat', system-ui, sans-serif",
  heroBColor: '#FFD700',
  personaMode: 'auto' as const,
  inAnimation: 'default' as const,
};

export const AURA_DEFAULTS = {
  cursiveFont: '"Playfair Display", "InstrumentSerifItalic", "Georgia", serif',
  boldFont: '"TheBoldFont", "Anton", sans-serif',
  // CSS-identical to AURA_SANS ('"Open Sans", …'); single-quoted to match the canonical
  // SLOT_FONT_CHOICES "Open Sans" entry so the dropdown highlights it as the default.
  supportFont: "'Open Sans', sans-serif",
  baseColor: '#ffffff',
  accentColor: '#F5D300',
  inAnimation: 'default' as const,
};

// "Swiss" (aura_helvetica): the Aura role engine in ONE super-bold Helvetica-grotesque face. Real
// Helvetica is proprietary + absent from the Lambda box, so "HelveticaBold" is a bundled alias for
// Inter-Black (registered in globals.css + KineticCaptionComposition.buildFontsCss) → preview == export.
export const AURA_HELVETICA_FONT =
  '"HelveticaBold", "Helvetica Neue", Helvetica, Arial, sans-serif';

// Swiss defaults = every role in the one flat font; colours/animation match Aura. The render `flat`
// flag drops the cursive italic + rotation and reveals each word WHEN SPOKEN; fonts still come from
// these slots, so the Text-tab controls override them exactly like Aura.
export const SWISS_DEFAULTS = {
  cursiveFont: AURA_HELVETICA_FONT,
  boldFont: AURA_HELVETICA_FONT,
  supportFont: AURA_HELVETICA_FONT,
  baseColor: '#ffffff',
  accentColor: '#F5D300',
  inAnimation: 'default' as const,
};

// ── In-animation ("in" entrance) — shared by all three editorial templates ───────
// The dropdown offered in BOTH the web Text tab and the plugin panel. 'default' keeps the
// template's signature entrance (byte-identical to before this control existed); the rest
// swap in a single snappy uniform motion so a short caption's word is fully on-screen well
// before it's spoken away. Order = render order in the picker.
export const IN_ANIMATION_CHOICES: { label: string; value: CaptionInAnimation }[] = [
  { label: 'Signature (default)', value: 'default' },
  { label: 'No animation',        value: 'none' },
  { label: 'Slide up',            value: 'up' },
  { label: 'Slide down',          value: 'down' },
  { label: 'Slide left',          value: 'left' },
  { label: 'Slide right',         value: 'right' },
];

// ── Slot font choices ───────────────────────────────────────────────────────────
// ONLY families bundled in BOTH the preview (globals.css) and the Lambda export
// (KineticCaptionComposition.buildFontsCss) — so a slot font renders pixel-identically
// in preview AND export without per-font data-URL embedding. value = the CSS stack
// stored on the slot; '' = template default (clears the override).
export const SLOT_FONT_CHOICES: { label: string; value: string }[] = [
  { label: 'Template default', value: '' },
  { label: 'Montserrat',          value: "'Montserrat', system-ui, sans-serif" },
  { label: 'Inter',               value: "'Inter', sans-serif" },
  { label: 'Poppins',             value: "'Poppins', sans-serif" },
  { label: 'Open Sans',           value: "'Open Sans', sans-serif" },
  { label: 'Mona Sans',           value: "'MonaSans', sans-serif" },
  { label: 'Instrument Sans',     value: "'InstrumentSans', sans-serif" },
  { label: 'Anton',               value: "'Anton', sans-serif" },
  { label: 'The Bold Font',       value: '"TheBoldFont", "Anton", sans-serif' },
  { label: 'Rubik Black',         value: "'RubikBlack', sans-serif" },
  { label: 'Clash Display',       value: "'ClashDisplay', sans-serif" },
  { label: 'Druk Wide',           value: "'DrukWide', sans-serif" },
  { label: 'Futura',              value: "'Futura', sans-serif" },
  { label: 'Luckiest Guy',        value: "'LuckiestGuy', cursive" },
  { label: 'Komika Axis',         value: "'KomikaAxis', sans-serif" },
  { label: 'Playfair (serif italic)', value: '"Playfair Display", "InstrumentSerifItalic", "Georgia", serif' },
  { label: 'Instrument Serif (italic)', value: '"InstrumentSerifItalic", "Playfair Display", "Georgia", serif' },
  { label: 'Lobster Two (italic)', value: "'LobsterTwoItalic', cursive" },
  { label: 'Times New Roman',     value: "'TimesNewRomanBold', serif" },
  { label: 'Pixel',               value: "'VPPixel', monospace" },
];

// ── Resolved shapes (every field concrete; emphColor stays optional → row falls back) ──

export interface ResolvedIllusionSlots {
  font: string;
  baseColor?: string;     // undefined → row falls back to the global caption text colour
  emphColor?: string;     // undefined → row uses per-word colour ?? baseColor
  glitchTarget: NonNullable<IllusionSlots['glitchTarget']>;
  glitchStyle: NonNullable<IllusionSlots['glitchStyle']>;
  inAnimation: CaptionInAnimation;
}

export interface ResolvedEditorMasalaSlots {
  contextFont: string;
  contextColor?: string;  // undefined → row falls back to the global caption text colour
  heroAFont: string;
  heroAColor: string;
  heroBFont: string;
  heroBColor: string;
  personaMode: NonNullable<EditorMasalaSlots['personaMode']>;
  inAnimation: CaptionInAnimation;
}

export interface ResolvedAuraSlots {
  cursiveFont: string;
  boldFont: string;
  supportFont: string;
  baseColor: string;
  accentColor: string;
  inAnimation: CaptionInAnimation;
}

/** Shallow per-template merge (line wins). For callers (CaptionOverlay / export) that
    pre-merge global + the active segment's per-line slots into one effective object. */
export function mergeTemplateSlots(
  global?: TemplateSlotOverrides,
  line?: TemplateSlotOverrides,
): TemplateSlotOverrides | undefined {
  if (!line) return global;
  if (!global) return line;
  return {
    illusion:      { ...global.illusion,      ...line.illusion },
    editor_masala: { ...global.editor_masala, ...line.editor_masala },
    aura:          { ...global.aura,           ...line.aura },
    aura_helvetica: { ...global.aura_helvetica, ...line.aura_helvetica },
  };
}

// Merge order matches styleResolve.mergeTextOverrides: line wins over global, field by field.
export function resolveIllusionSlots(global?: IllusionSlots, line?: IllusionSlots): ResolvedIllusionSlots {
  return {
    font:         line?.font         ?? global?.font         ?? ILLUSION_DEFAULTS.font,
    baseColor:    line?.baseColor    ?? global?.baseColor,   // undefined → row uses captionTextColor
    emphColor:    line?.emphColor    ?? global?.emphColor,
    glitchTarget: line?.glitchTarget ?? global?.glitchTarget ?? ILLUSION_DEFAULTS.glitchTarget,
    glitchStyle:  line?.glitchStyle  ?? global?.glitchStyle  ?? ILLUSION_DEFAULTS.glitchStyle,
    inAnimation:  line?.inAnimation  ?? global?.inAnimation  ?? ILLUSION_DEFAULTS.inAnimation,
  };
}

export function resolveEditorMasalaSlots(global?: EditorMasalaSlots, line?: EditorMasalaSlots): ResolvedEditorMasalaSlots {
  return {
    contextFont:  line?.contextFont  ?? global?.contextFont  ?? EDITOR_MASALA_DEFAULTS.contextFont,
    contextColor: line?.contextColor ?? global?.contextColor,  // undefined → row uses captionTextColor
    heroAFont:    line?.heroAFont    ?? global?.heroAFont    ?? EDITOR_MASALA_DEFAULTS.heroAFont,
    heroAColor:   line?.heroAColor   ?? global?.heroAColor   ?? EDITOR_MASALA_DEFAULTS.heroAColor,
    heroBFont:    line?.heroBFont    ?? global?.heroBFont    ?? EDITOR_MASALA_DEFAULTS.heroBFont,
    heroBColor:   line?.heroBColor   ?? global?.heroBColor   ?? EDITOR_MASALA_DEFAULTS.heroBColor,
    personaMode:  line?.personaMode  ?? global?.personaMode  ?? EDITOR_MASALA_DEFAULTS.personaMode,
    inAnimation:  line?.inAnimation  ?? global?.inAnimation  ?? EDITOR_MASALA_DEFAULTS.inAnimation,
  };
}

export function resolveAuraSlots(global?: AuraSlots, line?: AuraSlots): ResolvedAuraSlots {
  return {
    cursiveFont: line?.cursiveFont ?? global?.cursiveFont ?? AURA_DEFAULTS.cursiveFont,
    boldFont:    line?.boldFont    ?? global?.boldFont    ?? AURA_DEFAULTS.boldFont,
    supportFont: line?.supportFont ?? global?.supportFont ?? AURA_DEFAULTS.supportFont,
    baseColor:   line?.baseColor   ?? global?.baseColor   ?? AURA_DEFAULTS.baseColor,
    accentColor: line?.accentColor ?? global?.accentColor ?? AURA_DEFAULTS.accentColor,
    inAnimation: line?.inAnimation ?? global?.inAnimation ?? AURA_DEFAULTS.inAnimation,
  };
}

// "Swiss" resolver — same shape/fields as resolveAuraSlots but falls back to the Helvetica-black
// SWISS_DEFAULTS. Swiss stores its overrides under the `aura_helvetica` slot key (independent of Aura).
export function resolveSwissSlots(global?: AuraSlots, line?: AuraSlots): ResolvedAuraSlots {
  return {
    cursiveFont: line?.cursiveFont ?? global?.cursiveFont ?? SWISS_DEFAULTS.cursiveFont,
    boldFont:    line?.boldFont    ?? global?.boldFont    ?? SWISS_DEFAULTS.boldFont,
    supportFont: line?.supportFont ?? global?.supportFont ?? SWISS_DEFAULTS.supportFont,
    baseColor:   line?.baseColor   ?? global?.baseColor   ?? SWISS_DEFAULTS.baseColor,
    accentColor: line?.accentColor ?? global?.accentColor ?? SWISS_DEFAULTS.accentColor,
    inAnimation: line?.inAnimation ?? global?.inAnimation ?? SWISS_DEFAULTS.inAnimation,
  };
}

// ── Illusion glitch decision (pure → shared by both render rows + unit-tested) ───
// The hemisphere hero word gets one entry "glitch": a strobe (flicker) OR a gaussian
// blur-in. Original behaviour: ALWAYS on the hero, with a seeded coin-flip choosing
// flicker vs blur. The slots model layers control on top WITHOUT changing the default:
//   · glitchTarget 'auto'|'emphasized' → hero always glitches (default 'auto')
//   · glitchTarget 'pick'              → only if the hero word is flagged styleOverride.glitch
//   · glitchTarget 'off'              → no glitch (entry keeps only its velocity blur)
//   · glitchStyle  'random'           → seeded flicker|blur coin-flip (default; == old code)
//   · glitchStyle  'flicker'|'blur'   → force that look
// seedStrobe is the original `random(`${segmentSeed}:em`)` value (0..1) so 'random'
// reproduces the exact prior choice.
export function resolveGlitch(
  slots: Pick<ResolvedIllusionSlots, 'glitchTarget' | 'glitchStyle'>,
  opts: { emphWordHasGlitchFlag: boolean; seedStrobe: number },
): { wantGlitch: boolean; useStrobe: boolean } {
  const wantGlitch =
    slots.glitchTarget === 'off'  ? false :
    slots.glitchTarget === 'pick' ? opts.emphWordHasGlitchFlag :
    true; // 'auto' | 'emphasized'
  const useStrobe =
    slots.glitchStyle === 'flicker' ? true :
    slots.glitchStyle === 'blur'    ? false :
    opts.seedStrobe < 0.5;          // 'random' — matches the original coin-flip
  return { wantGlitch, useStrobe };
}

// ── In-animation override pose (pure → shared by BOTH render rows) ────────────────
// Produces the entrance transform for the non-'default' in-animation modes. Both render
// surfaces call this with the SAME inputs, so the override renders pixel-identically in the
// preview (elapsed = (currentTimeMs − appearMs)/1000) and the frame-by-frame export
// (elapsed = (frame − startFrame)/fps). The LOCKUP is untouched — this only replaces the
// per-word slide/blur that a 'default' word would run.
//
//   dx/dy   px offset to translate the word by RIGHT NOW (0 at rest). Directional slides
//           decay this to 0 over IN_ANIM_DURATION_S with a cubic ease-out (matches the
//           preview's entrancePose easing). `mag` is the full slide distance, passed
//           sz()-scaled by the caller so preview & export stay proportional.
//   opacity 0 before the word appears; ramps to 1 over ~60% of the slide (instant for 'none').
export const IN_ANIM_DURATION_S = 0.26;   // snappy — the whole point is "settled before spoken away"

const _inClamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const _inEaseOut = (t: number) => 1 - Math.pow(1 - t, 3);   // cubic ease-out (== CaptionOverlay._easeOut)

export function resolveInAnimPose(
  anim: Exclude<CaptionInAnimation, 'default'>, elapsedS: number, mag: number,
): { dx: number; dy: number; opacity: number } {
  if (elapsedS < 0) return { dx: 0, dy: 0, opacity: 0 };
  if (anim === 'none') return { dx: 0, dy: 0, opacity: 1 };
  const e   = _inEaseOut(_inClamp01(elapsedS / IN_ANIM_DURATION_S));
  const off = (1 - e) * mag;   // full offset at t=0, decays to 0 at rest
  return {
    // 'up' starts BELOW (positive y) and rises; 'left' starts to the RIGHT (positive x) and slides in.
    dx: anim === 'left' ? off : anim === 'right' ? -off : 0,
    dy: anim === 'up'   ? off : anim === 'down'  ? -off : 0,
    opacity: _inClamp01(elapsedS / (IN_ANIM_DURATION_S * 0.6)),
  };
}
