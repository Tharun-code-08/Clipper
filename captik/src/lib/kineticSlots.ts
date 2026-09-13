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

import type { IllusionSlots, EditorMasalaSlots, AuraSlots, ScribbleSlots, ArchivesSlots, BlockbusterSlots, TemplateSlotOverrides, CaptionInAnimation, InterlockSlots, JournalSlots } from '@/types/transcript';
import { IL_SERIF, IL_CAPS } from '@/lib/interlockEngine';

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
  { label: 'Kaushan (brush script)', value: '"KaushanScript","Caveat","Segoe Script","Brush Script MT",cursive' },
  { label: 'Caveat (handwriting)', value: '"Caveat","Segoe Print","Comic Sans MS",cursive' },
  { label: 'Great Vibes (roundhand)', value: '"GreatVibes","Snell Roundhand","Script MT Bold","Palace Script MT",cursive' },
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

// ── Scribble + Archives (the two hand-drawn templates) ────────────────────────────
// Both build their look from an ink palette + drawn marks rather than tiers of type, so
// their slots are colours-per-mark plus a couple of switches for the signature motion.
// Defaults MUST equal the constants the rows hardcode, so "no override" is byte-identical.

export const SCRIBBLE_DEFAULTS = {
  font: '"Caveat","Segoe Print","Comic Sans MS",cursive',
  noteColor: '#FDFAF3',
  markerColor: '#FFE042',
  inkColor: '#241C12',
  penColor: '#FF5D5D',
  inAnimation: 'default' as const,
};

export const ARCHIVES_DEFAULTS = {
  font: '"KaushanScript","Caveat","Segoe Script","Brush Script MT",cursive',
  inkColor: '#E1CDC2',
  emphColor: undefined as string | undefined,   // undefined → inherits inkColor
  showUnderline: true,
  showScrawl: true,
  boilAmount: 'normal' as const,
  inAnimation: 'default' as const,
};

export type ResolvedScribbleSlots = {
  font: string; noteColor: string; markerColor: string; inkColor: string; penColor: string;
  inAnimation: CaptionInAnimation;
};
export type ResolvedArchivesSlots = {
  font: string; inkColor: string; emphColor?: string;
  showUnderline: boolean; showScrawl: boolean;
  boilAmount: 'off' | 'low' | 'normal' | 'high'; inAnimation: CaptionInAnimation;
};

export function resolveScribbleSlots(global?: ScribbleSlots, line?: ScribbleSlots): ResolvedScribbleSlots {
  return {
    font:        line?.font        ?? global?.font        ?? SCRIBBLE_DEFAULTS.font,
    noteColor:   line?.noteColor   ?? global?.noteColor   ?? SCRIBBLE_DEFAULTS.noteColor,
    markerColor: line?.markerColor ?? global?.markerColor ?? SCRIBBLE_DEFAULTS.markerColor,
    inkColor:    line?.inkColor    ?? global?.inkColor    ?? SCRIBBLE_DEFAULTS.inkColor,
    penColor:    line?.penColor    ?? global?.penColor    ?? SCRIBBLE_DEFAULTS.penColor,
    inAnimation: line?.inAnimation ?? global?.inAnimation ?? SCRIBBLE_DEFAULTS.inAnimation,
  };
}

export function resolveArchivesSlots(global?: ArchivesSlots, line?: ArchivesSlots): ResolvedArchivesSlots {
  return {
    font:          line?.font          ?? global?.font          ?? ARCHIVES_DEFAULTS.font,
    inkColor:      line?.inkColor      ?? global?.inkColor      ?? ARCHIVES_DEFAULTS.inkColor,
    emphColor:     line?.emphColor     ?? global?.emphColor     ?? ARCHIVES_DEFAULTS.emphColor,
    showUnderline: line?.showUnderline ?? global?.showUnderline ?? ARCHIVES_DEFAULTS.showUnderline,
    showScrawl:    line?.showScrawl    ?? global?.showScrawl    ?? ARCHIVES_DEFAULTS.showScrawl,
    boilAmount:    line?.boilAmount    ?? global?.boilAmount    ?? ARCHIVES_DEFAULTS.boilAmount,
    inAnimation:   line?.inAnimation   ?? global?.inAnimation   ?? ARCHIVES_DEFAULTS.inAnimation,
  };
}

