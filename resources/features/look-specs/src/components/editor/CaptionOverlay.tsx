'use client';

import { useLayoutEffect, useMemo, useRef, useState, useEffect, useSyncExternalStore } from 'react';
import { random } from 'remotion';
import type { TranscriptWord, TextOverrides, EmphasisStyle, LayoutMode, TemplateSlotOverrides } from '@/types/transcript';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import {
  ArchivesBoilDefs,
  archivesDrawIndex, archivesJitter, archivesScrawl,
  archivesUnderline, archivesRoles, archivesCase,
  archivesTiming, wordRoomSec, paceFactor, scribbleRoles,
  BB_RED, BB_COND, BB_SCRIPT, bbEntry, bbTrack, bbSplit, bbRiseMs, bbTrackMs, BB_TRACK_TO,
  BB_RISE_TRAVEL_EM, bbScriptFade, BB_WORD_SLIDE_EM, bbWordSlide, bbWordPace,
} from '@/remotion/KineticCaptionComposition';
import type { BleepRange } from '@/lib/profanity';
import { getFontFamily } from '@/lib/textParser';
import { buildTextOverrideCSS, isStyleLocked } from '@/lib/styleResolve';
import { resolveIllusionSlots, resolveEditorMasalaSlots, resolveAuraSlots, resolveSwissSlots, resolveGlitch, resolveInAnimPose,
  resolveScribbleSlots, resolveArchivesSlots, resolveBlockbusterSlots, BB_LEVEL_MUL,
  resolveInterlockSlots, IL_CAPS_SIZE_MUL, IL_TRACKING_EM,
  resolveJournalSlots, JN_EXIT_MS, JN_ENTRANCE_BLUR, type ResolvedJournalSlots, JN_STROKE_EM, jnEntranceMs, jnStaggerMs, jnSequenceMs, JN_SWEEP_MUL } from '@/lib/kineticSlots';
import type { CaptionInAnimation } from '@/types/transcript';
import type { ResolvedInterlockSlots } from '@/lib/kineticSlots';
import { interlockLayout, baselineFromTop, ilClearCache, type ILStyle } from '@/lib/interlockEngine';
import { resolveSegments, activeSegmentIndexAt, activeSegmentWindowAt, captionTailMs, captionMinMs } from '@/lib/captionSegments';
import { resolveUserColors, shadeHex } from '@/lib/captionColors';
import { charUnit, estTextWidth, fitRowScale, fitWordScale, fontWeightFactor, fontWidthFactor, type FitItem } from '@/lib/fitText';
import { findLookSpec, impactPx, lookAccentStyle, lookBaseStyle, lookJitter, lookRestStyle } from '../../lib/looks/lookSpec';
import { planImpact, pickImpactWords, isContentWord } from '@/lib/looks/impactWords';
import { buildStackRows, stackRowScale } from '@/lib/looks/stackRows';
import { applyDepthTreatment, currentDepthGrid, subscribeDepthGrid } from '@/lib/looks/depthLive';
import { AgentStoryScene } from './property/AgentStoryScene';
import { PropertyReelScene } from './property/PropertyReelScene';
import { faceBandAt, faceBandFromGrid } from '@/lib/looks/property/geometry';
import { letterMaskMoments, letterMaskRows, LETTER_MASK_CAP_SHIFT_EM, LETTER_MASK_LINE_HEIGHT, LETTER_MASK_MAX_PX_OF_WIDTH, LETTER_MASK_MULTI_ROW_SHIFT_PCT, LETTER_MASK_WIDTH_FRAC } from '@/lib/looks/letterMask';
import { emphasisScore } from '@/lib/emphasis';
import type { LookSpec, LookEnter } from '../../lib/looks/lookSpec';
import type { FaceTrack } from '@/lib/matte/faceTrack';
import { focuslineArchetype, focuslineRowJustify, FOCUSLINE_BANDS } from '@/lib/looks/focusline';
import { dynamicPlacement, heroClipKeys } from '@/lib/looks/dynamicLayout';

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
  /** 3-layer compositing around the subject cut-out, for designs whose caption reads in FRONT of the
   *  person while a title goes behind (Big Reveal, and looks with an impact word): render only the
   *  title ('behind', the layer under the cut-out) or only the caption ('front', the layer over it).
   *  Omit → render both. */
  subjectLayer?:        'behind' | 'front';
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
  /** The frame's logical height (a property scene places against the whole frame). */
  canvasHeightPx?:    number;
  /** This frame's subject grid from a render route's track (see depthLive.ts); the live grid otherwise. */
  depthGrid?:         Uint8Array | null;
  /** True only where the video sits directly behind this overlay. Effects that read the video
   *  through the text (inception) need it; without it they fall back to plain accent text, so a
   *  transparent overlay export never ends up with an invisible word. */
  videoBackdrop?:     boolean;
  /** Where the speaker's face is over time (from the subject cut-out pass). Face-anchored looks use
   *  it; without it they keep their measured fixed position. */
  faceTrack?:         FaceTrack | null;
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

// Entrance for spec looks — one definition, so flat rows, the wrapRows block and the stack rows all
// time and travel identically. The duration belongs to the LOOK: their registry declares one on 19
// of these designs, spanning 0.01s to 0.56s, and a single hardcoded 160ms made the fast cuts drift
// and the slow drifts snap.
// The accent word with the video DIFFERENCED against the accent colour inside its letters
// ("inception"): |accent - video| per channel, which is plain inversion for a white accent.
//
// A mix-blend-mode cannot do this here: every export draws captions inside a transform: scale()
// layer, which makes an isolated group, so a difference blend only ever sees transparency and the
// word stays white (checked in Chrome). backdrop-filter is not stopped by a transform, and Chrome
// will mask it with an inline-SVG text mask, so the inversion lands only on the glyphs. The HTML
// text is transparent and only holds the layout — the inverted glyphs ARE the word, so there is no
// second copy to register against. Where nothing is behind the overlay (a transparent export),
// it falls back to plain text rather than rendering an invisible word.
function InceptionWord({ id, text, style, backdrop }: {
  id: string; text: string; style: React.CSSProperties; backdrop: boolean;
}) {
  if (!backdrop) return <span style={{ ...style, display: 'inline-block' }}>{text}</span>;
  // Opacity on ANY ancestor of a backdrop filter makes that ancestor its backdrop root, so the filter
  // sees only transparency (checked in Chrome: the effect vanished; on the filtered element itself it
  // fades correctly). An entrance or exit fade therefore goes on the filtered layer, not the word.
  const { opacity: fade, ...outer } = style;
  const px = Number(style.fontSize) || 16;
  const lh = typeof style.lineHeight === 'number' ? style.lineHeight : 1.15;
  const shown = style.textTransform === 'uppercase' ? text.toUpperCase()
    : style.textTransform === 'lowercase' ? text.toLowerCase() : text;
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '');
  const maskId = `inception-m-${safe}`;
  const filterId = `inception-f-${safe}`;
  // |accent - video| per channel as a lookup table: the V has its point at the accent's own level,
  // which no chain of CSS filter functions can express. 64 samples keep the error under 2 levels.
  const hex = typeof style.color === 'string' && /^#[0-9a-f]{6}$/i.test(style.color) ? style.color : '#ffffff';
  const table = (c: number) => Array.from({ length: 64 }, (_, k) => (Math.abs(c - (k * 255) / 63) / 255).toFixed(3)).join(' ');
  const [cr, cg, cb] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  return (
    <span style={{
      ...outer, display: 'inline-block', position: 'relative',
      color: 'transparent', WebkitTextFillColor: 'transparent', textShadow: 'none', background: 'none',
    }}>
      {text}
      <svg aria-hidden width="0" height="0" style={{ position: 'absolute', overflow: 'hidden' }}>
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              <feFuncR type="table" tableValues={table(cr)} />
              <feFuncG type="table" tableValues={table(cg)} />
              <feFuncB type="table" tableValues={table(cb)} />
            </feComponentTransfer>
          </filter>
          <mask id={maskId} maskUnits="objectBoundingBox" maskContentUnits="userSpaceOnUse" x="0" y="0" width="1" height="1">
            <text x="0" y={(px * lh) / 2} dominantBaseline="central" fill="#fff"
              fontFamily={style.fontFamily as string | undefined} fontSize={px}
              fontWeight={style.fontWeight as number | undefined}
              fontStyle={style.fontStyle as string | undefined}
              letterSpacing={style.letterSpacing as string | undefined}>{shown}</text>
          </mask>
        </defs>
      </svg>
      <span aria-hidden style={{
        position: 'absolute', inset: 0, opacity: fade,
        backdropFilter: `url(#${filterId})`, WebkitBackdropFilter: `url(#${filterId})`,
        mask: `url(#${maskId})`, WebkitMask: `url(#${maskId})`,
      }} />
    </span>
  );
}

// The letter-mask plate: the frame black, the rows' letters cut out of it so the footage shows
// through the type. One inline SVG the size of the frame — inside an SVG, `50%` resolves against
// ITS viewport, which is the frame; referenced from an HTML element the same mask resolved every
// percentage against the 0x0 helper SVG and hid the whole frame. Luminance mask: the white rect
// keeps the plate, the black text punches through it.
// The plate's type fills the frame, so a 5% estimate error is 27px of glyph: in a browser the row
// is measured in the DOM in the loaded face — the same font matching the plate's own text gets;
// server-side (tests) the estimator stands in. Not a canvas: measureText fell back to Arial for a
// face declared with unicode-range subsets (the bundled faces all are) while the DOM drew the face.
// The trailing letter-spacing counts, as it does in the rendered row (Chrome spaces after every
// glyph). A face loads LAZILY, on its first use by text — a measurement taken before it arrived
// reports the fallback's advances and is never asked again. So a measurement that finds its face
// missing asks for it and uses the estimate meanwhile; the overlay re-renders when the face lands
// (fontArrivals), in the preview and in every render route. In a Remotion render the FIRST pass
// runs before the composition's @font-face <style> is even in the DOM (React commits both at
// once): nothing matches, check() is vacuously true, the measurement takes Arial — so every
// 'loadingdone' on document.fonts re-renders too, and the pass after the faces land re-measures.
const fontArrivals = { n: 0, subs: new Set<() => void>(), asked: new Set<string>() };
const subscribeFontArrivals = (cb: () => void) => { fontArrivals.subs.add(cb); return () => { fontArrivals.subs.delete(cb); }; };
const fontArrivalsNow = () => fontArrivals.n;
const fontArrivalsServer = () => 0;
function requestFace(fontStr: string, text: string) {
  const key = `${fontStr}|${text}`;
  if (typeof document === 'undefined' || !document.fonts?.load || fontArrivals.asked.has(key)) return;
  fontArrivals.asked.add(key);
  document.fonts.load(fontStr, text).then(() => { fontArrivals.n++; fontArrivals.subs.forEach((cb) => cb()); }).catch(() => {});
}
type PlateMetrics = { em: number; capEm: number };
/** A stacked row's word gap, in em of the row: their wordSpacingEm default (.28). */
const STACK_WORD_GAP_EM = 0.28;
let plateMeasureEl: { box: HTMLSpanElement; text: Text; cap: CanvasRenderingContext2D | null } | null | undefined;
function plateMeasure(text: string, font: string, weight: number, lsEm: number, factor: number): PlateMetrics {
  if (plateMeasureEl === undefined) {
    if (typeof document === 'undefined' || !document.body) plateMeasureEl = null;
    else {
      const box = document.createElement('span');
      box.setAttribute('aria-hidden', 'true');
      box.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;white-space:pre;pointer-events:none;line-height:normal;letter-spacing:0';
      const textNode = document.createTextNode('');
      box.append(textNode);
      document.body.appendChild(box);
      // the cap height is INK (a canvas 'H'), the same on every platform — the face's ascent is
      // not: Chrome on Windows lays lines out by the OS/2 win metrics, on Linux/Mac by hhea, and a
      // baseline set from the ascent landed 7px lower here than on their frames
      plateMeasureEl = { box, text: textNode, cap: document.createElement('canvas').getContext('2d') };
      document.fonts?.addEventListener?.('loadingdone', () => { fontArrivals.n++; fontArrivals.subs.forEach((cb) => cb()); });
    }
  }
  const ls = lsEm * [...text].length;
  if (plateMeasureEl) {
    const fontStr = `${weight} 100px ${font}`;
    if (document.fonts?.check && !document.fonts.check(fontStr, text)) requestFace(fontStr, text);
    plateMeasureEl.box.style.font = fontStr;
    plateMeasureEl.text.data = text;
    const width = plateMeasureEl.box.getBoundingClientRect().width;
    let capEm = 0;
    if (plateMeasureEl.cap) {
      plateMeasureEl.cap.font = fontStr;
      capEm = (plateMeasureEl.cap.measureText('H').actualBoundingBoxAscent || 0) / 100;
    }
    if (width > 0) return { em: width / 100 + ls, capEm: capEm > 0.3 && capEm < 1 ? capEm : 0.69 };
  }
  return { em: estTextWidth(text, 1, factor) + ls, capEm: 0.69 };
}

function LetterMaskPlate({ id, rows, px, pitch, capEm, font, weight, letterSpacingEm, opacity }: {
  id: string; rows: string[]; px: number; pitch: number; capEm: number; font: string; weight: number;
  letterSpacingEm?: number; opacity: number;
}) {
  const maskId = `letter-mask-${id.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const blockPx = rows.length * pitch;
  // Each row's baseline sits half a cap below the row's centre, less the face's own cap-to-em
  // offset (LETTER_MASK_CAP_SHIFT_EM): where an HTML line box of `pitch` puts it by the hhea
  // metrics, which is how their lone "One" lands (cap 0.398-0.597H about a 0.5H centre).
  const baselineFromCentre = (capEm / 2 + LETTER_MASK_CAP_SHIFT_EM) * px;
  // Their two-row blocks sit 0.8% of the frame lower than a centred block (both rows of "One" /
  // "sharp" and of "One sharp" / "visual", 7-11px of 960); a lone row is centred.
  const centreY = rows.length > 1 ? `${(50 + LETTER_MASK_MULTI_ROW_SHIFT_PCT).toFixed(2)}%` : '50%';
  return (
    <svg aria-hidden data-letter-mask="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity }}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
          <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
          {rows.map((text, ri) => (
            <text key={ri} x="50%" y={centreY} dy={(-blockPx / 2 + (ri + 0.5) * pitch + baselineFromCentre).toFixed(2)}
              textAnchor="middle" fill="#000"
              fontFamily={font} fontSize={px.toFixed(2)} fontWeight={weight}
              letterSpacing={letterSpacingEm ? `${letterSpacingEm}em` : undefined}>{text}</text>
          ))}
        </mask>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="#000" mask={`url(#${maskId})`} />
    </svg>
  );
}

function lookEnterStyle(spec: LookSpec, nowMs: number, startMs: number, fade: boolean): React.CSSProperties {
  const kind = spec.animIn ?? 'none';
  if (kind === 'none') return {};
  if (kind === 'pop') return popIn(nowMs, startMs, { fade });
  // a LINE's fade is linear: read back from rendered frames against their footage, six looks land
  // within one 33ms step; the faster ramp below is the roles' own
  return enterStyle({ kind, ms: spec.animInMs ?? 160, em: spec.animInEm }, nowMs, startMs, 1);
}

/**
 * One role's entrance. The opacity ramps 2.2x faster than the travel, their word reveal's ramp: a
 * 300ms rise reads fully opaque by 135ms while it is still settling — MEASURED on Quay's hero,
 * opaque by frame 52 of 47. The travel eases out so the last of it is slowest; fadeUp rises, fadeDown
 * drops, fadeLeft comes in from the right and fadeRight from the left.
 */
function enterStyle(e: LookEnter, nowMs: number, startMs: number, ramp = 2.2): React.CSSProperties {
  const t = _clamp01((nowMs - startMs - (e.delayMs ?? 0)) / Math.max(1, e.ms));
  const opacity = Math.min(1, ramp * t);
  if (e.kind === 'fade') return { opacity };
  const eased = 1 - Math.pow(1 - t, 3);
  const travel = ((1 - eased) * (e.em ?? 0.35)).toFixed(4);
  if (e.kind === 'fadeUp') return { opacity, transform: `translateY(${travel}em)` };
  if (e.kind === 'fadeDown') return { opacity, transform: `translateY(-${travel}em)` };
  if (e.kind === 'fadeLeft') return { opacity, transform: `translateX(${travel}em)` };
  return { opacity, transform: `translateX(-${travel}em)` };
}

