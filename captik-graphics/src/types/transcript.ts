export interface WordAnimations {
  screenShake?: boolean;
  flash?: boolean;
  pulse?: boolean;
  bounce?: boolean;
}

export interface WordStyleOverride {
  color?: string;
  scale?: number;
  layout?: 'inline' | 'stacked';
  animations?: WordAnimations;
  /** Aura template: marks a word for the 'difference' blend-mode highlight (trippy inverted colour). */
  highlight?: boolean;
  /** Captik-family hero templates: word takes the screen alone (context rows hidden) while spoken. */
  spotlight?: boolean;
  /** Illusion template: marks a word to receive the glitch effect when glitchTarget === 'pick'. */
  glitch?: boolean;
  /** Free per-word transform (timeline word-layers) — offset as % of canvas WIDTH
   *  on both axes. Pure visual transform: layout/fit math never sees it. */
  dxPct?: number;
  dyPct?: number;
  /** Free per-word visual scale (CapCut-style). Distinct from `scale`, which is the
   *  Emphasize semantic and participates in font sizing/fit. */
  wScale?: number;
  /** Static per-word rotation in degrees (keyframes override when they carry rot). */
  wRotDeg?: number;
  /** Transform KEYFRAMES: sorted by t (normalized 0..1 over the word's own
   *  startMs→endMs window, so retiming stretches the path). dx/dy are % of
   *  canvas WIDTH; s/rot are per-property optional (a keyframe without them has
   *  no opinion — the static value applies). See lib/wordKf.ts. */
  posKf?: WordPosKeyframe[];
}

export interface WordPosKeyframe {
  t: number;
  dx: number;
  dy: number;
  /** Visual scale multiplier at this keyframe (optional per-property track). */
  s?: number;
  /** Rotation in degrees at this keyframe (optional per-property track). */
  rot?: number;
}

/* ── Global text styling (right-panel Text tab) ─────────────────────────────
   Every field is optional: undefined = "use the template's own value".
   Locked templates (editor_masala / illusion / aura) ignore all of these. */

export interface FontFace {
  weight: number;          // 100–900
  italic: boolean;
}

export type TextCasing = 'capitalize' | 'upper' | 'lower';

export type GradientLevel = 'word' | 'char';

export interface GradientStop {
  pos: number;             // 0–1 along the gradient axis
  hex: string;
}

export type TextColorConfig =
  | { mode: 'solid'; hex: string }
  | { mode: 'gradient'; stops: GradientStop[]; angle: number; level: GradientLevel };

export interface ShadowConfig {
  hex: string;
  opacity: number;         // 0–100
  x: number;               // logical px
  y: number;
  blur: number;
}

export interface StrokeConfig {
  hex: string;
  opacity: number;         // 0–100
  width: number;           // logical px
}

export interface OutlineConfig {
  hex: string;
  opacity: number;         // 0–100
  width: number;           // stroke width, logical px
  offset: number;          // outline offset, logical px
}

export interface BackgroundConfig {
  hex: string;
  opacity: number;                                        // 0–100
  radius: number | { tl: number; tr: number; br: number; bl: number };
  padW: number;                                           // horizontal padding, logical px
  padH: number;                                           // vertical padding, logical px
  shadows?: ShadowConfig[];                               // multi-layer box shadows
  outline?: OutlineConfig;
}

export interface TextOverrides {
  fontFamily?: string;
  fontFace?: FontFace;
  /** Logical px in the 270(portrait)/640(landscape) preview space — same space the templates size in. */
  fontSizePx?: number;
  casing?: TextCasing;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: TextColorConfig;
  letterSpacing?: number;  // logical px — gap between characters within a word
  wordSpacing?: number;    // logical px — gap between words on a line (flex column-gap)
  lineSpacing?: number;    // line-height multiplier — gap between stacked lines
  shadow?: ShadowConfig;
  stroke?: StrokeConfig;
  background?: BackgroundConfig;
}

/** Styling applied to emphasized words (Text tab → Emphasis section). */
export interface EmphasisStyle {
  mode?: 'emphasize' | 'spotlight';   // default action of the Emphasize tools
  hex?: string;                       // emphasized-word colour (defaults to accentColor)
  size?: number;                      // scale multiplier ×1–×3 (default 1.4)
  fontFamily?: string;
  fontFace?: FontFace;
  casing?: TextCasing;
  underline?: boolean;
}

/** Emphasis layout for the captik hero family (captik / captik_glow / captik_shadow). */
export type LayoutMode = 'splash' | 'center';

/* ── Per-template "slot" overrides (editor_masala / illusion / aura) ──────────
   These three templates build their look from MULTIPLE fonts/colours per tier or
   persona plus signature motion, so the flat TextOverrides above can't express
   them. Each template exposes named slots instead; every field optional →
   undefined = the template's built-in default. Resolved by src/lib/kineticSlots.ts
   and consumed identically by the preview (CaptionOverlay) and export
   (KineticCaptionComposition), so a control change means the same pixels. */

export type IllusionGlitchTarget = 'auto' | 'emphasized' | 'pick' | 'off';
export type IllusionGlitchStyle = 'flicker' | 'blur' | 'random';