// Blockbuster: the two-voice caption. Defaults MUST equal the constants the branch used before
// slots existed, or adding the panel would silently restyle every existing project.
export const BLOCKBUSTER_DEFAULTS = {
  condFont: '"Anton",Haettenschweiler,"Arial Narrow",Impact,sans-serif',
  scriptFont: '"GreatVibes","Snell Roundhand","Script MT Bold","Palace Script MT",cursive',
  redColor: '#FA232D',
  scriptColor: '#FFFFFF',
  glowAmount: 'normal' as const,
  shadowAmount: 'normal' as const,
  overlap: true,
  tracking: true,
  inAnimation: 'default' as const,
};

export type ResolvedBlockbusterSlots = {
  condFont: string; scriptFont: string; redColor: string; scriptColor: string;
  glowAmount: 'off' | 'low' | 'normal' | 'high';
  shadowAmount: 'off' | 'low' | 'normal' | 'high';
  overlap: boolean; tracking: boolean; inAnimation: CaptionInAnimation;
};

/** Slots are persisted JSON (localStorage, project docs, plugin panel) — the union type is a
    compile-time promise only. An unrecognised level used to index BB_LEVEL_MUL to `undefined`
    and multiply the glow radius / shadow alpha into NaN, which silently drops the effect in
    the export renderer and writes a broken value into the AE insert. Anything unknown falls
    back to the default level instead. */
export function bbLevel(v: unknown, fallback: 'off' | 'low' | 'normal' | 'high'): 'off' | 'low' | 'normal' | 'high' {
  return (v === 'off' || v === 'low' || v === 'normal' || v === 'high') ? v : fallback;
}

export function resolveBlockbusterSlots(global?: BlockbusterSlots, line?: BlockbusterSlots): ResolvedBlockbusterSlots {
  return {
    condFont:     line?.condFont     ?? global?.condFont     ?? BLOCKBUSTER_DEFAULTS.condFont,
    scriptFont:   line?.scriptFont   ?? global?.scriptFont   ?? BLOCKBUSTER_DEFAULTS.scriptFont,
    redColor:     line?.redColor     ?? global?.redColor     ?? BLOCKBUSTER_DEFAULTS.redColor,
    scriptColor:  line?.scriptColor  ?? global?.scriptColor  ?? BLOCKBUSTER_DEFAULTS.scriptColor,
    glowAmount:   bbLevel(line?.glowAmount   ?? global?.glowAmount,   BLOCKBUSTER_DEFAULTS.glowAmount),
    shadowAmount: bbLevel(line?.shadowAmount ?? global?.shadowAmount, BLOCKBUSTER_DEFAULTS.shadowAmount),
    overlap:      line?.overlap      ?? global?.overlap      ?? BLOCKBUSTER_DEFAULTS.overlap,
    tracking:     line?.tracking     ?? global?.tracking     ?? BLOCKBUSTER_DEFAULTS.tracking,
    inAnimation:  line?.inAnimation  ?? global?.inAnimation  ?? BLOCKBUSTER_DEFAULTS.inAnimation,
  };
}

/** Alpha multiplier for the glow / drop-shadow strength dials. */
export const BB_LEVEL_MUL: Record<'off' | 'low' | 'normal' | 'high', number> = {
  off: 0, low: 0.55, normal: 1, high: 1.7,
};
export const BB_LEVEL_CHOICES: { value: 'off' | 'low' | 'normal' | 'high'; label: string }[] = [
  { value: 'off',    label: 'Off' },
  { value: 'low',    label: 'Subtle' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'Strong' },
];