/** An entrance laid over a style that may already carry an opacity (karaoke's dimmed rest) or a
 *  transform (per-word jitter): both compose, where spreading the entrance over them would drop
 *  the dim and the jitter for as long as it runs. */
function withEnter(style: React.CSSProperties, enter: React.CSSProperties): React.CSSProperties {
  if (enter.opacity == null && enter.transform == null) return { ...style, ...enter };
  const out: React.CSSProperties = { ...style, ...enter };
  if (enter.opacity != null) out.opacity = (style.opacity == null ? 1 : Number(style.opacity)) * Number(enter.opacity);
  if (enter.transform != null && style.transform) out.transform = `${style.transform} ${enter.transform}`;
  return out;
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

// ── "The Big Red" (big_red) ────────────────────────────────────────────────────
// Big Reveal's two-box lockup with NO subject cut-out: a huge vertically-stretched Times New Roman
// title in red behind the plain white Times caption. Both faces are the SAME family — the
// typography IS the template, so big_red is font-locked (FONT_LOCKED_STYLES + data-cfont-lock).
// Times New Roman Bold is bundled and registered under BOTH names in globals.css (preview) and
// buildFontsCss (export), so this stack resolves identically on every surface.
const BIG_RED_FONT = '"TimesNewRomanBold","Times New Roman",Times,serif';
// Vertical stretch — 35% taller glyphs (scaleY on an inner span so the entrance translate, which
// lives on the outer span, is never scaled with it).
const BIG_RED_STRETCH = 1.35;
// The red fill, measured per-pixel off the reference frame: deep red at the ends of the word
// lightening to a soft band through its horizontal centre. Clipped to the glyphs.
const BIG_RED_GRAD = 'linear-gradient(90deg,#C9302F 0%,#D53E3E 18%,#E68C8C 50%,#D53E3E 82%,#C9302F 100%)';
// Solid fallback (per-word colour override, and the picker thumbnail's flat state).
const BIG_RED_SOLID = '#D53E3E';
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
// Latin rows unchanged: aura's tier packing and blockbuster's word split (and its EST_RED / EST_SCRIPT
// calibration) were tuned on them, so English lockups keep their layout. Everything else goes to
// fitText's MEASURED table — the old flat 0.72 / 0.18 under-counted Tamil and Malayalam ~2×, which
// ran aura and blockbuster lockups off the frame.
function auraCharUnit(ch: string): number {
  if (/[mwMW@]/.test(ch))      return 0.92;
  if (/[A-Z0-9]/.test(ch))     return 0.66;
  if (/[ilIjt.,'!|]/.test(ch)) return 0.30;
  if (/[fr]/.test(ch))         return 0.42;
  if (/[a-z]/.test(ch))        return 0.54;
  if (/\s/.test(ch))           return 0.32;
  return charUnit(ch);
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

// ── Scribble role engine + look constants ──────────────────────────────────────
// DUPLICATED BYTE-FOR-BYTE from KineticCaptionComposition.tsx (ScribbleRow). Pure & deterministic,
// so the preview (here) and the Lambda export pick IDENTICAL roles for every phrase. Reuses aura's
// pure text helpers READ-ONLY (auraClean / auraStructural / auraEstWidth). Keep in lockstep.
//   MARKED  = longest non-emph, non-structural word → dark ink on the highlighter swipe.
//   CIRCLED = the emphasised word (isEmph test) → red-pen draw-around, slightly larger.
//   NOTES   = everything else → white handwriting with a soft paper shadow.
//   Focal guard: nothing qualified for MARKED → promote the longest non-circled word.
// scribbleRoles is IMPORTED from the composition (not duplicated) so the preview and the
// export can never disagree about which word is circled/marked.
// Scribble's look constants live in kineticSlots.SCRIBBLE_DEFAULTS (Text-tab editable);
// this branch reads everything through its resolved `slots`.

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

  // Depth treatment (their depthFx): after every commit, and whenever the frame's subject grid is
  // published, each [data-depth] word under this root is blurred/dimmed/shrunk by its overlap
  // with the person — imperatively, so a new frame costs no render. Only the behind layer: the
  // front layer of a split design sits above the cut-out, and nothing covers its words.
  const rootRef = useRef<HTMLDivElement>(null);
  const depthFx = findLookSpec(captionStyle)?.depth ?? null;
  const depthOn = !!depthFx && props.subjectLayer !== 'front';
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !depthOn || !depthFx) return;
    const run = () => applyDepthTreatment(root, props.depthGrid ?? currentDepthGrid(), depthFx);
    run();
    return subscribeDepthGrid(run);
  });

  return (
    <div ref={rootRef} data-captik-tov="" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {tovCSS && <style>{tovCSS}</style>}
      <CaptionOverlayInner {...props} />
    </div>
  );
}

