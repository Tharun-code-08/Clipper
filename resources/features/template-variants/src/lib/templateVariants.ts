// Curated per-template VARIANTS — breadth of browsable choice without a single new look.
//
// A variant is nothing but a NAMED BUNDLE OF OVERRIDE VALUES the existing renderers already
// read. There is no variant render code, no variant branch in any template, and no new field
// in the data model: applying one writes the same state the Templates/Text tabs already write
// (accentColor / captionTextColor / textOverrides / emphasisStyle / templateSlots), so every
// surface picks it up for free — the preview, the Lambda export and the in-browser export all
// render the SAME CaptionOverlay component (see LambdaCaptionComposition / CaptionExportComposition),
// so "honoured by the preview" and "honoured by every export path" are the same statement.
//
// ── WHICH FIELDS ARE LEGAL, AND WHY ─────────────────────────────────────────────────────────
// Derived from the real resolvers, not from taste. templateVariants.spec.ts asserts every one
// of these against the code rather than against a hand-written list, so a renderer change that
// stops honouring a field fails the suite instead of silently producing a dead variant.
//
//  1. textOverrides — reach a template only when it is NEITHER style-locked NOR font-locked:
//       · isStyleLocked()        → CaptionOverlay passes ov={} and emits no override CSS at all.
//       · FONT_LOCKED_STYLES     → those templates wrap their captions in [data-cfont-lock], and
//                                  every override selector is `:not([data-cfont-lock] *)`.
//     (illusion is style-locked but NOT font-locked; the style lock alone already excludes it.)
//     Within that, only the keys buildTextOverrideCSS ACTUALLY EMITS are usable:
//       fontFace · casing · underline · letterSpacing · wordSpacing · lineSpacing ·
//       shadow · stroke · background · align · color (GRADIENT MODE ONLY).
//     THREE FIELDS ARE TRAPS and are deliberately never used here:
//       · color in 'solid' mode — buildTextOverrideCSS has a gradient branch and NO solid branch,
//         so a solid fill is inert in the preview and in every live export. (Only the .ass fast
//         path reads it, and that path is disabled at source: ENABLE_RAILWAY_EXPORT = false.)
//       · fontFamily — emitted by fontCSS(), which CaptionOverlay never calls. The user's font
//         choice travels through captionCustomFont/buildCustomFontCss instead.
//       · fontSizePx — read by sizeMultiplier(), which CaptionOverlay never calls.
//     Recolouring therefore always goes through captionTextColor / accentColor / slots.
//
//  2. captionTextColor / accentColor — per-template. Some branches read the prop directly and
//     some read it through resolveUserColors() (which returns undefined while the control is
//     still at its global default, so the template keeps its signature colour). Either way the
//     branch has to MENTION it, so the spec scans each template's own branch in CaptionOverlay
//     for the identifier. black_punch, for instance, hardcodes #000000 and reads neither — so it
//     gets no colour variant. For userText/userAccent-gated templates a variant must also avoid
//     the global default value itself (#ffffff / #06b6d4), or the override resolves to undefined
//     and the variant would do nothing.
//
//  3. emphasisStyle — only the captik hero family renders [data-emph] spans and reads emphHex /
//     emphSizeMul, so isHeroTemplate() gates it. `size` is fit-guarded by rowFit(), so enlarging
//     the hero word can't push it out of the box.
//
//  4. templateSlots — the nine slot-driven templates. A variant may only write under its OWN
//     template key, and only keys its resolver returns (Object.keys(resolveXSlots())).
//
// ── WHAT A VARIANT MUST NEVER DO ────────────────────────────────────────────────────────────
//  · Touch the TYPEFACE of a FONT_LOCKED template. Those faces ARE the product (Bradley Hand for
//    Journal, Kaushan for Archives, the Playfair/TheBoldFont pairing for Aura…), which is exactly
//    what the data-cfont-lock exemption exists to protect. Enforced by the spec: no variant on a
//    font-locked template sets a slot key matching /font/i. illusion is not font-locked, so its
//    `font` slot is fair game — but only values from SLOT_FONT_CHOICES, which are the families
//    bundled in BOTH globals.css and buildFontsCss, so preview and export resolve identically.
//  · Set captionLines. It looks like look state but is not: handleCaptionLinesChange() RE-CHUNKS
//    the caption segments, which would silently destroy the user's manual caption edits.
//
// ── WHERE I DELIBERATELY GAVE FEW OR NO VARIANTS ────────────────────────────────────────────
//  · big_red — NONE. The template is "The Big Red": a huge vertically-stretched Times title in
//    one measured red gradient. That gradient is not an overridable field, the face is font-locked,
//    and textOverrides can't reach it (data-cfont-lock). All that is left is recolouring the small
//    white caption — which changes nothing anyone would call a variant. The look IS the colour.
//  · delhi (2) and pixelated (3) — colour only. Both are font-locked with inert textOverrides, so
//    captionTextColor is the single honest lever; the serif-italic pairing and the pixel face are
//    the templates themselves.
//  · black_punch (2) — typography only. It reads no colour prop (black fill + white ring are
//    hardcoded), and recolouring the fill would stop it being Black Punch.
//  · aura / aura_helvetica (3 each) — the role engine and its one flat face are the look; only the
//    accent and base ink are open without touching type.
// Templates that genuinely carry variation — the hero family, the slot-driven kinetic templates,
// and the plain colour-led rows — get 4-5.

