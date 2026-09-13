// Shared resolver for the reference-parity styling system.
//
// One override model, four render surfaces: the live CaptionOverlay (DOM), the
// Remotion compositions (Lambda + web-renderer), the .ass fast path, and the
// Adobe plugin specs. Every surface calls THESE helpers so a control change in
// the Text tab means the same pixels everywhere.
//
// Merge order (sparse — undefined means "template default"):
//   template base → global TextOverrides → per-line LineOverride.text → per-word styleOverride
//
// Pure functions only: imported by both client components and Remotion entries.

import type {
  TextOverrides, LineOverride, TextColorConfig, GradientStop, ShadowConfig,
  StrokeConfig, BackgroundConfig, TextCasing, EmphasisStyle,
} from '@/types/transcript';
import type { CSSProperties } from 'react';

/** The px value the Text-tab Size slider shows when nothing is overridden.
    fontSizePx maps onto the existing captionFontScale: scale = px / BASE. */
export const BASE_FONT_PX = 32;

/** Templates whose typography/layout is the product — Text-tab overrides are
    disabled for these and never applied at render time. */
export const STYLE_LOCKED_TEMPLATES = ['editor_masala', 'illusion', 'aura', 'aura_helvetica', 'scribble', 'archives', 'blockbuster', 'interlock', 'journal'] as const;
export function isStyleLocked(styleId: string): boolean {
  return (STYLE_LOCKED_TEMPLATES as readonly string[]).includes(styleId);
}

/** Captik hero family — templates with the splash emphasis layout that gain the
    Layout (Splash | Center) toggle and the Spotlight emphasis mode. */
export const HERO_TEMPLATES = ['captik', 'captik_glow', 'captik_shadow'] as const;
export function isHeroTemplate(styleId: string): boolean {
  return (HERO_TEMPLATES as readonly string[]).includes(styleId);
}

/** Merge global + per-line text overrides (line wins, field by field). */
export function mergeTextOverrides(
  global: TextOverrides | undefined,
  line: Partial<TextOverrides> | undefined,
): TextOverrides {
  return { ...(global ?? {}), ...(line ?? {}) };
}

/** Resolve the effective overrides for a segment, honouring locked templates. */
export function effectiveTextOverrides(
  styleId: string,
  global: TextOverrides | undefined,
  lineOverride: LineOverride | undefined,
): TextOverrides {
  if (isStyleLocked(lineOverride?.styleId ?? styleId)) return {};
  return mergeTextOverrides(global, lineOverride?.text);
}

// ── Casing ────────────────────────────────────────────────────────────────────

/** Transform the actual string (needed for .ass which has no text-transform). */
export function applyCasing(text: string, casing: TextCasing | undefined): string {
  if (!casing) return text;
  if (casing === 'upper') return text.toUpperCase();
  if (casing === 'lower') return text.toLowerCase();
  // capitalize: first letter of each word (Unicode-aware enough for Latin + Indic)
  return text.replace(/(^|\s)(\S)/g, (_, sp: string, ch: string) => sp + ch.toUpperCase());
}

// ── Colors ────────────────────────────────────────────────────────────────────

