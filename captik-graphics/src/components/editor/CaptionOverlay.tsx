'use client';

import { useMemo } from 'react';
import { random } from 'remotion';
import type { TranscriptWord, TextOverrides, EmphasisStyle, LayoutMode, TemplateSlotOverrides } from '@/types/transcript';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import type { BleepRange } from '@/lib/profanity';
import { getFontFamily } from '@/lib/textParser';
import { buildTextOverrideCSS, isStyleLocked } from '@/lib/styleResolve';
import { sampleKf, kfTimeOf, buildSegEndMap } from '@/lib/wordKf';
import { resolveIllusionSlots, resolveEditorMasalaSlots, resolveAuraSlots, resolveSwissSlots, resolveGlitch, resolveInAnimPose } from '@/lib/kineticSlots';
import type { CaptionInAnimation } from '@/types/transcript';
import { resolveSegments, activeSegmentIndexAt } from '@/lib/captionSegments';
import { resolveUserColors, shadeHex } from '@/lib/captionColors';
import { fitRowScale, fitWordScale, fontWidthFactor, type FitItem } from '@/lib/fitText';

interface CaptionOverlayProps {
  words:              TranscriptWord[];
  currentTimeMs:      number;
  captionStyle:       CaptionStyleId;
  accentColor:        string;
  bleepRanges:        BleepRange[];
  segments?:          string[][];
  captionYPercent?:   number;
  captionXPercent?:   number;
  captionWidthPercent?: number;
  // "Big Reveal" template only: the SECOND box — position/width of the emphasised TITLE that sits
  // behind the subject. The lower caption uses captionX/Y/WidthPercent; the title uses these.
  emphBoxYPercent?:     number;
  emphBoxXPercent?:     number;
  emphBoxWidthPercent?: number;
  /** Independent font scale for the Big Reveal TITLE (driven by the title box's resize handles), so
   *  the title sizes separately from the lower caption's captionFontScale. Defaults to 1. */
  emphFontScale?:       number;
  /** Big Reveal 3-layer compositing: render only the TITLE ('title', the behind-subject back layer)
   *  or only the lower caption ('lower', the front layer above the cut-out). Omit → render both. */
  bigRevealLayer?:      'title' | 'lower';
  captionFontScale?:  number;
  captionLines?:      'single' | 'double';
  captionTextColor?:  string;
  captionGapMs?:      number;
  // Plugin-only: drop the whole-line fade in/out so caption lines hard-cut on appear/
  // disappear. Keeps each style's signature MOTION (pop/slide) and per-word reveals.
  noLineFade?:        boolean;
  // Logical canvas pixel width (9:16 → 270). Used by Aura's char-aware packer to size the box in the
  // same px space as the fonts (the box width is FIXED, unlike fontScale). Defaults to the 9:16 base.
  canvasWidthPx?:     number;
  /** Director-authored 'dynamic' style typography — hero/support font pair per video. */
  dynamicSpec?:       { heroFont?: string; supportFont?: string; heroColor?: string } | null;
  // Reference-parity styling: global Text-tab overrides + emphasis styling + hero layout.
  // Ignored entirely by the locked templates (editor_masala / illusion / aura).
  textOverrides?:     TextOverrides;
  emphasisStyle?:     EmphasisStyle;
  layoutMode?:        LayoutMode;
  /** Effective per-template slot overrides (caller pre-merges global + the active segment's
      per-line slots), consumed by the editor_masala / illusion / aura branches. */
  templateSlots?:     TemplateSlotOverrides;
  /** Aura alpha-overlay split (plugin transparent burn-in renders aura TWICE):
   *  'base' = everything except the difference-blend words (kept as hidden placeholders so the
   *  layout is identical); 'diff' = ONLY the difference words, solid colour with NO CSS blend —
   *  the NLE's track Difference blend mode recreates the effect against the underlying video.
   *  Omit for normal rendering. Only the aura branch reads this. */
  auraAlphaLayer?:    'base' | 'diff';
}


function buildPhrases(words: TranscriptWord[], n = 5): TranscriptWord[][] {
  const out: TranscriptWord[][] = [];
  for (let i = 0; i < words.length; i += n) out.push(words.slice(i, i + n));
  return out;
}

type EmphasisSection = { pre: TranscriptWord[]; emph: TranscriptWord; trailing: TranscriptWord[] };

function buildEmphasisSections(
  ph: TranscriptWord[],
  isEmphFn: (w: TranscriptWord) => boolean,
): EmphasisSection[] {
  const sections: EmphasisSection[] = [];
  const emphIdxs = ph.map((w, i) => (isEmphFn(w) ? i : -1)).filter(i => i >= 0);
  let cursor = 0;
  for (let si = 0; si < emphIdxs.length; si++) {
    const ei    = emphIdxs[si];
    const nextEi = emphIdxs[si + 1] ?? ph.length;
    sections.push({ pre: ph.slice(cursor, ei), emph: ph[ei], trailing: ph.slice(ei + 1, nextEi) });
    cursor = nextEi;
  }
  return sections;
}

const ANIM_CSS = `
@keyframes _captikPop   { from{opacity:0;transform:scale(0.82)} 60%{transform:scale(1.08)} to{opacity:1;transform:scale(1)} }
@keyframes _captikBox   { from{opacity:0;transform:scale(0.78)} 65%{transform:scale(1.1)} to{opacity:1;transform:scale(1)} }
@keyframes _captikSlide { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
/* No-fade variants (plugin): same pop motion, but full opacity throughout — line hard-cuts in. */
@keyframes _captikPopNF { from{transform:scale(0.82)} 60%{transform:scale(1.08)} to{transform:scale(1)} }
@keyframes _captikBoxNF { from{transform:scale(0.78)} 65%{transform:scale(1.1)} to{transform:scale(1)} }
`;

// Illusion modifier 2A — a subtle hard-cut opacity strobe (two brief flickers over 0.2s,
// ending visible) that mirrors the export's 6-frame glitch. Runs on the browser clock, so
// it's visible in the preview even though the preview is time-driven (no per-frame loop).
const ILLUSION_CSS = `
@keyframes _illusionGlitch {
  0%{opacity:0} 24%{opacity:0} 25%{opacity:1} 49%{opacity:1}
  50%{opacity:0} 74%{opacity:0} 75%{opacity:1} 100%{opacity:1}
}
`;

// ── Frame-safe entrance motion ─────────────────────────────────────────────────────────────────
// The CSS @keyframes/`transition`s above only advance on the BROWSER CLOCK, so they animate in the
// 60 fps preview but render as a STATIC final frame in the Remotion export (every export frame is an
// independent DOM snapshot — CSS animations/transitions never tick between frames). These helpers
// recompute the SAME motion from `currentTimeMs − appearMs`, so a caption's entrance renders
// identically in the preview (localMs @60fps) AND the frame-by-frame burn-in/export.
const _clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const _easeOut  = (t: number) => 1 - Math.pow(1 - t, 3);                 // ≈ cubic-bezier ease-out
// Overshoot ease-out (≈ cubic-bezier(0.34,1.56,0.64,1)) for the spring/pop motions.
const _backOut  = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; const u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; };

/** Interpolated entrance pose — drop-in for `spoken ? resting : entry` + a CSS transition. */
function entrancePose(
  now: number, startMs: number,
  o: { durMs?: number; opDurMs?: number; blurDurMs?: number; dx?: number; dy?: number; blur?: number; scaleFrom?: number; overshoot?: boolean; fade?: boolean },
): React.CSSProperties {
  const raw = _clamp01((now - startMs) / (o.durMs ?? 380));
  const op  = _easeOut(_clamp01((now - startMs) / (o.opDurMs ?? o.durMs ?? 380)));  // opacity may ramp faster than motion
  const mt  = o.overshoot ? _backOut(raw) : _easeOut(raw); // motion progress (may overshoot past 1)
  // Blur sharpens over its OWN (usually much shorter) window so the word reads CRISP well before the
  // caption swaps out on fast speech — the rest of the entrance (rise/opacity) keeps the longer durMs.
  const braw = _clamp01((now - startMs) / (o.blurDurMs ?? o.durMs ?? 380));
  const dx  = (o.dx ?? 0) * (1 - mt), dy = (o.dy ?? 0) * (1 - mt), bl = (o.blur ?? 0) * (1 - braw);
  const tf: string[] = [];
  if (o.scaleFrom != null) tf.push(`scale(${(o.scaleFrom + (1 - o.scaleFrom) * mt).toFixed(4)})`);
  if (dx || dy) tf.push(`translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px)`);
  return {
    opacity: o.fade === false ? 1 : op,
    transform: tf.length ? tf.join(' ') : 'none',
    filter: bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : 'blur(0px)',
  };
}

/** In-animation override pose (preview) — the CaptionOverlay analogue of the export's inPose.
    Uses the SAME resolveInAnimPose math off (now − startMs)/1000 so the preview and the frame-based
    export render the override pixel-identically. Only called for the non-'default' modes. `lean` is
    an optional static transform suffix kept at rest (e.g. Aura's cursive tilt). */
function inEntrancePose(
  anim: Exclude<CaptionInAnimation, 'default'>, now: number, startMs: number, mag: number, lean = '',
): React.CSSProperties {
  const { dx, dy, opacity } = resolveInAnimPose(anim, (now - startMs) / 1000, mag);
  const tf = (dx || dy) ? `translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px)` : '';
  return { opacity, transform: (tf + lean).trim() || 'none', filter: 'blur(0px)' };
}

/** Scale "pop" with overshoot — frame-based drop-in for the _captikPop / _captikBox @keyframes. */
function popIn(now: number, startMs: number, o?: { box?: boolean; fade?: boolean }): React.CSSProperties {
  const dur = o?.box ? 130 : 120;
  const from = o?.box ? 0.78 : 0.82, peak = o?.box ? 1.1 : 1.08, peakAt = o?.box ? 0.65 : 0.6;
  const t = _clamp01((now - startMs) / dur);
  const scale = t < peakAt ? from + (peak - from) * (t / peakAt) : peak + (1 - peak) * ((t - peakAt) / (1 - peakAt));
  return { transform: `scale(${scale.toFixed(4)})`, opacity: o?.fade === false ? 1 : _clamp01(t / 0.5) };
}

/** Frame-based opacity strobe (two flickers over 200ms, ending visible) — the _illusionGlitch keyframes. */
function illusionStrobe(elapsedMs: number): number {
  if (elapsedMs < 0) return 0;
  if (elapsedMs >= 200) return 1;
  const p = elapsedMs / 200;
  return (p < 0.25 || (p >= 0.5 && p < 0.75)) ? 0 : 1;
}