import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import type { TextOverrides, EmphasisStyle, TemplateSlotOverrides } from '@/types/transcript';
import { DEFAULT_ACCENT, DEFAULT_CAPTION_TEXT } from '@/lib/captionColors';

/** The sparse bundle a variant applies. Every field is optional; absent = leave the base alone. */
export interface VariantOverrides {
  accentColor?:      string;
  captionTextColor?: string;
  textOverrides?:    Partial<TextOverrides>;
  emphasisStyle?:    Partial<EmphasisStyle>;
  templateSlots?:    TemplateSlotOverrides;
}

export interface TemplateVariant {
  /** Globally unique across every template (asserted). */
  id:        string;
  label:     string;
  overrides: VariantOverrides;
}

/** The look state a variant reads from and writes back to — the editor's own fields. */
export interface VariantLook {
  accentColor:      string;
  captionTextColor: string;
  textOverrides:    TextOverrides;
  emphasisStyle:    EmphasisStyle;
  templateSlots:    TemplateSlotOverrides;
}

// Shorthands keep the table readable and the shapes honest.
const shadow = (hex: string, opacity: number, x: number, y: number, blur: number) =>
  ({ hex, opacity, x, y, blur });
const face   = (weight: number, italic = false) => ({ weight, italic });

export const TEMPLATE_VARIANTS: Partial<Record<CaptionStyleId, TemplateVariant[]>> = {
  // ── Captik hero family — accent + context ink + the emphasis knobs ────────────────────────
  captik: [
    { id: 'captik-midnight', label: 'Midnight', overrides: { accentColor: '#7C5CFF', captionTextColor: '#E8E4FF' } },
    { id: 'captik-ember',    label: 'Ember',    overrides: { accentColor: '#FF6B35', captionTextColor: '#FFE9DF' } },
    { id: 'captik-mono',     label: 'Mono',     overrides: { accentColor: '#FFFFFF', captionTextColor: '#9AA0A6' } },
    { id: 'captik-mint',     label: 'Mint',     overrides: { accentColor: '#2BE8A5', captionTextColor: '#DFF7EE' } },
    { id: 'captik-punch',    label: 'Punch',    overrides: { accentColor: '#FF3D8B', captionTextColor: '#FFE3F0', emphasisStyle: { size: 1.7 } } },
  ],
  captik_glow: [
    { id: 'glow-cyan',   label: 'Cyan',   overrides: { accentColor: '#22D3EE', captionTextColor: '#CFFAFE' } },
    { id: 'glow-violet', label: 'Violet', overrides: { accentColor: '#A855F7', captionTextColor: '#F3E8FF' } },
    { id: 'glow-lime',   label: 'Lime',   overrides: { accentColor: '#A3E635', captionTextColor: '#ECFCCB' } },
    { id: 'glow-rose',   label: 'Rose',   overrides: { accentColor: '#FB7185', captionTextColor: '#FFE4E6' } },
    { id: 'glow-gold',   label: 'Gold',   overrides: { accentColor: '#FBBF24', captionTextColor: '#FEF3C7', emphasisStyle: { size: 1.6 } } },
  ],
  captik_shadow: [
    { id: 'shadow-steel',   label: 'Steel',   overrides: { accentColor: '#93C5FD', captionTextColor: '#E5E7EB' } },
    { id: 'shadow-amber',   label: 'Amber',   overrides: { accentColor: '#F59E0B', captionTextColor: '#FDE68A' } },
    { id: 'shadow-emerald', label: 'Emerald', overrides: { accentColor: '#34D399', captionTextColor: '#D1FAE5' } },
    { id: 'shadow-mono',    label: 'Mono',    overrides: { accentColor: '#FFFFFF', captionTextColor: '#A1A1AA' } },
  ],

  // ── Big Reveal — the yellow title is per-word emphasis, so only the lower caption is open ──
  big_reveal: [
    { id: 'reveal-cool', label: 'Cool',  overrides: { captionTextColor: '#BFDBFE' } },
    { id: 'reveal-warm', label: 'Warm',  overrides: { captionTextColor: '#FED7AA' } },
    { id: 'reveal-heavy', label: 'Heavy', overrides: { textOverrides: { fontFace: face(900) } } },
  ],

  // ── Colour-led rows ───────────────────────────────────────────────────────────────────────
  ali_abdaal: [
    { id: 'ali-navy',    label: 'Navy',    overrides: { captionTextColor: '#1E3A8A' } },
    { id: 'ali-crimson', label: 'Crimson', overrides: { captionTextColor: '#9F1239' } },
    { id: 'ali-heavy',   label: 'Heavy',   overrides: { textOverrides: { fontFace: face(900) } } },
  ],
  clean_motion: [
    { id: 'motion-sky',  label: 'Sky',  overrides: { captionTextColor: '#7DD3FC' } },
    { id: 'motion-sand', label: 'Sand', overrides: { captionTextColor: '#FDE68A' } },
    { id: 'motion-bold', label: 'Bold', overrides: { textOverrides: { fontFace: face(800) } } },
    { id: 'motion-soft', label: 'Soft', overrides: { captionTextColor: '#E5E7EB', textOverrides: { fontFace: face(300) } } },
  ],
  bubble: [
    { id: 'bubble-coral',  label: 'Coral',  overrides: { accentColor: '#FB7185' } },
    { id: 'bubble-violet', label: 'Violet', overrides: { accentColor: '#A78BFA' } },
    { id: 'bubble-amber',  label: 'Amber',  overrides: { accentColor: '#FBBF24' } },
    { id: 'bubble-dim',    label: 'Dim',    overrides: { captionTextColor: '#A1A1AA' } },
  ],
  hormozi: [
    // hormozi REBUILDS its lime ramp from userText, so a colour here restyles the whole gradient.
    { id: 'hormozi-ice',     label: 'Ice',     overrides: { captionTextColor: '#7DD3FC' } },
    { id: 'hormozi-magenta', label: 'Magenta', overrides: { captionTextColor: '#F472B6' } },
    { id: 'hormozi-gold',    label: 'Gold',    overrides: { captionTextColor: '#FACC15' } },
    { id: 'hormozi-bone',    label: 'Bone',    overrides: { captionTextColor: '#F8FAFC' } },
  ],
  boxed: [
    { id: 'boxed-red',  label: 'Red',  overrides: { accentColor: '#DC2626' } },
    { id: 'boxed-blue', label: 'Blue', overrides: { accentColor: '#2563EB' } },
    { id: 'boxed-ink',  label: 'Ink',  overrides: { accentColor: '#111111' } },
    { id: 'boxed-lime', label: 'Lime', overrides: { accentColor: '#84CC16', captionTextColor: '#111111' } },
  ],
  mrbeast: [
    { id: 'mrb-gold',  label: 'Gold',  overrides: { captionTextColor: '#FFD54A' } },
    { id: 'mrb-sky',   label: 'Sky',   overrides: { captionTextColor: '#67E8F9' } },
    { id: 'mrb-rose',  label: 'Rose',  overrides: { captionTextColor: '#FF7597' } },
    { id: 'mrb-lower', label: 'Lower', overrides: { textOverrides: { casing: 'lower' } } },
  ],
  mr_beast_2: [
    { id: 'mrb2-platinum', label: 'Platinum', overrides: { captionTextColor: '#E5E7EB' } },
    { id: 'mrb2-cyan',     label: 'Cyan',     overrides: { captionTextColor: '#22D3EE' } },
    { id: 'mrb2-lower',    label: 'Lower',    overrides: { textOverrides: { casing: 'lower' } } },
  ],
  iman_gadzhi: [
    { id: 'iman-warm',  label: 'Warm',  overrides: { captionTextColor: '#F5E6D3' } },
    { id: 'iman-cool',  label: 'Cool',  overrides: { captionTextColor: '#C7D2FE' } },
    { id: 'iman-light', label: 'Light', overrides: { textOverrides: { fontFace: face(300) } } },
    { id: 'iman-lower', label: 'Lower', overrides: { textOverrides: { casing: 'lower' } } },
  ],
  prism: [
    { id: 'prism-teal',  label: 'Teal',  overrides: { captionTextColor: '#2DD4BF' } },
    { id: 'prism-amber', label: 'Amber', overrides: { captionTextColor: '#F59E0B' } },
    { id: 'prism-lower', label: 'Lower', overrides: { textOverrides: { casing: 'lower' } } },
  ],
  highlighted_word: [
    { id: 'hw-red',   label: 'Red',   overrides: { accentColor: '#EF4444' } },
    { id: 'hw-green', label: 'Green', overrides: { accentColor: '#22C55E' } },
    { id: 'hw-blue',  label: 'Blue',  overrides: { accentColor: '#3B82F6' } },
    { id: 'hw-dim',   label: 'Dim',   overrides: { captionTextColor: '#9CA3AF' } },
  ],
  clean_glow: [
    { id: 'cg-ice',  label: 'Ice',  overrides: { captionTextColor: '#BAE6FD' } },
    { id: 'cg-warm', label: 'Warm', overrides: { captionTextColor: '#FED7AA' } },
    { id: 'cg-bold', label: 'Bold', overrides: { textOverrides: { fontFace: face(700) } } },
  ],
  captik_clean: [
    { id: 'cc-cream',  label: 'Cream',  overrides: { captionTextColor: '#FDF6E3' } },
    { id: 'cc-sky',    label: 'Sky',    overrides: { captionTextColor: '#BFDBFE' } },
    { id: 'cc-bold',   label: 'Bold',   overrides: { textOverrides: { fontFace: face(700) } } },
    { id: 'cc-shadow', label: 'Shadow', overrides: { textOverrides: { shadow: shadow('#000000', 75, 0, 2, 6) } } },
  ],
  black_punch: [
    // No colour prop is read (black fill + white ring are hardcoded) — typography only, and only
    // narrowing changes, so the ring can never be pushed over a neighbouring glyph.
    { id: 'bp-lower',     label: 'Lower',     overrides: { textOverrides: { casing: 'lower' } } },
    { id: 'bp-condensed', label: 'Condensed', overrides: { textOverrides: { letterSpacing: -0.5 } } },
  ],
  captik_word: [
    { id: 'cw-amber', label: 'Amber', overrides: { captionTextColor: '#FBBF24' } },
    { id: 'cw-mint',  label: 'Mint',  overrides: { captionTextColor: '#6EE7B7' } },
    { id: 'cw-bold',  label: 'Bold',  overrides: { textOverrides: { fontFace: face(800) } } },
    { id: 'cw-quiet', label: 'Quiet', overrides: { captionTextColor: '#D4D4D8', textOverrides: { fontFace: face(400) } } },
  ],
  liquid_glass: [
    { id: 'lg-ice',  label: 'Ice',  overrides: { captionTextColor: '#E0F2FE' } },
    { id: 'lg-gold', label: 'Gold', overrides: { captionTextColor: '#FDE68A' } },
    { id: 'lg-bold', label: 'Bold', overrides: { textOverrides: { fontFace: face(600) } } },
  ],
  tabahi: [
    { id: 'tab-yellow', label: 'Yellow', overrides: { captionTextColor: '#FDE047' } },
    { id: 'tab-cyan',   label: 'Cyan',   overrides: { captionTextColor: '#22D3EE' } },
    { id: 'tab-lower',  label: 'Lower',  overrides: { textOverrides: { casing: 'lower' } } },
  ],
  deep_glow: [
    // deep_glow's glow colour IS userText, so these restyle the whole neon.
    { id: 'dg-cyan',   label: 'Cyan',   overrides: { captionTextColor: '#22D3EE' } },
    { id: 'dg-lime',   label: 'Lime',   overrides: { captionTextColor: '#A3E635' } },
    { id: 'dg-orange', label: 'Orange', overrides: { captionTextColor: '#FB923C' } },
    { id: 'dg-lower',  label: 'Lower',  overrides: { textOverrides: { casing: 'lower' } } },
  ],
  seedha_saadha: [
    { id: 'ss-yellow', label: 'Yellow', overrides: { captionTextColor: '#FACC15' } },
    { id: 'ss-red',    label: 'Red',    overrides: { captionTextColor: '#EF4444' } },
    { id: 'ss-lower',  label: 'Lower',  overrides: { textOverrides: { casing: 'lower' } } },
  ],
  thora_cinematic: [
    { id: 'tc-warm',  label: 'Warm',  overrides: { captionTextColor: '#F5E6D3' } },
    { id: 'tc-cool',  label: 'Cool',  overrides: { captionTextColor: '#C7D2FE' } },
    { id: 'tc-tight', label: 'Tight', overrides: { textOverrides: { letterSpacing: 1 } } },
  ],

  // ── Font-locked, colour-only ──────────────────────────────────────────────────────────────
  delhi: [
    { id: 'delhi-warm', label: 'Warm', overrides: { captionTextColor: '#FDE8D0' } },
    { id: 'delhi-cool', label: 'Cool', overrides: { captionTextColor: '#CBD5E1' } },
  ],
  pixelated: [
    { id: 'px-green', label: 'Green', overrides: { captionTextColor: '#4ADE80' } },
    { id: 'px-amber', label: 'Amber', overrides: { captionTextColor: '#FBBF24' } },
    { id: 'px-cyan',  label: 'Cyan',  overrides: { captionTextColor: '#22D3EE' } },
  ],

  // ── Slot-driven kinetic templates ─────────────────────────────────────────────────────────
  illusion: [
    // illusion is style-locked but NOT font-locked, so its `font` slot is legitimately open.
    // Values must come from SLOT_FONT_CHOICES (bundled in both preview and export).
    { id: 'il-amber',  label: 'Amber',  overrides: { templateSlots: { illusion: { baseColor: '#F5F5F4', emphColor: '#F59E0B' } } } },
    { id: 'il-cyan',   label: 'Cyan',   overrides: { templateSlots: { illusion: { baseColor: '#E0F2FE', emphColor: '#22D3EE' } } } },
    { id: 'il-blur',   label: 'Blur',   overrides: { templateSlots: { illusion: { glitchStyle: 'blur' } } } },
    { id: 'il-strobe', label: 'Strobe', overrides: { templateSlots: { illusion: { glitchStyle: 'flicker' } } } },
    { id: 'il-anton',  label: 'Anton',  overrides: { templateSlots: { illusion: { font: "'Anton', sans-serif" } } } },
  ],
  editor_masala: [
    { id: 'em-amber',  label: 'Amber',  overrides: { templateSlots: { editor_masala: { heroBColor: '#FFA800', contextColor: '#F3F4F6' } } } },
    { id: 'em-ice',    label: 'Ice',    overrides: { templateSlots: { editor_masala: { heroBColor: '#7DD3FC', heroAColor: '#E0F2FE', contextColor: '#CBD5E1' } } } },
    { id: 'em-script', label: 'Script', overrides: { templateSlots: { editor_masala: { personaMode: 'A' } } } },
    // A fourth variant pinning personaMode:'B' ("Punch") was authored and then DROPPED: the
    // clipping sweep measured it overflowing the box by 57.8px on the Tamil phrase at scale 1.6
    // where the stock look overflows by 43px. Persona B sets the hero to weight 900 against
    // persona A's 600, and the fit guard estimates width from a char table that ignores weight,
    // so the extra ink is never compensated for. Persona B still appears on its own through the
    // template's seeded coin-flip; what a variant may not do is pin the heavier one deterministically.
  ],
  aura: [
    { id: 'aura-coral', label: 'Coral', overrides: { templateSlots: { aura: { accentColor: '#FF6B6B' } } } },
    { id: 'aura-mint',  label: 'Mint',  overrides: { templateSlots: { aura: { accentColor: '#4ADE80', baseColor: '#F0FDF4' } } } },
    { id: 'aura-ice',   label: 'Ice',   overrides: { templateSlots: { aura: { accentColor: '#38BDF8', baseColor: '#E0F2FE' } } } },
  ],
  aura_helvetica: [
    { id: 'swiss-red',  label: 'Red',  overrides: { templateSlots: { aura_helvetica: { accentColor: '#EF4444' } } } },
    { id: 'swiss-mono', label: 'Mono', overrides: { templateSlots: { aura_helvetica: { accentColor: '#FFFFFF', baseColor: '#A3A3A3' } } } },
    { id: 'swiss-blue', label: 'Blue', overrides: { templateSlots: { aura_helvetica: { accentColor: '#3B82F6' } } } },
  ],
  scribble: [
    { id: 'scr-mint', label: 'Mint', overrides: { templateSlots: { scribble: { markerColor: '#7EE7C7', penColor: '#3B82F6' } } } },
    { id: 'scr-pink', label: 'Pink', overrides: { templateSlots: { scribble: { markerColor: '#FBCFE8', penColor: '#DB2777' } } } },
    { id: 'scr-noir', label: 'Noir', overrides: { templateSlots: { scribble: { noteColor: '#F5F5F4', markerColor: '#A3A3A3', inkColor: '#111111', penColor: '#EF4444' } } } },
    { id: 'scr-sky',  label: 'Sky',  overrides: { templateSlots: { scribble: { noteColor: '#F8FAFC', markerColor: '#BAE6FD', penColor: '#0EA5E9' } } } },
  ],
  archives: [
    { id: 'arc-ivory', label: 'Ivory', overrides: { templateSlots: { archives: { inkColor: '#F5EFE6' } } } },
    { id: 'arc-gold',  label: 'Gold',  overrides: { templateSlots: { archives: { inkColor: '#E8C88A', emphColor: '#FFD98E' } } } },
    { id: 'arc-clean', label: 'Clean', overrides: { templateSlots: { archives: { showScrawl: false, boilAmount: 'low' } } } },
    { id: 'arc-heavy', label: 'Heavy', overrides: { templateSlots: { archives: { boilAmount: 'high' } } } },
  ],
  blockbuster: [
    { id: 'bb-blue', label: 'Blue', overrides: { templateSlots: { blockbuster: { redColor: '#2563EB' } } } },
    { id: 'bb-gold', label: 'Gold', overrides: { templateSlots: { blockbuster: { redColor: '#F59E0B', scriptColor: '#FFF7ED' } } } },
    { id: 'bb-noir', label: 'Noir', overrides: { templateSlots: { blockbuster: { glowAmount: 'off', shadowAmount: 'high' } } } },
    { id: 'bb-neon', label: 'Neon', overrides: { templateSlots: { blockbuster: { glowAmount: 'high' } } } },
  ],
  interlock: [
    { id: 'il2-amber', label: 'Amber', overrides: { templateSlots: { interlock: { heroColor: '#F5C77E', capsColor: '#F7F4EE' } } } },
    { id: 'il2-mono',  label: 'Mono',  overrides: { templateSlots: { interlock: { heroColor: '#FFFFFF', capsColor: '#9CA3AF' } } } },
    { id: 'il2-wide',  label: 'Wide',  overrides: { templateSlots: { interlock: { tracking: 'wide', capsSize: 'small' } } } },
    { id: 'il2-lower', label: 'Lower', overrides: { templateSlots: { interlock: { uppercase: false } } } },
  ],
  journal: [
    { id: 'jn-ink',   label: 'Ink',   overrides: { templateSlots: { journal: { color: '#F8FAFC', exitColor: '#38BDF8' } } } },
    { id: 'jn-gold',  label: 'Gold',  overrides: { templateSlots: { journal: { color: '#FFF7ED', exitColor: '#F59E0B' } } } },
    { id: 'jn-bold',  label: 'Bold',  overrides: { templateSlots: { journal: { weight: 'bold' } } } },
    { id: 'jn-soft',  label: 'Soft',  overrides: { templateSlots: { journal: { entrance: 'soft', exitLead: 'long' } } } },
    { id: 'jn-quick', label: 'Quick', overrides: { templateSlots: { journal: { exitLead: 'short', sweep: 'tight' } } } },
  ],
};