export function hexWithOpacity(hex: string, opacityPct: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const a = Math.round(Math.max(0, Math.min(100, opacityPct)) * 2.55);
  return `#${full}${a.toString(16).padStart(2, '0')}`;
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Sample the gradient at position t∈[0,1] → solid hex. Used for the .ass
    approximation and char-level fills. */
export function gradientColorAt(stops: GradientStop[], t: number): string {
  if (!stops.length) return '#ffffff';
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if (t <= sorted[0].pos) return sorted[0].hex;
  if (t >= sorted[sorted.length - 1].pos) return sorted[sorted.length - 1].hex;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (t >= a.pos && t <= b.pos) {
      const f = b.pos === a.pos ? 0 : (t - a.pos) / (b.pos - a.pos);
      const pa = parseHex(a.hex), pb = parseHex(b.hex);
      return `#${[lerpChannel(pa[0], pb[0], f), lerpChannel(pa[1], pb[1], f), lerpChannel(pa[2], pb[2], f)]
        .map(c => c.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return sorted[sorted.length - 1].hex;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16) || 255, parseInt(full.slice(2, 4), 16) || 255, parseInt(full.slice(4, 6), 16) || 255];
}

export function gradientCSS(stops: GradientStop[], angle: number): string {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const parts = sorted.map(s => `${s.hex} ${Math.round(s.pos * 100)}%`).join(', ');
  return `linear-gradient(${angle}deg, ${parts})`;
}

/** CSS for a text span filled per the color config. Gradient uses
    background-clip:text — supported by the preview, Lambda Chrome and the
    in-browser web-renderer alike. */
export function textFillCSS(color: TextColorConfig | undefined): CSSProperties {
  if (!color) return {};
  if (color.mode === 'solid') return { color: color.hex };
  return {
    backgroundImage: gradientCSS(color.stops, color.angle),
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
  };
}

// ── Effects ───────────────────────────────────────────────────────────────────

export function shadowCSS(shadow: ShadowConfig | undefined, sz: (n: number) => number): CSSProperties {
  if (!shadow) return {};
  return { textShadow: `${sz(shadow.x)}px ${sz(shadow.y)}px ${sz(shadow.blur)}px ${hexWithOpacity(shadow.hex, shadow.opacity)}` };
}

export function strokeCSS(stroke: StrokeConfig | undefined, sz: (n: number) => number): CSSProperties {
  if (!stroke) return {};
  return {
    WebkitTextStroke: `${sz(stroke.width)}px ${hexWithOpacity(stroke.hex, stroke.opacity)}`,
    paintOrder: 'stroke fill',
  } as CSSProperties;
}

export function backgroundCSS(bg: BackgroundConfig | undefined, sz: (n: number) => number): CSSProperties {
  if (!bg) return {};
  const radius = typeof bg.radius === 'number'
    ? `${sz(bg.radius)}px`
    : `${sz(bg.radius.tl)}px ${sz(bg.radius.tr)}px ${sz(bg.radius.br)}px ${sz(bg.radius.bl)}px`;
  const css: CSSProperties = {
    backgroundColor: hexWithOpacity(bg.hex, bg.opacity),
    borderRadius: radius,
    padding: `${sz(bg.padH)}px ${sz(bg.padW)}px`,
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  } as CSSProperties;
  if (bg.shadows?.length) {
    css.boxShadow = bg.shadows
      .map(s => `${sz(s.x)}px ${sz(s.y)}px ${sz(s.blur)}px ${hexWithOpacity(s.hex, s.opacity)}`)
      .join(', ');
  }
  if (bg.outline && bg.outline.width > 0) {
    css.outline = `${sz(bg.outline.width)}px solid ${hexWithOpacity(bg.outline.hex, bg.outline.opacity)}`;
    css.outlineOffset = `${sz(bg.outline.offset)}px`;
  }
  return css;
}

// ── Typography ────────────────────────────────────────────────────────────────

export function fontCSS(ov: TextOverrides): CSSProperties {
  const css: CSSProperties = {};
  if (ov.fontFamily) css.fontFamily = `'${ov.fontFamily}', sans-serif`;
  if (ov.fontFace) {
    css.fontWeight = ov.fontFace.weight;
    css.fontStyle = ov.fontFace.italic ? 'italic' : 'normal';
  }
  if (ov.underline) css.textDecoration = 'underline';
  if (ov.casing) {
    // DOM surfaces can use text-transform; .ass callers must use applyCasing().
    css.textTransform = ov.casing === 'upper' ? 'uppercase' : ov.casing === 'lower' ? 'lowercase' : 'capitalize';
  }
  return css;
}

export function spacingCSS(ov: TextOverrides, sz: (n: number) => number): CSSProperties {
  const css: CSSProperties = {};
  if (typeof ov.letterSpacing === 'number' && ov.letterSpacing !== 0) css.letterSpacing = `${sz(ov.letterSpacing)}px`;
  if (typeof ov.wordSpacing === 'number') css.columnGap = `${sz(Math.max(0, ov.wordSpacing))}px`;
  if (typeof ov.lineSpacing === 'number') css.lineHeight = ov.lineSpacing;
  return css;
}

/** Extra multiplier the Size control adds on top of captionFontScale. */
export function sizeMultiplier(ov: TextOverrides): number {
  return typeof ov.fontSizePx === 'number' && ov.fontSizePx > 0 ? ov.fontSizePx / BASE_FONT_PX : 1;
}

/** Everything except the per-word fill — one spread for phrase containers. */
export function containerCSS(ov: TextOverrides, sz: (n: number) => number): CSSProperties {
  return {
    ...fontCSS(ov),
    ...spacingCSS(ov, sz),
    ...shadowCSS(ov.shadow, sz),
    ...strokeCSS(ov.stroke, sz),
    ...(ov.align ? { textAlign: ov.align } : {}),
  };
}

// ── Scoped CSS injection ──────────────────────────────────────────────────────
//
// The override mechanism mirrors the proven custom-font pattern: the caption
// tree is wrapped in [data-captik-tov] and a <style> block forces the overrides
// onto caption <span>s / row containers with !important — no per-template code.
//   · word-level props target  span:not([data-cfont-lock] *):not([data-emph])
//   · emphasis props target    span[data-emph]
//   · line-level props target  [data-cap-row] (each phrase/section row)
// Locked templates pass ov={} so the block is empty for them.

export function buildTextOverrideCSS(
  ov: TextOverrides,
  emph: EmphasisStyle | undefined,
  sz: (n: number) => number,
): string {
  const word: string[] = [];
  const allSpans: string[] = [];
  const row: string[] = [];
  const emphRules: string[] = [];

  if (ov.fontFace) {
    allSpans.push(`font-weight:${ov.fontFace.weight} !important`);
    allSpans.push(`font-style:${ov.fontFace.italic ? 'italic' : 'normal'} !important`);
  }
  if (ov.casing) {
    allSpans.push(`text-transform:${ov.casing === 'upper' ? 'uppercase' : ov.casing === 'lower' ? 'lowercase' : 'capitalize'} !important`);
  }
  if (ov.underline) allSpans.push('text-decoration:underline !important');
  if (typeof ov.letterSpacing === 'number' && ov.letterSpacing !== 0) allSpans.push(`letter-spacing:${sz(ov.letterSpacing)}px !important`);
  // NOTE: line spacing is applied at the ROW level below (flex row-gap + stacked-row margin),
  // NOT as line-height on inline words — line-height on flex items doesn't move the wrapped/
  // stacked line boxes apart, which is why the slider appeared to do nothing.
  if (ov.shadow) {
    allSpans.push(`text-shadow:${sz(ov.shadow.x)}px ${sz(ov.shadow.y)}px ${sz(ov.shadow.blur)}px ${hexWithOpacity(ov.shadow.hex, ov.shadow.opacity)} !important`);
  }
  if (ov.stroke) {
    allSpans.push(`-webkit-text-stroke:${sz(ov.stroke.width)}px ${hexWithOpacity(ov.stroke.hex, ov.stroke.opacity)} !important`);
    allSpans.push('paint-order:stroke fill !important');
  }
  if (ov.color?.mode === 'gradient') {
    word.push(`background-image:${gradientCSS(ov.color.stops, ov.color.angle)} !important`);
    word.push('-webkit-background-clip:text !important');
    word.push('background-clip:text !important');
    word.push('color:transparent !important');
    word.push('-webkit-text-fill-color:transparent !important');
    if (ov.color.level === 'char') {
      // Per-character approximation: repeat the gradient every ~1 character.
      word.push('background-size:1.1ch 100% !important');
      word.push('background-repeat:repeat !important');
    }
  }
  if (ov.background) {
    const bg = ov.background;
    const radius = typeof bg.radius === 'number'
      ? `${sz(bg.radius)}px`
      : `${sz(bg.radius.tl)}px ${sz(bg.radius.tr)}px ${sz(bg.radius.br)}px ${sz(bg.radius.bl)}px`;
    row.push(`background:${hexWithOpacity(bg.hex, bg.opacity)} !important`);
    row.push(`border-radius:${radius} !important`);
    row.push(`padding:${sz(bg.padH / 2)}px ${sz(bg.padW / 2)}px !important`);
    if (bg.shadows?.length) {
      row.push(`box-shadow:${bg.shadows.map(s => `${sz(s.x)}px ${sz(s.y)}px ${sz(s.blur)}px ${hexWithOpacity(s.hex, s.opacity)}`).join(', ')} !important`);
    }
    if (bg.outline && bg.outline.width > 0) {
      row.push(`outline:${sz(bg.outline.width)}px solid ${hexWithOpacity(bg.outline.hex, bg.outline.opacity)} !important`);
      row.push(`outline-offset:${sz(bg.outline.offset)}px !important`);
    }
  }
  if (ov.align) {
    const jc = ov.align === 'left' ? 'flex-start' : ov.align === 'right' ? 'flex-end' : 'center';
    row.push(`justify-content:${jc} !important`);
    row.push(`text-align:${ov.align} !important`);
  }

  // Line spacing → ROW-level gap. Caption rows are flex containers, so the vertical gap between
  // WRAPPED words is row-gap; between STACKED phrase rows it's the adjacent-sibling margin added
  // in the CSS assembly below. Convert the line-height multiplier to logical px vs the base font
  // (1.0 = tight, 2.0 ≈ +1 line height of gap); never negative.
  const lineGapPx = typeof ov.lineSpacing === 'number' ? Math.max(0, (ov.lineSpacing - 1) * BASE_FONT_PX) : null;
  if (lineGapPx !== null) row.push(`row-gap:${sz(lineGapPx)}px !important`);

  // Word spacing → the horizontal gap BETWEEN words on a line. Words are separate flex items,
  // so the gap is the row's column-gap (not letter-spacing, which spreads chars within a word).
  if (typeof ov.wordSpacing === 'number') row.push(`column-gap:${sz(Math.max(0, ov.wordSpacing))}px !important`);

  if (emph) {
    if (emph.hex) emphRules.push(`color:${emph.hex} !important`, `-webkit-text-fill-color:${emph.hex} !important`, 'background-image:none !important');
    if (emph.fontFamily) emphRules.push(`font-family:'${emph.fontFamily}', sans-serif !important`);
    if (emph.fontFace) {
      emphRules.push(`font-weight:${emph.fontFace.weight} !important`);
      emphRules.push(`font-style:${emph.fontFace.italic ? 'italic' : 'normal'} !important`);
    }
    if (emph.casing) emphRules.push(`text-transform:${emph.casing === 'upper' ? 'uppercase' : emph.casing === 'lower' ? 'lowercase' : 'capitalize'} !important`);
    if (emph.underline) emphRules.push('text-decoration:underline !important');
  }

  let css = '';
  const scope = '[data-captik-tov]';
  if (allSpans.length) css += `${scope} span:not([data-cfont-lock] *){${allSpans.join(';')}}\n`;
  if (word.length) css += `${scope} span:not([data-cfont-lock] *):not([data-emph]){${word.join(';')}}\n`;
  if (row.length) css += `${scope} [data-cap-row]:not([data-cfont-lock] *){${row.join(';')}}\n`;
  if (emphRules.length) css += `${scope} span[data-emph]{${emphRules.join(';')}}\n`;
  // Stacked two-line layouts render each phrase as its own [data-cap-row]; space them with a
  // top margin on every row that follows another (row-gap only handles wrapping within one row).
  if (lineGapPx !== null) css += `${scope} [data-cap-row]:not([data-cfont-lock] *) + [data-cap-row]:not([data-cfont-lock] *){margin-top:${sz(lineGapPx)}px !important}\n`;
  return css;
}

// ── Export routing ────────────────────────────────────────────────────────────

/** True when these overrides can be reproduced faithfully by the libass fast
    path. Gradient fills and rounded background pills can't — those exports
    auto-route to the HD (Remotion) renderer. */
export function overridesFastPathSafe(ov: TextOverrides | undefined): boolean {
  return fastPathBlocker(ov) === null;
}

/** Reason string for the small "HD render" note next to Export. */
export function fastPathBlocker(ov: TextOverrides | undefined): string | null {
  if (!ov) return null;
  if (ov.color?.mode === 'gradient') return 'gradient text';
  if (ov.background) return 'caption background';
  if (typeof ov.lineSpacing === 'number') return 'line spacing';
  if (typeof ov.wordSpacing === 'number') return 'word spacing';
  if (ov.align) return 'text alignment';
  return null;
}