// Client fallback hero pick — kept byte-identical to the KineticCaptionComposition copy so the
// preview and export choose the SAME hero. Scoped to editor_masala; never mutates word data.
const EM_STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of',
  'in', 'on', 'for', 'with', 'at', 'by', 'it', 'this', 'that', 'you', 'your', 'they', 'have',
  'has', 'had', 'will', 'would', 'what', 'when', 'where', 'why', 'how', 'from', 'just', 'not',
  'about', 'into',
  'hai', 'hain', 'tha', 'thi', 'ki', 'ka', 'ke', 'ko', 'se', 'mein', 'par', 'aur', 'ya',
  'nahi', 'kya', 'jo', 'woh', 'yeh', 'bhi', 'toh', 'kar', 'raha', 'rahe', 'mera', 'tera',
  'aap', 'hum',
  'ahe', 'ani', 'pan', 'mi', 'tu', 'kay',
  'naan', 'nee', 'avan', 'aval', 'adi', 'idi', 'oru', 'illa', 'enna',
  'nenu', 'nuvvu', 'oka', 'ledu', 'emi',
  'ami', 'tumi', 'eta', 'ekta', 'nei', 'ache',
]);
function pickEditorMasalaHero(ws: { text: string }[]): number {
  let bestIdx = -1, bestLen = 3;   // require normalised length >= 4 to qualify
  for (let i = 0; i < ws.length; i++) {
    const n = (ws[i].text || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    if (n.length > bestLen && !EM_STOPWORDS.has(n)) { bestLen = n.length; bestIdx = i; }
  }
  return bestIdx;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map(c => c + c).join('') : n;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Aura role + char-aware packing engine ──────────────────────────────────────
// DUPLICATED BYTE-FOR-BYTE from KineticCaptionComposition.tsx (AuraRow). Pure & deterministic, so
// the preview (here) and the Lambda export pick the IDENTICAL roles / tiers / sizes for every phrase.
// Keep the two copies in lockstep. See iamdumb.md §2.11.
// AURA_YELLOW is the role engine's default accent (the resolved accentColor slot defaults to it).
// The cursive/bold/support font defaults now live in kineticSlots.AURA_DEFAULTS.
const AURA_YELLOW  = '#F5D300';
// Big Reveal title default colour (overridden by a word's emphasis colour when the user set one).
const BIG_REVEAL_YELLOW = '#FFE800';
// Heavy display stack for the Big Reveal title (Latin); Indic scripts keep their Noto stack.
const BIG_REVEAL_TITLE_FONT = '"TheBoldFont","Anton","Arial Black",sans-serif';
const AURA_STOP = new Set<string>([
  'a','an','the','and','or','but','to','of','in','on','for','with','at','by','it','is','are','was',
  'were','be','as','that','this','you','your','i','we','he','she','they','my','me','so','if','do',
  'did','not','no','up','out','its','too','am','our','us','his','her','off','let','get','got',
]);
type AuraRole = 'CURSIVE' | 'BOLDKEY' | 'SUPPORT';
interface AuraSpec { role: AuraRole; emph: boolean; diff: boolean; color: string; }
const AURA_FACTOR: Record<AuraRole, number> = { CURSIVE: 1.0, BOLDKEY: 1.2, SUPPORT: 1.0 };

// KEEP combining marks (\p{M}): Indic matras (ा ि े ं …) are marks, not letters — stripping them made
// most Hindi words look ≤3 chars → wrongly "structural" → a flat all-SUPPORT native lockup. Counting
// them gives native words fair lengths (फीचर्स=6, हैं=3, जो=2) so the role engine produces the same
// hero/support structure for native script as for romanised text.
function auraClean(t: string): string { return t.replace(/[^\p{L}\p{N}\p{M}]/gu, ''); }
function auraStructural(t: string): boolean {
  if (/['’]/.test(t)) return true;   // contractions (you've, it's, don't) → SUPPORT, never the cursive feature
  const c = auraClean(t).toLowerCase();
  // Indic words use a LOWER threshold (≤2): romanisation lengthens words (हैं→hain, में→mein), so the
  // Latin ≤3 would demote native words whose romanised twins are heroes — breaking native↔roman parity.
  const limit = getFontFamily(t) !== 'system-ui, sans-serif' ? 2 : 3;
  return c.length <= limit || AURA_STOP.has(c) || AURA_STOP.has(t.toLowerCase());
}
function auraCharUnit(ch: string): number {
  if (/[mwMW@]/.test(ch))      return 0.92;
  if (/[A-Z0-9]/.test(ch))     return 0.66;
  if (/[ilIjt.,'!|]/.test(ch)) return 0.30;
  if (/[fr]/.test(ch))         return 0.42;
  if (/[a-z]/.test(ch))        return 0.54;
  if (/\s/.test(ch))           return 0.32;
  if (/\p{M}/u.test(ch))       return 0.18;   // combining marks (Indic matras) are zero/narrow width
  return 0.72;                                // Indic/other full letters (Noto Sans Devanagari ≈ 0.72em)
}
function auraEstWidth(text: string, fontPx: number, factor: number): number {
  let u = 0; for (const ch of text) u += auraCharUnit(ch);
  return u * fontPx * factor;
}
function auraIsEmphW(w: TranscriptWord): boolean {
  return !!(w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1));
}
function auraAssignRoles(words: TranscriptWord[]): AuraSpec[] {
  const n = words.length;
  const emphIndex = words.findIndex(auraIsEmphW);
  // cursive = longest non-emph, non-structural word. Indic words CAN take the role — the renderer
  // swaps Playfair for the script's Noto stack with a synthetic italic (mirrors AuraRow).
  let cursiveIdx = -1, best = 3;
  for (let i = 0; i < n; i++) {
    if (i === emphIndex) continue;
    if (words[i].styleOverride?.highlight) continue;                         // a highlighted word is a difference BOLDKEY, never cursive
    if (auraStructural(words[i].text)) continue;
    const len = auraClean(words[i].text).length;
    if (len >= best) { best = len; cursiveIdx = i; }
  }
  const specs: AuraSpec[] = words.map((w, i) => {
    if (i === emphIndex)   return { role: 'BOLDKEY', emph: true,  diff: false, color: w.styleOverride?.color || AURA_YELLOW };
    if (i === cursiveIdx)  return { role: 'CURSIVE', emph: false, diff: false, color: '#FFFFFF' };
    if (auraStructural(w.text)) return { role: 'SUPPORT', emph: false, diff: false, color: '#FFFFFF' };
    return { role: 'BOLDKEY', emph: false, diff: false, color: '#FFFFFF' };
  });
  // Focal guard: if everything came out SUPPORT (all-short / all-Indic), promote the longest to BOLDKEY.
  if (!specs.some(s => s.role !== 'SUPPORT')) {
    let li = 0; for (let i = 1; i < n; i++) if (auraClean(words[i].text).length > auraClean(words[li].text).length) li = i;
    specs[li] = { role: 'BOLDKEY', emph: false, diff: false, color: '#FFFFFF' };
  }
  const manual = words.map((w, i) => (w.styleOverride?.highlight ? i : -1)).filter(i => i >= 0);
  if (manual.length) {
    for (const i of manual) if (specs[i].role === 'BOLDKEY' && !specs[i].emph) specs[i].diff = true;
  } else {
    let pick = -1, pl = 5;
    for (let i = 0; i < n; i++) {
      if (specs[i].role !== 'BOLDKEY' || specs[i].emph) continue;
      const len = auraClean(words[i].text).length;
      if (len > pl) { pl = len; pick = i; }
    }
    if (pick >= 0) specs[pick].diff = true;
  }
  return specs;
}
interface AuraTierItem { w: TranscriptWord; spec: AuraSpec; idx: number; fs: number; }
interface AuraTier { items: AuraTierItem[]; hasCursive: boolean; width: number; }
function auraBuildTiers(words: TranscriptWord[], specs: AuraSpec[], boxPx: number, baseFs: number): AuraTier[] {
  const mul = (s: AuraSpec) => s.role === 'CURSIVE' ? 2.6 : s.role === 'BOLDKEY' ? (s.emph ? 2.0 : 1.9) : 0.95;
  // Indic glyphs read visually smaller than TheBoldFont caps at equal px (Devanagari body ≈ 0.55em vs
  // display-caps ≈ 0.75em) — bump them so a native hero carries the same weight as a romanised one.
  const scriptMul = (w: TranscriptWord) => getFontFamily(w.text) !== 'system-ui, sans-serif' ? 1.12 : 1;
  const gap = baseFs * 0.35;
  const rowW = (items: AuraTierItem[]) => {
    let w = 0;
    for (const it of items) w += auraEstWidth(it.spec.role === 'BOLDKEY' ? it.w.text.toUpperCase() : it.w.text, it.fs, AURA_FACTOR[it.spec.role]);
    return w + Math.max(0, items.length - 1) * gap;
  };
  const tiers: AuraTier[] = [];
  for (let i = 0; i < words.length; i++) {
    const spec = specs[i];
    const item: AuraTierItem = { w: words[i], spec, idx: i, fs: Math.round(mul(spec) * scriptMul(words[i]) * baseFs) };
    const last = tiers[tiers.length - 1];
    const isSupport = spec.role === 'SUPPORT';
    if (isSupport && last && last.items.every(it => it.spec.role === 'SUPPORT') && rowW([...last.items, item]) <= boxPx) {
      last.items.push(item);
    } else {
      tiers.push({ items: [item], hasCursive: spec.role === 'CURSIVE', width: 0 });
    }
  }
  let guard = 0;
  while (tiers.length > 3 && guard++ < 12) {
    let mi = tiers.findIndex((t, k) => t.items.every(it => it.spec.role === 'SUPPORT') && (tiers[k - 1] || tiers[k + 1]));
    if (mi === -1) mi = tiers.length - 1;
    const tgt = mi + 1 < tiers.length ? mi + 1 : mi - 1;
    if (tgt < mi) tiers[tgt].items.push(...tiers[mi].items);
    else          tiers[tgt].items.unshift(...tiers[mi].items);
    tiers.splice(mi, 1);
  }
  for (const t of tiers) {
    const w = rowW(t.items);
    if (w > boxPx) { const k = boxPx / w; for (const it of t.items) it.fs = Math.max(Math.round(baseFs * 1.0), Math.round(it.fs * k)); }
    // The baseFs floor above can itself exceed the box at high captionFontScale (baseFs scales
    // with the fontScale but boxPx is FIXED) — the floored tier still overflowed and glyphs got
    // cut at the box/canvas edge. Final unfloored pass: a tier NEVER exceeds the box.
    const w2 = rowW(t.items);
    if (w2 > boxPx) { const k2 = boxPx / w2; for (const it of t.items) it.fs = Math.max(6, Math.round(it.fs * k2)); }
    t.hasCursive = t.items.some(it => it.spec.role === 'CURSIVE');
    t.width = rowW(t.items);
  }
  return tiers;
}

// Outer component: wraps the per-template renderer in the [data-captik-tov] scope
// and injects the Text-tab override CSS (same !important mechanism as the custom
// font override). Locked templates get an empty override set, so this is a no-op
// for them and for any project with no Text-tab customizations.
export function CaptionOverlay(props: CaptionOverlayProps) {
  const { captionStyle, textOverrides, emphasisStyle, captionFontScale = 1 } = props;
  const locked = isStyleLocked(captionStyle);
  const tovCSS = useMemo(() => {
    if (locked || !textOverrides) return '';
    return buildTextOverrideCSS(textOverrides, emphasisStyle, n => Math.round(n * captionFontScale * 10) / 10);
  }, [locked, textOverrides, emphasisStyle, captionFontScale]);

  // Per-word user transforms (timeline word-layers): offset + free scale, keyed by
  // the data-w attribute every word span carries. The CSS `translate`/`scale`
  // PROPERTIES compose with the templates' own animation `transform`s instead of
  // overwriting them, and neither affects layout — so fit math, wrapping and the
  // template's signature look stay untouched on every render surface.
  //
  // Position KEYFRAMES are sampled fresh at currentTimeMs — a pure function of
  // the surface's own clock, exactly like the template animations, so Lambda /
  // box / Element Capture replay the identical motion path frame by frame
  // (a CSS animation would free-run on wall time and drift in renders).
  const wordXfCSS = useMemo(() => {
    const cw = props.canvasWidthPx ?? 270;
    // Keyframes run over the word's VISIBLE lifetime (spoken start -> caption
    // line end), matching how long the accumulating templates keep it on screen.
    const segEnd = buildSegEndMap(props.segments, props.words);
    const rules: string[] = [];
    for (const w of props.words) {
      const o = w.styleOverride;
      if (!o) continue;
      let dx: number, dy: number, sc: number, rot: number;
      if (o.posKf && o.posKf.length > 0) {
        const p = sampleKf(o.posKf, kfTimeOf(props.currentTimeMs, w.startMs, segEnd.get(w.id) ?? w.endMs));
        dx = p.dx; dy = p.dy;
        sc = p.s ?? o.wScale ?? 1;          // per-property: kf track wins, else static
        rot = p.rot ?? o.wRotDeg ?? 0;
      } else {
        dx = o.dxPct ?? 0; dy = o.dyPct ?? 0;
        sc = o.wScale ?? 1; rot = o.wRotDeg ?? 0;
      }
      if (dx === 0 && dy === 0 && sc === 1 && rot === 0) continue;
      // Both axes are % of canvas WIDTH so the offset scales identically on every
      // surface (preview 270px … Lambda 1080px) regardless of aspect ratio.
      const tx = ((dx / 100) * cw).toFixed(1);
      const ty = ((dy / 100) * cw).toFixed(1);
      const rotCss = rot !== 0 ? `rotate:${rot.toFixed(1)}deg;` : '';
      rules.push(`[data-captik-tov] [data-w="${w.id}"]{translate:${tx}px ${ty}px;scale:${sc};${rotCss}position:relative;z-index:6;}`);
    }
    return rules.join('\n');
  }, [props.words, props.canvasWidthPx, props.currentTimeMs]);

  return (
    <div data-captik-tov="" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {tovCSS && <style>{tovCSS}</style>}
      {wordXfCSS && <style>{wordXfCSS}</style>}
      <CaptionOverlayInner {...props} />
    </div>
  );
}

function CaptionOverlayInner({
  words, currentTimeMs, captionStyle, accentColor, bleepRanges, segments,
  captionYPercent = 85, captionXPercent = 50, captionWidthPercent = 84,
  emphBoxYPercent = 24, emphBoxXPercent = 50, emphBoxWidthPercent = 84, emphFontScale = 1,
  bigRevealLayer,
  captionFontScale = 1, captionLines = 'single', captionTextColor = '#ffffff',
  captionGapMs = 0, noLineFade = false, canvasWidthPx = 270, dynamicSpec = null,
  emphasisStyle, layoutMode = 'splash', templateSlots, auraAlphaLayer,
}: CaptionOverlayProps) {
  // Caption display window: a caption appears LEAD ms before its first word and stays
  // TAIL ms after its last word, then clears. We intentionally do NOT bridge across to
  // the next segment — when the speaker pauses, the caption disappears, so captions track
  // the speech ("come when said out loud") instead of staying on screen continuously.
  // captionGapMs lets the user lengthen the tail a little if they prefer captions to linger.
  const LEAD = 80;
  const TAIL = Math.max(120, 120 + captionGapMs);

  // Colours the user has actually customised (undefined while still at the global default), so the
  // template branches below honour the editor's colour pickers WITHOUT shifting any template's
  // signature look for projects that never touched the colour. See lib/captionColors.ts.
  const { userText, userAccent } = resolveUserColors(captionTextColor, accentColor);

  const isBleep = bleepRanges.some(r => currentTimeMs >= r.startMs && currentTimeMs <= r.endMs);

  const activeWord = useMemo(
    () => words.find(w => currentTimeMs >= w.startMs && currentTimeMs <= w.endMs),
    [words, currentTimeMs],
  );

  // Resolve segments to their word lists + raw time spans once (independent of the clock);
  // drop any segment whose words are all gone. Shared with the Remotion render
  // (KineticCaptionComposition) via resolveSegments so preview and export never disagree.
  const resolvedSegs = useMemo(() => resolveSegments(segments, words), [segments, words]);

  const segWords = useMemo(() => {
    // The shared display window (activeSegmentIndexAt) — the SAME call every override reader
    // (page.tsx preview + both export compositions) uses, so what's displayed and which
    // per-line overrides apply can never disagree across surfaces.
    const idx = activeSegmentIndexAt(resolvedSegs, currentTimeMs, captionGapMs);
    return idx >= 0 ? resolvedSegs[idx].sw : null;
  }, [resolvedSegs, currentTimeMs, captionGapMs]);

  const phrase = useMemo(() => {
    if (segWords) return segWords;
    // Segments are authoritative when provided: if no segment is active at this instant
    // (a pause/gap between captions), show NOTHING. The buildPhrases fallback re-chunks the
    // words into arbitrary groups of 5 that ignore the segment boundaries — in a gap its
    // wide window matches and a phantom caption appears, re-showing words that were already
    // spoken (e.g. "someone yaar" reappearing merged with "I mean"). Only fall back to
    // ad-hoc chunking when there are NO segments at all — OR when segments exist but every one
    // references word IDs that are gone (resolvedSegs empty), so a stale/remapped segment list
    // can never blank the timeline.
    if (resolvedSegs.length) return null;
    const phrases = buildPhrases(words);
    return phrases.find(p =>
      p.length > 0 && currentTimeMs >= p[0].startMs - LEAD && currentTimeMs <= p[p.length - 1].endMs + TAIL,
    ) ?? null;
  }, [words, resolvedSegs, segWords, currentTimeMs, LEAD, TAIL]);

  // Next segment — used by tabahi and the captionLines='double' two-line layout
  // Grace matches segWords (200ms) to avoid showing the same segment as both phrase and nextPhrase.
  const nextPhrase = useMemo(() => {
    if (!segments?.length || !words.length) return null;
    const wMap = new Map(words.map(w => [w.id, w]));
    let graceIdx = -1;
    for (let i = 0; i < segments.length - 1; i++) {
      const sw = segments[i].map(id => wMap.get(id)).filter((w): w is TranscriptWord => !!w);
      if (!sw.length) continue;
      const first = sw[0], last = sw[sw.length - 1];
      if (currentTimeMs >= first.startMs && currentTimeMs <= last.endMs)
        return segments[i + 1].map(id => wMap.get(id)).filter((w): w is TranscriptWord => !!w);
      if (currentTimeMs > last.endMs && currentTimeMs <= last.endMs + 200 && graceIdx === -1)
        graceIdx = i;
    }
    if (graceIdx >= 0)
      return segments[graceIdx + 1].map(id => wMap.get(id)).filter((w): w is TranscriptWord => !!w);
    return null;
  }, [segments, words, currentTimeMs]);

  const sz  = (n: number) => Math.round(n * captionFontScale);
  const ff  = (w?: TranscriptWord) => w ? getFontFamily(w.text) : 'system-ui, sans-serif';

  // ── Fit-to-box guard (see lib/fitText.ts) ──────────────────────────────────
  // The dotted box fixes the row width, but captionFontScale scales the font freely — an
  // oversized single-line row used to get CLIPPED by the row's overflow:hidden (or by the
  // canvas edge for hero layouts). rowFit estimates the row width with the Aura char-table
  // technique (no DOM measure → identical on preview and every export surface) and returns a
  // ≤1 font multiplier. It is 1 (a no-op) for every caption that already fits, and constant
  // per phrase (sizes never pulse as words activate — callers pass each word's LARGEST size).
  // In wrap mode only a single overlong word can overflow, so the guard keys on the widest word.
  const boxPx = canvasWidthPx * (captionWidthPercent / 100);
  const rowFit = (
    items: FitItem[],
    opts?: { gapPx?: number; frac?: number; forceRow?: boolean },
  ) => {
    const inner = boxPx * (opts?.frac ?? 0.9);   // most rows render at maxWidth:'90%'
    return captionLines === 'single' || opts?.forceRow
      ? fitRowScale(items, opts?.gapPx ?? 6, inner)
      : fitWordScale(items, inner);
  };
  // The common case: every word in the row at one base px (per-word emphasis scale honored).
  const phraseFit = (ph: TranscriptWord[], basePx: number, opts?: { gapPx?: number; frac?: number; upper?: boolean; forceRow?: boolean; factor?: number }) =>
    rowFit(
      ph.map(w => ({
        text: opts?.upper ? w.text.toUpperCase() : w.text,
        fontPx: basePx * (w.styleOverride?.scale && w.styleOverride.scale > 1 ? w.styleOverride.scale : 1),
        factor: opts?.factor,
      })),
      opts,
    );
  const pos: React.CSSProperties = {
    position: 'absolute',
    top: `${captionYPercent}%`,
    left: `${captionXPercent}%`,
    width: `${captionWidthPercent}%`,
    transform: 'translate(-50%, -50%)',
    display: 'flex', justifyContent: 'center', pointerEvents: 'none',
  };

  if (isBleep) return null;

  // ── Shared phrase-row renderer ─────────────────────────────────────────────
  // NO emphasis handling — templates using phraseRow are NOT emphasis-dependent.
  // (captik, captik_glow, captik_shadow, delhi handle their own emphasis logic
  // directly without going through phraseRow.)
  const phraseRow = (
    ph: TranscriptWord[],
    getActive:   (w: TranscriptWord, i: number) => React.CSSProperties,
    getInactive: (w: TranscriptWord, i: number) => React.CSSProperties,
    wrap?: React.CSSProperties,
    gap = 6,
  ) => {
    // Fit guard: estimate every word at its LARGEST state (active vs inactive style) so the
    // multiplier is constant for the whole phrase and sizes never pulse mid-caption. The
    // style's own font stack + em letter-spacing feed the estimator so wide faces
    // (Montserrat/Komika) and tracked styles (thora_cinematic) don't under-shrink.
    const fit = rowFit(ph.map((w, i) => {
      const a = getActive(w, i), n = getInactive(w, i);
      const px = Math.max(Number(a.fontSize ?? 0) || 0, Number(n.fontSize ?? 0) || 0) || sz(18);
      const upper = (a.textTransform ?? n.textTransform) === 'uppercase';
      const lsRaw = a.letterSpacing ?? n.letterSpacing;
      const lsEm  = typeof lsRaw === 'string' && lsRaw.endsWith('em') ? parseFloat(lsRaw) || 0 : 0;
      return {
        text: upper ? w.text.toUpperCase() : w.text, fontPx: px,
        factor: fontWidthFactor((a.fontFamily ?? n.fontFamily) as string | undefined), lsEm,
      };
    }), { gapPx: gap });
    const fitted = (s: React.CSSProperties): React.CSSProperties => {
      const px = Number(s.fontSize ?? 0) || 0;
      return fit < 1 && px > 0 ? { ...s, fontSize: Math.max(1, Math.round(px * fit)) } : s;
    };
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', maxWidth: '90%', overflow: 'hidden', ...wrap }}>
            {ph.map((w, i) => {
              const active = currentTimeMs >= w.startMs && currentTimeMs <= w.endMs;
              const baseStyle = fitted(active ? getActive(w, i) : getInactive(w, i));
              return <span key={w.id} data-w={w.id} style={{ fontFamily: ff(w), display: 'inline-block', transition: 'all 0.1s', ...baseStyle }}>{w.text}</span>;
            })}
          </div>
        </div>
      </>
    );
  };

  // ── isEmph: word has user-set emphasis color, scale > 1, or spotlight ──────
  const isEmph = (w: TranscriptWord) =>
    !!(w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1) || w.styleOverride?.spotlight);

  // Spotlight: the hero word takes the screen alone — per-word flag, or globally
  // when the Emphasis mode is set to Spotlight (hero templates only).
  const isSpotlit = (w: TranscriptWord) =>
    !!(w.styleOverride?.spotlight || (emphasisStyle?.mode === 'spotlight' && isEmph(w)));

  // Emphasis-style knobs (Text tab → Emphasis): size multiplies the hero font
  // size relative to the stock 1.4× emphasis; colour/font/face land via the
  // [data-emph] CSS rules plus the inline colour below (inline wins for hex).
  const emphSizeMul = (emphasisStyle?.size ?? 1.4) / 1.4;
  const emphHex = emphasisStyle?.hex;

  // ── Emphasis layout: captik / captik_shadow
  // Vertically centered, left-aligned block. Words reveal one-by-one as spoken.
  // Unspoken words are opacity-0 (still occupy space) so the bounding box stays stable.
  const emphasisLayout = (
    ph: TranscriptWord[],
    accentStyle: React.CSSProperties,
    contextStyle: React.CSSProperties,
    opts?: { layered?: boolean; flatStyle?: React.CSSProperties },
  ) => {
    const layered = opts?.layered ?? false;
    // Fixed-width outer so the anchor point never shifts as content switches between
    // flat (1 row) and emphasis (multi-row column) layouts — eliminates position jumping.
    // overflow:hidden ensures inner fit-content divs never escape the box boundary.
    const outerPos: React.CSSProperties = {
      position: 'absolute',
      top: `${captionYPercent}%`,
      left: `${captionXPercent}%`,
      width: `${captionWidthPercent}%`,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      padding: '0 10px',
      display: 'flex',
      justifyContent: 'center',
    };
    const revealed = (w: TranscriptWord) => currentTimeMs >= w.startMs;
    const revealStyle = (w: TranscriptWord): React.CSSProperties => ({
      // captik / captik_glow / captik_shadow: hard reveal as spoken, no fade in or out.
      opacity: revealed(w) ? 1 : 0,
    });
    // Full-opacity primary style for flat (no-emphasis) mode. Callers can pass an explicit
    // flatStyle to keep an effect the default would strip — e.g. captik_shadow needs its
    // white→gray gradient on no-emphasis lines too, which the default (solid color +
    // WebkitTextFillColor:undefined) would otherwise remove.
    const flatStyle: React.CSSProperties = opts?.flatStyle ?? {
      ...contextStyle,
      color: captionTextColor,
      WebkitTextFillColor: undefined,
      opacity: 1,
      fontSize: sz(20),
    };

    // No emphasis markers → progressive flat row at full opacity
    if (!ph.some(isEmph)) {
      const flatPx  = Number(flatStyle.fontSize ?? 0) || sz(20);
      const flatFit = phraseFit(ph, flatPx, {
        frac: 0.94, forceRow: true, upper: flatStyle.textTransform === 'uppercase',
      });
      const fittedFlat = flatFit < 1 ? { ...flatStyle, fontSize: Math.max(1, Math.round(flatPx * flatFit)) } : flatStyle;
      return (
        <>
          <style>{ANIM_CSS}</style>
          <div style={outerPos} data-caption-content="true">
            <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', justifyContent: 'center' }}>
              {ph.map(w => (
                <span key={w.id} data-w={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...fittedFlat, ...revealStyle(w) }}>{w.text}</span>
              ))}
            </div>
          </div>
        </>
      );
    }

    // Spotlight: while a spotlit emphasized word is on screen, it owns the screen —
    // render ONLY the hero word (no context rows) for maximum impact.
    const spotlitNow = ph.find(w => isSpotlit(w) && currentTimeMs >= w.startMs);
    if (spotlitNow) {
      const emphColor = spotlitNow.styleOverride?.color ?? emphHex;
      const spotStyle: React.CSSProperties = emphColor
        ? { ...accentStyle, color: emphColor, WebkitTextFillColor: emphColor, backgroundImage: 'none' }
        : accentStyle;
      const spotBase = Math.round(Number(spotStyle.fontSize ?? sz(46)) * emphSizeMul);
      const spotText = spotStyle.textTransform === 'uppercase' ? spotlitNow.text.toUpperCase() : spotlitNow.text;
      const spotSize = Math.max(1, Math.round(spotBase * rowFit([{ text: spotText, fontPx: spotBase }], { gapPx: 0, frac: 0.94, forceRow: true })));
      return (
        <>
          <style>{ANIM_CSS}</style>
          <div style={outerPos} data-caption-content="true">
            <div data-cap-row="" style={{ display: 'flex', justifyContent: 'center' }}>
              <span data-emph="" data-w={spotlitNow.id} style={{ fontFamily: ff(spotlitNow), display: 'inline-block', ...spotStyle, fontSize: spotSize, ...popIn(currentTimeMs, spotlitNow.startMs, { fade: !noLineFade }) }}>
                {spotlitNow.text}
              </span>
            </div>
          </div>
        </>
      );
    }

    // Build sections — words reveal progressively; layout positions are fixed from the start
    const sections = buildEmphasisSections(ph, isEmph);
    const centered = layoutMode === 'center';

    // Flatten into rows tagged by role so layered mode can apply global z-ordering
    // (all pre behind, all emph middle, all trailing in front) + vertical overlap.
    type RowRole = 'pre' | 'emph' | 'trailing';
    const Z: Record<RowRole, number> = { pre: 1, emph: 2, trailing: 3 };
    const rows: { role: RowRole; key: string; content: React.ReactNode }[] = [];

    // Fit guards: the hero word shrinks to fit the box alone; each context row (nowrap)
    // shrinks as a unit. Computed per section from final sizes so rows never pulse.
    const ctxPx = Number(contextStyle.fontSize ?? 0) || sz(13);
    const ctxRowStyle = (ws: TranscriptWord[]): React.CSSProperties => {
      const f = phraseFit(ws, ctxPx, { frac: 0.94, forceRow: true, upper: contextStyle.textTransform === 'uppercase' });
      return f < 1 ? { ...contextStyle, fontSize: Math.max(1, Math.round(ctxPx * f)) } : contextStyle;
    };

    sections.forEach((sec, si) => {
      const emphColor = sec.emph.styleOverride?.color ?? emphHex ?? null;
      const accPx = emphSizeMul !== 1
        ? Math.round(Number(accentStyle.fontSize ?? sz(46)) * emphSizeMul)
        : (Number(accentStyle.fontSize ?? 0) || sz(46));
      const accText = accentStyle.textTransform === 'uppercase' ? sec.emph.text.toUpperCase() : sec.emph.text;
      const accFit  = rowFit([{ text: accText, fontPx: accPx }], { gapPx: 0, frac: 0.94, forceRow: true });
      const sized: React.CSSProperties = { ...accentStyle, fontSize: Math.max(1, Math.round(accPx * accFit)) };
      const finalAccent: React.CSSProperties = emphColor
        ? { ...sized, color: emphColor, WebkitTextFillColor: emphColor, backgroundImage: 'none' }
        : sized;
      if (sec.pre.length > 0) {
        const rowStyle = ctxRowStyle(sec.pre);
        rows.push({ role: 'pre', key: `pre${si}`, content: sec.pre.map(w => (
          <span key={w.id} data-w={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...rowStyle, ...revealStyle(w) }}>{w.text}</span>
        )) });
      }
      rows.push({ role: 'emph', key: `emph${si}`, content: (
        <span data-emph="" data-w={sec.emph.id} style={{ fontFamily: ff(sec.emph), display: 'inline-block', ...finalAccent, ...revealStyle(sec.emph) }}>{sec.emph.text}</span>
      ) });
      if (sec.trailing.length > 0) {
        const rowStyle = ctxRowStyle(sec.trailing);
        rows.push({ role: 'trailing', key: `trail${si}`, content: sec.trailing.map(w => (
          <span key={w.id} data-w={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...rowStyle, ...revealStyle(w) }}>{w.text}</span>
        )) });
      }
    });

    // Splash: pre left / BIG center / trailing right (the signature stagger).
    // Center: every row centered — context words sit in the middle with the hero.
    const align: Record<RowRole, React.CSSProperties['justifyContent']> = centered
      ? { pre: 'center', emph: 'center', trailing: 'center' }
      : { pre: 'flex-start', emph: 'center', trailing: 'flex-end' };

    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={outerPos} data-caption-content="true">
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: layered && !centered ? 0 : 2, width: 'fit-content' }}>
            {rows.map((r, idx) => (
              <div key={r.key} data-cap-row="" style={{
                display: 'flex', gap: 6, justifyContent: align[r.role],
                // Layered mode: pull rows together so the big emphasized word overlaps
                // its neighbours, and stack by role (trailing in front, pre behind).
                // Center layout keeps rows separated — no overlap stagger.
                marginTop: layered && !centered && idx > 0 ? -sz(7) : 0,
                position:  layered && !centered ? 'relative' : undefined,
                zIndex:    layered && !centered ? Z[r.role] : undefined,
              }}>
                {r.content}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  // ── Single-word pop renderer ────────────────────────────────────────────────
  const singleWord = (style: React.CSSProperties, wrap?: React.CSSProperties) => {
    if (!activeWord) return null;
    const px = Number(style.fontSize ?? 0) || sz(18);
    const t  = style.textTransform === 'uppercase' ? activeWord.text.toUpperCase() : activeWord.text;
    const f  = rowFit([{ text: t, fontPx: px }], { gapPx: 0, forceRow: true });
    const fittedStyle = f < 1 ? { ...style, fontSize: Math.max(1, Math.round(px * f)) } : style;
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', justifyContent: 'center', ...wrap }}>
            <span key={activeWord.id} data-w={activeWord.id} style={{ fontFamily: ff(activeWord), display: 'inline-block', ...fittedStyle, ...popIn(currentTimeMs, activeWord.startMs, { fade: !noLineFade }) }}>
              {activeWord.text}
            </span>
          </div>
        </div>
      </>
    );
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHRASE STYLES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // captik: no-emph → flat phrase; emph → big accent color | context small white
  if (captionStyle === 'captik') {
    if (!phrase) return null;
    return emphasisLayout(phrase,
      { color: accentColor, fontWeight: 900, fontSize: sz(46), textTransform: 'uppercase', lineHeight: 1, fontFamily: 'Inter, sans-serif' },
      { color: captionTextColor, fontWeight: 800, fontSize: sz(13), fontFamily: 'Inter, sans-serif', lineHeight: 1.2 },
    );
  }

  // ali_abdaal: phrase in white pill; words reveal progressively as spoken
  if (captionStyle === 'ali_abdaal') {
    if (!phrase) return null;
    const aaPx = Math.max(1, Math.round(sz(16) * phraseFit(phrase, sz(16), { frac: 0.8, factor: 1.15 })));  // pill pads 18px/side; Poppins runs wide
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ background: '#ffffff', borderRadius: 14, padding: '8px 18px', display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', alignItems: 'baseline', overflow: 'hidden' }}>
            {phrase.map(w => {
              const spoken = currentTimeMs >= w.startMs;
              return (
                <span key={w.id} data-w={w.id} style={{
                  fontFamily: 'Poppins, sans-serif', display: 'inline-block',
                  fontWeight: spoken ? 800 : 600, fontSize: aaPx,
                  color: spoken ? (userText ?? '#000000') : '#1f2022',
                  opacity: spoken ? 1 : 0.18,
                  transition: 'opacity 0.1s ease-in',
                }}>{w.text}</span>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // captik_shadow: no-emph → flat phrase; emph → big accent gradient | white→gray ctx
  if (captionStyle === 'captik_shadow') {
    if (!phrase) return null;
    const ctxGrad: React.CSSProperties = {
      backgroundImage: `linear-gradient(to bottom, ${captionTextColor} 45%, #555555 100%)`,
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent',
      fontWeight: 800, fontSize: sz(15), fontFamily: 'Inter, sans-serif', lineHeight: 1.2,
    };
    const activeGrad: React.CSSProperties = {
      backgroundImage: `linear-gradient(to bottom, ${accentColor} 45%, #555555 100%)`,
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent',
      fontWeight: 900, fontSize: sz(44), lineHeight: 1, fontFamily: 'Inter, sans-serif',
      // Padding ensures Devanagari vowel marks that extend outside the logical glyph box
      // are still within the -webkit-background-clip area and receive the gradient color.
      padding: '0 6px',
    };
    // Flat (no-emphasis) lines keep the white→gray "shadow" gradient too — at caption size,
    // matching the Lambda export's flatGrad so the shadow shows on every line, not just
    // emphasized ones. (The default flatStyle would strip the gradient to a solid fill.)
    const flatGrad: React.CSSProperties = {
      backgroundImage: `linear-gradient(to bottom, ${captionTextColor} 45%, #555555 100%)`,
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent',
      fontWeight: 800, fontSize: sz(20), fontFamily: 'Inter, sans-serif', lineHeight: 1.2,
    };
    return emphasisLayout(phrase, activeGrad, ctxGrad, { layered: true, flatStyle: flatGrad });
  }

  // clean_motion: words slide up from below as spoken (opacity 0→1, translateY 14→0)
  if (captionStyle === 'clean_motion') {
    if (!phrase) return null;
    const cmPx = Math.max(1, Math.round(sz(18) * phraseFit(phrase, sz(18))));
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', maxWidth: '90%', overflow: 'hidden' }}>
            {phrase.map(w => (
              <span key={w.id} data-w={w.id} style={{
                color: captionTextColor, fontWeight: 500, fontSize: cmPx,
                fontFamily: 'Inter, sans-serif', display: 'inline-block',
                // frame-based slide-up entry (renders in export, unlike the old CSS transition)
                ...entrancePose(currentTimeMs, w.startMs, { durMs: 180, dy: 14 }),
              }}>{w.text}</span>
            ))}
          </div>
        </div>
      </>
    );
  }

  // bubble: SINGLE-LINE display — current phrase only; active word gets the bubble bg.
  if (captionStyle === 'bubble') {
    if (!phrase) return null;
    // gapPx 22 = the 6px flex gap + each word's 8px+8px bubble padding (frac trimmed to cover
    // the un-gapped last pill's padding); Montserrat 700 runs wide → factor.
    const bbPx = Math.max(1, Math.round(sz(17) * phraseFit(phrase, sz(17), { gapPx: 22, frac: 0.88, factor: 1.15 })));
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', overflow: 'hidden' }}>
            {phrase.map(w => {
              const active = currentTimeMs >= w.startMs && currentTimeMs <= w.endMs;
              return (
                <span key={w.id} data-w={w.id} style={{
                  fontFamily: 'Montserrat, sans-serif',
                  display: 'inline-block',
                  fontWeight: 700,
                  fontSize: bbPx,
                  color: active ? '#000' : captionTextColor,
                  background: active ? (w.styleOverride?.color ?? userAccent ?? '#48A680') : 'transparent',
                  padding: '2px 8px',
                  borderRadius: 8,
                }}>{w.text}</span>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // mr_beast_2: ENTIRE LINE comes uniformly (like Mr Beast 1) — gold Futura, no per-word emphasis.
  if (captionStyle === 'mr_beast_2') {
    if (!phrase) return null;
    const mrb2 = (w: TranscriptWord): React.CSSProperties => ({
      color: w.styleOverride?.color ?? userText ?? '#FFD700', fontWeight: 900, fontSize: sz(20),
      textTransform: 'uppercase',
      fontFamily: 'Futura, "Trebuchet MS", "Century Gothic", sans-serif',
      textShadow: '0px 8px 2px rgba(0,0,0,0.85), 0px 10px 4px rgba(0,0,0,0.75), 0px -2px 0px rgba(0,0,0,1)',
    });
    return phraseRow(phrase, mrb2, mrb2);
  }

  // iman_gadzhi: FULL SEGMENT, uniform style. NO emphasis dependency — all words same size.
  // ALL CAPS, MonaSans (Montserrat), 600 weight, white. Renders the entire phrase at once.
  if (captionStyle === 'iman_gadzhi') {
    if (!phrase) return null;
    const igPx = Math.max(1, Math.round(sz(18) * phraseFit(phrase, sz(18), { upper: true, factor: 1.15 })));
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', maxWidth: '90%', overflow: 'hidden' }}>
            {phrase.map(w => (
              <span key={w.id} data-w={w.id} style={{
                color: captionTextColor, fontWeight: 600, fontSize: igPx,
                textTransform: 'uppercase', fontFamily: 'MonaSans, Montserrat, sans-serif',
                display: 'inline-block',
              }}>{w.text}</span>
            ))}
          </div>
        </div>
      </>
    );
  }

  // highlighted_word: active word orange #F5A623, all others white
  // T4: Montserrat 600, white, activeStyle.styles.color = #F5A623
  if (captionStyle === 'highlighted_word') {
    if (!phrase) return null;
    return phraseRow(phrase,
      ()  => ({ color: userAccent ?? '#F5A623', fontWeight: 700, fontSize: sz(17), fontFamily: 'Montserrat, sans-serif' }),
      ()  => ({ color: captionTextColor,  fontWeight: 600, fontSize: sz(17), fontFamily: 'Montserrat, sans-serif' }),
    );
  }

  // clean_glow: ALL words have same white glow — no per-word active/inactive split
  // T4: Inter, white, textShadow 0 0 14px rgba(255,255,255,0.9) on ALL words
  if (captionStyle === 'clean_glow') {
    if (!phrase) return null;
    const cgStyle: React.CSSProperties = {
      color: captionTextColor, fontWeight: 500, fontSize: sz(18),
      fontFamily: 'Inter, sans-serif',
      textShadow: '0px 0px 14px rgba(255, 255, 255, 0.9)',
    };
    return phraseRow(phrase, () => cgStyle, () => cgStyle);
  }

  // captik_clean: ALL words same white with subtle shadow — clean uniform look
  // T4: Inter, white, textShadow 1px 1px 2px rgba(0,0,0,0.3) on ALL words
  if (captionStyle === 'captik_clean') {
    if (!phrase) return null;
    const kcStyle: React.CSSProperties = {
      color: captionTextColor, fontWeight: 400, fontSize: sz(18),
      fontFamily: 'Inter, sans-serif',
      textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)',
    };
    return phraseRow(phrase, () => kcStyle, () => kcStyle);
  }

  // captik_word: PROGRESSIVE REVEAL — past + current words visible (opacity 1), future dim.
  // No emphasis dependency; all words same size, all white. Builds the phrase as it's spoken.
  if (captionStyle === 'captik_word') {
    if (!phrase) return null;
    const activeIdx = phrase.findIndex(w => currentTimeMs >= w.startMs && currentTimeMs <= w.endMs);
    const spokenUpTo = activeIdx >= 0 ? activeIdx : -1;
    const cwPx = Math.max(1, Math.round(sz(18) * phraseFit(phrase, sz(18))));
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', maxWidth: '90%', overflow: 'hidden' }}>
            {phrase.map((w, i) => {
              const visible = i <= spokenUpTo;
              return (
                <span key={w.id} data-w={w.id} style={{
                  color: w.styleOverride?.color ?? captionTextColor,
                  fontWeight: 600, fontSize: cwPx,
                  fontFamily: 'Inter, sans-serif',
                  opacity: visible ? 1 : 0.18,
                  transition: 'opacity 0.15s ease-in', display: 'inline-block',
                }}>{w.text}</span>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // liquid_glass: glass pill; words reveal PROGRESSIVELY as spoken (like ali_abdaal).
  // Spoken → white; unspoken → dim warm gray #918b7c. Glass pill (blur) wraps the phrase.
  if (captionStyle === 'liquid_glass') {
    if (!phrase) return null;
    const lgPx = Math.max(1, Math.round(sz(15) * phraseFit(phrase, sz(15), { frac: 0.78, factor: 1.15 })));  // pill pads 22px/side; Montserrat
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 36, padding: '8px 22px', display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', alignItems: 'baseline', backdropFilter: 'blur(10px)', overflow: 'hidden' }}>
            {phrase.map(w => {
              const spoken = currentTimeMs >= w.startMs;
              return (
                <span key={w.id} data-w={w.id} style={{
                  fontFamily: 'Montserrat, sans-serif', display: 'inline-block',
                  fontWeight: spoken ? 400 : 300, fontSize: lgPx,
                  color: spoken ? (userText ?? '#ffffff') : '#918b7c',
                  opacity: spoken ? 1 : 0.45,
                  transition: 'opacity 0.1s ease-in, color 0.1s ease-in',
                }}>{w.text}</span>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // delhi: PROGRESSIVE REVEAL with per-word font. Past+current visible; future dim.
  // Emphasized words → italic serif (Instrument Serif). Non-emph → sans (Instrument Sans).
  if (captionStyle === 'delhi') {
    if (!phrase) return null;
    const activeIdx = phrase.findIndex(w => currentTimeMs >= w.startMs && currentTimeMs <= w.endMs);
    const spokenUpTo = activeIdx >= 0 ? activeIdx : -1;
    const dlPx = Math.max(1, Math.round(sz(17) * phraseFit(phrase, sz(17))));
    return (
      <>
        <style>{ANIM_CSS}</style>
        {/* font-locked: the serif-italic emphasis face IS the template (mirrors the export) */}
        <div data-cfont-lock="" style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', maxWidth: '90%', alignItems: 'baseline', overflow: 'hidden' }}>
            {phrase.map((w, i) => {
              const visible = i <= spokenUpTo;
              const isEmphWord = isEmph(w);
              return (
                <span key={w.id} data-w={w.id} style={{
                  fontFamily: isEmphWord
                    ? 'InstrumentSerifItalic, "Instrument Serif", serif'
                    : 'InstrumentSans, "Instrument Sans", sans-serif',
                  fontStyle: isEmphWord ? 'italic' : 'normal',
                  textShadow: isEmphWord ? '0 0 18px rgba(255,255,255,0.7)' : 'none',
                  color: w.styleOverride?.color ?? captionTextColor,
                  fontWeight: 400, fontSize: dlPx, display: 'inline-block',
                  opacity: visible ? 1 : 0.2,
                  transition: 'opacity 0.15s ease-in',
                }}>{w.text}</span>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MULTI-LINE STYLES — use nextPhrase (next segment), not a split of current
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // tabahi: ALL CAPS, comic/heavy font (KomikaAxis), black outline, current + next
  // T4: KomikaAxis, 900, uppercase, black textShadow outline, WebkitTextStroke 0.066em black — NOT italic
  if (captionStyle === 'tabahi') {
    if (!phrase) return null;
    // KomikaAxis runs ~15% wider than the estimator's sans baseline → factor 1.15.
    const tbPx = Math.max(1, Math.round(sz(20) * phraseFit(phrase, sz(20), { gapPx: 5, upper: true, factor: 1.15 })));
    // Outline offsets shrink with a fitted font (capped at the stock 4px so the normal look is
    // byte-identical) — un-scaled they'd wrap tiny glyphs in a solid band.
    const tbO = Math.min(4, Math.max(1, Math.round(tbPx * (4 / 20))));
    const outline = `black -${tbO}px -${tbO}px 0px, black ${tbO}px -${tbO}px 0px, black -${tbO}px ${tbO}px 0px, black ${tbO}px ${tbO}px 0px, black 0px ${tbO}px 0px, black ${tbO}px 0px 0px, black 0px -${tbO}px 0px, black -${tbO}px 0px 0px`;
    const tStyle: React.CSSProperties = {
      color: captionTextColor, fontWeight: 900, fontSize: tbPx,
      fontFamily: 'KomikaAxis, "Comic Sans MS", cursive',
      textTransform: 'uppercase',
      textShadow: outline,
      WebkitTextStroke: '0.066em black',
    };
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div data-cap-row="" style={{ display: 'flex', gap: 5, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', overflow: 'hidden' }}>
              {phrase.map(w => (
                <span key={w.id} data-w={w.id} style={{ display: 'inline-block', ...tStyle }}>{w.text}</span>
              ))}
            </div>
            {captionLines !== 'single' && nextPhrase && nextPhrase.length > 0 && (
              <div data-cap-row="" style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', opacity: 0.75 }}>
                {nextPhrase.map(w => (
                  <span key={w.id} data-w={w.id} style={{ display: 'inline-block', ...tStyle, fontSize: sz(17) }}>{w.text}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SINGLE-WORD POP STYLES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // captik_glow: progressive word-by-word reveal, center-aligned.
  // Glow: tight contained textShadow on accent-colored emph words; neutral dark radial bg overlay.
  if (captionStyle === 'captik_glow') {
    if (!phrase) return null;

    const buildGlow = (color: string) => [
      `0 0 ${sz(3)}px  ${hexToRgba(color, 1)}`,
      `0 0 ${sz(7)}px  ${hexToRgba(color, 0.65)}`,
      `0 0 ${sz(16)}px ${hexToRgba(color, 0.32)}`,
      `0 0 ${sz(27)}px ${hexToRgba(color, 0.1)}`,
    ].join(', ');

    const accentSplash: React.CSSProperties = {
      color: accentColor, fontWeight: 900, fontSize: sz(46),
      textTransform: 'uppercase', lineHeight: 1, fontFamily: 'Inter, sans-serif',
      textShadow: buildGlow(accentColor),
    };
    const whiteCtx: React.CSSProperties = {
      color: captionTextColor, fontWeight: 700, fontSize: sz(20),
      fontFamily: 'Inter, sans-serif', lineHeight: 1.2,
      textShadow: buildGlow(captionTextColor),
    };

    const wordStyle = (w: TranscriptWord): React.CSSProperties => {
      if (!isEmph(w)) return whiteCtx;
      const overrideColor = w.styleOverride?.color ?? emphHex;
      const base = overrideColor
        ? { ...accentSplash, color: overrideColor, textShadow: buildGlow(overrideColor) }
        : accentSplash;
      return emphSizeMul !== 1
        ? { ...base, fontSize: Math.round(Number(base.fontSize ?? sz(46)) * emphSizeMul) }
        : base;
    };
    const outerPos: React.CSSProperties = {
      position: 'absolute',
      top: `${captionYPercent}%`,
      left: `${captionXPercent}%`,
      width: `${captionWidthPercent}%`,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      padding: '0 10px',
      display: 'flex',
      justifyContent: 'center',
    };
    const revealed = (w: TranscriptWord) => currentTimeMs >= w.startMs;
    const revealStyle = (w: TranscriptWord): React.CSSProperties => ({
      // captik / captik_glow / captik_shadow: hard reveal as spoken, no fade in or out.
      opacity: revealed(w) ? 1 : 0,
    });

    // Fit guards (same technique as emphasisLayout): context rows shrink as a unit, the
    // glowing hero shrinks alone — no-ops whenever the text already fits.
    const glowCtxPx = Number(whiteCtx.fontSize ?? 0) || sz(20);
    const glowCtxRow = (ws: TranscriptWord[]): React.CSSProperties => {
      const f = phraseFit(ws, glowCtxPx, { frac: 0.94, forceRow: true, gapPx: sz(6) });
      return f < 1 ? { ...whiteCtx, fontSize: Math.max(1, Math.round(glowCtxPx * f)) } : whiteCtx;
    };
    const fittedWordStyle = (w: TranscriptWord): React.CSSProperties => {
      const s  = wordStyle(w);
      const px = Number(s.fontSize ?? 0) || sz(46);
      const t  = s.textTransform === 'uppercase' ? w.text.toUpperCase() : w.text;
      const f  = rowFit([{ text: t, fontPx: px }], { gapPx: 0, frac: 0.94, forceRow: true });
      return f < 1 ? { ...s, fontSize: Math.max(1, Math.round(px * f)) } : s;
    };

    // No emph → progressive flat row (single line, no wrapping)
    if (!phrase.some(isEmph)) {
      const flatCtx = glowCtxRow(phrase);
      return (
        <>
          <style>{ANIM_CSS}</style>
          <div style={outerPos} data-caption-content="true">
            <div data-cap-row="" style={{ display: 'flex', gap: sz(6), flexWrap: 'nowrap', justifyContent: 'center' }}>
              {phrase.map(w => (
                <span key={w.id} data-w={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...flatCtx, ...revealStyle(w) }}>{w.text}</span>
              ))}
            </div>
          </div>
        </>
      );
    }

    // Spotlight — hero word alone with its glow, context hidden.
    const glowSpotlit = phrase.find(w => isSpotlit(w) && currentTimeMs >= w.startMs);
    if (glowSpotlit) {
      return (
        <>
          <style>{ANIM_CSS}</style>
          <div style={outerPos} data-caption-content="true">
            <div data-cap-row="" style={{ display: 'flex', justifyContent: 'center' }}>
              <span data-emph="" style={{ fontFamily: ff(glowSpotlit), display: 'inline-block', ...fittedWordStyle(glowSpotlit), ...popIn(currentTimeMs, glowSpotlit.startMs, { fade: !noLineFade }) }}>
                {glowSpotlit.text}
              </span>
            </div>
          </div>
        </>
      );
    }

    // Build sections — words reveal as spoken; layout positions fixed from start
    const glowSections = buildEmphasisSections(phrase, isEmph);
    const glowCentered = layoutMode === 'center';

    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={outerPos} data-caption-content="true">
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: sz(2), width: 'fit-content' }}>
            {glowSections.flatMap((sec, si) => {
              const nodes: React.ReactNode[] = [];
              if (sec.pre.length > 0) {
                const preCtx = glowCtxRow(sec.pre);
                nodes.push(
                  <div key={`pre${si}`} data-cap-row="" style={{ display: 'flex', gap: sz(6), justifyContent: glowCentered ? 'center' : 'flex-start' }}>
                    {sec.pre.map(w => (
                      <span key={w.id} data-w={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...preCtx, ...revealStyle(w) }}>{w.text}</span>
                    ))}
                  </div>
                );
              }
              nodes.push(
                <div key={`emph${si}`} data-cap-row="" style={{ display: 'flex', justifyContent: 'center' }}>
                  <span data-emph="" data-w={sec.emph.id} style={{ fontFamily: ff(sec.emph), display: 'inline-block', ...fittedWordStyle(sec.emph), ...revealStyle(sec.emph) }}>{sec.emph.text}</span>
                </div>
              );
              if (sec.trailing.length > 0) {
                const trailCtx = glowCtxRow(sec.trailing);
                nodes.push(
                  <div key={`trail${si}`} data-cap-row="" style={{ display: 'flex', gap: sz(6), justifyContent: glowCentered ? 'center' : 'flex-end' }}>
                    {sec.trailing.map(w => (
                      <span key={w.id} data-w={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...trailCtx, ...revealStyle(w) }}>{w.text}</span>
                    ))}
                  </div>
                );
              }
              return nodes;
            })}
          </div>
        </div>
      </>
    );
  }

  // deep_glow: ALL words magenta glow (uniform)
  // T4: TheBoldFont, 900, uppercase, textShadow 0 0 10/20/30/40px #FF00FF on ALL words
  if (captionStyle === 'deep_glow') {
    if (!phrase) return null;
    const glowCol     = userText ?? '#FF00FF';
    const magentaGlow = `0 0 3px ${glowCol}, 0 0 6px ${glowCol}, 0 0 9px ${glowCol}`;
    const magentaDim  = `0 0 2px ${hexToRgba(glowCol, 0.2)}`;
    const dgPx = Math.max(1, Math.round(sz(20) * phraseFit(phrase, sz(20), { gapPx: 5, frac: 0.95, upper: true, factor: 1.1 })));
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div style={{ display: 'flex', gap: 5, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', overflow: 'hidden' }}>
            {phrase.map(w => {
              const spoken = currentTimeMs >= w.startMs;
              return (
                <span key={w.id} data-w={w.id} style={{
                  fontFamily: 'TheBoldFont, Anton, Impact, sans-serif', display: 'inline-block',
                  color: glowCol, fontWeight: 900, fontSize: dgPx,
                  textTransform: 'uppercase',
                  textShadow: spoken ? magentaGlow : magentaDim,
                  opacity: spoken ? 1 : 0.28,
                  transition: 'opacity 0.12s ease-in',
                }}>{w.text}</span>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // seedha_saadha: progressive reveal — Rubik Black, uppercase, black outline
  if (captionStyle === 'seedha_saadha') {
    if (!phrase) return null;
    const ssPx = Math.max(1, Math.round(sz(22) * phraseFit(phrase, sz(22), { upper: true, factor: 1.1 })));
    const ssO  = Math.min(4, Math.max(1, Math.round(ssPx * (4 / 22))));
    const outline = `black -${ssO}px -${ssO}px 0px, black ${ssO}px -${ssO}px 0px, black -${ssO}px ${ssO}px 0px, black ${ssO}px ${ssO}px 0px, black 0px ${ssO}px 0px, black ${ssO}px 0px 0px, black 0px -${ssO}px 0px, black -${ssO}px 0px 0px`;
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', maxWidth: '90%', overflow: 'hidden' }}>
            {phrase.map(w => {
              const spoken = currentTimeMs >= w.startMs;
              return (
                <span key={w.id} data-w={w.id} style={{
                  color: captionTextColor, fontWeight: 900, fontSize: ssPx,
                  fontFamily: 'RubikBlack, Rubik, sans-serif',
                  textTransform: 'uppercase', textShadow: outline,
                  WebkitTextStroke: '0.085em black',
                  display: 'inline-block',
                  opacity: spoken ? 1 : 0.18,
                  transition: 'opacity 0.1s ease-in',
                }}>{w.text}</span>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // thora_cinematic: Montserrat 600, ALL CAPS, wide letter-spacing (PHRASE mode)
  // T4: Montserrat 600, 20px, uppercase, letterSpacing 20px, uniform all words
  if (captionStyle === 'thora_cinematic') {
    if (!phrase) return null;
    const tcStyle: React.CSSProperties = {
      color: captionTextColor, fontWeight: 600, fontSize: sz(16),
      fontFamily: 'Montserrat, sans-serif',
      textTransform: 'uppercase', letterSpacing: '0.28em',
    };
    return phraseRow(phrase, () => tcStyle, () => tcStyle, undefined, 10);
  }

  // pixelated: single word at a time, monospace/pixelated font (WORD mode)
  if (captionStyle === 'pixelated') {
    // font-locked: the pixel face IS the template — exempt from the custom-font override.
    return (
      <div data-cfont-lock="" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {singleWord({
          color: activeWord?.styleOverride?.color ?? captionTextColor,
          fontWeight: 700, fontSize: sz(16),
          fontFamily: 'VPPixel, "Courier New", monospace', textTransform: 'uppercase', letterSpacing: '0.1em',
        })}
      </div>
    );
  }

  // dynamic: the reference-reel word CLUSTER — one hero word HUGE in accent (Anton),
  // support words small white around it, asymmetric per line (seeded flip + tilt).
  // Built for autopilot's per-line box placement: the cluster lives wherever the
  // line's box was placed, so scattered placements read as composed word art.
  if (captionStyle === 'dynamic') {
    if (!phrase) return null;
    const seed = phrase[0].id;
    // Hero = the emphasised word (largest scale / colored), else the longest word.
    const heroIdx = (() => {
      let idx = -1;
      let best = 1;
      phrase.forEach((w, i) => {
        const s = (w.styleOverride?.scale ?? 1) + (w.styleOverride?.color ? 0.5 : 0);
        if (s > best) { best = s; idx = i; }
      });
      if (idx >= 0) return idx;
      let li = 0;
      phrase.forEach((w, i) => { if (w.text.length > phrase[li].text.length) li = i; });
      return li;
    })();
    const pre = phrase.slice(0, heroIdx);
    const hero = phrase[heroIdx];
    const post = phrase.slice(heroIdx + 1);
    const flip = random(`${seed}:dynflip`) < 0.5;
    const tilt = (random(`${seed}:dyntilt`) - 0.5) * 5;
    // Director-authored typography: hero/support faces per video (poster pairings —
    // serif-italic or script heroes read lowercase, impact sans heroes read caps).
    const ITALIC_FACES = new Set(['Playfair Display', 'InstrumentSerifItalic', 'LobsterTwoItalic']);
    const heroFace = dynamicSpec?.heroFont ?? 'Anton';
    const supportFace = dynamicSpec?.supportFont ?? 'Montserrat';
    const heroItalic = ITALIC_FACES.has(heroFace);
    const heroPx0 = sz(30);
    const heroFit = rowFit(
      [{ text: heroItalic ? hero.text : hero.text.toUpperCase(), fontPx: heroPx0, factor: fontWidthFactor(`${heroFace}, sans-serif`) }],
      { frac: 0.95, forceRow: true },
    );
    const heroPx = Math.max(14, Math.round(heroPx0 * heroFit));
    const heroColor = hero.styleOverride?.color ?? dynamicSpec?.heroColor ?? userAccent;
    const smallStyle = (w: TranscriptWord): React.CSSProperties => ({
      fontFamily: `${supportFace}, sans-serif`, fontWeight: 700, fontSize: sz(12.5),
      color: userText, textTransform: 'uppercase', letterSpacing: '0.06em',
      textShadow: '0 2px 10px rgba(0,0,0,0.55)',
      ...entrancePose(currentTimeMs, w.startMs, { durMs: 260, dy: 8, blur: 2 }),
    });
    return (
      <div style={pos}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: flip ? 'flex-start' : 'flex-end', gap: 2, maxWidth: '96%', transform: `rotate(${tilt.toFixed(2)}deg)` }}>
          {pre.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: flip ? 'flex-start' : 'flex-end' }}>
              {pre.map((w) => <span key={w.id} data-w={w.id} style={{ display: 'inline-block', ...smallStyle(w) }}>{w.text}</span>)}
            </div>
          )}
          <span
            key={hero.id}
            data-w={hero.id}
            style={{
              display: 'inline-block', fontFamily: `${heroFace}, ${heroItalic ? 'serif' : 'sans-serif'}`,
              fontWeight: heroItalic ? 700 : 400, fontStyle: heroItalic ? 'italic' : 'normal',
              fontSize: heroPx, lineHeight: 1.02, color: heroColor,
              textTransform: heroItalic ? 'none' : 'uppercase', letterSpacing: heroItalic ? '0' : '0.01em',
              textShadow: `0 0 ${Math.round(heroPx * 0.25)}px ${heroColor}55, 0 4px 18px rgba(0,0,0,0.5)`,
              ...entrancePose(currentTimeMs, hero.startMs, { durMs: 340, scaleFrom: 0.5, overshoot: true, blur: 3 }),
            }}
          >
            {hero.text}
          </span>
          {post.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: flip ? 'flex-end' : 'flex-start', alignSelf: flip ? 'flex-end' : 'flex-start' }}>
              {post.map((w) => <span key={w.id} data-w={w.id} style={{ display: 'inline-block', ...smallStyle(w) }}>{w.text}</span>)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // black_punch: ALL CAPS, Anton, black text with a thick WHITE outline.
  // Mirrors KineticCaptionComposition's export branch EXACTLY (preview == export): a
  // resolution-scaled white ring + faint dark halo replaces the old invisible 0.3px gray
  // stroke + all-black shadow, so it reads on dark OR bright footage.
  if (captionStyle === 'black_punch') {
    if (!phrase) return null;
    // Fit FIRST, then derive the white ring from the FITTED size: the ring offsets are what make
    // the style, but at a shrunken font un-scaled sz(3) offsets would paint the ring over the
    // NEIGHBOURING glyphs (white swallowing the last letter of each word).
    const bpBase = sz(22);
    const bpPx   = Math.max(1, Math.round(bpBase * phraseFit(phrase, bpBase, { upper: true, factor: 0.92 })));
    const bpO    = Math.max(1, Math.round(bpPx * (3 / 22)));
    const bpRing = `#fff -${bpO}px -${bpO}px 0px, #fff ${bpO}px -${bpO}px 0px, #fff -${bpO}px ${bpO}px 0px, #fff ${bpO}px ${bpO}px 0px, #fff 0px ${bpO}px 0px, #fff ${bpO}px 0px 0px, #fff 0px -${bpO}px 0px, #fff -${bpO}px 0px 0px`;
    const bpStyle: React.CSSProperties = {
      color: '#000000', fontWeight: 700, fontSize: bpPx,
      textTransform: 'uppercase',
      fontFamily: 'Anton, sans-serif',
      WebkitTextStroke: '0.045em #ffffff',
      textShadow: `${bpRing}, 0px 0px ${Math.max(1, Math.round(bpPx * (2 / 22)))}px rgba(0,0,0,0.45)`,
    };
    return phraseRow(phrase, () => bpStyle, () => bpStyle);
  }

  // boxed: orange bg box, ALL CAPS bold, animated per-segment
  if (captionStyle === 'boxed') {
    if (!phrase) return null;
    const boxKey = phrase.map(w => w.id).join(',');
    // The pill text WRAPS naturally, so only a single overlong word can escape the box.
    const bxFit = fitWordScale(phrase.map(w => ({ text: w.text.toUpperCase(), fontPx: sz(19) })), boxPx * 0.8);
    const bxPx  = Math.max(1, Math.round(sz(19) * bxFit));
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div key={boxKey} data-cap-row="" style={{ padding: '7px 18px', background: userAccent ?? '#f48601', borderRadius: 4, ...popIn(currentTimeMs, phrase[0].startMs, { box: true, fade: !noLineFade }), fontFamily: 'Inter, sans-serif' }}>
            <span style={{ fontSize: bxPx, fontWeight: 700, color: captionTextColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {phrase.map(w => w.text).join(' ')}
            </span>
          </div>
        </div>
      </>
    );
  }

  if (captionStyle === 'prism') {
    if (!phrase) return null;
    const prismStyle = (w: { styleOverride?: { color?: string } }) => ({
      color: w.styleOverride?.color ?? userText ?? '#A34EFF', fontWeight: 700, fontSize: sz(19),
      textTransform: 'uppercase' as const, fontFamily: 'Montserrat, sans-serif',
      letterSpacing: '0.04em',
    });
    return phraseRow(phrase, prismStyle, prismStyle);
  }

  // devin_jatho: ALL words same purple #A34EFF, uniform — no active/inactive split
  // T4: Montserrat bold uppercase, #A34EFF, dark textShadow, no activeStyle
  if (captionStyle === 'devin_jatho') {
    if (!phrase) return null;
    const djStyle: React.CSSProperties = {
      color: userText ?? '#A34EFF', fontWeight: 700, fontSize: sz(19),
      fontFamily: 'Montserrat, sans-serif',
      textTransform: 'uppercase',
    };
    return phraseRow(phrase, () => djStyle, () => djStyle);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HORMOZI / MRBEAST — entire segment uniform (no active/inactive differential)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // hormozi: lime gradient, Anton font, drop-shadow filter
  // T4: Anton 700, uppercase, green gradient, filter drop-shadow(10px 10px 6px rgba(71,79,46,0.9))
  if (captionStyle === 'hormozi') {
    if (!phrase) return null;
    // When the user picks a colour, rebuild the gradient (and its drop-shadow) from it so hormozi
    // keeps its light↔dark "pop" instead of flattening to a solid; at the default it's byte-identical
    // to the signature lime ramp + olive shadow.
    const limeGrad: React.CSSProperties = {
      backgroundImage: userText
        ? `linear-gradient(to bottom, ${shadeHex(userText, -15)} 0%, ${userText} 50%, ${shadeHex(userText, 20)} 100%)`
        : 'linear-gradient(to bottom, #77a748 0%, #8abe4c 25%, #97DE25 38%, #9FF747 60%, #a5fd4b 100%)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent',
      fontFamily: 'Anton, sans-serif', fontWeight: 700, textTransform: 'uppercase',
      filter: userText
        ? `drop-shadow(10px 10px 6px ${hexToRgba(shadeHex(userText, -60), 0.9)})`
        : 'drop-shadow(10px 10px 6px rgba(71, 79, 46, 0.9))',
    };
    return phraseRow(phrase,
      () => ({ ...limeGrad, fontSize: sz(20) }),
      () => ({ ...limeGrad, fontSize: sz(20) }),
    );
  }

  // mrbeast (MR_BEAST_STYLE_1): white, LuckiestGuy, thick black outline
  // T4: LuckiestGuy, white 900, uppercase, textShadow black offsets + WebkitTextStroke
  if (captionStyle === 'mrbeast') {
    if (!phrase) return null;
    // Pre-fit so the fixed 4px outline can shrink with the font (capped at stock 4px).
    const mbPx = Math.max(1, Math.round(sz(20) * phraseFit(phrase, sz(20), { upper: true, factor: 1.1 })));
    const mbO  = Math.min(4, Math.max(1, Math.round(mbPx * (4 / 20))));
    const outline = `black -${mbO}px -${mbO}px 0px, black ${mbO}px -${mbO}px 0px, black -${mbO}px ${mbO}px 0px, black ${mbO}px ${mbO}px 0px, black 0px ${mbO}px 0px, black ${mbO}px 0px 0px, black 0px -${mbO}px 0px, black -${mbO}px 0px 0px`;
    return phraseRow(phrase,
      (w) => ({ color: w.styleOverride?.color ?? captionTextColor, fontWeight: 900, fontSize: mbPx, textTransform: 'uppercase', fontFamily: 'LuckiestGuy, "Luckiest Guy", cursive', textShadow: outline, WebkitTextStroke: '0.015em black' }),
      ()  => ({ color: captionTextColor, fontWeight: 900, fontSize: mbPx, textTransform: 'uppercase', fontFamily: 'LuckiestGuy, "Luckiest Guy", cursive', textShadow: outline, WebkitTextStroke: '0.015em black' }),
    );
  }

  // ── Big Reveal: emphasised TITLE behind the subject (own box) + lower caption (own box) ──
  // Two independent boxes. The matte (subject cut-out) is blitted OVER this overlay on every
  // surface, so the title reads as behind the person; the user lines the title box up with the
  // head so it's ~50% covered. The title's emphasised words slide UP into existence word-by-word
  // as they are spoken; non-emphasised words form a normal caption below the subject.
  if (captionStyle === 'big_reveal') {
    if (!phrase) return null;

    // Project-wide emphasis test (color or scale>1) — identical to every other template.
    const isE = (w: TranscriptWord) =>
      !!(w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1));

    const emphWords = phrase.filter(isE);
    const restWords = phrase.filter(w => !isE(w));
    // Title shows only the emphasised words already spoken, so they appear one-by-one (the row
    // re-centres as each arrives — the "slide up word-by-word" look).
    const titleVisible = emphWords.filter(w => currentTimeMs >= w.startMs);

    // Fit guards: the title row WRAPS, so the longest emphasised word must fit the TITLE box
    // (estimated over ALL emph words — not just the revealed ones — so the size never changes
    // mid-reveal); the lower caption is a nowrap row that must fit ITS box in single mode.
    const titleBase  = Math.round(46 * emphFontScale);   // big hero title — independent scale
    const titleBoxPx = canvasWidthPx * (emphBoxWidthPercent / 100);
    const titleFit   = fitWordScale(
      emphWords.map(w => ({ text: w.text.toUpperCase(), fontPx: titleBase, factor: 1.1 })),
      titleBoxPx,
    );
    const TITLE_FS = Math.max(1, Math.round(titleBase * titleFit));
    const lowerFit = phraseFit(restWords, sz(15), { frac: 0.95, gapPx: sz(6) });
    const LOWER_FS = Math.max(1, Math.round(sz(15) * lowerFit));   // normal lower caption (global captionFontScale)

    const seed = phrase[0].id;

    return (
      <>
        {/* TITLE BOX — big bold uppercase, sits behind the subject; word-by-word slide-up.
            keyed by phrase id so each caption mounts fresh and the entrance replays.
            Rendered on the BACK layer (behind the cut-out) when 3-layer compositing is used. */}
        {emphWords.length > 0 && bigRevealLayer !== 'lower' && (
          <div key={`br-title-${seed}`} style={{
            position: 'absolute', top: `${emphBoxYPercent}%`, left: `${emphBoxXPercent}%`,
            width: `${emphBoxWidthPercent}%`, transform: 'translate(-50%,-50%)',
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end',
            gap: sz(10), overflow: 'visible', pointerEvents: 'none',
          }} data-caption-content="emph">
            {titleVisible.map(w => {
              const native = getFontFamily(w.text);
              return (
                <span key={w.id} data-w={w.id} style={{
                  display: 'inline-block',
                  fontFamily: native === 'system-ui, sans-serif' ? BIG_REVEAL_TITLE_FONT : native,
                  fontWeight: 900, fontSize: `${TITLE_FS}px`, lineHeight: 1,
                  textTransform: 'uppercase', letterSpacing: '-0.01em',
                  color: w.styleOverride?.color ?? BIG_REVEAL_YELLOW, whiteSpace: 'nowrap',
                  // Clean slide-up — no motion blur (per design).
                  ...entrancePose(currentTimeMs, w.startMs, { dy: sz(28), durMs: 420 }),
                }}>
                  {w.text}
                </span>
              );
            })}
          </div>
        )}

        {/* LOWER CAPTION BOX — normal caption below the subject. Rendered on the FRONT layer
            (above the cut-out) when 3-layer compositing is used, so it reads in front of the person. */}
        {restWords.length > 0 && bigRevealLayer !== 'title' && (
          <div key={`br-lower-${seed}`} style={{
            position: 'absolute', top: `${captionYPercent}%`, left: `${captionXPercent}%`,
            width: `${captionWidthPercent}%`, transform: 'translate(-50%,-50%)',
            display: 'flex', flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap',
            justifyContent: 'center', alignItems: 'baseline', gap: sz(6),
            overflow: 'hidden', pointerEvents: 'none',
          }} data-caption-content="true">
            {restWords.map(w => (
              <span key={w.id} data-w={w.id} style={{
                display: 'inline-block', fontFamily: ff(w), fontWeight: 700,
                fontSize: `${LOWER_FS}px`, color: captionTextColor, whiteSpace: 'nowrap',
                ...entrancePose(currentTimeMs, w.startMs, { durMs: 360, dy: sz(8) }),
              }}>
                {w.text}
              </span>
            ))}
          </div>
        )}
      </>
    );
  }

  // ── Illusion: CSS-transition preview (mirrors IllusionRow logic) ──────────
  if (captionStyle === 'illusion') {
    if (!phrase) return null;

    // Slot-resolved typography (caller pre-merges global + per-line). baseColor falls back to the
    // global caption text colour when not overridden (preserves the pre-editable behaviour).
    const slots     = resolveIllusionSlots(templateSlots?.illusion);
    const OSANS     = slots.font;
    const baseColor = slots.baseColor ?? captionTextColor;
    const CTX_FS  = sz(15);
    const GAP     = sz(5);
    // In-animation override: non-'default' → every word does a uniform snappy slide (or appears
    // instantly), replacing the signature slide+glitch. The hemisphere lockup stays intact.
    const inAnim   = slots.inAnimation;
    const override = inAnim !== 'default';

    const isE = (w: TranscriptWord) =>
      !!(w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1));

    // Seed exactly like the export (Remotion random) so preview & export pick the IDENTICAL
    // layout/modifier for every segment — the visual look stays in sync between the two.
    const seed = phrase[0].id;

    if (!phrase.some(isE)) {
      // ── CONDITION 1: standard line — OBEYS the dotted box ──
      const mixed   = random(`${seed}:ls`) < 0.5;   // true → 1A mixed entry, false → 1B push
      // 1B push: only spoken words sit in the flow so flex-end shoves earlier ones left.
      const visible = mixed ? phrase : phrase.filter(w => currentTimeMs >= w.startMs);
      // Fit guard over the FULL phrase (stable during 1B's progressive reveal): 1A wraps →
      // longest word governs; 1B is a nowrap row → the whole line must fit.
      const c1Items = phrase.map(w => ({ text: w.text, fontPx: CTX_FS }));
      const c1Fit   = mixed ? fitWordScale(c1Items, boxPx * 0.94) : fitRowScale(c1Items, GAP, boxPx * 0.94);
      const C1_FS   = Math.max(1, Math.round(CTX_FS * c1Fit));
      return (
        <div style={{
          position: 'absolute', top: `${captionYPercent}%`, left: `${captionXPercent}%`,
          width: `${captionWidthPercent}%`, transform: 'translate(-50%,-50%)',
          display: 'flex',
          flexWrap: mixed ? 'wrap' : 'nowrap',
          justifyContent: 'center', // always centred — 1B never jumps to the box edge
          alignItems: 'baseline', gap: GAP, overflow: 'hidden', pointerEvents: 'none',
        }} data-caption-content="true">
          {visible.map((w, i) => {
            const fromX  = !mixed || i === 0;   // 1B all from X; 1A first from X, rest from Y
            return (
              <span key={w.id} data-w={w.id} style={{
                display: 'inline-block', fontFamily: OSANS, fontWeight: 700,
                fontSize: C1_FS, color: baseColor, whiteSpace: 'nowrap',
                // frame-based slide+blur entry (renders in export, unlike the old CSS transition)
                ...(override
                  ? inEntrancePose(inAnim as Exclude<typeof inAnim, 'default'>, currentTimeMs, w.startMs, sz(16))
                  : entrancePose(currentTimeMs, w.startMs, { durMs: 380, dx: fromX ? sz(16) : 0, dy: fromX ? 0 : sz(16), blur: 4 })),
              }}>
                {w.text}
              </span>
            );
          })}
        </div>
      );
    }

    // ── CONDITION 2: the Hemisphere Lockup — OBEYS the dotted box ──
    // Mirrors IllusionRow: a 3-tier column centred INSIDE the box (top zone / emph word /
    // bottom zone). preWords & postWords are split across the two hemispheres (may swap,
    // seeded) and never share one; each hemisphere gets a random justify. The preview
    // approximates the export's velocity blur with CSS slide-in transitions.
    const ei   = phrase.findIndex(isE);
    const pre  = phrase.slice(0, ei);
    const emph = phrase[ei];
    const tail = phrase.slice(ei + 1);

    const emphSpoken         = currentTimeMs >= emph.startMs;
    const emphColor          = emph.styleOverride?.color ?? slots.emphColor ?? baseColor;
    // Fit guards: the lockup's master box is width:max-content, so an oversized hero word or
    // hemisphere row escapes the dotted box (and gets cut at the canvas edge) — clamp each.
    const emphFontSize = Math.max(1, Math.round(
      CTX_FS * 2.8 * fitWordScale([{ text: emph.text, fontPx: Math.round(CTX_FS * 2.8) }], boxPx * 0.94),
    ));
    // Positive clearance so the context hemispheres sit just CLEAR of the big word's glyphs.
    // (The old negative "tuck" combined with the emph word's crushed lineHeight pulled the
    // context rows down into the big word — the overlap the user reported. With lineHeight:1
    // the emph line box now contains its glyphs, so a small positive gap keeps it tight but
    // non-overlapping.)
    const tierGap      = `${Math.round(CTX_FS * 0.12)}px`;
    const zoneGap      = sz(2);   // hemisphere word gap — via sz() so preview & export stay proportional

    // Spatial hemisphere assignment — pre/post may swap; each hemisphere a random justify.
    const swap        = random(`${seed}:swap`) < 0.5;
    const topWords    = swap ? tail : pre;
    const bottomWords = swap ? pre  : tail;
    const topJustify: React.CSSProperties['justifyContent'] = random(`${seed}:tj`) < 0.5 ? 'flex-start' : 'flex-end';
    const botJustify: React.CSSProperties['justifyContent'] = random(`${seed}:bj`) < 0.5 ? 'flex-start' : 'flex-end';
    // Same glitch plan as the export (slot-driven; defaults reproduce the 2A strobe / 2B blur coin-flip).
    const { wantGlitch, useStrobe } = resolveGlitch(slots, {
      emphWordHasGlitchFlag: !!emph.styleOverride?.glitch,
      seedStrobe: random(`${seed}:em`),
    });
    const useStrobeAnim = wantGlitch && useStrobe;     // 2A — opacity strobe
    const useGaussian   = wantGlitch && !useStrobe;    // 2B — 7px→0 entry blur

    const zonePx = (ws: TranscriptWord[]) => ws.length
      ? Math.max(1, Math.round(CTX_FS * fitRowScale(ws.map(w => ({ text: w.text, fontPx: CTX_FS })), zoneGap, boxPx * 0.94)))
      : CTX_FS;
    const topPx = zonePx(topWords), botPx = zonePx(bottomWords);
    const zoneWord = (fs: number) => function ZoneWord(w: TranscriptWord) {
      return (
        <span key={w.id} data-w={w.id} style={{
          display: 'inline-block', lineHeight: 0.8, fontWeight: 700, fontSize: `${fs}px`,
          fontFamily: OSANS, color: baseColor, whiteSpace: 'nowrap',
          // frame-based slide+blur entry (renders in export, unlike the old CSS transition)
          ...(override
            ? inEntrancePose(inAnim as Exclude<typeof inAnim, 'default'>, currentTimeMs, w.startMs, sz(16))
            : entrancePose(currentTimeMs, w.startMs, { durMs: 380, dy: sz(10), blur: 3 })),
        }}>
          {w.text}
        </span>
      );
    };

    return (
      <>
      <style>{ILLUSION_CSS}</style>
      {/* key by phrase id so each caption mounts FRESH. Without it React reuses the emph
          <span> across phrases and its CSS transition animates from the previous phrase's
          resting position — the "slides down on appear, up when said" artifact. */}
      <div key={seed} style={{
        position: 'absolute', top: `${captionYPercent}%`, left: `${captionXPercent}%`,
        width: `${captionWidthPercent}%`, transform: 'translate(-50%,-50%)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        pointerEvents: 'none',
      }} data-caption-content="true">
        {/* THE TIGHTLY PACKED MASTER BOX */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', width: 'max-content',
        }}>
          {/* Tier 1 — top hemisphere: tucked DOWN onto the big word via negative margin */}
          {topWords.length > 0 && (
            <div style={{
              width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: topJustify,
              gap: zoneGap, marginBottom: tierGap, zIndex: 2,
            }}>
              {topWords.map(zoneWord(topPx))}
            </div>
          )}

          {/* Tier 2 — the emphasized word (lineHeight:1 so its line box contains the glyphs) */}
          <div style={{ overflow: 'visible', zIndex: 1 }}>
            <span style={{
              display: 'inline-block', fontFamily: OSANS, fontWeight: 900,
              fontSize: `${emphFontSize}px`, color: emphColor,
              lineHeight: 1, textAlign: 'center',
              // override → clean uniform slide (no glitch/velocity); default → signature slide + glitch.
              ...(override
                ? inEntrancePose(inAnim as Exclude<typeof inAnim, 'default'>, currentTimeMs, emph.startMs, sz(26))
                : {
                    // frame-based slide (+2B's 7px→0 blur) entry; 2A overrides opacity with the strobe.
                    ...entrancePose(currentTimeMs, emph.startMs, { durMs: 380, dy: sz(26), blur: useGaussian ? 7 : 0 }),
                    ...(useStrobeAnim ? { opacity: emphSpoken ? illusionStrobe(currentTimeMs - emph.startMs) : 0 } : {}),
                  }),
            }}>
              {emph.text}
            </span>
          </div>

          {/* Tier 3 — bottom hemisphere: tucked UP onto the big word via negative margin */}
          {bottomWords.length > 0 && (
            <div style={{
              width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: botJustify,
              gap: zoneGap, marginTop: tierGap, zIndex: 2,
            }}>
              {bottomWords.map(zoneWord(botPx))}
            </div>
          )}
        </div>
      </div>
      </>
    );
  }

  // ── Editor Masala: time-driven preview (mirrors EditorMasalaRow + the Python engine) ──
  // Reads Python engineData when present; otherwise uses the SAME deterministic fallback as
  // the export, with the SAME seed (phrase[0].id) and random() keys, so the preview and the
  // Lambda export pick the IDENTICAL layout / persistence / animation for every segment.
  if (captionStyle === 'editor_masala') {
    if (!phrase) return null;

    type EMEngine = { animation?: string; isHero?: boolean; isEmphasized?: boolean; fontWeight?: number };
    const eng = (w: TranscriptWord) => (w as TranscriptWord & { engineData?: EMEngine }).engineData;

    const seed    = phrase[0].id;
    // Slot-resolved fonts/colours/persona (caller pre-merges global + per-line; defaults === today's).
    const slots   = resolveEditorMasalaSlots(templateSlots?.editor_masala);
    // In-animation override (non-'default') → uniform snappy slide / instant appear; lockup untouched.
    const inAnim   = slots.inAnimation;
    const override = inAnim !== 'default';
    const CTX_FS  = sz(15);
    const ZONEGAP = sz(2);   // tight hemisphere word gap (like Illusion)
    // Positive clearance so the context hemispheres sit just clear of the hero's glyphs
    // (matches the Illusion fix — was a negative tuck + crushed heroLine that overlapped).
    const tierGap = `${Math.round(CTX_FS * 0.12)}px`;
    // (entrance easing now lives in entrancePose — frame-based so it renders in the export)

    // Context font: keep the script's Noto stack for Indic, swap the Latin default for the slot.
    const fontFor = (t: string) => {
      const f = getFontFamily(t);
      return f === 'system-ui, sans-serif' ? slots.contextFont : f;
    };

    // Hero: Python engineData / manual emphasis, else longest-significant-word fallback,
    // else index 0 — so the 3-tier lockup ALWAYS forms (matches the export exactly).
    const isHeroWord = (w: TranscriptWord) =>
      !!(eng(w)?.isEmphasized || eng(w)?.isHero
         || w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1));

    let emphIndex = phrase.findIndex(isHeroWord);
    if (emphIndex === -1) emphIndex = pickEditorMasalaHero(phrase);
    // Anti-collapse guarantee (mirrors the export): no Python hero AND no significant word →
    // force the single LONGEST word so the 3-tier lockup never collapses to a flat line.
    if (emphIndex === -1) emphIndex = phrase.reduce((b, w, i, a) => w.text.length > a[b].text.length ? i : b, 0);
    const heroWord  = phrase[emphIndex];

    // Hero visual persona (seeded; identical keys to the export).
    // A = Elegant Script (250%, serif italic, lowercase, white, 600).
    // B = Glowing Punch  (200%, base sans, uppercase, white/yellow, 900, heavy glow).
    // persona / swap / diagonal via the SAME salted djb2 hash as the plugin's _ng_emHash (over the
    // caption's word text), so the native AE insert makes the SAME choices as this preview.
    const emHash = (wl: { text: string }[], salt: string): number => {
      let s = salt; for (const w of wl) s += w.text;
      let h = 5381; for (let j = 0; j < s.length; j++) h = ((h * 33) ^ s.charCodeAt(j)) & 0x7fffffff;
      return h;
    };
    const persona: 'A' | 'B' =
      slots.personaMode === 'A' ? 'A' :
      slots.personaMode === 'B' ? 'B' :
      (emHash(phrase, '') % 2 === 0 ? 'A' : 'B');
    const heroIndic = getFontFamily(heroWord.text) !== 'system-ui, sans-serif';
    const heroFont  = heroIndic ? fontFor(heroWord.text)
                    : persona === 'A' ? slots.heroAFont
                    : slots.heroBFont;
    const heroStyle: React.CSSProperties['fontStyle'] = persona === 'A' && !heroIndic ? 'italic' : 'normal';
    const heroCase: React.CSSProperties['textTransform'] =
      heroIndic ? 'none' : persona === 'A' ? 'lowercase' : 'uppercase';
    // Fit guards: the tiers wrap, so only the (nowrap) hero word or a single overlong context
    // word can escape the box → clamp both at word level (no-ops when everything fits).
    const HERO_BASE = Math.round(CTX_FS * (persona === 'A' ? 2.5 : 2.2));
    const heroFitTx = heroCase === 'uppercase' ? heroWord.text.toUpperCase()
                    : heroCase === 'lowercase' ? heroWord.text.toLowerCase() : heroWord.text;
    const HERO_FS   = Math.max(1, Math.round(HERO_BASE * fitWordScale([{ text: heroFitTx, fontPx: HERO_BASE }], boxPx * 0.94)));
    const EM_CTX_FS = Math.max(1, Math.round(CTX_FS * fitWordScale(phrase.map(w => ({ text: w.text, fontPx: CTX_FS })), boxPx * 0.94)));
    const heroWeight = persona === 'A' ? 600 : 900;
    const heroLine   = 1;
    const heroColor  = persona === 'A'
      ? slots.heroAColor
      : (heroWord.styleOverride?.color ?? slots.heroBColor);
    // Persona B glows; persona A (script) stays clean → glow appears RANDOMLY with the random persona
    // (same djb2 persona pick as the native plugin, so the insert glows on the SAME captions).
    const heroGlow   = persona === 'B'
      ? `0 0 ${sz(15)}px rgba(255,255,255,0.4), 0 0 ${sz(30)}px rgba(255,255,255,0.2)`
      : undefined;

    // Hemisphere split + seeded swap (same keys as the export → preview == export).
    const preWords  = phrase.slice(0, emphIndex);
    const postWords = phrase.slice(emphIndex + 1);
    const swap        = emHash(phrase, 'hemi') % 2 === 0;
    const topWords    = swap ? postWords : preWords;
    const bottomWords = swap ? preWords  : postWords;

    // Center-cluster diagonal stagger (wall-slam fix; identical keys/values to the export so
    // the preview and the Lambda export pick the SAME diagonal for every segment).
    const offset       = Math.round(CTX_FS * 1.5);
    const diagFlip     = emHash(phrase, 'diag') % 2 === 0;
    const topOffset    = diagFlip ?  offset : -offset;
    const bottomOffset = diagFlip ? -offset :  offset;

    // Every word does the SAME short ease-out slide (matches the native plugin + the export) — no
    // per-word variety, no scale-pop.
    const pickAnim = (): string => 'slide_blur';

    // Entry pose interpolated per-frame from (currentTimeMs − word.startMs), so the slide/blur/pop
    // entrance renders in the burn-in/export too (the old CSS transitions only ticked in the live
    // 60fps preview; each export frame is a static DOM snapshot, so they showed the resting frame).
    const poseFor = (anim: string, color: string, startMs: number): React.CSSProperties => {
      switch (anim) {
        case 'fade_up':
          return entrancePose(currentTimeMs, startMs, { durMs: 500, dy: sz(10), blur: 2 });
        case 'zoom_punch':
          return entrancePose(currentTimeMs, startMs, { durMs: 340, scaleFrom: 0.42, blur: 3, overshoot: true });
        case 'scale_bounce':
          return entrancePose(currentTimeMs, startMs, { durMs: 420, scaleFrom: 0.7, overshoot: true });
        case 'soft_glow':
          return { ...entrancePose(currentTimeMs, startMs, { durMs: 550, dy: sz(6) }),
            textShadow: `0 0 ${sz(6)}px ${color}, 0 0 ${sz(12)}px ${color}` };
        case 'slide_blur':
        default:
          return entrancePose(currentTimeMs, startMs, { durMs: 320, dy: sz(10), blur: 2.5, blurDurMs: 150 });
      }
    };

    const renderWord = (w: TranscriptWord, role: 'context' | 'hero'): React.ReactNode => {
      const isHero   = role === 'hero';
      const anim     = pickAnim();
      const color    = isHero ? heroColor : (slots.contextColor ?? captionTextColor);

      const pose = override
        ? inEntrancePose(inAnim as Exclude<typeof inAnim, 'default'>, currentTimeMs, w.startMs, isHero ? sz(24) : sz(14))
        : poseFor(anim, color, w.startMs);
      // Spoken words persist at full opacity (no dim/replace) so the highlight never "moves".
      const opacity = pose.opacity as number;
      // Persona B's heavy glow wins; Persona A keeps the animation's own (soft_glow) shadow.
      const shadow = isHero ? (heroGlow ?? pose.textShadow) : pose.textShadow;

      return (
        <span key={w.id} data-w={w.id} style={{
          display: 'inline-block',
          fontFamily:    isHero ? heroFont   : fontFor(w.text),
          fontStyle:     isHero ? heroStyle  : 'normal',
          fontWeight:    isHero ? heroWeight : 600,
          fontSize:      isHero ? HERO_FS    : EM_CTX_FS,
          lineHeight:    isHero ? heroLine   : 0.8,
          textTransform: isHero ? heroCase   : 'none',
          color, whiteSpace: 'nowrap',
          ...pose, opacity, textShadow: shadow,
        }}>{w.text}</span>
      );
    };

    const outerPos: React.CSSProperties = {
      position: 'absolute', top: `${captionYPercent}%`, left: `${captionXPercent}%`,
      width: `${captionWidthPercent}%`, transform: 'translate(-50%,-50%)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none',
    };

    // ── 3-TIER HEMISPHERE LOCKUP (the only layout — matches the export) ──────────
    return (
      <>
      {/* key by phrase id so each caption mounts fresh (no cross-phrase CSS-transition slide) */}
      <div key={seed} style={outerPos} data-caption-content="true" data-cfont-lock="">
        <div style={{
          position: 'relative', isolation: 'isolate', width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Tier 1 — Top hemisphere: auto-width, centred by the parent, nudged diagonally via
              translateX and tucked DOWN onto the hero. NO width:100% + flex-align (wall-slam). */}
          {topWords.length > 0 && (
            <div style={{
              position: 'relative', zIndex: 2, maxWidth: '100%', boxSizing: 'border-box',
              display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'center',
              gap: ZONEGAP, marginBottom: tierGap,
              transform: `translate3d(${topOffset}px, 0, 0)`, willChange: 'transform',
            }}>
              {topWords.map(w => renderWord(w, 'context'))}
            </div>
          )}
          {/* Tier 2 — the persona-styled Hero word */}
          <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center', overflow: 'visible' }}>
            {renderWord(heroWord, 'hero')}
          </div>
          {/* Tier 3 — Bottom hemisphere: auto-width, centred, nudged the OPPOSITE diagonal via
              translateX and tucked UP onto the hero. */}
          {bottomWords.length > 0 && (
            <div style={{
              position: 'relative', zIndex: 2, maxWidth: '100%', boxSizing: 'border-box',
              display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center',
              gap: ZONEGAP, marginTop: tierGap,
              transform: `translate3d(${bottomOffset}px, 0, 0)`, willChange: 'transform',
            }}>
              {bottomWords.map(w => renderWord(w, 'context'))}
            </div>
          )}
        </div>
      </div>
      </>
    );
  }

  // ── Aura: time-driven preview (mirrors the role-engine AuraRow) ─────────────
  // Same deterministic roles / tiers / sizes as the export (auraAssignRoles + auraBuildTiers), so
  // preview == Lambda. Entry motion is the CSS-transition analogue of the export's velocity blur +
  // spring. Difference-HIGHLIGHT words animate via NON-isolating `top` only (never transform/opacity/
  // filter) so the mix-blend reaches the video pixels. Sandboxed to 'aura'.
  if (captionStyle === 'aura' || captionStyle === 'aura_helvetica') {
    if (!phrase) return null;

    const seed   = phrase[0].id;
    // "Swiss" (aura_helvetica) resolves its OWN Helvetica-defaulted slot store; Aura uses `aura`.
    // Fonts come from the slots either way, so the Text-tab controls apply to both.
    const helv   = captionStyle === 'aura_helvetica';
    const slots  = helv ? resolveSwissSlots(templateSlots?.aura_helvetica) : resolveAuraSlots(templateSlots?.aura);
    const CTX_FS = sz(15);
    // In-animation override (non-'default') → uniform snappy slide / instant appear; the editorial
    // lockup + staggered reveal timing stay intact. IN_MAG mirrors the export's Math.round(baseFs*0.9).
    const inAnim   = slots.inAnimation;
    const override = inAnim !== 'default';
    const IN_MAG   = Math.round(CTX_FS * 0.9);
    // (aura entrance easing now lives in entrancePose — frame-based so it renders in the export)

    const boxPx     = canvasWidthPx * (captionWidthPercent / 100) * 0.92;   // FIXED canvas width (not CTX_FS, which scales with fontScale)
    const specs     = auraAssignRoles(phrase);
    const tiers     = auraBuildTiers(phrase, specs, boxPx, CTX_FS);
    const cursiveFs = tiers.flatMap(t => t.items).find(it => it.spec.role === 'CURSIVE')?.fs ?? CTX_FS;

    // key by phrase id so each caption mounts FRESH — otherwise React reuses the spans and their
    // CSS transitions animate from the previous phrase's resting state.
    // TRANSFORM-FREE positioner: a 0×0 flex box centred on (x, y) — NO translate, so it creates no
    // stacking context and a highlighted word's mixBlendMode:'difference' blends against the video.
    const outer: React.CSSProperties = {
      position: 'absolute', top: `${captionYPercent}%`, left: `${captionXPercent}%`,
      width: 0, height: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
    };

    // Reveal the whole lockup, cascading in READING ORDER (perceptible per-word stagger), with a soft
    // "focus-pull": fade + gentle rise + blur→sharp (NO scale) — the time-driven analogue of the export.
    const segStartMs = phrase[0].startMs;
    const RISE = Math.round(CTX_FS * 0.5),  BLUR  = (CTX_FS * 0.30).toFixed(1);
    const CRISE = Math.round(CTX_FS * 0.35), CBLUR = (CTX_FS * 0.24).toFixed(1);
    const SLIDEX = Math.round(CTX_FS * 1.3);   // slide-in distance (enters from the right)
    const renderItem = (it: AuraTierItem): React.ReactNode => {
      const { w, spec, fs } = it;
      // Swiss reveals each word WHEN SPOKEN (its own startMs); Aura keeps the staggered reveal-together.
      const appearMs = helv ? w.startMs : (segStartMs + it.idx * 110);
      const a = Math.floor(random(`${seed}a${it.idx}`) * 3);   // 0=focus-pull · 1=direct · 2=slide-from-right
      const indic = getFontFamily(w.text) !== 'system-ui, sans-serif';
      // Indic scripts need taller line boxes — matras stack above/below the headline (ें ी ू ृ), so the
      // Latin lineHeight:1 makes stacked tiers visually collide. 1.25/1.2 keeps native lockups clean.
      const lh = indic ? 1.25 : 1;

      // Entry for non-highlight words, interpolated per-frame so it RENDERS in the export (the old CSS
      // transitions only ticked in the live preview). cursive keeps a static lean + softer blur; the
      // seeded `a` matches the export's animOf, so preview == export. NO scale.
      const withLean = (p: React.CSSProperties, lean: string): React.CSSProperties => {
        const base = p.transform && p.transform !== 'none' ? p.transform : '';
        return { ...p, transform: (base + lean).trim() || 'none' };
      };
      const entryStyle = (cursive: boolean): React.CSSProperties => {
        const lean = (cursive && !helv) ? (indic ? ' rotate(-3deg) skewX(-8deg)' : ' rotate(-3deg)') : '';
        if (override)   // uniform slide / instant entrance — keeps the static lean at rest
          return inEntrancePose(inAnim as Exclude<typeof inAnim, 'default'>, currentTimeMs, appearMs, IN_MAG, lean);
        if (a === 1)   // DIRECT — quick fade, no motion
          return withLean({ opacity: _easeOut(_clamp01((currentTimeMs - appearMs) / 180)), transform: 'translateY(0px)', willChange: 'opacity' }, lean);
        if (a === 2)   // SLIDE in from the right
          return withLean(entrancePose(currentTimeMs, appearMs, { durMs: 450, opDurMs: 270, dx: SLIDEX }), lean);
        const rise = cursive ? CRISE : RISE, blur = cursive ? CBLUR : BLUR;   // FOCUS — rise + fast blur→sharp
        return withLean(entrancePose(currentTimeMs, appearMs, { durMs: 450, opDurMs: 270, blurDurMs: 170, dy: rise, blur: Number(blur) }), lean);
      };

      // Alpha-overlay split: the 'diff' pass shows ONLY the difference words; every other word
      // stays as an INVISIBLE placeholder so both passes lay out identically and the two .movs
      // align pixel-perfect when stacked. (visibility keeps the box; opacity would too, but
      // visibility can't be overridden by the entry animation's opacity interpolation.)
      const hideOnLayer = (layer: 'base' | 'diff'): React.CSSProperties =>
        auraAlphaLayer === layer ? { visibility: 'hidden' } : {};

      if (spec.role === 'CURSIVE') {
        return (
          <span key={w.id} data-w={w.id} style={{
            display: 'inline-block', fontFamily: indic ? getFontFamily(w.text) : slots.cursiveFont,
            fontStyle: (helv || indic) ? 'normal' : 'italic', fontWeight: helv ? 900 : (indic ? 600 : 500), fontSize: `${fs}px`, color: slots.baseColor,
            lineHeight: indic ? 1.2 : 0.95, whiteSpace: 'nowrap', textShadow: `0px ${sz(5)}px ${sz(12)}px rgba(0,0,0,0.7)`,
            ...entryStyle(true),
            ...hideOnLayer('diff'),
          }}>{w.text}</span>
        );
      }
      const isBold = spec.role === 'BOLDKEY';
      const fam = indic ? getFontFamily(w.text) : (isBold ? slots.boldFont : slots.supportFont);
      const tt: React.CSSProperties['textTransform'] = indic ? 'none' : (isBold ? 'uppercase' : 'none');
      // Slot colour: emphasised word → per-word override ?? accent; everything else → base.
      const itemColor = spec.emph ? (w.styleOverride?.color ?? slots.accentColor) : slots.baseColor;

      if (spec.diff) {
        // NON-isolating — animate via position (top/left) ONLY so the mix-blend stays live; clean
        // inverted glyphs, NO stroke/edge. Same random type: focus→top rise, direct→instant, slide→left.
        const mp = 1 - _easeOut(_clamp01((currentTimeMs - appearMs) / 450));   // motion remaining 1→0
        const ovp = override ? resolveInAnimPose(inAnim as Exclude<typeof inAnim, 'default'>, (currentTimeMs - appearMs) / 1000, IN_MAG) : null;
        const dpos: React.CSSProperties = ovp
          ? { position: 'relative', left: `${ovp.dx.toFixed(1)}px`, top: `${ovp.dy.toFixed(1)}px` }
          : a === 1
          ? { position: 'relative' }
          : a === 2
          ? { position: 'relative', left: `${(SLIDEX * mp).toFixed(1)}px` }
          : { position: 'relative', top: `${(RISE * mp).toFixed(1)}px` };
        return (
          <span key={w.id} data-w={w.id} style={{
            ...dpos,
            fontFamily: fam, fontWeight: 900, textTransform: tt, fontSize: `${fs}px`, lineHeight: lh,
            // 'diff' overlay pass: solid glyphs, NO CSS blend — the NLE track's Difference blend
            // recreates the inversion against the clip below.
            color: slots.baseColor, ...(auraAlphaLayer === 'diff' ? {} : { mixBlendMode: 'difference' as const }),
            display: 'inline-block', whiteSpace: 'nowrap',
            ...hideOnLayer('base'),
          }}>{w.text}</span>
        );
      }

      return (
        <span key={w.id} data-w={w.id} style={{
          display: 'inline-block', fontFamily: fam, fontWeight: isBold ? 900 : 700, textTransform: tt,
          fontSize: `${fs}px`, color: itemColor, lineHeight: lh, whiteSpace: 'nowrap',
          textShadow: isBold ? `0px ${sz(3)}px ${sz(8)}px rgba(0,0,0,0.55)` : `0px ${sz(2)}px ${sz(5)}px rgba(0,0,0,0.5)`,
          ...entryStyle(false),
          ...hideOnLayer('diff'),
        }}>{w.text}</span>
      );
    };

    const N = tiers.length;
    // Splash direction ALTERNATES segment-to-segment (mirrors AuraRow): the first segment leans a
    // seeded way, every following segment flips. Ad-hoc (no segments) → per-phrase seeded random.
    const segIndex   = segments?.length ? segments.findIndex(s => s.includes(phrase[0].id)) : -1;
    const splashSeed = segments?.[0]?.[0] ?? seed;
    const splashDir  = segIndex >= 0
      ? (segIndex % 2 === 0 ? 1 : -1) * (random(`${splashSeed}:splashstart`) > 0.5 ? 1 : -1)
      : (random(`${seed}splash`) > 0.5 ? 1 : -1);
    const leanStep = Math.round(CTX_FS * 1.6);
    return (
      <div key={seed} style={outer} data-cfont-lock="">
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 'max-content' }} data-caption-content="true">
          {tiers.map((t, ti) => {
            const maxLean = Math.max(0, (boxPx - t.width) / 2);
            const leanX = Math.round(Math.max(-maxLean, Math.min(maxLean, splashDir * (ti - (N - 1) / 2) * leanStep)));
            // half-lap when either lapping tier holds Indic glyphs — Devanagari matras above the
            // headline collide under the full Latin lap (mirrors AuraRow).
            const indicLap = ti > 0 && [t, tiers[ti - 1]].some(tt2 =>
              tt2.items.some(it2 => getFontFamily(it2.w.text) !== 'system-ui, sans-serif'));
            return (
              <div key={ti} style={{
                // editorial diagonal splash via position:relative+left (non-isolating — transform/z-index
                // would isolate the difference blend). The cursive tier laps via DOM paint order.
                position: 'relative', left: `${leanX}px`,
                display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'baseline', justifyContent: 'center',
                gap: `${Math.round(CTX_FS * 0.3)}px`,
                marginTop: t.hasCursive && ti > 0 ? `${-Math.round(cursiveFs * (indicLap ? 0.16 : 0.32))}px` : 0,
              }}>
                {t.items.map(renderItem)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!phrase) return null;

  // Fallback
  return phraseRow(
    phrase,
    (w) => ({ color: w.styleOverride?.color ?? '#C8FF00', fontWeight: 800, fontSize: sz(20) }),
    ()  => ({ color: 'rgba(255,255,255,0.6)', fontWeight: 500, fontSize: sz(20) }),
  );
}