/** Boil strength → which displacement filter set to use. 'off' pins one static drawing. */
export const BOIL_AMOUNT_CHOICES: { value: 'off' | 'low' | 'normal' | 'high'; label: string }[] = [
  { value: 'off',    label: 'Off (static)' },
  { value: 'low',    label: 'Subtle' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'Heavy' },
];

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

/* ── Interlock — the negative-space caption ─────────────────────────────────
   One template, two states: with no emphasised word the line sets as a plain centred caption;
   emphasise a word and it becomes the large italic serif with the rest of the line placed in the
   empty strips its letterforms leave. These dials cover both states. */
export const INTERLOCK_DEFAULTS = {
  heroFont: IL_SERIF,
  capsFont: IL_CAPS,
  heroColor: '#F7F4EE',
  capsColor: '#F7F4EE',
  capsSize: 'normal' as const,
  tracking: 'normal' as const,
  shadowAmount: 'normal' as const,
  inAnimation: 'default' as const,
  capsReveal: 'spoken' as const,
  nest: true,
  uppercase: true,
};

export type ResolvedInterlockSlots = {
  heroFont: string; capsFont: string; heroColor: string; capsColor: string;
  capsSize: 'small' | 'normal' | 'large';
  tracking: 'tight' | 'normal' | 'wide';
  shadowAmount: 'off' | 'low' | 'normal' | 'high';
  inAnimation: CaptionInAnimation;
  capsReveal: 'spoken' | 'together' | 'before';
  nest: boolean; uppercase: boolean;
};

const ilOneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;

export function resolveInterlockSlots(global?: InterlockSlots, line?: InterlockSlots): ResolvedInterlockSlots {
  return {
    heroFont:  line?.heroFont  ?? global?.heroFont  ?? INTERLOCK_DEFAULTS.heroFont,
    capsFont:  line?.capsFont  ?? global?.capsFont  ?? INTERLOCK_DEFAULTS.capsFont,
    heroColor: line?.heroColor ?? global?.heroColor ?? INTERLOCK_DEFAULTS.heroColor,
    capsColor: line?.capsColor ?? global?.capsColor ?? INTERLOCK_DEFAULTS.capsColor,
    capsSize:  ilOneOf(line?.capsSize  ?? global?.capsSize,  ['small','normal','large'] as const, INTERLOCK_DEFAULTS.capsSize),
    tracking:  ilOneOf(line?.tracking  ?? global?.tracking,  ['tight','normal','wide'] as const,  INTERLOCK_DEFAULTS.tracking),
    shadowAmount: bbLevel(line?.shadowAmount ?? global?.shadowAmount, INTERLOCK_DEFAULTS.shadowAmount),
    inAnimation: line?.inAnimation ?? global?.inAnimation ?? INTERLOCK_DEFAULTS.inAnimation,
    capsReveal: ilOneOf(line?.capsReveal ?? global?.capsReveal, ['spoken','together','before'] as const, INTERLOCK_DEFAULTS.capsReveal),
    nest:       line?.nest      ?? global?.nest      ?? INTERLOCK_DEFAULTS.nest,
    uppercase:  line?.uppercase ?? global?.uppercase ?? INTERLOCK_DEFAULTS.uppercase,
  };
}

export const IL_CAPS_SIZE_MUL: Record<'small'|'normal'|'large', number> = { small: 0.80, normal: 1, large: 1.22 };
export const IL_TRACKING_EM:  Record<'tight'|'normal'|'wide', number>  = { tight: 0.015, normal: 0.045, wide: 0.10 };
export const IL_CAPS_SIZE_CHOICES = [
  { value: 'small'  as const, label: 'Small' },
  { value: 'normal' as const, label: 'Normal' },
  { value: 'large'  as const, label: 'Large' },
];
export const IL_TRACKING_CHOICES = [
  { value: 'tight'  as const, label: 'Tight' },
  { value: 'normal' as const, label: 'Normal' },
  { value: 'wide'   as const, label: 'Wide' },
];
export const IL_CAPS_REVEAL_CHOICES = [
  { value: 'spoken'   as const, label: 'As spoken' },
  { value: 'together' as const, label: 'All together' },
  { value: 'before'   as const, label: 'Before the big word' },
];