/** Variants offered for a template (empty when the look IS the colour/typography). */
export function variantsFor(styleId: string): TemplateVariant[] {
  return TEMPLATE_VARIANTS[styleId as CaptionStyleId] ?? [];
}

/** Look up one variant within a template; undefined when the id belongs to another template. */
export function findVariant(styleId: string, variantId: string | null | undefined): TemplateVariant | undefined {
  if (!variantId) return undefined;
  return variantsFor(styleId).find(v => v.id === variantId);
}

/** True when `variantId` belongs to `styleId` — the test a template switch uses to drop a stale id. */
export function variantBelongsTo(styleId: string, variantId: string | null | undefined): boolean {
  return !!findVariant(styleId, variantId);
}

/** Every field name any variant of this template can touch — the reset surface for "Original". */
export interface VariantFieldSurface {
  accentColor:      boolean;
  captionTextColor: boolean;
  textKeys:         (keyof TextOverrides)[];
  emphKeys:         (keyof EmphasisStyle)[];
  slotKeys:         Partial<Record<keyof TemplateSlotOverrides, string[]>>;
}

export function variantFieldSurface(styleId: string): VariantFieldSurface {
  const out: VariantFieldSurface = {
    accentColor: false, captionTextColor: false, textKeys: [], emphKeys: [], slotKeys: {},
  };
  const text = new Set<string>(), emph = new Set<string>();
  const slots = new Map<string, Set<string>>();
  for (const v of variantsFor(styleId)) {
    const o = v.overrides;
    if (o.accentColor !== undefined)      out.accentColor = true;
    if (o.captionTextColor !== undefined) out.captionTextColor = true;
    for (const k of Object.keys(o.textOverrides ?? {}))  text.add(k);
    for (const k of Object.keys(o.emphasisStyle ?? {}))  emph.add(k);
    for (const [tpl, fields] of Object.entries(o.templateSlots ?? {})) {
      if (!slots.has(tpl)) slots.set(tpl, new Set());
      for (const k of Object.keys(fields ?? {})) slots.get(tpl)!.add(k);
    }
  }
  out.textKeys = [...text] as (keyof TextOverrides)[];
  out.emphKeys = [...emph] as (keyof EmphasisStyle)[];
  for (const [tpl, keys] of slots) out.slotKeys[tpl as keyof TemplateSlotOverrides] = [...keys];
  return out;
}