function CaptionOverlayInner({
  words, currentTimeMs, captionStyle, accentColor, bleepRanges, segments,
  captionYPercent = 85, captionXPercent = 50, captionWidthPercent = 84,
  emphBoxYPercent = 24, emphBoxXPercent = 50, emphBoxWidthPercent = 84, emphFontScale = 1,
  subjectLayer,
  captionFontScale = 1, captionLines = 'single', captionTextColor = '#ffffff',
  captionGapMs = 0, noLineFade = false, canvasWidthPx = 270, canvasHeightPx, depthGrid = null, videoBackdrop = false, faceTrack = null,
  emphasisStyle, layoutMode = 'splash', templateSlots, auraAlphaLayer,
}: CaptionOverlayProps) {
  // Caption display window: a caption appears LEAD ms before its first word and stays
  // TAIL ms after its last word, then clears. We intentionally do NOT bridge across to
  // the next segment — when the speaker pauses, the caption disappears, so captions track
  // the speech ("come when said out loud") instead of staying on screen continuously.
  // captionGapMs lets the user lengthen the tail a little if they prefer captions to linger.
  const LEAD = 80;
  const TAIL = Math.max(120, 120 + captionGapMs);
  // Words of a depth look on a behind layer are marked for the treatment (see the outer
  // component); every other template's markup is untouched.
  const depthAttr: { 'data-depth'?: '' } = findLookSpec(captionStyle)?.depth && subjectLayer !== 'front' ? { 'data-depth': '' } : {};

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
  useSyncExternalStore(subscribeFontArrivals, fontArrivalsNow, fontArrivalsServer);

  // The shared display window — the SAME call every override reader (page.tsx preview + both
  // export compositions) uses, so what's displayed and which per-line overrides apply can never
  // disagree across surfaces. Kept as the whole window, not just the index, because a template
  // that animates on the way OUT has to know the instant the line leaves.
  const segWindow = useMemo(
    () => activeSegmentWindowAt(resolvedSegs, currentTimeMs, captionTailMs(captionStyle, captionGapMs), captionMinMs(captionStyle)),
    [resolvedSegs, currentTimeMs, captionGapMs]);

  const segWords = useMemo(
    () => (segWindow ? resolvedSegs[segWindow.index].sw : null),
    [resolvedSegs, segWindow]);

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
  // A fitted size must never round UP past the budget the fit computed (11.6px → 12px is +3.4%,
  // enough to clip a row that exactly fills its box). Unfitted sizes round as before.
  const fitPx = (px: number, fit: number) => Math.max(1, fit < 1 ? Math.floor(px * fit) : Math.round(px));
  const rowFit = (
    items: FitItem[],
    opts?: { gapPx?: number; frac?: number; forceRow?: boolean; wraps?: boolean },
  ) => {
    const inner = boxPx * (opts?.frac ?? 0.9);   // most rows render at maxWidth:'90%'
    // `wraps`: this row wraps whatever the line setting (a design whose rows break by width)
    return (captionLines === 'single' && !opts?.wraps) || opts?.forceRow
      ? fitRowScale(items, opts?.gapPx ?? 6, inner)
      : fitWordScale(items, inner);
  };
  // The common case: every word in the row at one base px (per-word emphasis scale honored).
  const phraseFit = (ph: TranscriptWord[], basePx: number, opts?: { gapPx?: number; frac?: number; upper?: boolean; forceRow?: boolean; factor?: number; weight?: number | string }) =>
    rowFit(
      ph.map(w => ({
        text: opts?.upper ? w.text.toUpperCase() : w.text,
        fontPx: basePx * (w.styleOverride?.scale && w.styleOverride.scale > 1 ? w.styleOverride.scale : 1),
        factor: opts?.factor,
        weight: opts?.weight,
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
    /** A measured width factor for this row's face, in place of the table's worst case. */
    factorOverride?: number,
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
        factor: factorOverride ?? fontWidthFactor((a.fontFamily ?? n.fontFamily) as string | undefined), lsEm,
        weight: a.fontWeight ?? n.fontWeight,
      };
    }), { gapPx: gap, wraps: wrap?.flexWrap === 'wrap' });
    const fitted = (s: React.CSSProperties): React.CSSProperties => {
      const px = Number(s.fontSize ?? 0) || 0;
      return fit < 1 && px > 0 ? { ...s, fontSize: fitPx(px, fit) } : s;
    };
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', maxWidth: '90%', overflow: 'hidden', ...wrap }}>
            {ph.map((w, i) => {
              const active = currentTimeMs >= w.startMs && currentTimeMs <= w.endMs;
              const baseStyle = fitted(active ? getActive(w, i) : getInactive(w, i));
              return <span key={w.id} {...depthAttr} style={{ fontFamily: ff(w), display: 'inline-block', transition: 'all 0.1s', ...baseStyle }}>{w.text}</span>;
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
    opts?: {
      layered?: boolean; flatStyle?: React.CSSProperties;
      /** Entrance for a word once it is spoken. Captik's own emphasis templates omit it and keep
       *  their hard reveal; spec looks pass their declared entrance, which this layout used to
       *  ignore — so a look declared fadeDown over 560ms simply appeared. */
      enter?: (w: TranscriptWord) => React.CSSProperties;
      /** A word to treat as the hero when none is marked. Their lockup designs always have one; a
       *  phrase the emphasis heuristic left unmarked fell back to a flat row at a fixed size. */
      heroId?: string;
      /** A measured width factor for the hero's face, in place of the table's worst case. */
      accentFactor?: number;
      /** Where the block goes, in place of the caption box (a dynamic layout's zone), percent. */
      at?: { xPct: number; yPct: number };
      /** When a word counts as revealed, in place of its own start (a hero shown from the clip start). */
      revealedAt?: (w: TranscriptWord) => number;
    },
  ) => {
    const layered = opts?.layered ?? false;
    const emph = (w: TranscriptWord) => isEmph(w) || (!!opts?.heroId && w.id === opts.heroId);
    // Fixed-width outer so the anchor point never shifts as content switches between
    // flat (1 row) and emphasis (multi-row column) layouts — eliminates position jumping.
    // overflow:hidden ensures inner fit-content divs never escape the box boundary.
    const outerPos: React.CSSProperties = {
      position: 'absolute',
      top: `${opts?.at?.yPct ?? captionYPercent}%`,
      left: `${opts?.at?.xPct ?? captionXPercent}%`,
      width: `${captionWidthPercent}%`,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      padding: '0 10px',
      display: 'flex',
      justifyContent: 'center',
    };
    const revealed = (w: TranscriptWord) => currentTimeMs >= (opts?.revealedAt ? opts.revealedAt(w) : w.startMs);
    const revealStyle = (w: TranscriptWord): React.CSSProperties => {
      // Unspoken words hold their space invisibly either way, so the box never reflows.
      if (!revealed(w)) return { opacity: 0 };
      // captik / captik_glow / captik_shadow: hard reveal as spoken, no fade in or out.
      return opts?.enter ? { opacity: 1, ...opts.enter(w) } : { opacity: 1 };
    };
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
    if (!ph.some(emph)) {
      const flatPx  = Number(flatStyle.fontSize ?? 0) || sz(20);
      const flatFit = phraseFit(ph, flatPx, {
        frac: 0.94, forceRow: true, upper: flatStyle.textTransform === 'uppercase', weight: flatStyle.fontWeight,
      });
      const fittedFlat = flatFit < 1 ? { ...flatStyle, fontSize: fitPx(flatPx, flatFit) } : flatStyle;
      return (
        <>
          <style>{ANIM_CSS}</style>
          <div style={outerPos} data-caption-content="true">
            <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', justifyContent: 'center' }}>
              {ph.map(w => (
                <span key={w.id} {...depthAttr} style={{ fontFamily: ff(w), display: 'inline-block', ...fittedFlat, ...revealStyle(w) }}>{w.text}</span>
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
      const spotSize = fitPx(spotBase, rowFit([{ text: spotText, fontPx: spotBase, weight: spotStyle.fontWeight, factor: fontWidthFactor(spotStyle.fontFamily as string | undefined) }], { gapPx: 0, frac: 0.94, forceRow: true }));
      return (
        <>
          <style>{ANIM_CSS}</style>
          <div style={outerPos} data-caption-content="true">
            <div data-cap-row="" style={{ display: 'flex', justifyContent: 'center' }}>
              <span data-emph="" style={{ fontFamily: ff(spotlitNow), display: 'inline-block', ...spotStyle, fontSize: spotSize, ...popIn(currentTimeMs, spotlitNow.startMs, { fade: !noLineFade }) }}>
                {spotlitNow.text}
              </span>
            </div>
          </div>
        </>
      );
    }

    // Build sections — words reveal progressively; layout positions are fixed from the start
    const sections = buildEmphasisSections(ph, emph);
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
      const f = phraseFit(ws, ctxPx, { frac: 0.94, forceRow: true, upper: contextStyle.textTransform === 'uppercase', weight: contextStyle.fontWeight,
        factor: fontWidthFactor(contextStyle.fontFamily as string | undefined) });
      return f < 1 ? { ...contextStyle, fontSize: Math.max(1, Math.round(ctxPx * f)) } : contextStyle;
    };

    sections.forEach((sec, si) => {
      const emphColor = sec.emph.styleOverride?.color ?? emphHex ?? null;
      const accPx = emphSizeMul !== 1
        ? Math.round(Number(accentStyle.fontSize ?? sz(46)) * emphSizeMul)
        : (Number(accentStyle.fontSize ?? 0) || sz(46));
      const accText = accentStyle.textTransform === 'uppercase' ? sec.emph.text.toUpperCase() : sec.emph.text;
      const accFit  = rowFit([{ text: accText, fontPx: accPx, weight: accentStyle.fontWeight, factor: opts?.accentFactor ?? fontWidthFactor(accentStyle.fontFamily as string | undefined) }], { gapPx: 0, frac: 0.94, forceRow: true });
      const sized: React.CSSProperties = { ...accentStyle, fontSize: fitPx(accPx, accFit) };
      const finalAccent: React.CSSProperties = emphColor
        ? { ...sized, color: emphColor, WebkitTextFillColor: emphColor, backgroundImage: 'none' }
        : sized;
      if (sec.pre.length > 0) {
        const rowStyle = ctxRowStyle(sec.pre);
        rows.push({ role: 'pre', key: `pre${si}`, content: sec.pre.map(w => (
          <span key={w.id} {...depthAttr} style={{ fontFamily: ff(w), display: 'inline-block', ...rowStyle, ...revealStyle(w) }}>{w.text}</span>
        )) });
      }
      rows.push({ role: 'emph', key: `emph${si}`, content: (
        <span data-emph="" style={{ fontFamily: ff(sec.emph), display: 'inline-block', ...finalAccent, ...revealStyle(sec.emph) }}>{sec.emph.text}</span>
      ) });
      if (sec.trailing.length > 0) {
        const rowStyle = ctxRowStyle(sec.trailing);
        rows.push({ role: 'trailing', key: `trail${si}`, content: sec.trailing.map(w => (
          <span key={w.id} {...depthAttr} style={{ fontFamily: ff(w), display: 'inline-block', ...rowStyle, ...revealStyle(w) }}>{w.text}</span>
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
            <span key={activeWord.id} style={{ fontFamily: ff(activeWord), display: 'inline-block', ...fittedStyle, ...popIn(currentTimeMs, activeWord.startMs, { fade: !noLineFade }) }}>
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

  // ── Spec looks ────────────────────────────────────────────────────────────
  // A look described as DATA (lib/looks/lookSpec) renders through the SAME helpers as every
  // hand-written branch below: same fit guard, same positioning, same colour controls. That is
  // what makes one table row a real template in the preview AND in every export path.
  const lookSpec = findLookSpec(captionStyle);
  if (lookSpec) {
    // Exit: their rows declare a short fade out (100-140ms) on seven of these looks. It runs over the
    // last part of the SHARED display window, so preview and every export end the line together.
    const exitAlpha = lookSpec.animOutMs && segWindow && Number.isFinite(segWindow.winEnd)
      ? _clamp01((segWindow.winEnd - currentTimeMs) / lookSpec.animOutMs) : 1;
    const specOut = (() => {
    if (!phrase) return null;
    const lookCtx = { sz, captionTextColor, accentColor };
    // ── variety: the phrase's slot in the design's cycle picks its layout ──────
    // Their registry gives these looks a per-phrase pattern; the footage shows it plainly — a phrase
    // typed along an arc over the head, then a caption at chest height, then one giant word behind
    // the speaker. 'front' is the ordinary render below; only 'behind' and 'curve' differ here.
    // The slot comes from the SHARED display window index, so preview and every export agree.
    const variety = lookSpec.variety;
    const slot = variety && !variety.layerOnly && variety.pattern.length
      ? variety.pattern[(segWindow?.index ?? 0) % variety.pattern.length] : 'front';
    // A user drag of the caption box moves the whole design together.
    const shiftY = captionYPercent - (lookSpec.positionYPct ?? captionYPercent);
    const isAccent = (w: TranscriptWord) =>
      !!(w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1));
    // Word importance, the emphasis heuristic's own, so a phrase never disagrees with its marks.
    const mixedScript = phrase.some((w) => /[\u0900-\u0DFF\u0600-\u06FF]/.test(w.text));
    const scoreOf = (w: TranscriptWord) => emphasisScore(w.text, phrase.indexOf(w), mixedScript);
    // ── dynamic layout: this phrase's zone, seeded by its caption key ─────────
    // Hero phrases are the captions with a hero, spaced by the intensity's gap over the whole video,
    // so the pick is the same in the preview and in every export.
    const dynAt = (() => {
      const dyn = lookSpec.dynamic;
      if (!dyn) return null;
      const heroKeys = heroClipKeys(resolvedSegs.map((s) => ({ key: s.key, startSec: s.startMs / 1000, hasHero: s.sw.some(isAccent) })), dyn.intensity);
      const key = phrase[0].id;
      const p = dynamicPlacement(dyn, {
        clipKey: key, startSec: phrase[0].startMs / 1000, isHero: heroKeys.has(key),
        text: phrase.map((w) => w.text).join(' '), baseXPct: captionXPercent / 100, baseYPct: captionYPercent / 100,
      });
      return { xPct: p.xPct * 100, yPct: p.yPct * 100, fontScale: p.fontScale };
    })();
    // The giant behind row. `held` is a phrase kept on screen from an earlier behind slot
    // (preserveBehind): in their footage "unforgettable" stays up while the next caption plays.
    // MEASURED on Abbey's footage: the giant word spans 94.8% of the FRAME (median over 64 frames),
    // not the caption box, so it is fitted to the frame. Fitting it to the 84% box drew it at ~79%.
    const BEHIND_FRAME_FRAC = 0.98;   // with a no-clip width factor, typical words land ~94%
    const behindPx = (ws: TranscriptWord[]) => {
      const basePx = sz(Math.round(lookSpec.sizePx * (variety!.behindScale ?? 3)));
      // the behind row is drawn in the ACCENT face, so it is measured in that face
      const items = ws.map((w) => ({
        text: lookSpec.transform === 'uppercase' ? w.text.toUpperCase() : w.text, fontPx: basePx,
        factor: fontWidthFactor(lookSpec.accentFont ?? lookSpec.font),
        weight: lookSpec.accentWeight ?? lookSpec.weight,
      }));
      return fitPx(basePx, fitRowScale(items, sz(8), canvasWidthPx * BEHIND_FRAME_FRAC));
    };
    const behindRow = (ws: TranscriptWord[], held: boolean) => {
      const acc = lookAccentStyle(lookSpec, lookCtx);
      const px = behindPx(ws);
      return (
        <div key={held ? 'held' : 'behind'} data-caption-content={held ? 'behind-held' : 'behind'}
          style={{ ...pos, left: '50%', width: '100%', top: `${(variety!.behindYPct ?? 38) + shiftY}%` }}>
          <div data-cap-row="" style={{ display: 'flex', gap: sz(8), justifyContent: 'center', flexWrap: 'nowrap' }}>
            {ws.map((w) => (
              <span key={w.id} {...depthAttr} style={{
                ...acc, fontSize: px, lineHeight: 1, display: 'inline-block', whiteSpace: 'nowrap',
                ...(held ? {} : currentTimeMs >= w.startMs
                  ? lookEnterStyle(lookSpec, currentTimeMs, w.startMs, !noLineFade) : { opacity: 0 }),
              }}>{w.text}</span>
            ))}
          </div>
        </div>
      );
    };
    if (slot === 'behind') {
      return <><style>{ANIM_CSS}</style>{behindRow(phrase, false)}</>;
    }
    let preservedLayer: React.ReactNode = null;
    if (variety?.preserveBehind && slot === 'front' && segWindow) {
      const len = variety.pattern.length;
      for (let k = segWindow.index - 1; k >= 0; k--) {
        const sk = variety.pattern[k % len];
        if (sk === 'behind') {
          // Hold it only if it CLEARS the front caption. The cut-out hides an overlap in the
          // Element Capture export, but the Lambda and in-browser routes have no matte and would
          // draw the collision in plain view. Heights use the measured constant: a row of size N
          // spans about N * 0.25 percent of frame height (sizes in look units, so font scale
          // cancels). Abbey's bands sit 30 points apart and hold; Vang's sit 6 apart and do not.
          const held = resolvedSegs[k].sw;
          const heldH = (behindPx(held) / Math.max(0.01, captionFontScale)) * 0.25;
          const frontH = (lookSpec.sizePx + (lookSpec.contextSizePx ?? 0)) * 0.25;
          const gap = Math.abs((variety.behindYPct ?? 38) - (lookSpec.positionYPct ?? captionYPercent));
          if (gap >= (heldH + frontH) / 2) preservedLayer = behindRow(held, true);
          break;
        }
        if (sk !== 'front') break;      // an arc in between ends the hold
      }
    }
    if (slot === 'curve' && lookSpec.curve) {
      // Letters along a concave-down arc whose APEX sits at curveYPct. Arc length is laid out from
      // the same width estimator the fit guard uses, so the spacing is deterministic across
      // renderers; if the phrase would wrap past ~70deg either side, the whole arc scales down.
      const R = lookSpec.curve.radiusPct * canvasWidthPx;
      const baseS = lookBaseStyle(lookSpec, lookCtx);
      const accS = lookAccentStyle(lookSpec, lookCtx);
      const factorOf = (st: React.CSSProperties) =>
        fontWidthFactor(st.fontFamily as string | undefined) * fontWeightFactor(st.fontWeight as number | undefined);
      type Glyph = { ch: string; w: TranscriptWord; k: number; n: number; st: React.CSSProperties; adv: number };
      const glyphs: Glyph[] = [];
      phrase.forEach((w, wi) => {
        const st = isAccent(w) ? accS : baseS;
        const fpx = Number(st.fontSize) || sz(lookSpec.sizePx);
        const txt = lookSpec.transform === 'uppercase' ? w.text.toUpperCase() : w.text;
        const chars = Array.from(txt);
        chars.forEach((ch, k) => glyphs.push({ ch, w, k, n: chars.length, st, adv: estTextWidth(ch, fpx, factorOf(st)) }));
        if (wi < phrase.length - 1) glyphs.push({ ch: ' ', w, k: chars.length, n: chars.length, st, adv: estTextWidth(' ', fpx, 1) });
      });
      const total = glyphs.reduce((a, g) => a + g.adv, 0);
      const maxArc = R * (Math.PI * 0.78);                 // about 70deg either side of the apex
      const k = total > maxArc ? maxArc / total : 1;
      let s = -total * k / 2;
      return (
        <>
          <style>{ANIM_CSS}</style>
          <div data-caption-content="curve" style={{
            position: 'absolute', left: `${captionXPercent}%`,
            top: `${(variety!.curveYPct ?? 12) + shiftY}%`, width: 0, height: 0, pointerEvents: 'none',
          }}>
            {glyphs.map((g, i) => {
              const mid = s + (g.adv * k) / 2;
              s += g.adv * k;
              if (g.ch === ' ') return null;
              const phi = mid / R;
              // typewriter: letters of a word land in order across the first part of its span
              // the last letter lands by 75% of the word, never after the word has ended
              const per = Math.min(70, (0.75 * (g.w.endMs - g.w.startMs)) / Math.max(1, g.n));
              const at = g.w.startMs + g.k * per;
              const shown = currentTimeMs >= at;
              return (
                <span key={`${g.w.id}-${i}`} style={{
                  ...g.st, fontSize: (Number(g.st.fontSize) || sz(lookSpec.sizePx)) * k,
                  position: 'absolute', left: 0, top: 0, lineHeight: 1, whiteSpace: 'pre',
                  transformOrigin: '0 0',
                  transform: `translate(${(R * Math.sin(phi)).toFixed(2)}px, ${(R * (1 - Math.cos(phi))).toFixed(2)}px) `
                    + `rotate(${(phi * 180 / Math.PI).toFixed(2)}deg) translate(-50%, -100%)`,
                  opacity: shown ? 1 : 0,
                }}>{g.ch}</span>
              );
            })}
          </div>
        </>
      );
    }
    // A variety look's FRONT phrase is one line — "content ideas", "A playful beat" — the accent
    // word larger on the same baseline. The stacked context-over-accent lockup is right for the
    // property designs and wrong here: it rendered two rows where their footage shows one.
    if (variety && !variety.layerOnly && slot === 'front' && lookSpec.family === 'emphasis') {
      const accS = lookAccentStyle(lookSpec, lookCtx);
      const baseS = lookBaseStyle(lookSpec, lookCtx);
      const inlineStyle = (w: TranscriptWord): React.CSSProperties => ({
        ...(isAccent(w) ? accS : baseS),
        ...(currentTimeMs >= w.startMs
          ? lookEnterStyle(lookSpec, currentTimeMs, w.startMs, !noLineFade) : { opacity: 0 }),
      });
      const inline = phraseRow(phrase, inlineStyle, inlineStyle, { alignItems: 'baseline' }, sz(6));
      return preservedLayer ? <>{preservedLayer}{inline}</> : inline;
    }
    const frontOut = (() => {
    // ── behind the speaker: TWO boxes, hero high, caption low ─────────────
    // Opt-in now (heroBox), because it is wrong for the property designs. Reading their previews
    // at 30fps and drawing the detected blocks on the frames shows the accent word sitting DIRECTLY
    // under a small context line as one two-line lockup — "asking" over "$600,000", "a month" over
    // "25,000" — not alone in a box of its own. Those looks fall through to emphasisLayout, which
    // already builds exactly that lockup.
    // MEASURED off their rendered frames (kumar, 3 frames, accent-colour keyed): the hero word
    // occupies y 17.4%-27.4% of the frame and the caption sits at 77.0%-79.5%. A single centred
    // box — which is what this used to do — is the wrong shape entirely: at 50% the hero lands on
    // the speaker's face instead of above it, and there is no caption line at all.
    if (lookSpec.behindSubject && lookSpec.family === 'emphasis' && lookSpec.heroBox) {
      const isE = (w: TranscriptWord) =>
        !!(w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1));
      const heroWords = phrase.filter(isE);
      const restWords = phrase.filter((w) => !isE(w));
      const heroStyle = lookAccentStyle(lookSpec, lookCtx);
      const restStyle = lookBaseStyle(lookSpec, lookCtx);
      const heroBase  = Number(heroStyle.fontSize) || sz(44);
      const heroBoxPx = canvasWidthPx * (emphBoxWidthPercent / 100);
      // Fitted over EVERY hero word, not just the ones revealed so far, so the size cannot change
      // mid-caption as later words arrive.
      const heroFit = fitWordScale(
        heroWords.map((w) => ({
          text: lookSpec.transform === 'uppercase' ? w.text.toUpperCase() : w.text,
          fontPx: heroBase, factor: fontWidthFactor(lookSpec.font), weight: lookSpec.weight,
        })),
        heroBoxPx,
      );
      const heroPx = fitPx(heroBase, heroFit);
      return (
        <>
          <style>{ANIM_CSS}</style>
          {heroWords.length > 0 && (
            <div data-caption-content="emph" style={{
              position: 'absolute', top: `${emphBoxYPercent}%`, left: `${emphBoxXPercent}%`,
              width: `${emphBoxWidthPercent}%`, transform: 'translate(-50%,-50%)',
              display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end',
              gap: sz(10), pointerEvents: 'none',
            }}>
              {heroWords.filter((w) => currentTimeMs >= w.startMs).map((w) => (
                <span key={w.id} data-emph="" {...depthAttr} style={{
                  ...heroStyle, fontSize: heroPx, display: 'inline-block', whiteSpace: 'nowrap',
                  ...lookEnterStyle(lookSpec, currentTimeMs, w.startMs, !noLineFade),
                }}>{w.text}</span>
              ))}
            </div>
          )}
          {restWords.length > 0 && (
            <div style={pos}>
              <div data-cap-row="" style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'nowrap' }}>
                {restWords.map((w) => (
                  <span key={w.id} {...depthAttr} style={{ ...restStyle, display: 'inline-block' }}>{w.text}</span>
                ))}
              </div>
            </div>
          )}
        </>
      );
    }
    if (lookSpec.family === 'emphasis') {
      const ctxLook = lookBaseStyle(lookSpec, lookCtx);
      const heroIdFor = lookSpec.heroSelect && !phrase.some(isAccent)
        ? phrase[pickImpactWords(phrase, { marked: isAccent, score: scoreOf, select: lookSpec.heroSelect, maxPerClip: 1 })[0] ?? -1]?.id
        : undefined;
      const isLockupHero = (w: TranscriptWord) => isAccent(w) || w.id === heroIdFor;
      return emphasisLayout(phrase, lookAccentStyle(lookSpec, lookCtx), ctxLook, {
        // by role: the hero's own entrance, from the phrase start when the design says so; the
        // context's, with its delay from the phrase start
        enter: (w) => isLockupHero(w) && lookSpec.heroEnter
          ? enterStyle(lookSpec.heroEnter, currentTimeMs, lookSpec.heroFromStart ? phrase[0].startMs : w.startMs)
          : lookSpec.rowEnter ? enterStyle(lookSpec.rowEnter, currentTimeMs, lookSpec.heroFromStart ? phrase[0].startMs : w.startMs)
          : lookEnterStyle(lookSpec, currentTimeMs, w.startMs, !noLineFade),
        revealedAt: lookSpec.heroFromStart ? (w) => (isLockupHero(w) ? phrase[0].startMs : w.startMs) : undefined,
        heroId: heroIdFor,
        accentFactor: lookSpec.fitFactor,
        at: dynAt ?? undefined,
        // A phrase with no hero is a context line in their property clips ("Imagine a home" alone,
        // small), not a caption at a size of its own.
        flatStyle: { ...ctxLook, opacity: 1 },
      });
    }
    const lookAcc  = lookAccentStyle(lookSpec, lookCtx);
    const lookRest = lookRestStyle(lookSpec, lookCtx);
    // The lit (spoken) word keeps the ROW's face: an accent face belongs to emphasised words. Their
    // Beacon lights "the" blue in Montserrat while "right" stays in script the whole time.
    const lookLit: React.CSSProperties = lookSpec.accentFont || lookSpec.accentUppercase
      ? { ...lookAcc, fontFamily: lookRest.fontFamily, fontWeight: lookRest.fontWeight, fontStyle: lookRest.fontStyle, textTransform: lookRest.textTransform }
      : lookAcc;
    // An emphasised word inside a karaoke row, for looks that name an accent face: that face, in the
    // accent colour, accentScale larger — spoken or not.
    const lookMarked: React.CSSProperties = {
      ...lookAcc,
      fontSize: Math.round((Number(lookAcc.fontSize) || sz(lookSpec.sizePx)) * (lookSpec.accentScale ?? 1)),
    };
    // Impact words the hero could not take (a pair that did not fit) stay in the row in the accent
    // role, in the hero's case — filled by the impact branch below before it draws the row.
    const keywords = new Set<TranscriptWord>();
    const rowMarked = (w: TranscriptWord) => (!!lookSpec.accentFont && isAccent(w)) || keywords.has(w);
    const markedStyle = (w: TranscriptWord): React.CSSProperties =>
      keywords.has(w) && lookSpec.impact?.uppercase ? { ...lookMarked, textTransform: 'uppercase' } : lookMarked;
    // Entrances. Their whole-phrase looks cut the line in ONCE (each measured phrase is fully there
    // within a frame); only `reveal` looks enter word by word. The entrance used to restart on each
    // word as it lit, which blinked every word out for the entrance's length — 450ms on Belfry — at
    // the moment it was spoken. 'pop' stays on the lit word: that pop is the design.
    const phraseStartMs = phrase[0].startMs;
    const perWordEnter = !!lookSpec.reveal || lookSpec.animIn === 'pop';
    // The row's own entrance where the look names one (their subtitleTransitions), else the line's.
    const enterAt = (w: TranscriptWord): React.CSSProperties => {
      if (noLineFade && !perWordEnter) return {};
      const from = perWordEnter ? w.startMs : phraseStartMs;
      return lookSpec.rowEnter ? enterStyle(lookSpec.rowEnter, currentTimeMs, from) : lookEnterStyle(lookSpec, currentTimeMs, from, !noLineFade);
    };
    // A role's own exit runs over the end of the shared window, like the line's.
    const exitFor = (outMs: number | undefined) => outMs && segWindow && Number.isFinite(segWindow.winEnd)
      ? _clamp01((segWindow.winEnd - currentTimeMs) / outMs) : 1;
    // A reveal look holds an unspoken word's place, invisibly, so the row never reflows.
    const unseen = (w: TranscriptWord) => !!lookSpec.reveal && currentTimeMs < w.startMs;
    // Rows that break by width in their footage ("YEARS into / editing") wrap whatever the user's
    // line setting, stacked tight; the fit guard then only keeps the widest word inside the box.
    const lookWrap: React.CSSProperties | undefined = lookSpec.wrap ? { flexWrap: 'wrap', rowGap: 0 } : undefined;
    // Word spacing in the row's own units, where the design measures one (their rows sit ~0.38em apart).
    const lookGap = lookSpec.wordGapEm ? Math.round(sz(lookSpec.sizePx) * lookSpec.wordGapEm) : 6;
    const rowActive = (w: TranscriptWord): React.CSSProperties => withEnter(
      { ...(rowMarked(w) ? markedStyle(w) : lookSpec.family === 'karaoke' ? lookLit : lookRest), ...lookJitter(lookSpec, w.id) },
      enterAt(w));
    const rowInactive = (w: TranscriptWord): React.CSSProperties => {
      const st = { ...(rowMarked(w) ? markedStyle(w) : lookRest), ...lookJitter(lookSpec, w.id) };
      if (unseen(w)) return { ...st, opacity: 0 };
      return perWordEnter && !lookSpec.reveal ? st : withEnter(st, enterAt(w));
    };
    // ── story: a property scene — the caption planned into a moment (their agent story) ──────
    // Times to the scene in seconds; the frame's height from the mount (a 9:16 frame when none);
    // the face from the track at this moment. The scene reads the layer itself: the headline and
    // icon on the behind layer, the amount and support in front.
    if (lookSpec.family === 'story' && lookSpec.story === 'reel' && lookSpec.reel) {
      const gridBand = faceBandFromGrid(depthGrid ?? currentDepthGrid(), canvasWidthPx / (canvasHeightPx ?? (canvasWidthPx * 16) / 9));
      const tracked = faceBandAt(faceTrack, currentTimeMs);
      const face = gridBand ? { band: gridBand, headTop: gridBand.top + 0.015 } : tracked;
      const winEnd = segWindow && Number.isFinite(segWindow.winEnd) ? segWindow.winEnd : phrase[phrase.length - 1].endMs + 500;
      let best = -1;
      if (!phrase.some(isAccent)) phrase.forEach((w, i) => { if (isContentWord(w.text) && scoreOf(w) > (best < 0 ? 0 : scoreOf(phrase[best]))) best = i; });
      return (
        <PropertyReelScene
          preset={lookSpec.reel}
          words={phrase.map((w, i) => ({ id: w.id, text: w.text, start: w.startMs / 1000, end: w.endMs / 1000, emphasisTier: isAccent(w) || i === best ? 2 : 0 }))}
          t={currentTimeMs / 1000} end={winEnd / 1000}
          width={canvasWidthPx} height={canvasHeightPx ?? (canvasWidthPx * 16) / 9}
          caption={{
            fontSizePx: 104 * captionFontScale, emphasisColor: lookSpec.accent ?? accentColor, color: lookSpec.color ?? captionTextColor,
            xPct: captionXPercent / 100, positionYPct: captionYPercent / 100,
            fontFamily: lookSpec.accentFont ?? lookSpec.font, accentFamily: lookSpec.reel === 'reach-counter' ? 'Roboto, sans-serif' : lookSpec.accentFont ?? lookSpec.font,
            secondaryFamily: lookSpec.font, wordSpacingEm: lookSpec.wordGapEm,
          }}
          layer={subjectLayer} headYPct={face?.headTop} faceBand={face?.band ?? null}
        />
      );
    }
    if (lookSpec.family === 'story' && lookSpec.story === 'agent') {
      // the band their scene reads: from the subject grid where a cut-out is live (the preview and
      // the Element Capture export), from the face track where a render has none
      const gridBand = faceBandFromGrid(depthGrid ?? currentDepthGrid(), canvasWidthPx / (canvasHeightPx ?? (canvasWidthPx * 16) / 9));
      const tracked = faceBandAt(faceTrack, currentTimeMs);
      const face = gridBand ? { band: gridBand, headTop: gridBand.top + 0.015 } : tracked;
      const winEnd = segWindow && Number.isFinite(segWindow.winEnd) ? segWindow.winEnd : phrase[phrase.length - 1].endMs + 500;
      // Their headline falls back on the transcript word their pipeline marked important (tier 2);
      // ours falls back on the same emphasis score the impact looks use, when nothing is marked.
      let best = -1;
      if (!phrase.some(isAccent)) phrase.forEach((w, i) => { if (isContentWord(w.text) && scoreOf(w) > (best < 0 ? 0 : scoreOf(phrase[best]))) best = i; });
      return (
        <AgentStoryScene
          words={phrase.map((w, i) => ({ id: w.id, text: w.text, start: w.startMs / 1000, end: w.endMs / 1000, emphasisTier: isAccent(w) || i === best ? 2 : 0 }))}
          t={currentTimeMs / 1000} end={winEnd / 1000}
          width={canvasWidthPx} height={canvasHeightPx ?? (canvasWidthPx * 16) / 9}
          caption={{
            fontSizePx: 104 * captionFontScale, emphasisColor: lookSpec.accent ?? accentColor, color: lookSpec.color ?? captionTextColor,
            xPct: captionXPercent / 100, positionYPct: captionYPercent / 100,
            fontFamily: lookSpec.accentFont ?? lookSpec.font, secondaryFamily: lookSpec.font,
          }}
          layer={subjectLayer} headYPct={face?.headTop} faceBand={face?.band ?? null}
        />
      );
    }
    // ── impact: one word of the phrase huge behind the speaker, the rest a caption in front ──
    // Their karaoke behind designs (see LookImpact for what was measured). The word leaves the row
    // and takes the title box, which the user can move and scale like Big Reveal's. With a cut-out
    // the editor mounts this overlay twice — the word on the layer under the person, the row on the
    // layer over them — and the exports keep the matte off the row (splitsAroundSubject).
    if (lookSpec.impact && (lookSpec.family === 'karaoke' || lookSpec.family === 'flat')) {
      const im = lookSpec.impact;
      const reqPx = Math.max(1, Math.round(im.sizePx * emphFontScale));
      const heroText = (ws: TranscriptWord[]) => ws.map((w) => w.text).join(' ');
      // Their selection: marked words, else the strongest content words, else the design's own
      // by-length rule; a pair collapses to one when it cannot be set at 78% of the design size.
      const plan = planImpact(phrase, currentTimeMs, {
        marked: isAccent, score: scoreOf, select: im.select, maxPerClip: im.maxPerClip, maxChars: im.maxChars,
        fitRatio: (ws) => impactPx(heroText(ws), im, canvasWidthPx, reqPx) / reqPx,
      });
      for (const w of plan.keywords) keywords.add(w);
      const hero = plan.hero[0];
      const heroLast = plan.hero[plan.hero.length - 1];
      const rowWords = plan.row;
      let heroNode: React.ReactNode = null;
      if (hero && subjectLayer !== 'front' && !(unseen(hero) && !lookSpec.heroFromStart)) {
        const px = impactPx(heroText(plan.hero), im, canvasWidthPx, reqPx);
        const lit = !!im.litColor && currentTimeMs >= hero.startMs && currentTimeMs <= heroLast.endMs;
        const from = lookSpec.reveal && !lookSpec.heroFromStart ? hero.startMs : phraseStartMs;
        const heroE = lookSpec.heroEnter;
        const enter: React.CSSProperties = heroE ? enterStyle(heroE, currentTimeMs, from) : enterAt(hero);
        if (heroE?.outMs) enter.opacity = Number(enter.opacity ?? 1) * exitFor(heroE.outMs);
        const chipK = im.chip ? _clamp01((currentTimeMs - hero.startMs) / Math.max(1, im.chip.wipeMs)) : 0;
        heroNode = (
          <div key={`impact-${hero.id}`} data-caption-content="emph" style={{
            position: 'absolute', top: `${emphBoxYPercent}%`, left: `${emphBoxXPercent}%`,
            transform: 'translate(-50%,-50%)', whiteSpace: 'nowrap', lineHeight: 1, pointerEvents: 'none',
          }}>
            <span data-impact="" {...depthAttr} style={withEnter({
              display: 'inline-block', position: 'relative', lineHeight: 1,
              fontFamily: im.font, fontWeight: im.weight ?? 400, fontSize: px,
              ...(im.italic ? { fontStyle: 'italic' as const } : {}),
              ...(im.uppercase ? { textTransform: 'uppercase' as const } : {}),
              ...(im.letterSpacingEm ? { letterSpacing: `${im.letterSpacingEm}em` } : {}),
              color: lit ? im.litColor : (im.color ?? lookSpec.accent ?? accentColor),
              ...(lookRest.textShadow ? { textShadow: lookRest.textShadow } : {}),
              // a spread shadow, not padding, so lighting the word cannot move it
              ...(lit ? { borderRadius: '0.06em', background: hexToRgba(im.litColor!, 0.32), boxShadow: `0 0 0 0.05em ${hexToRgba(im.litColor!, 0.32)}` } : {}),
            }, enter)}>
              {chipK > 0 && (
                // grows leftward from the word's right edge, as their Netting chip does
                <span aria-hidden="true" style={{
                  position: 'absolute', zIndex: -1, top: '0.06em', bottom: '-0.04em', right: '-0.1em',
                  width: `calc(${(chipK * 100).toFixed(1)}% + ${(0.2 * chipK).toFixed(3)}em)`,
                  background: im.chip!.bg, borderRadius: '0.1em',
                }} />
              )}
              {heroText(plan.hero)}
            </span>
          </div>
        );
      }
      const rowNode = rowWords.length && subjectLayer !== 'behind'
        ? phraseRow(rowWords, rowActive, rowInactive, lookWrap, lookGap, lookSpec.fitFactor) : null;
      return <>{heroNode}{rowNode}</>;
    }
    // ── stack: the phrase as a lockup, rows growing down the frame ──────────
    // Each row is fitted INDEPENDENTLY in this look's own face (fontWidthFactor), because the
    // bottom row is the largest and would be the first to run off frame.
    // ── popoff: a zigzag lockup, context flush left and accents flush right ──
    // Rows follow the phrase: a run of plain words is one small left row, each accent word its own
    // big right row. Every row's baseline sits `step` of ITS OWN size below the one before, which is
    // what the measured footage reduces to (0.8 for both the small-after-big and big-after-small
    // steps). The block is centred on the caption box, as their footage's block is.
    if (lookSpec.popoff) {
      const po = lookSpec.popoff;
      const ctxPx = sz(lookSpec.sizePx);
      const availPx = canvasWidthPx * (po.rightPct - po.leftPct) / 100;
      const upper = lookSpec.transform === 'uppercase';
      const lower = lookSpec.transform === 'lowercase';
      type PoRow = { ws: TranscriptWord[]; acc: boolean; px: number };
      const rows: PoRow[] = [];
      for (const w of phrase) {
        const acc = isAccent(w);
        const last = rows[rows.length - 1];
        if (!acc && last && !last.acc) last.ws.push(w);
        else rows.push({ ws: [w], acc, px: 0 });
      }
      const factor = fontWidthFactor(lookSpec.font);
      for (const r of rows) {
        const base = r.acc ? ctxPx * po.accentScale : ctxPx;
        const items = r.ws.map((w) => ({
          text: upper ? w.text.toUpperCase() : lower ? w.text.toLowerCase() : w.text,
          fontPx: base, factor, weight: lookSpec.weight,
        }));
        r.px = fitPx(base, fitRowScale(items, sz(6), availPx));
      }
      // Inter's baseline sits ~0.86 em below the top of a line-height-1 box
      const ASC = 0.86, DESC = 0.26;
      let y = 0;
      const tops = rows.map((r, i) => {
        y = i === 0 ? ASC * r.px : y + po.step * r.px;
        return y - ASC * r.px;
      });
      const heightPx = y + DESC * (rows[rows.length - 1]?.px ?? ctxPx);
      return (
        <>
          <style>{ANIM_CSS}</style>
          <div data-caption-content="popoff" style={{
            position: 'absolute', left: 0, width: '100%', top: `${captionYPercent}%`,
            height: heightPx, transform: 'translateY(-50%)', pointerEvents: 'none',
          }}>
            {rows.map((r, ri) => (
              <div key={r.ws[0].id} data-cap-row="" style={{
                position: 'absolute', top: tops[ri], whiteSpace: 'nowrap', display: 'flex', gap: sz(6),
                ...(r.acc ? { right: `${100 - po.rightPct}%` } : { left: `${po.leftPct}%` }),
              }}>
                {r.ws.map((w) => (
                  <span key={w.id} {...depthAttr} style={{
                    ...(r.acc ? lookAcc : lookRest), fontSize: r.px, lineHeight: 1, display: 'inline-block',
                    ...(currentTimeMs >= w.startMs
                      ? lookEnterStyle(lookSpec, currentTimeMs, w.startMs, !noLineFade) : { opacity: 0 }),
                  }}>{w.text}</span>
                ))}
              </div>
            ))}
          </div>
        </>
      );
    }
    if (lookSpec.family === 'stack' && lookSpec.stack) {
      const st = lookSpec.stack;
      const per = Math.max(1, Math.round(st.maxPerRow));
      const lookFactor = fontWidthFactor(lookSpec.font);
      const upperCase = lookSpec.transform === 'uppercase';
      const shownText = (w: TranscriptWord) => upperCase ? w.text.toUpperCase()
        : lookSpec.transform === 'lowercase' ? w.text.toLowerCase() : w.text;
      // ── Letter mask: the frame goes black and this phrase's letters are cut out of it ──────────
      // Which phrases: their letterMask rule over the segment list (the opening caption, and a payoff
      // near the end of a long video). The plate replaces the phrase's caption for its whole window.
      // Its rows re-flow as the words arrive (measured: "One" huge, then "One"/"sharp", then
      // "One sharp"/"visual"), every row at the one size that fits the widest row across the frame.
      const lm = lookSpec.letterMask;
      const plateKeys = lm && segWindow
        ? letterMaskMoments(resolvedSegs, resolvedSegs.reduce((m, s) => Math.max(m, s.endMs), 0), lm) : null;
      if (lm && segWindow && plateKeys?.has(resolvedSegs[segWindow.index].key)) {
        const shownWords = phrase.filter((w) => currentTimeMs >= w.startMs);
        const measure = (ws: TranscriptWord[]) => plateMeasure(ws.map(shownText).join(' '), lookSpec.font, lookSpec.weight,
          lookSpec.letterSpacingEm ?? 0, lookFactor * fontWeightFactor(lookSpec.weight));
        const rowEm = (ws: TranscriptWord[]) => measure(ws).em;
        const rows = letterMaskRows(shownWords, rowEm);
        const widest = Math.max(1e-6, ...rows.map(rowEm));
        const face = measure(rows[0] ?? phrase);
        const px = Math.max(1, Math.min(canvasWidthPx * LETTER_MASK_MAX_PX_OF_WIDTH, (canvasWidthPx * LETTER_MASK_WIDTH_FRAC) / widest));
        const fadeIn = _clamp01((currentTimeMs - phrase[0].startMs) / Math.max(1, lookSpec.animInMs ?? 60));
        return <LetterMaskPlate id={resolvedSegs[segWindow.index].key} rows={rows.map((ws) => ws.map(shownText).join(' '))}
          px={px} pitch={px * LETTER_MASK_LINE_HEIGHT} capEm={face.capEm} font={lookSpec.font} weight={lookSpec.weight}
          letterSpacingEm={lookSpec.letterSpacingEm} opacity={fadeIn * exitAlpha} />;
      }
      // rows as their buildStackRows breaks them: a hero alone, the plain words chunked by maxPerRow,
      // each row scaled by its own tier — the hero row big wherever it lands, the rest at the plain size
      const stackRows = buildStackRows(phrase, (w) => (isAccent(w) ? 2 : 0), per, { heroPair: st.heroPair, hyphenSplit: st.hyphenSplit });
      const groups: TranscriptWord[][] = stackRows.map((r) => r.words);
      const dynScale = dynAt?.fontScale ?? 1;
      // A hero row is the tier's rowScale TIMES the accent's own scale (their emphasisStyle.scale /
      // fontPairing.accentScale — Cutout's "stop" asks for 2.75 x 1.75 of the base), then fitted to
      // the box on the row's REAL width in its own face and tracking (measured in the DOM, the
      // estimator server-side): a 4-letter hero at 109px must not shrink because a marked word's
      // override scale was counted in, and their fit lands "stop" at 93px, 0.80 of the frame.
      const rowPxs = groups.map((ws, ri) => {
        const hero   = stackRows[ri].tier >= 2;
        const scale  = stackRowScale(st.rowScale, stackRows[ri].tier) * (hero ? (lookSpec.accentScale ?? 1) : 1);
        const basePx = sz(Math.max(1, Math.round(lookSpec.sizePx * scale * dynScale)));
        const font   = hero && lookSpec.accentFont ? lookSpec.accentFont : lookSpec.font;
        const weight = hero ? (lookSpec.accentWeight ?? lookSpec.weight) : lookSpec.weight;
        const lsEm   = hero ? (lookSpec.accentLetterSpacingEm ?? lookSpec.letterSpacingEm ?? 0) : (lookSpec.letterSpacingEm ?? 0);
        const upper  = upperCase || (hero && !!lookSpec.accentUppercase);
        const factor = fontWidthFactor(font) * fontWeightFactor(weight);
        const em = ws.reduce((sum, w, i) => sum + plateMeasure(upper ? w.text.toUpperCase() : w.text, font, weight, lsEm, factor).em
          + (i ? STACK_WORD_GAP_EM : 0), 0);
        const inner = boxPx * 0.94;
        return em * basePx <= inner ? basePx : Math.max(1, Math.floor(inner / em));
      });
      // ── Focusline: the band comes from the phrase's own text ───────────────
      // The block's BOTTOM sits on the band (their planner's y), laid out from the same row sizes the
      // render uses, with calc() so no canvas height is needed; rows justify by band. A drag of the
      // caption box shifts every band together.
      let stackPos: React.CSSProperties = pos;
      const arch = lookSpec.focusline
        ? focuslineArchetype(phrase.map((w) => w.text).join(' '), phrase.some(isAccent)) : null;
      const heroRow = groups.findIndex((ws) => ws.some(isAccent));
      const justifyOf = (ri: number) => arch
        ? focuslineRowJustify(arch, heroRow < 0 || ri > heroRow ? 'trailing' : ri < heroRow ? 'pre' : 'hero')
        : 'center';
      if (arch) {
        const lh = typeof lookSpec.lineHeight === 'number' ? lookSpec.lineHeight : 1.15;
        let blockPx = 0;
        rowPxs.forEach((px, i) => { if (i > 0) blockPx += (st.rowGapEm ?? 0) * px; blockPx += px * lh; });
        const shift = captionYPercent - (lookSpec.positionYPct ?? captionYPercent);
        const bottom = FOCUSLINE_BANDS[arch].y * 100 + shift;
        stackPos = { ...pos, top: `calc(${bottom.toFixed(3)}% - ${blockPx.toFixed(2)}px)`, transform: 'translateX(-50%)' };
      }
      if (dynAt) stackPos = { ...pos, top: `${dynAt.yPct.toFixed(3)}%`, left: `${dynAt.xPct.toFixed(3)}%` };
      return (
        <>
          <style>{ANIM_CSS}</style>
          <div style={stackPos} data-focusline={arch ?? undefined}>
            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: arch ? 'stretch' : 'center', width: 'fit-content' }}>
              {groups.map((ws, ri) => {
                const rowPx = rowPxs[ri];
                return (
                  <div key={ws[0].id} data-cap-row="" style={{
                    display: 'flex', gap: Math.round(STACK_WORD_GAP_EM * rowPx * 100) / 100, justifyContent: justifyOf(ri),
                    // rowGapEm of BOTH rows' sizes: each of their rows carries the gap as its own em
                    // margin, so the space between two rows is the sum (their Cutout pitches, 163px and
                    // 65px on frame 84, land within 1px that way; one row's em alone was 4-5px short).
                    // As `em` it resolved against the row div, which sets no font size of its own.
                    marginTop: ri > 0 ? Math.round((st.rowGapEm ?? 0) * (rowPxs[ri - 1] + rowPx) * 100) / 100 : 0,
                  }}>
                    {ws.map((w) => {
                      const spoken = currentTimeMs >= w.startMs && currentTimeMs <= w.endMs;
                      // The accent marks the EMPHASISED word, as their stacked designs do (Focusline's
                      // "biggest", Cutout's "stop"), not whichever word is being spoken — that karaoke
                      // rule turned every word italic-black-cyan once the accent had its own face.
                      // Unspoken words are hidden until their turn, as every other layout here does and as
                      // their footage reveals. Shown at rest, a word blinked OUT when its entrance began
                      // at opacity 0 and then faded back in (measured: fully visible 33ms before its start).
                      // by role: a hero word takes the hero's entrance (from the phrase start when the
                      // design says so), the others the row's, else the line's
                      const heroW = isAccent(w);
                      const roleE = heroW ? lookSpec.heroEnter : lookSpec.rowEnter;
                      const fromMs = heroW && lookSpec.heroFromStart ? phrase[0].startMs : w.startMs;
                      const enter: React.CSSProperties = currentTimeMs >= fromMs
                        ? (roleE ? enterStyle(roleE, currentTimeMs, fromMs) : lookEnterStyle(lookSpec, currentTimeMs, fromMs, !noLineFade))
                        : lookSpec.animIn && lookSpec.animIn !== 'none' ? { opacity: 0 } : {};
                      if (roleE?.outMs) enter.opacity = Number(enter.opacity ?? 1) * exitFor(roleE.outMs);
                      const st: React.CSSProperties = {
                        ...(isAccent(w) ? lookAcc : lookRest), fontSize: rowPx, display: 'inline-block', ...enter,
                        ...(lookSpec.inception ? { opacity: (Number(enter.opacity ?? 1)) * exitAlpha } : {}),
                      };
                      if (lookSpec.inception && isAccent(w)) {
                        // the accent style LAST: the filter differences the video against its colour
                        return <InceptionWord key={w.id} id={w.id} text={w.text} backdrop={videoBackdrop}
                          style={{ ...st, ...lookAcc, fontSize: rowPx, ...enter, opacity: st.opacity }} />;
                      }
                      return <span key={w.id} {...depthAttr} style={st}>{w.text}</span>;
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      );
    }
    // ── wrapRows: a caption DESIGNED as a multi-row block ───────────────────
    // Not the same thing as a long line that happens to wrap. Their `depth` caption is two rows of
    // large full-width capitals ("DEPTH MAKES A" / "SIMPLE SENTENCE"), measured at 74-83% of frame
    // width with each row about 8% of frame height. Fitting that phrase to ONE row shrinks it to a
    // fraction of that and loses the design. Rows are balanced and fitted independently, so the
    // longer row cannot push the shorter one off frame.
    if ((lookSpec.wrapRows ?? 1) > 1 && phrase.length > 1) {
      const rows = Math.min(lookSpec.wrapRows as number, phrase.length);
      const per = Math.ceil(phrase.length / rows);
      const groups: TranscriptWord[][] = [];
      // An emphasised word opens the last row of a two-row design ("If your idea feels / messy,");
      // otherwise the rows are balanced.
      const markAt = rows === 2 ? phrase.findIndex((w, i) => i > 0 && rowMarked(w)) : -1;
      if (markAt > 0) groups.push(phrase.slice(0, markAt), phrase.slice(markAt));
      else for (let i = 0; i < phrase.length; i += per) groups.push(phrase.slice(i, i + per));
      const wrapFactor = lookSpec.fitFactor ?? fontWidthFactor(lookSpec.font);
      const basePx = sz(lookSpec.sizePx);
      return (
        <>
          <style>{ANIM_CSS}</style>
          <div style={pos}>
            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', width: 'fit-content' }}>
              {groups.map((ws) => {
                const f = phraseFit(ws, basePx, {
                  frac: 0.94, forceRow: true, factor: wrapFactor,
                  weight: lookSpec.weight, upper: lookSpec.transform === 'uppercase',
                });
                const rowPx = fitPx(basePx, f);
                return (
                  <div key={ws[0].id} data-cap-row="" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    {ws.map((w) => {
                      const spoken = currentTimeMs >= w.startMs;
                      return (
                        <span key={w.id} {...depthAttr} style={{
                          // Entrance by the shared rules: once for the phrase unless the look reveals
                          // word by word. (Running a per-word entrance over unspoken words hid them at
                          // opacity 0 and left the second row blank.)
                          ...withEnter({
                            ...(rowMarked(w) ? lookMarked : lookSpec.family === 'karaoke' && spoken ? lookLit : lookRest),
                            fontSize: rowMarked(w) ? Math.round(rowPx * (lookSpec.accentScale ?? 1)) : rowPx, display: 'inline-block',
                          }, unseen(w) ? { opacity: 0 } : spoken || !perWordEnter ? enterAt(w) : {}),
                        }}>{w.text}</span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      );
    }
    // popIn is the SAME entrance curve the hand-written templates use, keyed off each word's own
    // start — so a spec look pops identically rather than approximately.
    // Jitter is hashed from the word id, so it is identical in the preview and in every renderer
    // and does not twitch between frames. rowActive / rowInactive carry the entrance rules above.
    return phraseRow(phrase, rowActive, rowInactive, lookWrap, lookGap, lookSpec.fitFactor);
    })();
    return preservedLayer ? <>{preservedLayer}{frontOut}</> : frontOut;
    })();
    // A wrapper fades everything at once — except under an inception word, where an ancestor's
    // opacity would cut the backdrop filter off; those looks fade each element instead.
    // Always wrapped for a look that declares an exit, so the tree does not change shape mid-line
    // (opacity 1 isolates nothing); never for inception looks.
    if (specOut && lookSpec.animOutMs && !lookSpec.inception) {
      return <div data-caption-exit="" style={{ opacity: exitAlpha }}>{specOut}</div>;
    }
    return specOut;
  }

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
    const aaPx = fitPx(sz(16), phraseFit(phrase, sz(16), { frac: 0.8, factor: 1.15 }));  // pill pads 18px/side; Poppins runs wide
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ background: '#ffffff', borderRadius: 14, padding: '8px 18px', display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', alignItems: 'baseline', overflow: 'hidden' }}>
            {phrase.map(w => {
              const spoken = currentTimeMs >= w.startMs;
              return (
                <span key={w.id} style={{
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
    const cmPx = fitPx(sz(18), phraseFit(phrase, sz(18)));
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', maxWidth: '90%', overflow: 'hidden' }}>
            {phrase.map(w => (
              <span key={w.id} style={{
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
    const bbPx = fitPx(sz(17), phraseFit(phrase, sz(17), { gapPx: 22, frac: 0.88, factor: 1.15 }));
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', overflow: 'hidden' }}>
            {phrase.map(w => {
              const active = currentTimeMs >= w.startMs && currentTimeMs <= w.endMs;
              return (
                <span key={w.id} style={{
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
    const igPx = fitPx(sz(18), phraseFit(phrase, sz(18), { upper: true, factor: 1.15 }));
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', maxWidth: '90%', overflow: 'hidden' }}>
            {phrase.map(w => (
              <span key={w.id} style={{
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
    const cwPx = fitPx(sz(18), phraseFit(phrase, sz(18)));
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', maxWidth: '90%', overflow: 'hidden' }}>
            {phrase.map((w, i) => {
              const visible = i <= spokenUpTo;
              return (
                <span key={w.id} style={{
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
    const lgPx = fitPx(sz(15), phraseFit(phrase, sz(15), { frac: 0.78, factor: 1.15 }));  // pill pads 22px/side; Montserrat
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div data-cap-row="" style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 36, padding: '8px 22px', display: 'flex', gap: 6, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', alignItems: 'baseline', backdropFilter: 'blur(10px)', overflow: 'hidden' }}>
            {phrase.map(w => {
              const spoken = currentTimeMs >= w.startMs;
              return (
                <span key={w.id} style={{
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
    const dlPx = fitPx(sz(17), phraseFit(phrase, sz(17)));
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
                <span key={w.id} style={{
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
    const tbPx = fitPx(sz(20), phraseFit(phrase, sz(20), { gapPx: 5, upper: true, factor: 1.15 }));
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
                <span key={w.id} style={{ display: 'inline-block', ...tStyle }}>{w.text}</span>
              ))}
            </div>
            {captionLines !== 'single' && nextPhrase && nextPhrase.length > 0 && (
              <div data-cap-row="" style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', opacity: 0.75 }}>
                {nextPhrase.map(w => (
                  <span key={w.id} style={{ display: 'inline-block', ...tStyle, fontSize: sz(17) }}>{w.text}</span>
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
                <span key={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...flatCtx, ...revealStyle(w) }}>{w.text}</span>
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
                      <span key={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...preCtx, ...revealStyle(w) }}>{w.text}</span>
                    ))}
                  </div>
                );
              }
              nodes.push(
                <div key={`emph${si}`} data-cap-row="" style={{ display: 'flex', justifyContent: 'center' }}>
                  <span data-emph="" style={{ fontFamily: ff(sec.emph), display: 'inline-block', ...fittedWordStyle(sec.emph), ...revealStyle(sec.emph) }}>{sec.emph.text}</span>
                </div>
              );
              if (sec.trailing.length > 0) {
                const trailCtx = glowCtxRow(sec.trailing);
                nodes.push(
                  <div key={`trail${si}`} data-cap-row="" style={{ display: 'flex', gap: sz(6), justifyContent: glowCentered ? 'center' : 'flex-end' }}>
                    {sec.trailing.map(w => (
                      <span key={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...trailCtx, ...revealStyle(w) }}>{w.text}</span>
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
    const dgPx = fitPx(sz(20), phraseFit(phrase, sz(20), { gapPx: 5, frac: 0.95, upper: true, factor: 1.1 }));
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={pos}>
          <div style={{ display: 'flex', gap: 5, flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap', justifyContent: 'center', overflow: 'hidden' }}>
            {phrase.map(w => {
              const spoken = currentTimeMs >= w.startMs;
              return (
                <span key={w.id} style={{
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
    const ssPx = fitPx(sz(22), phraseFit(phrase, sz(22), { upper: true, factor: 1.1 }));
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
                <span key={w.id} style={{
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
    const bpPx   = fitPx(bpBase, phraseFit(phrase, bpBase, { upper: true, factor: 0.92 }));
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
    const bxPx  = fitPx(sz(19), bxFit);
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
    const mbPx = fitPx(sz(20), phraseFit(phrase, sz(20), { upper: true, factor: 1.1 }));
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
    const TITLE_FS = fitPx(titleBase, titleFit);
    const lowerFit = phraseFit(restWords, sz(15), { frac: 0.95, gapPx: sz(6) });
    const LOWER_FS = fitPx(sz(15), lowerFit);   // normal lower caption (global captionFontScale)

    const seed = phrase[0].id;

    return (
      <>
        {/* TITLE BOX — big bold uppercase, sits behind the subject; word-by-word slide-up.
            keyed by phrase id so each caption mounts fresh and the entrance replays.
            Rendered on the BACK layer (behind the cut-out) when 3-layer compositing is used. */}
        {emphWords.length > 0 && subjectLayer !== 'front' && (
          <div key={`br-title-${seed}`} style={{
            position: 'absolute', top: `${emphBoxYPercent}%`, left: `${emphBoxXPercent}%`,
            width: `${emphBoxWidthPercent}%`, transform: 'translate(-50%,-50%)',
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end',
            gap: sz(10), overflow: 'visible', pointerEvents: 'none',
          }} data-caption-content="emph">
            {titleVisible.map(w => {
              const native = getFontFamily(w.text);
              return (
                <span key={w.id} style={{
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
        {restWords.length > 0 && subjectLayer !== 'behind' && (
          <div key={`br-lower-${seed}`} style={{
            position: 'absolute', top: `${captionYPercent}%`, left: `${captionXPercent}%`,
            width: `${captionWidthPercent}%`, transform: 'translate(-50%,-50%)',
            display: 'flex', flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap',
            justifyContent: 'center', alignItems: 'baseline', gap: sz(6),
            overflow: 'hidden', pointerEvents: 'none',
          }} data-caption-content="true">
            {restWords.map(w => (
              <span key={w.id} style={{
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

  // ── The Big Red: white Times caption straight through a stretched red Times title ──────────
  // ONE box, two stacked layers: the emphasised words form a huge vertically-stretched red Times
  // title drawn FIRST (= lowest layer), and the non-emphasised words read as a plain white Times
  // caption drawn SECOND (= topmost layer). Both layers share a single grid cell, so the white
  // words land on the EXACT centre of the red title by construction — nothing to line up by hand.
  // NO MOTION anywhere: the title is simply there for its whole segment, and the white words hard-
  // cut in as they are spoken (no slide, no fade, and no re-flow — unspoken words hold their place
  // in the row). Same single mount on the preview and every export, so the paint order — and
  // therefore the layering — can never drift.
  if (captionStyle === 'big_red') {
    if (!phrase) return null;

    // Project-wide emphasis test (color or scale>1) — identical to every other template.
    const isE = (w: TranscriptWord) =>
      !!(w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1));

    const emphWords = phrase.filter(isE);
    const restWords = phrase.filter(w => !isE(w));

    // Fit guards, both against the ONE box: the title row wraps, so its widest word must fit;
    // the white caption is a nowrap row in single-line mode, so the whole row must fit.
    // factor 1.05: Times New Roman Bold caps run a little wider than the char table's ~Inter caps.
    // The title keeps its OWN scale (Text tab → "Title size") so it can be sized against the
    // caption without a second box.
    const titleBase = Math.round(46 * emphFontScale);
    const titleFit  = fitWordScale(
      emphWords.map(w => ({ text: w.text.toUpperCase(), fontPx: titleBase, factor: 1.05 })),
      boxPx,
    );
    const TITLE_FS = fitPx(titleBase, titleFit);
    const LOWER_FS = fitPx(sz(15), phraseFit(restWords, sz(15), { frac: 0.95, gapPx: sz(6) }));
    // Soft red halo. It has to be a drop-shadow FILTER, not a text-shadow: the glyphs are filled
    // with a clipped gradient (transparent text fill), and a text-shadow would show straight
    // THROUGH the letters. Same reason hormozi uses drop-shadow.
    const glowPx = Math.max(1, Math.round(TITLE_FS * 0.16));

    return (
      <div data-cfont-lock="" style={{
        position: 'absolute', top: `${captionYPercent}%`, left: `${captionXPercent}%`,
        width: `${captionWidthPercent}%`, transform: 'translate(-50%,-50%)',
        // Both layers occupy the SAME grid cell → they are centred on each other exactly.
        display: 'grid', placeItems: 'center', pointerEvents: 'none',
      }} data-caption-content="true">
        {/* TITLE (BACK layer). z-index, not just DOM order: the title's glyphs carry a transform +
            a drop-shadow filter, each of which makes its own stacking context that would otherwise
            paint ABOVE the plain inline caption text. Explicit 0 / 1 pins the order everywhere. */}
        {emphWords.length > 0 && (
          <div style={{
            gridArea: '1 / 1', position: 'relative', zIndex: 0,
            display: 'flex', flexWrap: 'wrap',
            justifyContent: 'center', alignItems: 'center',
            gap: Math.round(TITLE_FS * 0.22), overflow: 'visible',
          }}>
            {emphWords.map(w => {
              const native = getFontFamily(w.text);
              const solid  = w.styleOverride?.color;   // a colour override drops the gradient
              const fill: React.CSSProperties = solid
                ? { color: solid }
                : {
                    backgroundImage: BIG_RED_GRAD,
                    WebkitBackgroundClip: 'text', backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent', color: 'transparent',
                  };
              return (
                // Outer span carries the stretched line box; the inner one does the stretching, so
                // the row (and the dashed box's ResizeObserver) measures the real glyph height.
                <span key={w.id} style={{ display: 'inline-block', lineHeight: BIG_RED_STRETCH }}>
                  <span style={{
                    display: 'inline-block', lineHeight: 1,
                    transform: `scaleY(${BIG_RED_STRETCH})`, transformOrigin: 'center',
                    fontFamily: native === 'system-ui, sans-serif' ? BIG_RED_FONT : native,
                    fontWeight: 700, fontSize: `${TITLE_FS}px`,
                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                    ...fill,
                    filter: `drop-shadow(0 0 ${glowPx}px ${hexToRgba(shadeHex(solid ?? BIG_RED_SOLID, -55), 0.55)})`,
                  }}>
                    {w.text}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* CAPTION (FRONT layer — always above the title and its glow, whatever the title does) */}
        {restWords.length > 0 && (
          <div style={{
            gridArea: '1 / 1', position: 'relative', zIndex: 1,
            display: 'flex',
            flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap',
            justifyContent: 'center', alignItems: 'baseline', gap: sz(6),
          }}>
            {restWords.map(w => {
              const native = getFontFamily(w.text);
              return (
                <span key={w.id} style={{
                  display: 'inline-block',
                  fontFamily: native === 'system-ui, sans-serif' ? BIG_RED_FONT : native,
                  fontWeight: 700, fontSize: `${LOWER_FS}px`, lineHeight: 1.1,
                  color: w.styleOverride?.color ?? captionTextColor, whiteSpace: 'nowrap',
                  // Each word appears exactly when it is spoken — a hard cut, no fade or slide.
                  // `visibility` (not a filter on the list) keeps the unspoken words in the layout,
                  // so the line never re-flows or re-centres as words arrive: they simply light up
                  // in place over the title.
                  visibility: currentTimeMs >= w.startMs ? 'visible' : 'hidden',
                }}>
                  {w.text}
                </span>
              );
            })}
          </div>
        )}
      </div>
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
      const c1Items = phrase.map(w => ({ text: w.text, fontPx: CTX_FS, factor: fontWidthFactor(OSANS), weight: 700 }));
      const c1Fit   = mixed ? fitWordScale(c1Items, boxPx * 0.94) : fitRowScale(c1Items, GAP, boxPx * 0.94);
      const C1_FS   = fitPx(CTX_FS, c1Fit);
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
              <span key={w.id} style={{
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
    const emphFontSize = fitPx(
      CTX_FS * 2.8, fitWordScale([{ text: emph.text, fontPx: Math.round(CTX_FS * 2.8), factor: fontWidthFactor(OSANS) }], boxPx * 0.94),
    );
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
      ? fitPx(CTX_FS, fitRowScale(ws.map(w => ({ text: w.text, fontPx: CTX_FS, factor: fontWidthFactor(OSANS) })), zoneGap, boxPx * 0.94))
      : CTX_FS;
    const topPx = zonePx(topWords), botPx = zonePx(bottomWords);
    const zoneWord = (fs: number) => function ZoneWord(w: TranscriptWord) {
      return (
        <span key={w.id} style={{
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
    const HERO_FS   = fitPx(HERO_BASE, fitWordScale([{ text: heroFitTx, fontPx: HERO_BASE }], boxPx * 0.94));
    const EM_CTX_FS = fitPx(CTX_FS, fitWordScale(phrase.map(w => ({ text: w.text, fontPx: CTX_FS })), boxPx * 0.94));
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
        <span key={w.id} style={{
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
          <span key={w.id} style={{
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
          <span key={w.id} style={{
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
        <span key={w.id} style={{
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

  // ── Scribble: time-driven preview (mirrors ScribbleRow) ─────────────────────
  // Same deterministic roles (scribbleRoles above) and the SAME closed-form motion math as the
  // export, computed from (currentTimeMs − word.startMs) — so the sticker pop / highlighter wipe /
  // pen-circle draw render identically in the live preview, the WYSIWYG export and Lambda.
  if (captionStyle === 'scribble') {
    if (!phrase) return null;

    const seed  = phrase[0].id;
    const slots = resolveScribbleSlots(templateSlots?.scribble);
    const markerBg = `linear-gradient(94deg, ${slots.markerColor} 0%, ${slots.markerColor}DD 55%, ${slots.markerColor} 100%)`;
    const BASE  = sz(16);
    const S     = (n: number) => Math.max(1, Math.round(n * BASE / 16));
    const limPx = boxPx * 0.94;   // FIXED canvas-space box width (not BASE — that scales with fontScale)

    const { marked, circled } = scribbleRoles(phrase);
    const backOut = _backOut, easeOutC = _easeOut, clamp01 = _clamp01;

    const radii = [
      `${S(8)}px ${S(14)}px ${S(10)}px ${S(12)}px / ${S(14)}px ${S(8)}px ${S(13)}px ${S(9)}px`,
      `${S(12)}px ${S(9)}px ${S(15)}px ${S(8)}px / ${S(9)}px ${S(13)}px ${S(8)}px ${S(14)}px`,
      `${S(10)}px ${S(12)}px ${S(8)}px ${S(15)}px / ${S(12)}px ${S(9)}px ${S(14)}px ${S(8)}px`,
    ];

    const renderScribbleWord = (w: TranscriptWord, i: number): React.ReactNode => {
      const t = (currentTimeMs - w.startMs) / 1000;
      // PACE: same compression as the export — a fast line must still resolve every word.
      const pf = paceFactor(wordRoomSec(phrase, i), 0.9);
      const POP = 0.42 * pf, SW_AT = 0.26 * pf, SW_DUR = 0.3 * pf,
            CR_AT = 0.38 * pf, CR_DUR = 0.5 * pf;
      const isMarked  = marked.includes(i);
      const isCircled = i === circled;
      const indic     = getFontFamily(w.text) !== 'system-ui, sans-serif';
      // one marked word keeps the 1.35x hero bump; several share a gentler one
      const markMul = marked.length > 1 ? 1.1 : 1.35;
      const mul = (isMarked ? markMul : isCircled ? 1.18 : 1) * (indic ? 1.08 : 1);
      let fs = Math.round(BASE * mul);
      if (isMarked) {
        // Word-level fit clamp: a long marked word at 1.35× must never escape the box.
        const est = auraEstWidth(w.text, fs, 1.0), lim = limPx * 0.92;
        if (est > lim) fs = Math.max(S(10), Math.floor(fs * lim / est));
      }
      const rot = random(`${seed}:rot${i}`) * 6 - 3;

      // Sticker pop: spring scale 0.5→1 (overshoot ≈1.05) while the rotation settles from rot−8°.
      const p       = clamp01(t / POP);
      const k       = backOut(p);
      const opacity = t < 0 ? 0 : clamp01(p * 2.2);
      const scale   = 0.5 + 0.5 * k;
      const rotNow  = rot - 8 * (1 - k);
      // Highlighter wipes left→right just after the word lands; the circle draws on after that.
      const sw   = easeOutC(clamp01((t - SW_AT) / SW_DUR));
      const dash = 100 - 88 * easeOutC(clamp01((t - CR_AT) / CR_DUR));
      const tilt = (random(`${seed}:ct${i}`) * 8 - 4).toFixed(1);

      return (
        <span key={w.id} style={{
          position: 'relative', display: 'inline-block', whiteSpace: 'nowrap',
          fontFamily: indic ? getFontFamily(w.text) : slots.font,
          fontWeight: 700, fontSize: fs, lineHeight: 1.3,
          color: isMarked ? slots.inkColor : (w.styleOverride?.color ?? slots.noteColor),
          textShadow: isMarked ? 'none' : `0 ${S(2)}px ${S(6)}px rgba(30,20,10,0.55)`,
          opacity,
          transform: `scale(${scale.toFixed(3)}) rotate(${rotNow.toFixed(1)}deg)`,
          willChange: 'transform',
        }}>
          {isMarked && (
            <span aria-hidden style={{
              position: 'absolute', top: '6%', bottom: '-2%', left: '-6%', right: '-8%', zIndex: -1,
              background: markerBg,
              borderRadius: radii[Math.floor(random(`${seed}:hr${i}`) * 3)],
              transform: `scaleX(${sw.toFixed(3)}) skewX(-5deg)`, transformOrigin: 'left center',
            }} />
          )}
          <span style={{ position: 'relative' }}>{w.text}</span>
          {isCircled && (
            <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{
              position: 'absolute', top: '-16%', left: '-12%', width: '124%', height: '132%',
              overflow: 'visible', pointerEvents: 'none',
            }}>
              <ellipse cx={50} cy={30} rx={46} ry={25} pathLength={100}
                transform={`rotate(${tilt} 50 30)`}
                style={{
                  fill: 'none', stroke: w.styleOverride?.color ?? slots.penColor,
                  strokeWidth: 3, strokeLinecap: 'round',
                  strokeDasharray: 100, strokeDashoffset: dash,
                }} />
            </svg>
          )}
        </span>
      );
    };

    // (The ✦ corner doodle was removed — it read as a stray star at the frame edge.)
    const outerPos: React.CSSProperties = {
      position: 'absolute', top: `${captionYPercent}%`, left: `${captionXPercent}%`,
      width: `${captionWidthPercent}%`, transform: 'translate(-50%,-50%)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none',
    };

    return (
      // key by phrase id so each caption mounts fresh (matches the other kinetic templates)
      <div key={seed} style={outerPos} data-caption-content="true" data-cfont-lock="">
        <div style={{
          position: 'relative', width: '100%',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
          gap: `${S(3)}px ${S(7)}px`, paddingTop: S(6), paddingBottom: S(4),
        }}>
          {phrase.map(renderScribbleWord)}
        </div>
      </div>
    );
  }

  // ── Interlock: the negative-space caption ───────────────────────────────────
  // Two states from one engine: with no emphasised word the line sets as a plain centred
  // caption; emphasise a word and it becomes a large italic serif with the rest of the line
  // placed into the empty strips its letterforms leave. All geometry comes from measured ink
  // (src/lib/interlockEngine), cached per phrase, so preview and export agree.
  if (captionStyle === 'journal') {
    if (!phrase) return null;
    const slots = resolveJournalSlots(templateSlots?.journal);
    const basePx = sz(28);
    const gapPx  = basePx * 0.34;
    const k = rowFit(phrase.map(w => ({ text: w.text, fontPx: basePx, factor: 0.86 })), { gapPx, frac: 0.92 });
    return (
      <JournalPhrase
        key={phrase[0].id}
        phrase={phrase}
        currentTimeMs={currentTimeMs}
        winEnd={segWindow ? segWindow.winEnd : phrase[phrase.length - 1].endMs + 120}
        fontPx={Math.max(8, basePx * k)}
        gapPx={gapPx * k}
        slots={slots}
        xPct={captionXPercent} yPct={captionYPercent} wPct={captionWidthPercent}
      />
    );
  }

  if (captionStyle === 'interlock') {
    if (!phrase) return null;
    return (
      <InterlockPhrase
        key={phrase[0].id}
        phrase={phrase}
        currentTimeMs={currentTimeMs}
        emphIdx={phrase.findIndex(isEmph)}
        boxPx={boxPx}
        heroPx={Math.max(12, sz(canvasWidthPx * 0.215))}
        lines={captionLines}
        slots={resolveInterlockSlots(templateSlots?.interlock)}
        colorLocked={templateSlots?.interlock?.heroColor !== undefined}
        xPct={captionXPercent}
        yPct={captionYPercent}
        wPct={captionWidthPercent}
      />
    );
  }

  // ── Archives: time-driven preview (mirrors ArchivesRow) ─────────────────────
  // Same pure engine imported from the composition, and the SAME drawing index derived from
  // elapsed ms instead of frames — so the boil, scrawl and devices land on identical drawings
  // in the preview, the WYSIWYG export and Lambda. Sandboxed to 'archives'.
  if (captionStyle === 'archives') {
    if (!phrase) return null;

    const seedBase = phrase[0].id;
    const slots = resolveArchivesSlots(templateSlots?.archives);
    const BASE = sz(17);
    const S = (n: number) => Math.max(1, Math.round(n * BASE / 17));
    const { emph } = archivesRoles(phrase);
    // the preview clock runs at the composition's nominal 30fps so drawings match the export
    const drawOf = (ms: number) => archivesDrawIndex(Math.floor((ms / 1000) * 30));

    const sizeOf = (i: number) => Math.round(BASE * (i === emph ? 1.22 : 1));
    const gap = BASE * 0.34;
    const natural = phrase.reduce((acc, w, i) =>
      acc + auraEstWidth(archivesCase(w.text, i === 0), sizeOf(i), 1.0), 0) + gap * (phrase.length - 1);
    const limit = boxPx * 0.94;
    const fit = natural > limit ? limit / natural : 1;

    const outerPos: React.CSSProperties = {
      position: 'absolute', top: `${captionYPercent}%`, left: `${captionXPercent}%`,
      width: `${captionWidthPercent}%`, transform: 'translate(-50%,-50%)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none',
    };

    return (
      <div key={seedBase} style={outerPos} data-caption-content="true" data-cfont-lock="">
        <ArchivesBoilDefs idPrefix="arcP" />
        <div style={{
          position: 'relative', width: '100%',
          display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'center',
          gap: `${Math.round(BASE * 0.2)}px ${Math.round(gap * fit)}px`,
        }}>
          {phrase.map((w, i) => {
            const elapsed = currentTimeMs - w.startMs;
            if (elapsed < 0) return null;              // the line BUILDS as it's spoken
            const rawDraw = drawOf(elapsed);
            const boilMul = slots.boilAmount === 'low' ? .5 : slots.boilAmount === 'high' ? 1.7 : 1;
            const draw = slots.boilAmount === 'off' ? 0 : rawDraw;
            const seed = `${seedBase}:${w.id}`;
            const j0 = archivesJitter(seed, draw);
            const jit = slots.boilAmount === 'off'
              ? { dx: 0, dy: 0, rot: 0 }
              : { dx: j0.dx * boilMul, dy: j0.dy * boilMul, rot: j0.rot * boilMul };
            const fs = Math.max(6, Math.round(sizeOf(i) * fit));
            const inkCol = w.styleOverride?.color
              ?? (i === emph ? (slots.emphColor ?? slots.inkColor) : slots.inkColor);
            const indic = getFontFamily(w.text) !== 'system-ui, sans-serif';

            // PACE: sized to the room this word actually has (same helper as the export)
            const SD = archivesTiming(wordRoomSec(phrase, i) * 30);
            const override = slots.inAnimation !== 'default';
            const useScrawl = slots.showScrawl && !override;
            const scrawlOn = useScrawl && rawDraw < SD.scrawl;
            const wordOn = useScrawl ? rawDraw >= SD.scrawl - 1 : true;
            const pose = override
              ? resolveInAnimPose(slots.inAnimation as Exclude<CaptionInAnimation, 'default'>, elapsed / 1000, sz(14))
              : null;
            const prog = Math.min(1, (rawDraw + 1) / Math.max(1, SD.scrawl - 1));
            const bw = auraEstWidth(archivesCase(w.text, i === 0), fs, 1.0), bh = fs * 1.15;
            const sw = bw * 1.45, sh = bh * 2.3;
            const dd = Math.max(0, rawDraw - (useScrawl ? SD.scrawl : 0));
            const dp = Math.min(1, dd / SD.device);

            return (
              <span key={w.id} style={{ position: 'relative', display: 'inline-block', whiteSpace: 'nowrap' }}>
                <span style={{
                  display: 'inline-block', position: 'relative', zIndex: 2,
                  fontFamily: indic ? getFontFamily(w.text) : slots.font,
                  fontWeight: 400, fontSize: fs, lineHeight: 1.15, color: inkCol,
                  textShadow: `0 ${S(2)}px ${S(7)}px rgba(0,0,0,0.6)`,
                  opacity: pose ? pose.opacity : (wordOn ? 1 : 0),
                  transform: pose
                    ? `translate(${pose.dx.toFixed(2)}px,${pose.dy.toFixed(2)}px)`
                    : `translate(${jit.dx.toFixed(2)}px,${jit.dy.toFixed(2)}px) rotate(${jit.rot.toFixed(2)}deg)`,
                  filter: `url(#arcP${draw % 8})`,
                }}>{archivesCase(w.text, i === 0)}</span>

                {/* the ONE device: the emphasised word is underlined by hand, drawn twice */}
                {slots.showUnderline && i === emph && dd > 0 && (
                  <svg viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden style={{
                    position: 'absolute', left: '-8%', bottom: '-30%', width: '116%', height: '28%',
                    overflow: 'visible', zIndex: 3, filter: `url(#arcP${draw % 8})`,
                  }}>
                    <path d={archivesUnderline(100, 14, 0, seed)}
                      style={{ fill: 'none', stroke: inkCol, strokeWidth: 2.6, strokeLinecap: 'round' }} />
                    {dp >= 1 && (
                      <path d={archivesUnderline(100, 14, 2.5, seed + 'b')}
                        style={{ fill: 'none', stroke: inkCol, strokeWidth: 1.6, strokeLinecap: 'round', opacity: .6 }} />
                    )}
                  </svg>
                )}

                {scrawlOn && (
                  <svg viewBox={`0 0 ${Math.round(sw)} ${Math.round(sh)}`} aria-hidden style={{
                    position: 'absolute', left: `${-(sw - bw) / 2}px`, top: `${-(sh - bh) / 2}px`,
                    width: `${sw}px`, height: `${sh}px`, overflow: 'visible', zIndex: 4,
                    opacity: rawDraw === 0 ? .5 : rawDraw >= SD.scrawl - 1 ? .55 : 1,
                    filter: `url(#arcP${draw % 8})`,
                  }}>
                    <g transform={`translate(${((sw - bw) / 2).toFixed(1)},${((sh - bh) / 2).toFixed(1)})`}>
                      <path d={archivesScrawl(bw, bh, prog, `${seed}:d${rawDraw}`)}
                        style={{
                          fill: 'none', stroke: inkCol, strokeLinecap: 'round', strokeLinejoin: 'round',
                          strokeWidth: (bh * (rawDraw === 0 ? .07 : .1)).toFixed(1),
                        }} />
                    </g>
                  </svg>
                )}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Blockbuster: the two-voice caption ──────────────────────────────────────
  // Decoded from a reference clip by scanning all 1118 frames. One sentence, TWO typographic
  // voices: a red condensed-caps run, then the remainder continuing in a white roundhand script
  // whose ascenders climb BACK INTO the red band — the tiers interlock, they never stack.
  // There is deliberately NO emphasis mechanic: in the source no word is ever scaled, recoloured
  // or marked. Tier 1 vs tier 2 IS the emphasis, and a third accent is what would break it.
  // Sandboxed — only ever reached from `captionStyle === 'blockbuster'`.
  if (captionStyle === 'blockbuster') {
    if (!phrase) return null;

    // MEASURED: red cap height is 6.39% of the frame. Anton's cap is ~0.73em, so the face sits
    // at 8.75% of frame width — derived from the canvas rather than a fixed px, or the caption
    // would hold no fixed proportion across aspect ratios (the logical canvas is ~270x480
    // portrait, 480x480 square). captionFontScale still rides on top as the user's size control.
    const bb       = resolveBlockbusterSlots(templateSlots?.blockbuster);
    const gMul     = BB_LEVEL_MUL[bb.glowAmount];
    const sMul     = BB_LEVEL_MUL[bb.shadowAmount];
    const A        = (base: number, mul: number) => Math.min(1, +(base * mul).toFixed(3));
    // Deriving this from Anton's NOMINAL 0.73 cap ratio gave 8.75% of frame width and rendered
    // the type 22% TOO BIG. 0.0705 is the ratio that actually reproduces the reference,
    // verified by rendering the app at the source's own 720px and running the same
    // row-profile scan over both (cap 46px vs 46, script ink 68 vs 68).
    const redPx    = Math.max(8, sz(canvasWidthPx * 0.0705));
    const scriptPx = Math.round(redPx * 1.355);       // tier 2 is TALLER than tier 1 (9.44% vs 6.39%)
    // shadow/glow radii were fitted at these type sizes; scale them with the type
    const R = (n: number) => Math.max(1, Math.round(n * redPx / 15.5));
    const K = (n: number) => Math.max(1, Math.round(n * scriptPx / 21));

    const elapsed = currentTimeMs - phrase[0].startMs;
    // PACE: sized to the room the line actually has, so on fast speech the plate has finished
    // climbing before the next word lands instead of still being in motion under it.
    const riseMs  = bbRiseMs(wordRoomSec(phrase, 0));
    const spanSec = Math.max(0.3, (phrase[phrase.length - 1].endMs - phrase[0].startMs) / 1000);
    // travel is expressed against the type, so it is aspect-independent and scales with size
    const entry   = bbEntry(elapsed, redPx * BB_RISE_TRAVEL_EM, riseMs);
    const trackX  = bb.tracking ? bbTrack(elapsed, bbTrackMs(spanSec)) : 1;

    // tier 1 runs until the next word would push it past ~64% of the box; the rest is tier 2
    // The red row is rendered under a scaleX condensation, so its NATURAL width overstates what
    // actually lands on screen by ~12%. Scale the estimate before testing it against the limit,
    // or the cap binds a word early and the split drifts off the source's (6 words gave 3:3
    // instead of 4:2).
    // The split is a decision about WORD GROUPING, not about pixels on screen, so measure it at
    // the UNSCALED size. Measuring at redPx made the user's Size control reshuffle the tiers —
    // and combined with the fit clamp below, scaling a long line UP rendered it NARROWER
    // (8-word line: run 123.6px at scale 1.0, 98.8px at scale 1.8). A stable split makes the
    // control monotonic: bigger scale grows the line until it fills the box, then stops.
    const splitPx = Math.max(8, Math.round(canvasWidthPx * 0.0705));
    const widths = phrase.map(w => auraEstWidth(w.text.toUpperCase(), splitPx, 1.0) * BB_TRACK_TO);
    const cut    = bbSplit(widths, boxPx * 0.64);
    const tier1  = phrase.slice(0, cut);
    const tier2  = phrase.slice(cut);

    const gap1 = Math.round(redPx * 0.194);
    const gap2 = Math.round(scriptPx * 0.524);
    // "never auto-shrinks" is the design, but a very long Indic word must not run off frame —
    // clamp only when a row would actually overflow.
    // auraEstWidth is a character-unit estimator tuned for Aura's SANS faces. Measured against
    // the real faces it overshoots badly here — Anton at .035em by +28%, Great Vibes at .02em by
    // ~+10% — and since the clamp below takes the MIN of both tiers, the red tier's error was
    // dragging the whole caption smaller than it needed to be. Worse, a clamp is a threshold, so
    // sitting near it makes the rendered size flip on tiny differences between surfaces. These
    // calibrate the estimate back onto what actually paints; the red also renders under the
    // tracking condensation, so its overflow width is the estimate times that too.
    const EST_RED = 0.78, EST_SCRIPT = 0.91;
    // MEASURED: the script face's swash CAPITALS are ~1.1em each, 1.44–1.68× the table — an all-caps
    // word in the script tier ran off both sides of the frame. (Its lowercase already overshoots.)
    const BB_SCRIPT_CAP_EM = 1.11;
    const scriptCapsExtra = (t: string, px: number) => {
      let e = 0;
      for (const ch of t) if (/[A-Z]/.test(ch)) e += BB_SCRIPT_CAP_EM - auraCharUnit(ch);
      return e * px;
    };
    const fitOf = (ws: typeof phrase, px: number, gap: number, upper: boolean) => {
      const raw = ws.reduce((a, w) => a + auraEstWidth(upper ? w.text.toUpperCase() : w.text, px, 1.0)
                  + (upper ? 0 : scriptCapsExtra(w.text, px)), 0)
                + gap * Math.max(0, ws.length - 1);
      const nat = upper ? raw * EST_RED * BB_TRACK_TO : raw * EST_SCRIPT;
      // Floor 0.25, not 0.6: at 0.6 a long line at a large Size still ran off the frame.
      return nat > boxPx ? Math.max(0.25, boxPx / nat) : 1;
    };
    const tier2Indic = tier2.some(w => getFontFamily(w.text) !== 'system-ui, sans-serif');
    // ONE shared clamp. Fitting each tier independently silently broke the designed 1:1.355
    // size relationship — a wide tier 1 would shrink to 0.7 while a short tier 2 stayed at 1.0,
    // leaving the red visibly out-scaled by the script. Both tiers now shrink together, so the
    // ratio between the two voices is fixed no matter what the line does.
    const fit  = Math.min(fitOf(tier1, redPx, gap1, true), fitOf(tier2, scriptPx, gap2, false));
    const fit1 = fit * trackX;
    const fit2 = fit;

    const outerPos: React.CSSProperties = {
      position: 'absolute', top: `${captionYPercent}%`, left: `${captionXPercent}%`,
      width: `${captionWidthPercent}%`, transform: 'translate(-50%,-50%)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none',
    };

    // The line is laid out COMPLETE from frame 0 and words are merely revealed, so the left edge
    // never moves and the run only resolves to centred on its final word — the signature move.
    const row = (
      ws: typeof phrase, px: number, gap: number, upper: boolean,
      fit: number, extra: React.CSSProperties,
    ) => (
      <div style={{
        display: 'flex', flexWrap: captionLines === 'single' ? 'nowrap' : 'wrap',
        justifyContent: 'center', rowGap: `${Math.round(px * 0.12)}px`,
        gap: `0 ${gap}px`, maxWidth: '100%', transform: `scaleX(${fit.toFixed(4)})`,
        willChange: 'transform', backfaceVisibility: 'hidden', ...extra,
      }}>
        {ws.map(w => {
          const since = currentTimeMs - w.startMs;
          const shown = since >= 0;
          // BOTH tiers ramp 0->100 per word. (In the source only tier 2 does; matching them is
          // a deliberate departure — see bbScriptFade.)
          // PACED per word: both durations scale with the room this word actually has, sharing
          // one factor so the fade:lift lag survives at any speech rate
          const pace  = bbWordPace(wordRoomSec(phrase, phrase.indexOf(w)));
          const alpha = bbScriptFade(since, pace.fadeMs);
          // and lifts a very small distance while it does — slowly, so the movement outlasts
          // the fade and the word is still settling after it is fully visible
          const lift  = bbWordSlide(since, px * BB_WORD_SLIDE_EM, pace.liftMs);
          const indic = getFontFamily(w.text) !== 'system-ui, sans-serif';
          return (
            <span key={w.id} style={{
              fontFamily: indic ? getFontFamily(w.text) : (upper ? bb.condFont : bb.scriptFont),
              fontWeight: upper ? 700 : 400,
              textTransform: upper ? 'uppercase' : undefined,
              fontSize: px, lineHeight: 1, whiteSpace: 'nowrap',
              // inline boxes ignore transform; per-WORD inline-block is safe (kerning inside a
              // word is untouched) where per-GLYPH was not
              display: 'inline-block',
              transform: lift > 0.01 ? `translateY(${lift.toFixed(2)}px)` : undefined,
              letterSpacing: upper ? '.035em' : '.02em',
              color: w.styleOverride?.color ?? (upper ? bb.redColor : bb.scriptColor),
              opacity: alpha,
              // the 2-frame blur smear belonged to the snap; with a fade it just reads as mush
              filter: undefined,
              // glow pulled back, and BOTH tiers now carry a real directional drop so the plate
              // reads as sitting above the footage instead of glued to it
              textShadow: upper
                ? `0 0 ${R(4)}px ${hexToRgba(bb.redColor, A(.32, gMul))},0 0 ${R(10)}px ${hexToRgba(bb.redColor, A(.28, gMul))},`
                  + `0 0 ${R(18)}px ${hexToRgba(bb.redColor, A(.16, gMul))},`
                  + `0 ${R(2)}px ${R(4)}px rgba(0,0,0,${A(.62, sMul)}),0 ${R(5)}px ${R(14)}px rgba(0,0,0,${A(.5, sMul)})`
                : `0 0 ${K(5)}px ${hexToRgba(bb.scriptColor, A(.5, gMul))},0 0 ${K(13)}px ${hexToRgba(bb.scriptColor, A(.26, gMul))},`
                  + `0 ${K(2)}px ${K(4)}px rgba(0,0,0,${A(.9, sMul)}),0 ${K(5)}px ${K(16)}px rgba(0,0,0,${A(.8, sMul)})`,
            }}>{upper ? w.text.toUpperCase() : w.text}</span>
          );
        })}
      </div>
    );

    return (
      <div key={phrase[0].id} style={outerPos} data-caption-content="true" data-cfont-lock="">
        <div style={{
          position: 'relative', width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          opacity: entry.opacity, transform: `translateY(${entry.dy.toFixed(2)}px)`,
        }}>
          {tier1.length > 0 && row(tier1, redPx, gap1, true, fit1, {})}
          {/* THE OVERLAP: 11px at 720 = 1.53% of frame. A NEGATIVE MARGIN, never a gap —
              the script's ascenders and i-dots rise into the red and sit in front of it.
              Indic tier-2 is EXEMPT: there is no Devanagari roundhand, so it falls back to Noto,
              whose matras and full-height glyphs would drive straight through the red instead of
              just grazing it. Those lines sit clear of tier 1. */}
          {tier2.length > 0 && row(tier2, scriptPx, gap2, false, fit2, {
            marginTop: `${(tier2Indic || !bb.overlap) ? Math.round(redPx * 0.06) : -Math.round(redPx * 0.387)}px`,
            position: 'relative', zIndex: 2,
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

const IL_FONTS_SETTLED = new Set<string>();

// ─── Interlock (sandboxed) ────────────────────────────────────────────────────
// The negative-space caption. All geometry comes from the pure engine in
// src/lib/interlockEngine — the hero word is scanned for ink and the small words are flowed
// around its tall letters — and every visual dial arrives as a resolved slot. Reached solely
// from the `captionStyle === 'interlock'` branch, so it can affect no other template.
function InterlockPhrase({ phrase, currentTimeMs, emphIdx, boxPx, heroPx, lines, slots, colorLocked, xPct, yPct, wPct }: {
  phrase: TranscriptWord[]; currentTimeMs: number; emphIdx: number;
  boxPx: number; heroPx: number; lines: 'single' | 'double';
  slots: ResolvedInterlockSlots; colorLocked: boolean;
  xPct: number; yPct: number; wPct: number;
}) {
  // The whole layout is measured from the hero's rasterised glyphs on a canvas — which the
  // server does not have, and which reports the FALLBACK's letterforms until the web fonts land.
  // Either would place the small words into gaps that are not there, so hold off until the two
  // faces this composition actually uses have DECODED. `document.fonts.ready` alone is not that
  // promise: an @font-face nobody has asked for yet is not pending, so ready can resolve with
  // Playfair still unloaded — ask for the faces first, exactly as the export's own font gate does.

  const style: ILStyle = useMemo(() => ({
    heroFont:  slots.heroFont,
    capsFont:  slots.capsFont,
    capsMul:   IL_CAPS_SIZE_MUL[slots.capsSize],
    tracking:  IL_TRACKING_EM[slots.tracking],
    nest:      slots.nest,
    uppercase: slots.uppercase,
  }), [slots]);

  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const key = `${style.heroFont}|${style.capsFont}`;
    const d = typeof document === 'undefined' ? null : document;
    const go = () => {
      if (!live) return;
      // the memo holds layouts scanned off the fallback; drop it once, when the pair first lands
      if (!IL_FONTS_SETTLED.has(key)) { IL_FONTS_SETTLED.add(key); ilClearCache(); }
      setReady(true);
    };
    if (!d?.fonts) { Promise.resolve().then(go); return () => { live = false; }; }
    Promise.all([
      d.fonts.load(`italic 500 64px ${style.heroFont}`).catch(() => {}),
      d.fonts.load(`600 64px ${style.capsFont}`).catch(() => {}),
    ]).then(() => d.fonts.ready).then(go).catch(go);
    return () => { live = false; };
  }, [style.heroFont, style.capsFont]);

  const L = useMemo(
    () => (ready ? interlockLayout(phrase.map(w => w.text), emphIdx, heroPx, boxPx * 0.96, lines, style) : null),
    [ready, phrase, emphIdx, heroPx, boxPx, lines, style]);

  const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
  // WHEN each word arrives. "As spoken" is the caption default; the other two treat the small
  // words as one unit so the emphasised word can land alone.
  const cueOf = (wi: number) => {
    const own = phrase[wi]?.startMs ?? 0;
    if (L?.plain || slots.capsReveal === 'spoken' || wi === emphIdx) return own;
    if (slots.capsReveal === 'together') return phrase[emphIdx]?.startMs ?? own;
    return phrase[0]?.startMs ?? own;                       // 'before' — all caps up front
  };
  const alphaOf = (wi: number) => {
    const fade = (L && !L.plain && wi === emphIdx ? 340 : 240) * paceFactor(wordRoomSec(phrase, wi), 0.6);
    return smooth((currentTimeMs - cueOf(wi)) / Math.max(80, fade));
  };

  const outerPos: React.CSSProperties = {
    position: 'absolute', top: `${yPct}%`, left: `${xPct}%`,
    width: `${wPct}%`, transform: 'translate(-50%,-50%)',
    display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none',
  };
  if (!L) return <div style={outerPos} data-caption-content="true" data-cfont-lock="" />;

  // The engine has already fitted the composition to the box. Never scale UP to fill it — that is
  // what made the type size jump from caption to caption.
  const k = Math.min(1, (boxPx * 0.96) / Math.max(1, L.bbox.w));
  const W = L.bbox.w * k, H = L.bbox.h * k;
  const shMul = BB_LEVEL_MUL[slots.shadowAmount];
  const shadow = shMul === 0 ? 'none'
    : `0 ${(L.capH * k * 0.06).toFixed(1)}px ${(L.capH * k * 0.26).toFixed(1)}px rgba(0,0,0,${Math.min(0.9, 0.55 * shMul).toFixed(2)})`;

  return (
    <div style={outerPos} data-caption-content="true" data-cfont-lock="">
      <div style={{ position: 'relative', width: W, height: H, margin: '0 auto' }}>
        {L.items.map((it, i) => {
          const hero = it.kind === 'hero';
          const indic = getFontFamily(it.t) !== 'system-ui, sans-serif';
          const elapsed = (currentTimeMs - cueOf(it.wi)) / 1000;
          const fs = hero ? L.F * k : L.capsPx * k;
          const pose = (hero && slots.inAnimation !== 'default' && elapsed >= 0)
            ? resolveInAnimPose(slots.inAnimation as Exclude<CaptionInAnimation, 'default'>, elapsed, heroPx * 0.25)
            : null;
          return (
            <span
              key={`${i}:${it.t}`}
              style={{
                position: 'absolute',
                left: (it.x - L.bbox.x0) * k,
                // engine coords are baselines — put the span's OWN baseline there
                top:  (it.y - L.bbox.y0) * k - baselineFromTop(fs, hero, style),
                transform: pose ? `translate(${pose.dx.toFixed(2)}px,${pose.dy.toFixed(2)}px)` : undefined,
                whiteSpace: 'pre', lineHeight: 1,
                fontFamily: indic ? getFontFamily(it.t) : (hero ? slots.heroFont : slots.capsFont),
                fontStyle: hero && !indic ? 'italic' : 'normal',
                fontWeight: hero ? 500 : 600,
                fontSize: fs,
                letterSpacing: hero ? 0 : `${IL_TRACKING_EM[slots.tracking]}em`,
                color: hero
                  ? (colorLocked ? slots.heroColor : phrase[it.wi]?.styleOverride?.color ?? slots.heroColor)
                  : slots.capsColor,
                textShadow: shadow,
                opacity: pose ? pose.opacity : alphaOf(it.wi),
              }}
            >{hero || !slots.uppercase ? it.t : it.t.toUpperCase()}</span>
          );
        })}
      </div>
    </div>
  );
}


/** Straight sRGB mix of two hex colours. One end of this journey is always near-white, so the
 *  midpoints stay clean and a plain channel lerp reads smoother than a hue rotation would. */
function mixHex(from: string, to: string, t: number): string {
  const parse = (h: string) => {
    const s = h.replace('#', '');
    const v = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
    const n = parseInt(v.slice(0, 6), 16);
    return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
  };
  const a = parse(from), b = parse(to), m = _clamp01(t);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * m));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Smoothstep — eased at BOTH ends, so the colour leaves white gently and arrives gently. A
 *  plain ease-out starts at full speed and reads as a switch rather than a travel. */
const _smoothStep = (t: number) => { const c = _clamp01(t); return c * c * (3 - 2 * c); };

// ─── Journal (sandboxed) ──────────────────────────────────────────────────────
// The handwritten card. One hand, words arriving as they are spoken: each blurs into focus and
// grows the last 5% into place. The whole line then EASES to a second colour and fades out, so
// the caption leaves as a deliberate gesture rather than a cut. Reached solely from the
// `captionStyle === 'journal'` branch, so it can affect no other template.
function JournalPhrase({ phrase, currentTimeMs, winEnd, fontPx, gapPx, slots, xPct, yPct, wPct }: {
  phrase: TranscriptWord[]; currentTimeMs: number; winEnd: number;
  fontPx: number; gapPx: number; slots: ResolvedJournalSlots;
  xPct: number; yPct: number; wPct: number;
}) {
  const { travel, fade } = JN_EXIT_MS[slots.exitLead];

  // THE EXIT. Each word travels to the second colour and then fades; the colour finishes
  // travelling BEFORE that word's fade begins, or the colour is still arriving while the word is
  // already half gone and the gesture is wasted.
  //
  // Word by word, the stagger is carved OUT of the exit rather than added to it: the LAST word
  // still finishes exactly at winEnd — the same instant the display window ends
  // (activeSegmentWindowAt) — so nothing is cut off mid-travel by the line disappearing
  // underneath it. 'together' is the same path with a stagger of zero.
  const seq = slots.exitOrder === 'sequence';
  // Each word's own gesture is compressed in sequence mode so the stagger can be WIDER than it
  // — a word is well into its fade before its neighbour starts. Without that they overlap and
  // the line reads as one soft simultaneous shift instead of a sweep.
  const { travel: wTravel, fade: wFade } = seq ? jnSequenceMs(travel, fade) : { travel, fade };
  const stagger  = seq ? jnStaggerMs(phrase.length, wTravel + wFade, JN_SWEEP_MUL[slots.sweep]) : 0;
  const exitFrom = winEnd - (wTravel + wFade + stagger * (phrase.length - 1));

  const blur0  = JN_ENTRANCE_BLUR[slots.entrance] * fontPx;
  const stroke = JN_STROKE_EM[slots.weight];
  const sh    = BB_LEVEL_MUL[slots.shadowAmount];
  const shadow = sh <= 0 ? 'none'
    : `0 ${(fontPx * 0.035 * sh).toFixed(1)}px ${(fontPx * 0.16 * sh).toFixed(1)}px rgba(0,0,0,${(0.5 * sh).toFixed(2)})`;

  return (
    <div
      data-caption-content="true"
      data-cfont-lock=""
      style={{
        position: 'absolute', top: `${yPct}%`, left: `${xPct}%`, width: `${wPct}%`,
        transform: 'translate(-50%,-50%)', display: 'flex', flexWrap: 'wrap',
        justifyContent: 'center', alignItems: 'baseline', gap: `${gapPx}px`,
        pointerEvents: 'none', textAlign: 'center',
      }}
    >
      {phrase.map((w, i) => {
        // ENTRANCE, per word, on its own spoken time. Blur and scale share one progress so the
        // word resolves and settles as a single move. The duration comes from jnEntranceMs, NOT
        // paceFactor: that floors at 0.28, which turned a normal 250ms word gap into a 125ms
        // entrance — under four frames, and the blur read as not happening at all.
        const dur = jnEntranceMs(wordRoomSec(phrase, i) * 1000);
        const p   = _easeOut(_clamp01((currentTimeMs - w.startMs) / dur));

        // EXIT, this word's own slot in the sequence — left to right, reading order.
        const wTravelFrom = exitFrom + i * stagger;
        const wFadeFrom   = wTravelFrom + wTravel;
        const tint    = _smoothStep((currentTimeMs - wTravelFrom) / Math.max(1, wTravel));
        const leaving = 1 - _smoothStep((currentTimeMs - wFadeFrom) / Math.max(1, wFade));
        const ink     = mixHex(slots.color, slots.exitColor, tint);

        const indic = getFontFamily(w.text) !== 'system-ui, sans-serif';
        return (
          <span
            key={w.id}
            style={{
              display: 'inline-block',
              fontFamily: indic ? getFontFamily(w.text) : slots.font,
              fontSize: fontPx,
              lineHeight: 1.24,
              whiteSpace: 'pre',
              color: w.styleOverride?.color ?? ink,
              // no bold cut exists for this face — paint the weight instead (see JN_STROKE_EM)
              WebkitTextStrokeWidth: stroke ? `${stroke.toFixed(3)}em` : undefined,
              WebkitTextStrokeColor: w.styleOverride?.color ?? ink,
              textShadow: shadow,
              // grows the last 5% into place rather than ending 5% oversized — the settled
              // line has to stay the size the layout measured
              transform: `scale(${(0.95 + 0.05 * p).toFixed(4)})`,
              filter: p >= 1 ? undefined : `blur(${(blur0 * (1 - p)).toFixed(2)}px)`,
              opacity: p * leaving,
              willChange: 'opacity, filter, transform',
            }}
          >{slots.uppercase ? w.text.toUpperCase() : w.text}</span>
        );
      })}
    </div>
  );
}
