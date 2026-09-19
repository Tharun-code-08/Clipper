// ─────────────────────────────────────────────────────────────────────────────
// LOOK SPECS — a caption look described as DATA, rendered by the existing engine.
//
// Captik's 36 templates are 36 hand-written branches in CaptionOverlay (one `if
// (captionStyle === 'x')` each, ~2900 lines). Every new look therefore costs new render code,
// which is why breadth has been expensive. A look spec is the other half of that: a row of
// values that CaptionOverlay turns into the SAME style objects a hand-written branch builds,
// through the SAME helpers (phraseRow / emphasisLayout). One row = one browsable look.
//
// WHAT THIS IS NOT: a new renderer. There is no spec-specific layout, no second fit guard and
// no new field in the data model. A spec look is fit-guarded, positioned, colour-overridden and
// exported exactly like a hand-written one, because it goes through the same code path — which
// is also why the preview, the Lambda render and the in-browser render agree for free.
//
// This file is PURE (no JSX, no DOM): it returns React.CSSProperties. That keeps it unit-
// testable against the real renderer's rules, the way templateVariants.ts is.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react';
import { estTextWidth, fontWeightFactor } from '../fitText';

/** How the phrase is laid out — each maps to a helper CaptionOverlay already has. */
export type LookFamily =
  /** Every word in one row, one style. The plainest reading of a caption. */
  | 'flat'
  /** Every word in one row; the word being spoken takes the accent style (phraseRow). */
  | 'karaoke'
  /** Accent word on its own line, context words smaller above/below (emphasisLayout). */
  | 'emphasis'
  /** A property SCENE: the caption is a planned moment (see property/plan.ts) — a headline behind
   *  the head, an amount row, support words, an icon or a focus — rendered by its scene component. */
  | 'story'
  /** The phrase broken across rows that grow down the frame — a lockup, not a line. */
  | 'stack';

/** Ids are literal so CaptionStyleId stays an exhaustive union rather than widening to string —
 *  the switch-exhaustiveness the plugin style specs and the variant spec both rely on. */
export type LookSpecId =
  | 'look_anchorage' | 'look_beacon' | 'look_cove' | 'look_driftwood'
  | 'look_ellis' | 'look_ferrier' | 'look_garnet' | 'look_hawser'
  | 'look_ibis' | 'look_jetty' | 'look_keel' | 'look_lanyard'
  | 'look_mizzen' | 'look_netting' | 'look_outhaul' | 'look_painter'
  | 'look_quay' | 'look_rudder' | 'look_scupper' | 'look_taffrail'
  | 'look_underway' | 'look_vang' | 'look_windlass' | 'look_yawl'
  | 'look_abbey' | 'look_belfry' | 'look_cloister' | 'look_dovecote'
  | 'look_effigy' | 'look_font' | 'look_gable' | 'look_hassock'
  | 'look_iron' | 'look_jamb' | 'look_keystone' | 'look_lintel'
  | 'look_mullion';

export interface LookShadow { blurPx: number; color: string; offsetY: number }
/** One role's entrance, their heroTransitions / subtitleTransitions: a direction, a duration, how
 *  far it travels (em of its own size), a delay after the phrase starts, and its own exit. */
export interface LookEnter {
  kind: 'fade' | 'fadeUp' | 'fadeDown' | 'fadeLeft' | 'fadeRight';
  ms: number;
  em?: number;
  delayMs?: number;
  outMs?: number;
}
export interface LookStroke { px: number; color: string }