/**
 * Apply a variant on top of the current look. Pure — returns a new VariantLook and never
 * mutates its input, so the caller can hand each field straight to its own setState.
 */
export function applyVariant(base: VariantLook, variant: TemplateVariant): VariantLook {
  const o = variant.overrides;
  const templateSlots: TemplateSlotOverrides = { ...base.templateSlots };
  for (const [tpl, fields] of Object.entries(o.templateSlots ?? {})) {
    const key = tpl as keyof TemplateSlotOverrides;
    templateSlots[key] = { ...(templateSlots[key] ?? {}), ...(fields ?? {}) } as never;
  }
  return {
    accentColor:      o.accentColor      ?? base.accentColor,
    captionTextColor: o.captionTextColor ?? base.captionTextColor,
    textOverrides:    { ...base.textOverrides, ...(o.textOverrides ?? {}) },
    emphasisStyle:    { ...base.emphasisStyle, ...(o.emphasisStyle ?? {}) },
    templateSlots,
  };
}

/**
 * "Original" — return every field this template's variants can touch to its STOCK value:
 * the editor's global colour defaults, and, for the sparse bundles, key removal so each
 * resolver falls back to the template's own built-in default. Pure.
 */
export function clearVariant(base: VariantLook, styleId: string): VariantLook {
  const surface = variantFieldSurface(styleId);
  const textOverrides = { ...base.textOverrides };
  for (const k of surface.textKeys) delete textOverrides[k];
  const emphasisStyle = { ...base.emphasisStyle };
  for (const k of surface.emphKeys) delete emphasisStyle[k];
  const templateSlots: TemplateSlotOverrides = { ...base.templateSlots };
  for (const [tpl, keys] of Object.entries(surface.slotKeys)) {
    const key = tpl as keyof TemplateSlotOverrides;
    const current = templateSlots[key];
    if (!current) continue;
    const next = { ...current } as Record<string, unknown>;
    for (const k of keys ?? []) delete next[k];
    if (Object.keys(next).length) templateSlots[key] = next as never;
    else delete templateSlots[key];
  }
  return {
    accentColor:      surface.accentColor      ? DEFAULT_ACCENT       : base.accentColor,
    captionTextColor: surface.captionTextColor ? DEFAULT_CAPTION_TEXT : base.captionTextColor,
    textOverrides, emphasisStyle, templateSlots,
  };
}

/** Total across every template — used by the picker's copy and by the test that pins the count. */
export function totalVariantCount(): number {
  return Object.values(TEMPLATE_VARIANTS).reduce((n, list) => n + (list?.length ?? 0), 0);
}