/** Per-word ENTRANCE ("in") animation for the three editorial templates
    (illusion / editor_masala / aura). 'default' keeps each template's signature entrance
    (velocity-blur slide, hero glitch, focus-pull, etc.). The rest REPLACE it with a single
    snappy, uniform motion — for short captions whose spoken word is gone before the long
    signature entrance ever settles. The LOCKUP / layout is never touched, only the motion:
      · 'none'  — the word appears instantly (no slide, no blur)
      · 'up'    — rises into place (starts below)
      · 'down'  — drops into place (starts above)
      · 'left'  — slides in from the right
      · 'right' — slides in from the left
    Resolved by src/lib/kineticSlots.ts and consumed identically by the preview
    (CaptionOverlay) + export (KineticCaptionComposition), so a change means the same pixels. */
export type CaptionInAnimation = 'default' | 'none' | 'up' | 'down' | 'left' | 'right';

export interface IllusionSlots {
  font?: string;          // word font (default Open Sans bold)
  baseColor?: string;     // normal/context word colour (default #ffffff)
  emphColor?: string;     // hemisphere hero word colour (default = per-word colour ?? base)
  glitchTarget?: IllusionGlitchTarget;  // which word glitches (default 'auto' = seeded on emph word)
  glitchStyle?: IllusionGlitchStyle;    // glitch look (default 'random' = seeded flicker|blur)
  inAnimation?: CaptionInAnimation;     // per-word entrance (default 'default' = signature slide+glitch)
}

export interface EditorMasalaSlots {
  contextFont?: string;   // context-row font (default Montserrat)
  contextColor?: string;  // context-row colour (default #ffffff)
  heroAFont?: string;     // persona A "elegant script" hero font (default InstrumentSerifItalic)
  heroAColor?: string;    // persona A hero colour (default #ffffff)
  heroBFont?: string;     // persona B "glowing punch" hero font (default Montserrat-Black)
  heroBColor?: string;    // persona B hero colour (default #FFD700)
  personaMode?: 'auto' | 'A' | 'B';     // which persona to use (default 'auto' = seeded coin-flip)
  inAnimation?: CaptionInAnimation;     // per-word entrance (default 'default' = signature slide-blur)
}

export interface AuraSlots {
  cursiveFont?: string;   // flowing feature word (default Playfair Display italic)
  boldFont?: string;      // bold key word (default TheBoldFont)
  supportFont?: string;   // small stop-word rows (default Open Sans)
  baseColor?: string;     // default word colour (default #ffffff)
  accentColor?: string;   // emphasised-word colour (default #F5D300)
  inAnimation?: CaptionInAnimation;     // per-word entrance (default 'default' = signature focus-pull)
}

/** Per-template slot overrides, keyed by template id. Global (Text tab) or per-line. */
export interface TemplateSlotOverrides {
  illusion?: IllusionSlots;
  editor_masala?: EditorMasalaSlots;
  aura?: AuraSlots;
  // "Swiss" reuses the AuraSlots shape but its own store (edits independent of Aura) + Helvetica defaults.
  aura_helvetica?: AuraSlots;
}

/** Per-line (caption segment) override bundle, keyed by the segment's first word id. */
export interface LineOverride {
  styleId?: string;                     // CaptionStyleId — per-line template
  colors?: Record<string, string>;      // per-template colour slots (primary/secondary/background)
  boxSize?: { v: number; h: number };   // per-template box padding (ali_abdaal-style pills)
  text?: Partial<TextOverrides>;        // per-line typography overrides
  box?: CaptionBoxConfig;               // per-line position/width
  /** Per-line caption font scale (the box resize / Size control scoped to this caption).
      Wins over the global captionFontScale while this caption is on screen. */
  fontScale?: number;
  /** "Big Reveal" template only: per-line position/width of the emphasised TITLE box (the big
      word that sits behind the subject). The lower caption uses `box`; this is the second box. */
  emphBox?: CaptionBoxConfig;
  /** "Big Reveal" only: per-line TITLE font scale (the title box resize scoped to this caption). */
  emphFontScale?: number;
  slots?: TemplateSlotOverrides;        // per-line slot overrides (editor_masala/illusion/aura)
  /** "Behind the subject": render the cut-out subject ON TOP of this caption's text, so the
      text reads as if it's behind the person. Drives matte generation + a top compositing layer
      in the preview and every export path. */
  behindSubject?: boolean;
  /** Subject spotlight: while this caption is on screen the scene dims and the cut-out subject
      stays bright on top — the reels' subject-highlight beat. Rides the same matte machinery
      as behindSubject (matte windows include spotlight lines). */
  spotlight?: boolean;
}

export interface TranscriptWord {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  styleOverride: WordStyleOverride;
  /** Timing was NOT verified by the forced aligner (VAD/even-distribution fallback or
      degraded remap) — surfaces a "timing may be off" badge + re-align affordance. */
  lowConfidence?: boolean;
}

export interface CaptionBoxConfig {
  xPercent: number;      // center-X as % of canvas width (default 50)
  yPercent: number;      // center-Y as % of canvas height (default 85)
  widthPercent: number;  // container width as % of canvas width (default 84)
}