export interface LookSpec {
  /** Caption style id. Also the key the picker, the snapshot and every export carry. */
  id: LookSpecId;
  /** Display name in the picker. Captik's own naming — never a competitor's. */
  name: string;
  /** Picker filter tags, matching the existing StyleDef vocabulary. */
  tags: string[];
  family: LookFamily;
  /** CSS font stack. MUST be a face bundled in both globals.css and buildFontsCss, or the
   *  preview and the export resolve to different fonts (see SLOT_FONT_CHOICES for the same
   *  rule in templateVariants). */
  font: string;
  weight: number;
  /** Logical size, fed through sz() so the user's font-scale control still applies. */
  sizePx: number;
  /** Context/base size for 'emphasis' looks (the small words). */
  contextSizePx?: number;
  /** Playfair Display ships as an ITALIC-ONLY face (@font-face font-style: italic), so a look
   *  using it renders italic whatever we ask for. Declaring it keeps intent explicit instead of
   *  depending on the browser's style-matching fallback. */
  italic?: boolean;
  transform?: 'uppercase' | 'lowercase';
  letterSpacingEm?: number;
  /** The accent's tracking when it differs from the line's (their fontPairing.accentLetterSpacingEm;
   *  their hero role otherwise resets it: Cutout's "stop" runs at 0 over a -0.065em line). */
  accentLetterSpacingEm?: number;
  lineHeight?: number;
  /** Base ink. Omit to follow the user's caption colour control. */
  color?: string;
  /** Accent ink for the spoken/emphasised word. Omit to follow the user's accent control. */
  accent?: string;
  shadow?: LookShadow;
  stroke?: LookStroke;
  /** Unspoken words dim to this opacity in 'karaoke'. */
  restOpacity?: number;
  /** Gradient fill for the accent word, as CSS colour stops. Painted through background-clip, so
   *  the TEXT carries the gradient rather than a box behind it. */
  gradient?: string[];
  /** Slight per-word rotation and lift, so a row reads as placed by hand rather than typeset.
   *  Deterministic per word (hashed from its id) — it must not change frame to frame. */
  jitter?: { rotateDeg: number; yEm: number };
  /** Where this look's caption sits, as a percentage of frame height. Their popular and property
   *  designs each have their own height rather than sharing one default, so the look carries it.
   *  Applied on selection to a box the user has not moved; always draggable afterwards. */
  /** Where this look's caption goes, as a percent of frame height — the centre of the caption
   *  block, measured off the look's own footage (or DECLARED, where it has none). Checked by
   *  rendering a phrase that ends on its accent, as their lockups do, and reading the ink back.
   *  An earlier "+1.4 lockup offset" on the emphasis looks was an artefact of a probe whose words
   *  after the accent were still hidden but holding space; it is gone. */
  positionYPct?: number;
  /** Where the hero word sits for a behind-the-speaker design, as a percentage of frame height.
   *  Measured per look: their heroes range from 11% to 77%, so a single constant collides with the
   *  caption on designs that keep both near the top. */
  heroYPct?: number;
  /** Render the accent word in its OWN box above the caption, instead of as one lockup.
   *  MEASURED: the property designs do NOT do this — their accent word sits directly under a small
   *  context line as a single two-line lockup ("asking" over "$600,000"). The separate hero box was
   *  my assumption, and it rendered a bare word where their frames show a pair. The behind-class
   *  emphasis looks are left on the old path because their previews have not been read the same
   *  way, so nothing unverified changes shape. */
  heroBox?: boolean;
  /** Rows this caption is designed to occupy. Their `depth` caption is a two-line, full-width
   *  all-caps block; rendering it as one small row is the wrong design, not a position error. */
  wrapRows?: number;
  /** Draws a coloured ring around the subject cut-out, the way a sticker sits proud of its
   *  backing. Only meaningful with behindSubject, since it needs the matte; px is measured at
   *  export resolution. */
  subjectOutline?: { color: string; px: number };
  /** Entrance for the word being spoken. 'pop' reuses CaptionOverlay's popIn — the same curve the
   *  hand-written templates use, so a spec look enters identically rather than approximately. */
  /** A different face for the accent word. Their rows name one per role — Abbey's context is
   *  Montserrat and its accent Abril Fatface, the chunky yellow serif in its footage — and a single
   *  `font` drew both in Montserrat. */
  accentFont?: string;
  /** "Neon": a soft halo around the text, in logical px like the shadow. MEASURED on their Butter
   *  footage as the alpha of a white halo against the local backdrop — 0.40 at 3px, 0.20 at 6px,
   *  0.09 at 10px, 0.04 at 16px from the letter edge (1080-wide), where plain looks sit at a flat
   *  ~0.02. A Gaussian of blur 3.75 logical px (15 export px) at 0.82 reproduces that falloff. */
  glow?: { blurPx: number; alpha: number; color?: string };
  /** "Inception": inside the accent word, the video DIFFERENCED against the accent colour,
   *  |accent - video| per channel — pure inversion when the accent is white. MEASURED on core pixels
   *  over a static wall: Cutout (white) 15.3 off for both models; Focusline (cyan #9BCDD0) 12.3 off as
   *  a difference against cyan, 37.5 as plain inversion, 142.8 as a flat fill. */
  inception?: boolean;
  /** Weight for the accent face. Abril Fatface exists at 400 only; asking it for the look's 800
   *  makes the browser smear a synthetic bold over it. */
  accentWeight?: number;
  /** Italic on the accent word only — their Focusline accent is Inter Black italic over a regular
   *  context, and `italic` on the look slants both. */
  accentItalic?: boolean;
  /** Capitals on the accent word only (registry accent_transform): Outhaul's PROGRESS over a
   *  lowercase handwritten context, Painter's SECONDS inside a lowercase row. */
  accentUppercase?: boolean;
  /** A lockup look whose every phrase gets a hero: with none marked, chosen by this rule (see
   *  impactWords.ts — 'trailing' is the last content word). Their Outhaul shows one in every
   *  frame; their property clips do not (a context line can stand alone), so it is per look. */
  heroSelect?: 'emphasis' | 'leading' | 'trailing';
  /** Entrance. 'fadeUp' and 'fadeDown' travel as they fade — their registry declares a direction
   *  on 8 of these looks and the engine had only a static fade, so all eight entered wrong. */
  animIn?: 'pop' | 'fade' | 'fadeUp' | 'fadeDown' | 'none';
  /** How long that entrance takes, in ms. MEASURED FROM THEIR REGISTRY: 19 of these looks declare
   *  a duration, and they span 0.01s to 0.56s — a 56x range that a single hardcoded 160ms cannot
   *  stand in for. A 10ms entrance is a hard cut; a 560ms one is a slow drift. */
  animInMs?: number;
  /** Exit fade length in ms, over the end of the line's display window. Their rows declare one
   *  (out: 'fade', 100-140ms) on seven of these looks. */
  animOutMs?: number;
  /** How far a directional entrance travels, in em of its own font size. */
  animInEm?: number;
  /** The hero's own entrance (the impact word, the lockup's big word, a stack's hero row), in place
   *  of the line's: their heroTransitions. */
  heroEnter?: LookEnter;
  /** The other words' entrance (the subtitle row, the context), in place of the line's: their
   *  subtitleTransitions. Its delay counts from the phrase start. */
  rowEnter?: LookEnter;
  /** The hero shows from the phrase's first word, not when its own word is spoken (their
   *  heroStartsAtClipStart: Outhaul's PROGRESS is up while "into everyone" is being said). */
  heroFromStart?: boolean;
  /** The caption holds until the next one begins instead of clearing after its last word (their
   *  transitions.linger). */
  linger?: boolean;
  /** A per-phrase layout cycle. Phrase n takes pattern[n % length]:
   *   front  — the ordinary caption, at this look's positionYPct
   *   behind — the whole phrase as one giant row behind the subject, behindScale times the size
   *   curve  — the phrase typed letter by letter along an arc over the head (needs `curve`)
   *  With layerOnly the slots change ONLY which side of the subject the phrase sits on.
   *  Positions are absolute design values, shifted together when the user drags the caption. */
  variety?: {
    pattern: ('front' | 'behind' | 'curve')[];
    behindYPct?: number; behindScale?: number; curveYPct?: number; layerOnly?: boolean;
    /** Keep the last behind phrase on screen through the front phrases that follow it. */
    preserveBehind?: boolean;
  };
  /** Arc geometry for the variety 'curve' slot: a concave-down arc whose radius is a fraction of
   *  frame width, apex at curveYPct, letters rotated to the tangent and typed on. */
  curve?: { radiusPct: number };
  /** A chip behind the spoken word (their registry calls this captionEffect: 'box'). */
  chip?: { bg: string; radius?: number };
  /** 'stack' only: words per row, and the size multiplier for each row BY ITS TIER (plain 0, pop 1,
   *  hero 2 — the last value stands in past the table). rowGapEm is the gap between rows, in em.
   *  Rows break as their buildStackRows breaks them (see stackRows.ts): a hero stands alone. */
  /** heroPair: an accent word takes a row of its own, with the context chunked around it — their
   *  Focusline breaks "The / biggest / mistake", "fits your / day-to-day / life." */
  stack?: { maxPerRow: number; rowScale: number[]; rowGapEm?: number; heroPair?: boolean; hyphenSplit?: boolean };
  /** Their Cutout's letter mask: for a moment or two of the video the frame goes black and the
   *  phrase's letters are cut out of it (see letterMask.ts for which phrases, and the geometry). */
  letterMask?: import('./letterMask').LetterMaskSpec;
  /** Their depthFx: a word behind the subject blurs, dims and shrinks by how much of it the person
   *  covers (see depth.ts). Applied on the behind layer, from the cut-out's own alpha. */
  depth?: import('./depth').DepthFx;
  /** Most words in one caption — their maxWordsPerLine, per preset (see grouping.ts). Default 4. */
  maxWords?: number;
  /** Which property scene a 'story' look is: their agent story, or a reel (see property/reel.ts). */
  story?: 'agent' | 'reel';
  reel?: 'reach-counter' | 'magenta-estate' | 'dimension-story';
  /** A rows design's words per row, for the grouping's fit (Deep Focus: two rows of two). */
  wordsPerLine?: number;
  /** Their Focusline: the block takes one of four bands chosen from the phrase's own text (see
   *  focusline.ts), its bottom on the band, rows justified by band. Replaces a face-relative rule
   *  that was my own reading of the footage: the bands are fixed, and it is the phrase that moves. */
  focusline?: boolean;
  /** The look places text against the speaker's face, so the face track is read for every line. */
  faceAware?: boolean;
  /** Their dynamic layout: a place per phrase from seeded zone tables (see dynamicLayout.ts).
   *  'around' hops each phrase between the region's zones; 'impact' nudges and enlarges only the
   *  hero phrases, spaced by the intensity's gap. A drag of the caption box moves the zones. */
  dynamic?: import('./dynamicLayout').DynamicSpec;
  /** "Popoff": a zigzag lockup — runs of context words flush LEFT, each accent word its own big row
   *  flush RIGHT, interleaved in phrase order. MEASURED on their Moxie footage: context rows start
   *  at 3.9% of width, accents end at 90.7%, accents are ~3.2x the context size, and each row's
   *  baseline sits ~0.8 of ITS OWN size below the previous one. The remaining scatter matches the
   *  row's declared intensity 'wild', which is not modelled. */
  popoff?: { accentScale: number; leftPct: number; rightPct: number; step: number };
  /** The phrase's IMPACT word: pulled out of the caption and set huge behind the speaker's head.
   *  Their karaoke behind designs all do it (registry emphasis.role_split + impact_scale), one word
   *  a phrase, and a caption row without it stays low, in front of the body. */
  impact?: LookImpact;
  /** Words appear only once spoken, in the place the whole phrase will occupy. Their rows that
   *  declare a per-word `transitions` entrance do this (Jetty, Keel, Lanyard, Netting, Painter,
   *  Quay); the others show the phrase at once and light the spoken word. */
  reveal?: boolean;
  /** An emphasised word inside the row, in the accent face, this much larger (registry
   *  emphasis.accent_scale — Beacon's script "right" in "the right words"). */
  accentScale?: number;
  /** The caption box width the look starts with, % of frame. Their rows may run to the registry's
   *  width_pct of the frame; the fit guard allows 90% of the box, so a design allowed 85% needs a
   *  94% box where the default 84% stops it at 76%. */
  boxWidthPct?: number;
  /** A MEASURED width factor for the row's face, in place of fitText's worst case. The table's
   *  factor covers lowercase words; for a face set in capitals (Anton's run 0.69 at worst against its
   *  0.84) it shrank rows that fit. */
  fitFactor?: number;
  /** The row wraps by width whatever the user's line setting: their Jetty and Keel phrases break
   *  into rows ("YEARS into / editing", "don't arrive / when you / THEM") where a one-line fit would
   *  shrink them to a sliver. */
  wrap?: boolean;
  /** Space between the row's words, in em of the row size. MEASURED with a ruler on six of the
   *  impact designs' rows: 0.35-0.41em (a word space plus ~0.12em), where the engine's fixed 6px is
   *  0.2-0.27em at these sizes. */
  wordGapEm?: number;
  /** A hint that this look is designed to sit BEHIND the speaker: the editor centres the caption
   *  box and turns the subject cut-out on when the look is chosen. Purely a default — the user
   *  can still move the box or switch the effect off. */
  behindSubject?: boolean;
}

/**
 * The impact word, MEASURED per look off their footage at 30fps (each hero keyed by its colour,
 * boxes checked on the frames). Two rules hold across all 14 designs:
 *  - SIZE: as large as `sizePx`, unless that runs wider than `widthPct` of the frame. Short words
 *    stop at a fixed height (Mullion's WITH / LET / HIT all 10.4% tall at 44-70% wide); long ones
 *    fill the width (Garnet's CHOICE and FORWARD at 91-92%, the shorter PULL taller at 82%).
 *  - PLACE: the word's LINE BOX is centred at `yPct`. Cove's CUT and CHANGE differ in size by half
 *    and their ink centres by 0.9%, which is exactly Press Start 2P's ink offset inside its own box.
 */