/* ── Journal ──────────────────────────────────────────────────────────────── */
// The handwritten card. Words arrive as they are spoken, blurring into focus; the whole line
// then EASES to a second colour and fades, so the exit reads as a deliberate gesture rather
// than a cut. Everything here is a dial on that one behaviour.
export const JOURNAL_DEFAULTS = {
  font:         '"BradleyHand", "Bradley Hand ITC", "Bradley Hand", cursive',
  color:        '#FFFFFF',
  exitColor:    '#E8202A',
  entrance:     'normal' as const,
  weight:       'medium' as const,
  exitLead:     'normal' as const,
  exitOrder:    'sequence' as const,
  sweep:        'normal' as const,
  shadowAmount: 'normal' as const,
  uppercase:    false,
};

export type ResolvedJournalSlots = {
  font: string; color: string; exitColor: string;
  entrance: 'soft' | 'normal' | 'strong';
  weight: 'regular' | 'medium' | 'bold';
  exitLead: 'short' | 'normal' | 'long';
  exitOrder: 'together' | 'sequence';
  sweep: 'tight' | 'normal' | 'wide';
  shadowAmount: 'off' | 'low' | 'normal' | 'high';
  uppercase: boolean;
};

const jnOneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;

export function resolveJournalSlots(global?: JournalSlots, line?: JournalSlots): ResolvedJournalSlots {
  return {
    font:      line?.font      ?? global?.font      ?? JOURNAL_DEFAULTS.font,
    color:     line?.color     ?? global?.color     ?? JOURNAL_DEFAULTS.color,
    exitColor: line?.exitColor ?? global?.exitColor ?? JOURNAL_DEFAULTS.exitColor,
    entrance:  jnOneOf(line?.entrance ?? global?.entrance, ['soft','normal','strong'] as const, JOURNAL_DEFAULTS.entrance),
    weight:    jnOneOf(line?.weight ?? global?.weight, ['regular','medium','bold'] as const, JOURNAL_DEFAULTS.weight),
    exitLead:  jnOneOf(line?.exitLead ?? global?.exitLead, ['short','normal','long'] as const,  JOURNAL_DEFAULTS.exitLead),
    exitOrder: jnOneOf(line?.exitOrder ?? global?.exitOrder, ['together','sequence'] as const, JOURNAL_DEFAULTS.exitOrder),
    sweep:     jnOneOf(line?.sweep ?? global?.sweep, ['tight','normal','wide'] as const, JOURNAL_DEFAULTS.sweep),
    shadowAmount: bbLevel(line?.shadowAmount ?? global?.shadowAmount, JOURNAL_DEFAULTS.shadowAmount),
    uppercase: line?.uppercase ?? global?.uppercase ?? JOURNAL_DEFAULTS.uppercase,
  };
}

/** Blur the word starts at, as a fraction of its font size. */
export const JN_ENTRANCE_BLUR: Record<'soft'|'normal'|'strong', number> = { soft: 0.13, normal: 0.22, strong: 0.36 };

/**
 * Bradley Hand ships as ONE 400-weight face — there is no bold cut to switch to. So weight is
 * painted: a stroke in the ink colour, in em so it tracks the type size. Chosen over the
 * browser's synthetic bold because a monoline hand thickens evenly this way, and because a
 * stroke does not change advance widths — the row-fit measurement stays true.
 */
export const JN_STROKE_EM: Record<'regular'|'medium'|'bold', number> = { regular: 0, medium: 0.030, bold: 0.055 };