export interface LookImpact {
  font: string;
  weight?: number;
  italic?: boolean;
  /** The unfitted size, in logical px (a 270-wide frame), before the user's font scale. */
  sizePx: number;
  /** Line-box centre, % of frame height. */
  yPct: number;
  /** The widest the word may be set, % of frame width, as the fit estimator measures it. */
  widthPct: number;
  /** This face's MEDIAN width against the fit estimator, in the case the word is set in. The
   *  table's fontWidthFactor is a worst case for whole rows; one word read at its median lands
   *  where their words land (about 90% of the frame), where the worst case would under-size it. */
  fitFactor: number;
  uppercase?: boolean;
  letterSpacingEm?: number;
  /** Ink; defaults to the look's accent. */
  color?: string;
  /** While the word is spoken it turns this colour on a translucent chip of it, then back (Ibis). */
  litColor?: string;
  /** A chip wipes in behind the word once it is spoken, and stays (Netting). */
  chip?: { bg: string; wipeMs: number };
  /** How the impact words are chosen, their impactSelection: the highest-scored content words, or
   *  the first / last content word of the phrase. Rules in impactWords.ts. */
  select?: 'emphasis' | 'leading' | 'trailing';
  /** How many words may take the role in one phrase (their maxImpactPerClip). With two, the pair
   *  that cannot be set at 78% of the design's size collapses to one, and the other word stays in
   *  the row in the accent role. */
  maxPerClip?: number;
  /** A two-word impact longer than this many letters drops to one (their impactMaxChars). */
  maxChars?: number;
}

const shadowCss = (s?: LookShadow) => (s ? `0 ${s.offsetY}px ${s.blurPx}px ${s.color}` : undefined);
// A halo is a zero-offset shadow in the halo colour at the measured strength. White unless the
// design names a colour: their Signature row declares a white halo for every role.
const glowCss = (g?: { blurPx: number; alpha: number; color?: string }) => {
  if (!g) return undefined;
  const hex = (g.color ?? '#FFFFFF').replace('#', '');
  const [r, gg, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `0 0 ${g.blurPx}px rgba(${r},${gg},${b},${g.alpha})`;
};
const textShadowCss = (spec: { glow?: { blurPx: number; alpha: number; color?: string }; shadow?: LookShadow }) =>
  [glowCss(spec.glow), shadowCss(spec.shadow)].filter(Boolean).join(', ') || undefined;
// Stroke via paint-order keeps the fill on top, which is how the hand-written branches do it.
const strokeCss = (s?: LookStroke) =>
  (s && s.px > 0 ? { WebkitTextStrokeWidth: `${s.px}px`, WebkitTextStrokeColor: s.color, paintOrder: 'stroke fill' } : {});

export interface LookCtx {
  /** CaptionOverlay's own scale helper, so the user's font-size control keeps working. */
  sz: (n: number) => number;
  /** The user's colour controls — a spec only overrides them when it names a colour. */
  captionTextColor: string;
  accentColor: string;
}

/** The style for ordinary (unspoken / context) words. */
export function lookBaseStyle(spec: LookSpec, ctx: LookCtx): CSSProperties {
  return {
    fontFamily: spec.font,
    fontWeight: spec.weight,
    fontSize: ctx.sz(spec.family === 'emphasis' ? (spec.contextSizePx ?? Math.round(spec.sizePx * 0.32)) : spec.sizePx),
    color: spec.color ?? ctx.captionTextColor,
    lineHeight: spec.lineHeight ?? 1.15,
    ...(spec.italic ? { fontStyle: 'italic' as const } : {}),
    ...(spec.transform ? { textTransform: spec.transform } : {}),
    ...(spec.letterSpacingEm ? { letterSpacing: `${spec.letterSpacingEm}em` } : {}),
    ...(textShadowCss(spec) ? { textShadow: textShadowCss(spec) } : {}),
    ...strokeCss(spec.stroke),
    // A 'flat' look has no second state, so its chip belongs on the only ink it draws. Without
    // this, a dark-on-light design keeps the dark ink and loses the light chip — which renders as
    // nothing at all on a dark frame.
    ...(spec.chip && spec.family === 'flat'
      ? { background: spec.chip.bg, borderRadius: spec.chip.radius ?? 6, padding: '0.04em 0.22em' }
      : {}),
  };
}

/** The style for the spoken / emphasised word. */
/** A gradient fill has to paint the glyphs, not a rectangle behind them. */
function gradientFill(stops?: string[]): CSSProperties {
  if (!stops || stops.length < 2) return {};
  return {
    backgroundImage: `linear-gradient(180deg, ${stops.join(', ')})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  };
}

/** Their `P`: the depth treatment every depthFx design but Deep Focus declares. */
const DEPTH_P = { blurPx: 6, dim: 0.4, shrink: 0.06 } as const;

export function lookAccentStyle(spec: LookSpec, ctx: LookCtx): CSSProperties {
  return {
    ...lookBaseStyle(spec, ctx),
    fontSize: ctx.sz(spec.sizePx),
    ...(spec.accentFont ? { fontFamily: spec.accentFont, fontWeight: spec.accentWeight ?? spec.weight } : {}),
    ...(spec.accentItalic ? { fontStyle: 'italic' as const } : {}),
    ...(spec.accentUppercase ? { textTransform: 'uppercase' as const } : {}),
    ...(spec.accentLetterSpacingEm !== undefined ? { letterSpacing: spec.accentLetterSpacingEm ? `${spec.accentLetterSpacingEm}em` : 'normal' } : {}),
    color: spec.accent ?? ctx.accentColor,
    // Gradient last: it overrides `color`, which is exactly what it is for.
    ...gradientFill(spec.gradient),
    // em padding, so the chip grows with the fit guard's chosen size instead of staying put.
    ...(spec.chip
      ? { background: spec.chip.bg, borderRadius: spec.chip.radius ?? 6, padding: '0.04em 0.22em' }
      : {}),
  };
}

/** 'karaoke' dims words that have not been spoken yet; 'flat' treats them alike. */
export function lookRestStyle(spec: LookSpec, ctx: LookCtx): CSSProperties {
  const base = lookBaseStyle(spec, ctx);
  if (spec.family !== 'karaoke') return base;
  return { ...base, fontSize: ctx.sz(spec.sizePx), opacity: spec.restOpacity ?? 0.45 };
}

// ─────────────────────────────────────────────────────────────────────────────
// The table. Batch 1: looks that need NO capability Captik lacks — pure typography, which the
// competitor teardown measured as 25 of their 173 rows. Faces are limited to those already
// bundled (Inter / Poppins / Montserrat / Playfair Display / Space Grotesk / Anton / Bebas
// Neue / Rubik), so preview and export resolve identically.
// ─────────────────────────────────────────────────────────────────────────────
export const LOOK_SPECS: LookSpec[] = [
  // Three classes only: behind the speaker, popular, and property. Parameters are matched to
  // their registry rows; the caption y is MEASURED — the behind class sits at 78.3% in their
  // own frames (six sets, 78.2-78.5%), and the other two carry the y their row states.
  {
    id: 'look_anchorage', name: 'Anchorage', tags: ['Popular'], family: 'karaoke', maxWords: 3,
    font: 'Montserrat, sans-serif', weight: 800, sizePx: 21, transform: 'uppercase',
    positionYPct: 80.1, color: '#FFFFFF', accent: '#FFE500', animIn: 'fade', restOpacity: 0.85, shadow: { blurPx: 8, color: 'rgba(0,0,0,0.4)', offsetY: 3 },
    // MEASURED: yellow box on the key word, low in frame
  },
  {
    id: 'look_beacon', name: 'Beacon', tags: ['Behind'], family: 'karaoke', maxWords: 4,
    font: 'Montserrat, sans-serif', weight: 800, sizePx: 37, wordGapEm: 0.38, fitFactor: 1.06,
    accentFont: 'KaushanScript, cursive', accentWeight: 400, accentScale: 1.22,
    behindSubject: true, depth: DEPTH_P, positionYPct: 78.3, color: '#FFFFFF', accent: '#2742C4', animIn: 'fade', animInMs: 30, restOpacity: 0.85, shadow: { blurPx: 18, color: 'rgba(0,0,0,0.5)', offsetY: 5 },
    impact: { font: 'KaushanScript, cursive', sizePx: 91, yPct: 27.7, widthPct: 92, fitFactor: 0.777 },
    // FACES from their row: Montserrat, accent Kaushan Script. The script "right" in "the right
    // words" stays script while the spoken word lights blue in Montserrat.
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): "done" 60% and "hit" 37% wide, both
    // at one size (Kaushan, 88-90 by width, 80-86 by height), centred 27.7%.
  },
  {
    id: 'look_cove', name: 'Cove', tags: ['Behind'], family: 'karaoke', maxWords: 4,
    font: 'SpecialElite, "Courier New", monospace', weight: 400, sizePx: 22, wordGapEm: 0.38,
    behindSubject: true, depth: DEPTH_P, positionYPct: 77.8, color: '#F6EFE2', accent: '#F25FA0', animIn: 'fade', animInMs: 30, restOpacity: 0.85, shadow: { blurPx: 14, color: '#7A1442', offsetY: 6 },
    impact: { font: 'PressStart2P, monospace', sizePx: 60, letterSpacingEm: 0.02, yPct: 26.2, widthPct: 92, fitFactor: 1.389, uppercase: true },
    // FACES from their row: Special Elite, accent Press Start 2P (it was VPPixel for both). The accent
    // face is the hero's only: their row is Special Elite throughout, the spoken word lit pink.
    // Row size from "bold" read on a clean frame (a background-contaminated box had put it at 28).
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): CUT 65% wide at 60px; CHANGE and RHYTHM
    // fitted to 90-91% at 41px. Press Start 2P matches their glyphs exactly (height/width 1.00).
  },
  {
    id: 'look_driftwood', name: 'Driftwood', tags: ['Behind'], family: 'karaoke', maxWords: 4,
    font: 'Montserrat, sans-serif', weight: 800, sizePx: 21, wordGapEm: 0.38,
    behindSubject: true, depth: DEPTH_P, positionYPct: 78.3, color: '#FFF1DC', accent: '#FF6A2B', animIn: 'fade', animInMs: 30, restOpacity: 0.85, shadow: { blurPx: 12, color: 'rgba(0,0,0,0.5)', offsetY: 4 },
    impact: { font: 'LuckiestGuy, "Luckiest Guy", cursive', sizePx: 84, letterSpacingEm: 0.02, yPct: 26.4, widthPct: 92, fitFactor: 0.759, uppercase: true },
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): KEY, WORD, MISS all 12-12.5% tall at 52-84%
    // wide: one size (81-84), none fitted; centre 26.4% within 0.06.
  },
  {
    id: 'look_ellis', name: 'Ellis', tags: ['Behind'], family: 'karaoke', maxWords: 4,
    font: 'Montserrat, sans-serif', weight: 800, sizePx: 22, wordGapEm: 0.38,
    behindSubject: true, depth: DEPTH_P, positionYPct: 78.3, color: '#EAF0FF', accent: '#2B53D4', animIn: 'fade', animInMs: 30, restOpacity: 0.85, shadow: { blurPx: 18, color: 'rgba(10,18,48,0.55)', offsetY: 5 },
    impact: { font: 'GreatVibes, cursive', sizePx: 93, yPct: 26.8, widthPct: 92, fitFactor: 0.61 },
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): "typography" fitted to 88% (71px by width and
    // by height); "simple" 64% wide at 93px, its descender hidden behind the head.
  },
  {
    id: 'look_ferrier', name: 'Ferrier', tags: ['Behind'], family: 'karaoke', maxWords: 4,
    font: 'PoppinsBold, Poppins, sans-serif', weight: 700, sizePx: 28, wordGapEm: 0.38,
    behindSubject: true, depth: DEPTH_P, positionYPct: 78.2, color: '#FBF4E4', accent: '#6E7B2E', animIn: 'fade', animInMs: 30, restOpacity: 0.85, shadow: { blurPx: 16, color: 'rgba(0,0,0,0.5)', offsetY: 4 },
    impact: { font: 'BagelFatOne, sans-serif', sizePx: 100, yPct: 27.1, widthPct: 92, fitFactor: 0.96 },
    // FACES from their row: Poppins Bold (the bundled Poppins is Medium, drawn with a synthetic
    // bold), accent Bagel Fat One.
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): "sound" fitted to 86.5% (86 by width, 89 by
    // height). Every measured word was fitted, so the unfitted size is only known to exceed 89.
  },
  {
    id: 'look_garnet', name: 'Garnet', tags: ['Behind'], family: 'karaoke', maxWords: 4,
    font: 'Inter, sans-serif', weight: 700, sizePx: 22, wordGapEm: 0.38,
    behindSubject: true, depth: DEPTH_P, positionYPct: 78.9, color: '#FFFFFF', accent: '#A8FF1A', animIn: 'fade', animInMs: 30, restOpacity: 0.85, shadow: { blurPx: 14, color: 'rgba(0,0,0,0.5)', offsetY: 4 },
    impact: { font: 'Inter, sans-serif', weight: 900, sizePx: 91, yPct: 22.2, widthPct: 92, fitFactor: 0.852, uppercase: true },
    // MEASURED: caption 78.9%; the 22% block is its hero word, not the caption
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): PULL 82% wide at 90px; CHOICE and FORWARD
    // fitted to 91-92%; all three centred at 21.9% within 0.14.
  },
  {
    id: 'look_hawser', name: 'Hawser', tags: ['Behind'], family: 'flat', maxWords: 4, wordsPerLine: 2,
    font: 'Anton, sans-serif', weight: 400, sizePx: 57, transform: 'uppercase', fitFactor: 0.69,
    behindSubject: true, depth: { blurPx: 7, dim: 0.45, shrink: 0.07 }, positionYPct: 26.6, wrapRows: 2, color: '#FFFFFF', animIn: 'fade', shadow: { blurPx: 26, color: 'rgba(0,0,0,0.45)', offsetY: 8 },
  },
  {
    id: 'look_ibis', name: 'Ibis', tags: ['Popular'], family: 'karaoke', maxWords: 4,
    font: 'Montserrat, sans-serif', weight: 700, sizePx: 22, wordGapEm: 0.38,
    behindSubject: true, depth: DEPTH_P, positionYPct: 78.3, color: '#FFFFFF', accent: '#FFE500', chip: { bg: 'rgba(255,229,0,0.32)' }, animIn: 'fade', animInMs: 30, restOpacity: 0.85, shadow: { blurPx: 18, color: 'rgba(0,0,0,0.5)', offsetY: 5 },
    impact: { font: 'Anton, sans-serif', sizePx: 119, yPct: 21.7, widthPct: 92, fitFactor: 0.616, uppercase: true, color: '#FFFFFF', litColor: '#FFE500' },
    // FACES from their row: Montserrat Bold, accent Anton (the row was Anton). caption_effect
    // 'highlight': the spoken word turns yellow on a translucent yellow box, the hero too.
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): IDEA 69% wide at 118px; HIDING and SIGHT
    // fitted (85%); centre 21.5% within 0.09.
  },
  {
    id: 'look_jetty', name: 'Jetty', tags: ['Behind'], family: 'karaoke', maxWords: 4,
    font: 'InstrumentSerif, serif', weight: 400, sizePx: 43, wordGapEm: 0.38, letterSpacingEm: -0.023,
    behindSubject: true, reveal: true, wrap: true, boxWidthPct: 94, fitFactor: 0.7, positionYPct: 78.0, color: '#FFFFFF', accent: '#FFFFFF', animIn: 'fade', animInMs: 10, restOpacity: 0.85, shadow: { blurPx: 18, color: 'rgba(255,5,3,0.42)', offsetY: 5 },
    impact: { select: 'leading', maxPerClip: 2, font: 'RubikSprayPaint, sans-serif', sizePx: 130, letterSpacingEm: -0.07, yPct: 28.9, widthPct: 92, fitFactor: 0.957, uppercase: true, color: '#FF0503' },
    // MEASURED: caption low, big red hero word high
    // FACES from their row: upright Instrument Serif (it was the italic), accent Rubik Spray Paint.
    // The row stays white as it is spoken; the red is the hero's.
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): TEN, ONE, CURVED fitted to 90-93%
    // (TEN/ONE 114-120px); their SUBTITLES overflows the frame, which the fit here does not repeat.
    // Their letters sit tighter than the face's own spacing: at equal width their words are 9% taller,
    // which -0.07em (solved per word: -0.06 to -0.085) accounts for.
  },
  {
    id: 'look_keel', name: 'Keel', tags: ['Popular'], family: 'karaoke', maxWords: 3,
    font: 'Gloock, serif', weight: 400, sizePx: 31, wordGapEm: 0.38, letterSpacingEm: -0.012,
    behindSubject: true, reveal: true, wrap: true, boxWidthPct: 93, positionYPct: 76.5, color: '#FFF18F', accent: '#FFF18F', animIn: 'fade', animInMs: 10, restOpacity: 0.85, shadow: { blurPx: 14, color: 'rgba(0,0,0,0.45)', offsetY: 4 },
    impact: { select: 'leading', maxPerClip: 2, font: 'Gloock, serif', sizePx: 115, letterSpacingEm: -0.04, yPct: 19.9, widthPct: 92, fitFactor: 0.932, uppercase: true },
    // MEASURED: caption low, gold serif hero high
    // FACES from their row: Gloock for both roles (it was Inter).
    // ACCENT set explicitly to their declared emphasisColor even though it equals the base: an
    // omitted accent does not mean 'same as base', it falls through to the USER's accent colour,
    // which painted the spoken words cyan in a render.
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): BEST, FORCE, THEY, MAKE all fitted
    // to 88-90%, centred 19.9% within 0.17 (measured above the lamp, which shares the gold). Tracked
    // -0.04em (solved per word, -0.035 to -0.043); the unfitted size is only known to exceed 105.
  },
  {
    id: 'look_lanyard', name: 'Lanyard', tags: ['Popular'], family: 'flat', maxWords: 3,
    font: 'ArchivoBlack, sans-serif', weight: 400, sizePx: 28, wordGapEm: 0.38, letterSpacingEm: -0.06,
    behindSubject: true, reveal: true, boxWidthPct: 89, positionYPct: 75.1, color: '#FFFFFF', animIn: 'fade', animInMs: 10, shadow: { blurPx: 14, color: 'rgba(0,0,0,0.42)', offsetY: 4 },
    impact: { select: 'leading', maxPerClip: 2, font: 'ArchivoBlack, sans-serif', sizePx: 95, yPct: 17.6, widthPct: 92, fitFactor: 1.104, letterSpacingEm: -0.07, color: '#FFFFFF' },
    // MEASURED: caption low, white hero high
    // FACES from their row: Archivo Black for both roles (it was Anton).
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): Motivation, action, begin all fitted to
    // 90-93%; centre 17.6%. Their hero also carries a distressed texture, not reproduced.
  },
  {
    id: 'look_mizzen', name: 'Mizzen', tags: ['Behind'], family: 'stack', maxWords: 7,
    font: 'Inter, sans-serif', weight: 400, accentFont: 'Inter, sans-serif', accentWeight: 900, accentItalic: true, sizePx: 24, letterSpacingEm: -0.025, accentLetterSpacingEm: -0.06,
    behindSubject: true, focusline: true, inception: true, positionYPct: 27.0, color: '#F3F0EA', accent: '#9BCDD0', heroEnter: { kind: 'fadeUp', ms: 220, outMs: 140 }, rowEnter: { kind: 'fadeUp', ms: 200, outMs: 120 }, animIn: 'fadeUp', animInMs: 260, animOutMs: 120, stack: { maxPerRow: 2, rowScale: [1.05, 1.05, 1.22], rowGapEm: 0.02, heroPair: true }, shadow: { blurPx: 12, color: 'rgba(0,0,0,0.46)', offsetY: 3 },
    // MEASURED: a multi-line block high in frame, not a low caption
    // MEASURED rows: "What you / should really / be paying" — two words a row
    // FACES from their row: context Inter Regular, accent Inter Black italic.
    // INCEPTION: role_effects inception, verified from pixels as a difference against its cyan accent
    // FOCUSLINE: per phrase the block sits in one of three bands — MEASURED block centres 15-19%,
    // 27-31% and 57-61%. Their planner's rule, read from the public bundle, picks the band from the
    // phrase's text alone (opener, length, hero) with the block's BOTTOM at 22%, 34% or 68%, which
    // is exactly what the measured centres are for two- and three-row blocks. The 27% here is only
    // the fallback the caption box carries; a drag shifts every band together.
  },
  {
    id: 'look_netting', name: 'Netting', tags: ['Behind'], family: 'karaoke', maxWords: 4,
    font: 'Inter, sans-serif', weight: 400, sizePx: 23, wordGapEm: 0.38, letterSpacingEm: -0.03,
    behindSubject: true, reveal: true, boxWidthPct: 89, positionYPct: 79.2, color: '#FFFFFF', accent: '#FFFFFF', animIn: 'fade', animInMs: 10, restOpacity: 0.85, shadow: { blurPx: 14, color: 'rgba(0,0,0,0.5)', offsetY: 3 },
    impact: { select: 'leading', maxPerClip: 2, maxChars: 11, font: 'Inter, sans-serif', weight: 600, italic: true, sizePx: 46, yPct: 17.6, widthPct: 92, fitFactor: 0.886, letterSpacingEm: -0.05, color: '#121212', chip: { bg: '#96FF1A', wipeMs: 170 } },
    // MEASURED: caption low, highlighted hero word at ~18%
    // MEASURED + declared: caption_effect 'highlight', near-black ink on an acid-green chip. The
    // footage puts both on the HERO ("clever", "opened"), the chip wiping in from the right once the
    // word is spoken; the row is plain white Inter Regular (it was bold, with the chip on the row).
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): "clever" 40% wide, 7.3% tall; one size.
  },
  {
    id: 'look_outhaul', name: 'Outhaul', tags: ['Behind'], family: 'emphasis', maxWords: 4,
    font: 'GloriaHallelujah, cursive', weight: 400, sizePx: 120, contextSizePx: 30, fitFactor: 0.65, boxWidthPct: 100, heroSelect: 'trailing',
    accentFont: 'Anton, sans-serif', accentWeight: 400, accentUppercase: true, letterSpacingEm: -0.03,
    behindSubject: true, positionYPct: 14.4, color: '#FFFFFF', accent: '#96FF1A', heroEnter: { kind: 'fadeDown', ms: 480 }, rowEnter: { kind: 'fadeUp', ms: 300, delayMs: 120 }, heroFromStart: true, animIn: 'fadeDown', animInMs: 560, restOpacity: 0.85, shadow: { blurPx: 14, color: 'rgba(0,0,0,0.48)', offsetY: 4 },
    // MEASURED: a full-width lockup at the TOP: small context over a huge word
    // anchor 14.4 puts the ink on its measured 14.1% with the accent last, as their lockups end.
    // (An earlier +1.4 'lockup offset' came from a probe whose hidden trailing words held space.)
    // FACES from their row and frames: context in Gloria Hallelujah ("you avoid", "into everyone"),
    // the huge word in Anton. Both were Anton. Their row names impactSelection 'trailing-by-length': the
    // last content word of the phrase is the hero. The word fills the frame in every frame (DISCIPLINE,
    // PROBLEMS, PROGRESS 94% wide): the fit decides its size, against Anton's capitals (0.65).
  },
  {
    id: 'look_painter', name: 'Painter', tags: ['Behind'], family: 'karaoke', maxWords: 4,
    font: 'Unna, serif', weight: 400, sizePx: 17, wordGapEm: 0.38, letterSpacingEm: 0.02,
    accentFont: 'Anton, sans-serif', accentWeight: 400, accentUppercase: true,
    behindSubject: true, reveal: true, positionYPct: 80.0, color: '#FFF600', accent: '#FFF600', heroEnter: { kind: 'fadeUp', ms: 300 }, animIn: 'fadeDown', animInMs: 240, restOpacity: 0.85, shadow: { blurPx: 16, color: 'rgba(0,0,0,0.58)', offsetY: 6 },
    impact: { select: 'leading', maxPerClip: 2, font: 'Anton, sans-serif', sizePx: 135, letterSpacingEm: -0.03, yPct: 13.6, widthPct: 92, fitFactor: 0.616, uppercase: true },
    // MEASURED: caption low, gold hero at the very top
    // FACES from their row: Unna, accent Anton ("SECONDS" in the row, and the hero). It was Anton.
    // ACCENT set explicitly to their declared emphasisColor even though it equals the base: an
    // omitted accent does not mean 'same as base', it falls through to the USER's accent colour,
    // which painted the spoken words cyan in a render.
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): HOOK, THREE, NEVER, WATCHED all fitted
    // to 88-91%; line box centred 13.4% (HOOK's top reaches 1.4% of the frame). Tracked -0.03em.
  },
  {
    id: 'look_quay', name: 'Quay', tags: ['Behind'], family: 'karaoke', maxWords: 4,
    font: 'InstrumentSerif, serif', weight: 400, sizePx: 35, wordGapEm: 0.38, letterSpacingEm: -0.03,
    behindSubject: true, reveal: true, positionYPct: 75.9, color: '#EEEEEE', accent: '#E50914', heroEnter: { kind: 'fadeUp', ms: 300 }, animIn: 'fade', animInMs: 10, restOpacity: 0.85, shadow: { blurPx: 18, color: 'rgba(229,9,20,0.46)', offsetY: 5 },
    impact: { select: 'leading', maxPerClip: 2, font: 'InstrumentSerif, serif', sizePx: 130, letterSpacingEm: -0.08, yPct: 18.2, widthPct: 92, fitFactor: 0.68 },
    // MEASURED: caption low, crimson serif hero mid-frame
    // FACES from their row: upright Instrument Serif for both roles (it was the italic).
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): "notice" 75% wide at 100px, "system" and
    // "simple" at 103-105; "complicated" fitted to 93%. The hero rises in over their declared 300ms
    // (heroTransitions fadeUp .3) while the row cuts in; MEASURED fully opaque by frame 52 of 47, which
    // is the 2.2x opacity ramp of their word reveal inside that travel. Tracked -0.08em, so its letters touch as theirs do (solved per word,
    // -0.075 to -0.088); unfitted size 130 from the three unfitted words, rendered back.
  },
  {
    id: 'look_rudder', name: 'Rudder', tags: ['Popular'], family: 'stack', maxWords: 4,
    font: 'ArchivoBlack, sans-serif', weight: 400, sizePx: 22.6, letterSpacingEm: -0.065, accentLetterSpacingEm: 0, accentScale: 1.75, lineHeight: 0.92, boxWidthPct: 88,
    inception: true, positionYPct: 54.8, color: '#FFFFFF', accent: '#FFFFFF', animIn: 'fade', animInMs: 60, stack: { maxPerRow: 2, rowScale: [1.08, 1.65, 2.75], rowGapEm: 0.025 }, letterMask: { maxMoments: 2, openingWindowSec: 5, payoffTailFraction: 0.28, secondMomentMinDurationSec: 24, minGapSec: 8 }, shadow: { blurPx: 14, color: 'rgba(0,0,0,0.5)', offsetY: 3 },
    // MEASURED on their frame 84 ("makes people / stop / scrolling", 540x960) with Archivo Black's
    // real metrics: the plain rows at 24.4 logical px (height and width agree), so the base is
    // 24.4 / 1.08; the hero "stop" at 93 — their 2.75 x 1.75 (emphasisStyle.scale) asks for 109
    // and the row is FITTED to 0.83 of the frame width (ink 431 of 540), which 88% x 0.94 gives.
    // The hero runs at zero tracking (ink width 2.32em, not the line's 2.13). Rows pitch at
    // their lineHeightEm .92 with .025em of gap from each neighbour; the line boxes centre at 0.548H.
    // MEASURED rows: "makes people / stop / scrolling" — maxPerRow 6 made its own three-row scale unreachable
    // INCEPTION: registry emphasis.style.effect 'inception' + letter_mask; verified from pixels
    // LETTER MASK: their registry's block verbatim; the opening phrase is a black plate with the
    // letters cut out (frames 3-34 of their preview), later heroes take the inception
    // ACCENT set explicitly to their declared emphasisColor even though it equals the base: an
    // omitted accent does not mean 'same as base', it falls through to the USER's accent colour,
    // which painted the spoken words cyan in a render.
    // FACE from their row and frames: Archivo Black (it was Anton).
  },
  {
    id: 'look_scupper', name: 'Scupper', tags: ['Behind'], family: 'stack', maxWords: 4,
    font: 'Inter, sans-serif', weight: 900, sizePx: 24,
    accentFont: 'BebasNeue, sans-serif', accentWeight: 400, letterSpacingEm: -0.028, accentScale: 1.36, accentLetterSpacingEm: -0.025,
    behindSubject: true, positionYPct: 48.0, color: '#FFF8E8', accent: '#FFF8E8', animIn: 'fade', animInMs: 100, animOutMs: 100, stack: { maxPerRow: 4, rowScale: [1.05, 1.24, 1.72], rowGapEm: 0.018 },
    // DECLARED: their fontPairing accentScale 1.36 and accentLetterSpacingEm -.025 — the hero row
    // is the tier's rowScale TIMES the accent's scale, as Cutout's measured hero proved shadow: { blurPx: 7, color: 'rgba(29,23,18,0.34)', offsetY: 2 },
    // DECLARED, not measured: no preview on their public site. Registry position.y_pct.
    // ACCENT set explicitly to their declared emphasisColor even though it equals the base: an
    // omitted accent does not mean 'same as base', it falls through to the USER's accent colour,
    // which painted the spoken words cyan in a render.
    // FACES from their row: Inter Black, hero Bebas Neue. Their script 'pop' tier is not modelled.
  },
  {
    id: 'look_taffrail', name: 'Taffrail', tags: ['Behind'], family: 'stack', maxWords: 4,
    font: 'Inter, sans-serif', weight: 500, sizePx: 20,
    accentFont: 'BlackHanSans, sans-serif', accentWeight: 400, letterSpacingEm: -0.04, accentScale: 1.7, accentLetterSpacingEm: -0.05,
    behindSubject: true, variety: { pattern: ['front', 'behind', 'front', 'front', 'behind'], layerOnly: true }, dynamic: { style: 'impact', intensity: 'subtle' }, positionYPct: 58.0, color: '#F4F1ED', accent: '#8971FA', linger: true, animIn: 'fadeUp', animInMs: 160, animOutMs: 100, stack: { maxPerRow: 3, rowScale: [1.05, 1.45, 2.2], rowGapEm: 0.025 }, glow: { blurPx: 3.75, alpha: 0.82 }, shadow: { blurPx: 10, color: 'rgba(10,15,20,0.52)', offsetY: 2 },
    // DECLARED, not measured: no preview on their public site. Registry position.y_pct. Their
    // dynamic layout 'impact', subtle: a hero phrase at least 5s after the last is nudged by up to
    // 1%/4% of the frame and drawn 1.1x; plain phrases stay at the box.
    // VARIETY: layer-only cycle
    // NEON: DECLARED (role_effects neon); strength calibrated on Butter, the one neon look with footage
    // FACES from their row: Inter Medium, hero Black Han Sans (it was Anton for both). Their middle
    // 'pop' tier (Inter Black) is not modelled.
  },
  {
    id: 'look_underway', name: 'Underway', tags: ['Behind'], family: 'stack', maxWords: 4,
    font: 'BebasNeue, sans-serif', weight: 400, sizePx: 16,
    accentFont: 'ArchivoBlack, sans-serif', accentWeight: 400, accentUppercase: true, transform: 'uppercase', letterSpacingEm: -0.012, accentLetterSpacingEm: -0.045,
    behindSubject: true, depth: DEPTH_P, positionYPct: 24.0, color: '#FDF8FA', accent: '#B5D54A', heroEnter: { kind: 'fadeUp', ms: 120 }, rowEnter: { kind: 'fadeDown', ms: 100 }, animIn: 'fade', animInMs: 100, animOutMs: 100, stack: { maxPerRow: 4, rowScale: [1.05, 1.14, 1.58], rowGapEm: 0.015 }, shadow: { blurPx: 8, color: 'rgba(0,0,0,0.52)', offsetY: 2 },
    // DECLARED, not measured: no preview on their public site. Registry position.y_pct.
    // FACES from their row: Bebas Neue, hero Archivo Black (it was Anton for both).
  },
  {
    id: 'look_vang', name: 'Vang', tags: ['Behind'], family: 'emphasis', maxWords: 3,
    font: 'Inter, sans-serif', weight: 700, accentFont: 'Poppins, sans-serif', sizePx: 36, contextSizePx: 14,
    behindSubject: true, depth: DEPTH_P, variety: { pattern: ['front', 'behind', 'front', 'front', 'curve', 'behind', 'front', 'behind'], behindYPct: 28, behindScale: 3, curveYPct: 18, preserveBehind: true }, curve: { radiusPct: 0.5 }, positionYPct: 20.0, color: '#FFFFFF', accent: '#F6FBC5', animIn: 'fade', glow: { blurPx: 3.75, alpha: 0.82 }, shadow: { blurPx: 10, color: 'rgba(0,0,0,0.32)', offsetY: 2 },
    // MEASURED: one lockup near the top ("can"/"more"), not a low caption
    // VARIETY: variety cycle declared; front 22% vs measured 20%, behind MEASURED at 28%
    // front is an inline row now (no lockup offset), so the anchor IS the measured 20%
    // FACES from their row: primary Inter, accent Poppins
    // NEON: MEASURED on this look's footage
  },
  {
    id: 'look_windlass', name: 'Windlass', tags: ['Behind'], family: 'emphasis', maxWords: 4,
    font: 'Inter, sans-serif', weight: 700, sizePx: 36,
    accentFont: 'FredokaOne, cursive', accentWeight: 400, contextSizePx: 14, letterSpacingEm: -0.018,
    behindSubject: true, depth: DEPTH_P, positionYPct: 72.5, color: '#FFFFFF', accent: '#F6FBC5', heroEnter: { kind: 'fadeLeft', ms: 420, outMs: 120 }, rowEnter: { kind: 'fadeUp', ms: 260, outMs: 120 }, animOutMs: 120, animIn: 'fade', shadow: { blurPx: 10, color: 'rgba(0,0,0,0.42)', offsetY: 3 },
    // DECLARED, not measured: no preview on their public site. Registry position.y_pct.
    // heroBox dropped: emphasis.role_split is true, which holds on 4 of 4 verified
    // lockups and neither verified two-box look — so this is a lockup, not a hero above a caption.
    // anchor 72.5 puts the ink on the declared 72.0% (accent-last probe)
    // FACES from their row: Inter Bold, hero Fredoka One (it was Luckiest Guy for both).
  },
  {
    id: 'look_yawl', name: 'Yawl', tags: ['Behind'], family: 'stack', maxWords: 4,
    font: 'Inter, sans-serif', weight: 900, sizePx: 17, transform: 'lowercase',
    behindSubject: true, depth: DEPTH_P, variety: { pattern: ['front', 'behind', 'front', 'front', 'behind'], layerOnly: true }, positionYPct: 23.0, color: '#FFFFFF', accent: '#E3FC3E', linger: true, animIn: 'fadeUp', popoff: { accentScale: 3.0, leftPct: 3.6, rightPct: 91.4, step: 0.8 }, stack: { maxPerRow: 2, rowScale: [1.0, 1.9, 3.0], rowGapEm: -0.16 }, shadow: { blurPx: 16, color: 'rgba(0,0,0,0.45)', offsetY: 3 },
    // MEASURED: four-row block spanning 8-38%
    // VARIETY: layer-only cycle
    // POPOFF: registry dynamic_layout popoff (accumulate: true). Their face is Inter Black and the text
    // lowercase. Size and margins tuned by rendering their own passage and reading the ink back:
    // glyph side-bearings put the ink 0.3% inside leftPct and 0.7% inside rightPct.
    // NOT modelled: accumulating the block across phrases — the clip holds one block, so its reset
    // rule cannot be read from it.
  },
  {
    id: 'look_abbey', name: 'Abbey', tags: ['Behind'], family: 'emphasis', maxWords: 4,
    font: 'Montserrat, sans-serif', accentFont: 'AbrilFatface, "Times New Roman", serif', accentWeight: 400, weight: 800, sizePx: 41, contextSizePx: 14,
    behindSubject: true, depth: DEPTH_P, variety: { pattern: ['curve', 'front', 'behind', 'front', 'curve', 'behind', 'front', 'curve'], behindYPct: 28.1, behindScale: 3.15, curveYPct: 10.5, preserveBehind: true }, curve: { radiusPct: 0.47 }, positionYPct: 59.0, color: '#FFFFFF', accent: '#FFE451', animIn: 'fade', shadow: { blurPx: 14, color: 'rgba(0,0,0,0.5)', offsetY: 3 },
    // MEASURED: hero word high, caption low ("make ideas", "content ideas")
    // VARIETY: variety cycle declared; curve apex 10.5% matches the footage, behind MEASURED at 28.1% (70 frames, yellow rows wider than 40% of frame, which excludes the flower)
    // heroBox dropped: the 'hero high, caption low' I read off one frame was two DIFFERENT
    // phrases — a behind-slot word held on screen (preserveBehind) under the next front caption.
    // FACES from their row: primary Montserrat, accent Abril Fatface (weight 400)
  },
  {
    id: 'look_belfry', name: 'Belfry', tags: ['Behind'], family: 'karaoke', maxWords: 3,
    font: 'Montserrat, sans-serif', weight: 800, sizePx: 15,
    behindSubject: true, depth: DEPTH_P, positionYPct: 10.0, color: '#FFFFFF', accent: '#F4F1BE', linger: true, animIn: 'fade', animInMs: 450, restOpacity: 0.85, shadow: { blurPx: 8, color: 'rgba(0,0,0,0.25)', offsetY: 2 },
    // MEASURED: a single small line high in the frame ("Make them", "from you."), the spoken word
    // lit and the rest dimmed — karaoke, not a stack. It was a three-row growing lockup, which is a
    // layout I assigned from the registry row, not one their preview shows. At the measured 10% the
    // stack's top row also ran off the top of the frame, so the wrong family was clipping as well as
    // mismatching. Their clip does also park the caption low at ~70% at times; this is the position
    // it holds in 165 of 300 frames.
  },
  {
    id: 'look_cloister', name: 'Cloister', tags: ['Behind'], family: 'emphasis', maxWords: 4,
    font: 'InstrumentSerif, serif', weight: 400, sizePx: 60, contextSizePx: 20, fitFactor: 1.85,
    accentFont: 'BBHBartle, sans-serif', accentWeight: 400, accentUppercase: true,
    behindSubject: true, depth: DEPTH_P, variety: { pattern: ['front', 'front', 'behind', 'front'], layerOnly: true }, dynamic: { style: 'around', intensity: 'balanced', placementRegion: 'mostly-lower', consistentScale: true }, positionYPct: 56.0, color: '#FFFFFF', accent: '#141414', chip: { bg: '#F2EFE8', radius: 2 }, animIn: 'fadeUp', animInMs: 240, animOutMs: 120, jitter: { rotateDeg: 1.6, yEm: 0.03 }, subjectOutline: { color: '#FFD400', px: 40 }, shadow: { blurPx: 8, color: 'rgba(15,24,15,0.32)', offsetY: 2 },
    // MEASURED: one highlighted two-line block ("building a visual/DIRECTION.") at 54.9%: one pick of
    // their 'around' layout, which hops each phrase between the lower zones (55-81%, with the two
    // upper corners for a plain phrase every fourth two-second bucket). The 56% here is the box the
    // zones shift with, their registry's positionYPct; the zone table carries the placement.
    // VARIETY: layer-only cycle
    // anchor 54.9 puts the ink on its measured 55.0% with the accent last, as their lockups end.
    // (An earlier +1.4 'lockup offset' came from a probe whose hidden trailing words held space.)
    // FACES from their row and frames: upright Instrument Serif ("building a"), hero BBH Bartle in
    // near-black on a light chip ("DIRECTION."). It was the italic serif for both, cream, no chip.
    // Their Inter Bold 'pop' tier on a pink chip ("visual") is not modelled.
  },
  {
    id: 'look_dovecote', name: 'Dovecote', tags: ['Behind'], family: 'karaoke',
    font: 'GloriaHallelujah, cursive', weight: 400, sizePx: 42, wrap: true, lineHeight: 0.9,
    behindSubject: true, positionYPct: 61.0, color: 'rgba(255,255,255,0.55)', accent: '#FFD400', linger: true, animIn: 'fade', animInMs: 160, restOpacity: 0.5, jitter: { rotateDeg: 3.0, yEm: 0.05 }, subjectOutline: { color: '#FFD400', px: 36 }, shadow: { blurPx: 10, color: 'rgba(0,0,0,0.45)', offsetY: 2 },
    // MEASURED: handwritten line; the chalkboard REMEMBER is set dressing in their footage
    // FACE from their row and their frames: Gloria Hallelujah (it was Inter Bold). Their phrase wraps
    // ("remember a / new idea", rows at 57% and 64%, ~0.8em apart), so the block centre is 61.
  },
  {
    id: 'look_effigy', name: 'Effigy', tags: ['Behind'], family: 'flat',
    font: 'Poppins, sans-serif', weight: 500, sizePx: 24,
    accentFont: 'GloriaHallelujah, cursive', accentWeight: 400, accentScale: 1.4,
    behindSubject: true, positionYPct: 63.4, wrapRows: 2, color: '#FFFDF7', accent: '#FFFDF7', linger: true, animIn: 'fade', animInMs: 140, shadow: { blurPx: 12, color: 'rgba(0,0,0,0.46)', offsetY: 2 },
    // MEASURED: two-line caption, hero word high
    // FACES from their row: Poppins Medium (the bundled cut; 700 drew a synthetic bold), emphasised
    // words in Gloria Hallelujah ("messy," in their frames).
  },
  {
    id: 'look_font', name: 'Font', tags: ['Behind'], family: 'emphasis', maxWords: 5,
    font: 'Poppins, sans-serif', weight: 500, sizePx: 52, contextSizePx: 14,
    accentFont: 'PoppinsBold, Poppins, sans-serif', accentWeight: 700,
    behindSubject: true, depth: DEPTH_P, animIn: 'fadeUp', animInMs: 240, animOutMs: 140, positionYPct: 47.6, color: '#FFFFFF', accent: '#F021E8', shadow: { blurPx: 14, color: 'rgba(0,0,0,0.5)', offsetY: 3 },
    // DECLARED, not measured: no preview on their public site. Registry position.y_pct.
    // heroBox dropped: emphasis.role_split is true, which holds on 4 of 4 verified
    // lockups and neither verified two-box look — so this is a lockup, not a hero above a caption.
    // anchor 47.6 puts the ink on the declared 48.0% (accent-last probe)
    // FOCUSLINE declared, NOT anchored: face anchoring lives in the stack layout and this is an
    // emphasis lockup; it keeps its declared fixed position.
    // FACES from their row and frames: context Poppins Medium, hero Poppins Bold (one synthetic
    // bold drew both).
  },
  {
    id: 'look_gable', name: 'Gable', tags: ['Property'], family: 'story', story: 'agent', maxWords: 16,
    font: 'Poppins, sans-serif', weight: 500, sizePx: 52, contextSizePx: 14,
    accentFont: 'PoppinsBold, Poppins, sans-serif', accentWeight: 700,
    behindSubject: true, positionYPct: 50.0, color: '#FFFFFF', accent: '#F1F66F', shadow: { blurPx: 14, color: 'rgba(0,0,0,0.5)', offsetY: 3 },
    // THEIR AGENT STORY, as a scene (components/editor/property/AgentStoryScene.tsx): each caption
    // is planned into a headline behind the head (rearCaptionGeometry off the face track, in
    // difference blend — their yellow reads green over a bright room), an amount row clear of the
    // face, support words slotting in white, an icon or a focus. Grouped by their agent-story
    // breaks (no cost split; maxWords 16 is their maxWordsPerLine). positionYPct
    // 47 is their scene's own reference (.47): the box moves the whole scene from there.
    // anchor 43.5 puts the ink on its measured 43.9% with the accent last, as their lockups end.
    // (An earlier +1.4 'lockup offset' came from a probe whose hidden trailing words held space.)
    // FACES from their row and frames: context Poppins Medium, hero Poppins Bold (one synthetic
    // bold drew both).
  },
  {
    id: 'look_hassock', name: 'Hassock', tags: ['Property'], family: 'story', story: 'reel', reel: 'reach-counter', maxWords: 16,
    font: 'Poppins, sans-serif', weight: 500, sizePx: 52, contextSizePx: 14,
    accentFont: 'PoppinsBold, Poppins, sans-serif', accentWeight: 700,
    behindSubject: true, positionYPct: 50.0, color: '#FFFFFF', accent: '#EC00B5', shadow: { blurPx: 14, color: 'rgba(0,0,0,0.5)', offsetY: 3 },
    // THEIR REACH COUNTER reel, as a scene (components/editor/property/PropertyReelScene.tsx); their
    // registry: poppins-bold / poppins-medium (roboto figures for the counter), #EC00B5, positionYPct .47 — their previews sit .03H lower, as Gable's does, so 50 here.
    // anchor 21.9 puts the ink on its measured 22.2% with the accent last, as their lockups end.
    // (An earlier +1.4 'lockup offset' came from a probe whose hidden trailing words held space.)
    // FACES from their row and frames: context Poppins Medium, hero Poppins Bold (one synthetic
    // bold drew both).
  },
  {
    id: 'look_iron', name: 'Iron', tags: ['Property'], family: 'story', story: 'reel', reel: 'magenta-estate', maxWords: 16,
    font: 'Poppins, sans-serif', weight: 500, sizePx: 52, contextSizePx: 16,
    accentFont: 'PoppinsBold, Poppins, sans-serif', accentWeight: 700,
    behindSubject: true, positionYPct: 50.0, color: '#FFFFFF', accent: '#EC00B5', shadow: { blurPx: 14, color: 'rgba(0,0,0,0.5)', offsetY: 3 },
    // THEIR MAGENTA ESTATE reel, as a scene (components/editor/property/PropertyReelScene.tsx); their
    // registry: poppins-bold / poppins-medium (roboto figures for the counter), #EC00B5, positionYPct .47 — their previews sit .03H lower, as Gable's does, so 50 here.
    // anchor 51.7 puts the ink on its measured 52.0% with the accent last, as their lockups end.
    // (An earlier +1.4 'lockup offset' came from a probe whose hidden trailing words held space.)
    // FACES from their row and frames: context Poppins Medium, hero Poppins Bold (one synthetic
    // bold drew both).
  },
  {
    id: 'look_jamb', name: 'Jamb', tags: ['Property'], family: 'story', story: 'reel', reel: 'dimension-story', maxWords: 16,
    font: 'Poppins, sans-serif', weight: 500, sizePx: 52, contextSizePx: 14,
    accentFont: 'PoppinsBold, Poppins, sans-serif', accentWeight: 700,
    behindSubject: true, positionYPct: 50.0, color: '#FFFFFF', accent: '#EC00B5', shadow: { blurPx: 14, color: 'rgba(0,0,0,0.5)', offsetY: 3 },
    // THEIR DIMENSION STORY reel, as a scene (components/editor/property/PropertyReelScene.tsx); their
    // registry: poppins-bold / poppins-medium (roboto figures for the counter), #EC00B5, positionYPct .47 — their previews sit .03H lower, as Gable's does, so 50 here.
    // anchor 45.1 puts the ink on its measured 45.5% with the accent last, as their lockups end.
    // (An earlier +1.4 'lockup offset' came from a probe whose hidden trailing words held space.)
    // FACES from their row and frames: context Poppins Medium, hero Poppins Bold (one synthetic
    // bold drew both).
  },
  {
    id: 'look_keystone', name: 'Keystone', tags: ['Popular'], family: 'stack', maxWords: 4,
    font: '"Playfair Display", serif', weight: 600, sizePx: 14,
    positionYPct: 79.0, color: '#FFFFFF', accent: '#7FD3FF', animIn: 'fade', stack: { maxPerRow: 4, rowScale: [1.43, 1.9, 2.6], rowGapEm: -0.14 }, shadow: { blurPx: 14, color: 'rgba(0,0,0,0.5)', offsetY: 3 },
    // MEASURED: three-row stack ("THEN/SAY/less")
  },
  {
    id: 'look_lintel', name: 'Lintel', tags: ['Behind'], family: 'stack', maxWords: 5,
    font: 'InstrumentSans, sans-serif', weight: 600, sizePx: 24,
    accentFont: 'Inter, sans-serif', accentWeight: 900, letterSpacingEm: -0.025,
    behindSubject: true, depth: DEPTH_P, heroEnter: { kind: 'fadeRight', ms: 380, em: 0.55, outMs: 140 }, rowEnter: { kind: 'fadeUp', ms: 240, outMs: 120 }, heroFromStart: true, animIn: 'fadeUp', animInMs: 240, animOutMs: 140, positionYPct: 52.0, color: '#FFFFFF', accent: '#FFFFFF', stack: { maxPerRow: 4, rowScale: [1.16, 1.58, 1.66], rowGapEm: 0.035 }, glow: { blurPx: 3.75, alpha: 0.82 }, shadow: { blurPx: 3, color: 'rgba(0,0,0,0.5)', offsetY: 2 },
    // DECLARED, not measured: no preview on their public site. Registry position.y_pct.
    // ACCENT set explicitly to their declared emphasisColor even though it equals the base: an
    // omitted accent does not mean 'same as base', it falls through to the USER's accent colour,
    // which painted the spoken words cyan in a render.
    // NEON: DECLARED (role_effects neon); strength calibrated on Butter, the one neon look with footage
    // FACES from their row: Instrument Sans, hero Inter Black (it was Playfair for both). Their
    // Playfair 'pop' tier is not modelled.
  },
  {
    id: 'look_mullion', name: 'Mullion', tags: ['Behind'], family: 'karaoke', maxWords: 4,
    font: 'Baloo2, sans-serif', weight: 800, sizePx: 20, wordGapEm: 0.38,
    behindSubject: true, depth: DEPTH_P, positionYPct: 78.3, color: '#FFFFFF', accent: '#FFE14F', animIn: 'fade', animInMs: 30, restOpacity: 0.85, shadow: { blurPx: 16, color: 'rgba(0,0,0,0.6)', offsetY: 5 },
    impact: { font: 'Baloo2, sans-serif', weight: 800, sizePx: 82, yPct: 22.1, widthPct: 92, fitFactor: 0.761, uppercase: true },
    // FACES from their row: Baloo 2 for both roles (it was Luckiest Guy).
    // IMPACT MEASURED (30fps, hero keyed by colour, boxes checked on frames): WITH, LET, HIT all 10.4% tall at 44-70%
    // wide: one size (81-82), centre 21.9% within 0.1.
  },
];

export const LOOK_IDS: LookSpecId[] = LOOK_SPECS.map((l) => l.id);

/** The one lookup CaptionOverlay needs: is this style id a spec look? */
export function findLookSpec(id: string): LookSpec | undefined {
  return LOOK_SPECS.find((l) => l.id === id);
}

/**
 * Per-word jitter, hashed from the word id so it is stable across frames and identical in the
 * preview and every renderer. A random value per render would make the caption twitch.
 */
export function lookJitter(spec: LookSpec, wordId: string): CSSProperties {
  if (!spec.jitter) return {};
  // FNV-1a plus a final avalanche. A plain *31 hash does NOT diffuse: consecutive ids like w1 and
  // w2 land one apart, the angles differ by ~0.0007deg, and every word ends up jittered the same
  // way — jitter that does not jitter.
  let h = 2166136261;
  for (let i = 0; i < wordId.length; i++) {
    h ^= wordId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  const a = ((h >>> 0) % 2000) / 1000 - 1;          // -1..1
  const b = ((Math.imul(h, 0x27d4eb2d) >>> 0) % 2000) / 1000 - 1;
  return {
    transform: `rotate(${(a * spec.jitter.rotateDeg).toFixed(2)}deg) translateY(${(b * spec.jitter.yEm).toFixed(3)}em)`,
  };
}

/**
 * The impact word's size: the design's own size, unless that would run wider than its share of
 * the frame. `sizePx` is already scaled by the user's font control; `framePx` is the logical frame
 * width.
 */
export function impactPx(text: string, im: LookImpact, framePx: number, sizePx: number): number {
  const shown = im.uppercase ? text.toUpperCase() : text;
  const perPx = estTextWidth(shown, 1, im.fitFactor * fontWeightFactor(im.weight))
    + (im.letterSpacingEm ?? 0) * [...shown].length;
  if (!(perPx > 0)) return sizePx;
  return Math.min(sizePx, (framePx * im.widthPct) / 100 / perPx);
}

/**
 * Designs whose caption reads IN FRONT of the speaker while only a title goes behind: the cut-out
 * must be kept off the caption. Big Reveal is the hand-written case; a look with an impact word is
 * the same split, which every behind-subject route has to honour — the preview's layers, the
 * Element Capture composite and the render box's matte.
 */
export function splitsAroundSubject(styleId: string): boolean {
  if (styleId === 'big_reveal') return true;
  const l = findLookSpec(styleId);
  return !!(l?.behindSubject && (l.impact || l.family === 'story'));
}