/**
 * The entrance, in ms, given the room a word actually owns.
 *
 * This used to run through paceFactor, which floors at 0.28 — so a normal 250ms word gap
 * produced a 125ms entrance, under four frames at 30fps, and the blur was reported as simply
 * not happening. Opacity survives that; a blur ramp does not. So the entrance is authored long
 * enough to be SEEN, then capped at 85% of the word's own room so it still resolves before the
 * next word lands — the constraint paceFactor existed to enforce.
 */
export function jnEntranceMs(roomMs: number): number {
  return Math.max(170, Math.min(460, roomMs * 0.85));
}
/** How long the colour has to travel, and how long the fade that follows it runs (ms). */
export const JN_EXIT_MS: Record<'short'|'normal'|'long', { travel: number; fade: number }> = {
  short:  { travel: 90,  fade: 70 },
  normal: { travel: 150, fade: 100 },
  long:   { travel: 260, fade: 140 },
};
export const JN_WEIGHT_CHOICES = [
  { value: 'regular' as const, label: 'Regular' },
  { value: 'medium'  as const, label: 'Medium' },
  { value: 'bold'    as const, label: 'Bold' },
];
export const JN_ENTRANCE_CHOICES = [
  { value: 'soft'   as const, label: 'Soft' },
  { value: 'normal' as const, label: 'Normal' },
  { value: 'strong' as const, label: 'Strong' },
];
/**
 * Leaving word by word, each word's OWN gesture is quicker than the all-at-once one.
 *
 * This is what makes the sweep read. At the line durations, a word travels for 150ms; if the
 * next starts only 90ms later they overlap by 40% and three words are changing colour at once,
 * which looks like one soft simultaneous shift, not a sweep. So in sequence mode the per-word
 * travel and fade are compressed, which buys room for a stagger WIDER than the gesture — each
 * word is well into its fade before its neighbour starts. Same total exit budget, legible order.
 */
export function jnSequenceMs(travelMs: number, fadeMs: number): { travel: number; fade: number } {
  return { travel: travelMs * 0.42, fade: fadeMs * 0.46 };
}

/**
 * How long each word waits behind the one to its left.
 *
 * The stagger is carved OUT of the exit, never added to it: the span still ends exactly at the
 * instant the line leaves, so the tail of a long line is never cut off mid-travel. Capped so a
 * six-word caption does not stretch a 250ms exit into a second — past the cap the per-word delay
 * shrinks instead of the exit growing. A stagger of 0 reduces to the all-at-once behaviour
 * exactly, which is why both modes share one code path.
 */
export function jnStaggerMs(wordCount: number, gestureMs: number, mul = 1): number {
  if (wordCount < 2) return 0;
  return Math.min(80 * mul, gestureMs * 0.8 * mul, (gestureMs * 2.0 * mul) / (wordCount - 1));
}

/**
 * How far apart the words leave. Scales the stagger AND its budget together, so 'wide' is
 * genuinely allowed to lengthen the exit rather than being clamped back to the default.
 *
 * Tight runs the stagger BELOW the per-word travel, so neighbours overlap slightly and the
 * sweep blurs into a ripple — that is the intended look at that setting, not a bug.
 */
export const JN_SWEEP_MUL: Record<'tight'|'normal'|'wide', number> = { tight: 0.55, normal: 1, wide: 1.6 };

export const JN_SWEEP_CHOICES = [
  { value: 'tight'  as const, label: 'Tight' },
  { value: 'normal' as const, label: 'Normal' },
  { value: 'wide'   as const, label: 'Wide' },
];

export const JN_EXIT_ORDER_CHOICES = [
  { value: 'sequence'  as const, label: 'Word by word' },
  { value: 'together'  as const, label: 'All at once' },
];
export const JN_EXIT_LEAD_CHOICES = [
  { value: 'short'  as const, label: 'Quick' },
  { value: 'normal' as const, label: 'Normal' },
  { value: 'long'   as const, label: 'Slow' },
];
