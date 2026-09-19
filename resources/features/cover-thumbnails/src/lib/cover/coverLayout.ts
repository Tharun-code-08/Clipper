// Cover / thumbnail layout — PURE geometry + settings for the "Cover" feature.
//
// A cover is a still image: one video frame, cover-fit (CROPPED, never letterboxed — the video
// pipeline letterboxes, a thumbnail must fill), a headline rendered by the real CaptionOverlay
// template, optionally the cut-out subject on top of the headline, and the free-tier watermark.
//
// Everything here is DOM-free and unit-tested (coverLayout.spec.ts) so the preview stage and the
// exported PNG compute the IDENTICAL numbers.

import type { TranscriptWord } from '@/types/transcript';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import { logicalCanvasSize } from '@/lib/aspect';
import { isWatermarkFreePlan, type PlanId } from '@/lib/tiers';
import { isExcludedFromWysiwyg } from '@/lib/exportRouting';
import { resolveSegments } from '@/lib/captionSegments';

// ── presets ─────────────────────────────────────────────────────────────────

export type CoverPresetId = 'reel' | 'grid' | 'youtube';

export interface CoverPreset {
  id:     CoverPresetId;
  label:  string;
  hint:   string;
  width:  number;
  height: number;
}

export const COVER_PRESETS: readonly CoverPreset[] = [
  { id: 'reel',    label: 'Reels / Shorts', hint: '1080 × 1920', width: 1080, height: 1920 },
  { id: 'grid',    label: 'Grid post',      hint: '1080 × 1350', width: 1080, height: 1350 },
  { id: 'youtube', label: 'YouTube',        hint: '1280 × 720',  width: 1280, height: 720  },
];

export function coverPreset(id: CoverPresetId | string | null | undefined): CoverPreset {
  return COVER_PRESETS.find(p => p.id === id) ?? COVER_PRESETS[0];
}

/**
 * The logical caption canvas for a preset (CaptionOverlay's font pixels are tuned to it) and the
 * uniform scale that maps it onto the output pixels — the same math the in-browser video export
 * uses, so a headline looks exactly like that template does over video.
 */
export function coverLogical(preset: CoverPreset): { w: number; h: number; scale: number; rs: number } {
  const { w, h } = logicalCanvasSize(preset.width / preset.height);
  // Watermark sizing: RS = W<H ? W/270 : W/640 in LOGICAL px (src/remotion/Watermark.tsx).
  const rs = w < h ? w / 270 : w / 640;
  return { w, h, scale: preset.width / w, rs };
}

/**
 * Time (s) the free-tier watermark lockup is frozen at: after its 0.45 s pop-in, at the peak of
 * its 3 s breathe (sin = 1 at t = 0.75 + 3k) so a still carries it at full strength.
 */
export const COVER_WATERMARK_T = 3.75;

// ── cover-fit crop ──────────────────────────────────────────────────────────

export interface CoverRect {
  /** Destination rect (output px) the whole source frame is drawn into — may overflow the canvas. */
  dx: number; dy: number; dw: number; dh: number;
  /** The visible part of the source, in source px (for canvas drawImage 9-arg form). */
  sx: number; sy: number; sw: number; sh: number;
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

export const COVER_ZOOM_MIN = 1;
export const COVER_ZOOM_MAX = 3;

/**
 * Cover-fit the source into the destination (fill + crop), with pan and zoom.
 * `panX`/`panY` ∈ [0,1]: 0 = show the left/top edge, 0.5 = centred, 1 = right/bottom edge.
 * `zoom` ≥ 1 enlarges past the minimum fill.
 */
export function coverFitRect(
  srcW: number, srcH: number, dstW: number, dstH: number,
  panX = 0.5, panY = 0.5, zoom = 1,
): CoverRect {
  if (!(srcW > 0) || !(srcH > 0) || !(dstW > 0) || !(dstH > 0)) {
    return { dx: 0, dy: 0, dw: Math.max(0, dstW), dh: Math.max(0, dstH), sx: 0, sy: 0, sw: Math.max(0, srcW), sh: Math.max(0, srcH) };
  }
  const scale = Math.max(dstW / srcW, dstH / srcH) * clamp(zoom, COVER_ZOOM_MIN, COVER_ZOOM_MAX);
  const dw = srcW * scale;
  const dh = srcH * scale;
  const dx = (dstW - dw) * clamp(panX, 0, 1);
  const dy = (dstH - dh) * clamp(panY, 0, 1);
  return { dx, dy, dw, dh, sx: -dx / scale, sy: -dy / scale, sw: dstW / scale, sh: dstH / scale };
}

// ── headline box ────────────────────────────────────────────────────────────

export interface CoverBox { xPercent: number; yPercent: number; widthPercent: number }

export const COVER_FONT_SCALE_MIN = 0.6;
export const COVER_FONT_SCALE_MAX = 4;

/** Default headline box per preset: upper third on portrait (so a subject in front overlaps it). */
export function defaultCoverBox(id: CoverPresetId): CoverBox {
  if (id === 'youtube') return { xPercent: 50, yPercent: 30, widthPercent: 90 };
  if (id === 'grid')    return { xPercent: 50, yPercent: 26, widthPercent: 88 };
  return { xPercent: 50, yPercent: 28, widthPercent: 88 };
}

export function defaultCoverFontScale(id: CoverPresetId): number {
  return id === 'youtube' ? 1.6 : 1.9;
}

export function clampCoverBox(b: Partial<CoverBox> | null | undefined, fallback: CoverBox): CoverBox {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    xPercent:     clamp(num(b?.xPercent, fallback.xPercent), 0, 100),
    yPercent:     clamp(num(b?.yPercent, fallback.yPercent), 0, 100),
    widthPercent: clamp(num(b?.widthPercent, fallback.widthPercent), 20, 100),
  };
}

// ── styles ──────────────────────────────────────────────────────────────────

/**
 * Templates the cover can render faithfully. The still export goes through @remotion/web-renderer's
 * html-in-canvas, which mangles the WYSIWYG-excluded styles (gradient-clipped fills, backdrop glass,
 * blend modes, SVG blur engines) — those are not offered for covers in v1.
 */
export function isCoverStyleSupported(id: string | null | undefined): boolean {
  if (!id) return false;
  return !isExcludedFromWysiwyg(id as CaptionStyleId) && !COVER_EXTRA_EXCLUDED.includes(id);
}

/**
 * Templates that paint only the CURRENTLY SPOKEN word — as a still they show one word of the headline.
 * Found by rendering every supported template as a cover (dev harness /cover-test?gallery=1).
 */
export const COVER_EXTRA_EXCLUDED: readonly string[] = ['pixelated'];

/** The project's caption style when a cover can use it, else a safe bold default. */
export const COVER_FALLBACK_STYLE: CaptionStyleId = 'mrbeast';
export function coverStyleFor(preferred: string | null | undefined, projectStyle?: string | null): CaptionStyleId {
  if (isCoverStyleSupported(preferred)) return preferred as CaptionStyleId;
  if (isCoverStyleSupported(projectStyle)) return projectStyle as CaptionStyleId;
  return COVER_FALLBACK_STYLE;
}

// ── headline text → synthetic caption words ─────────────────────────────────

export const COVER_MAX_WORDS = 12;
export const COVER_MAX_CHARS = 90;

/** Normalise user / AI text into a headline: collapse whitespace, strip wrapping quotes, cap length. */
export function cleanCoverText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let t = raw.replace(/\s+/g, ' ').trim();
  t = t.replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '').trim();
  if (t.length > COVER_MAX_CHARS) t = t.slice(0, COVER_MAX_CHARS).trim();
  return t;
}

const HOLD_MS = 60_000;
const STEP_MS = 40;

/**
 * CaptionOverlay is time-based. To paint a whole headline as a still we hand it ONE segment whose
 * words were all spoken long ago (every entrance animation has finished) while the LAST word stays
 * "active" for a minute, and sample well inside that hold — far from the line's exit window.
 */
export function coverHeadlineWords(text: string): { words: TranscriptWord[]; segments: string[][]; currentTimeMs: number } {
  const tokens = cleanCoverText(text).split(' ').filter(Boolean).slice(0, COVER_MAX_WORDS);
  const words: TranscriptWord[] = tokens.map((tok, i) => ({
    id:      `cover-w${i}`,
    text:    tok,
    startMs: i * STEP_MS,
    endMs:   i === tokens.length - 1 ? HOLD_MS : (i + 1) * STEP_MS,
    styleOverride: {},
  }));
  return {
    words,
    segments: words.length ? [words.map(w => w.id)] : [],
    currentTimeMs: HOLD_MS - 1_000,
  };
}

// ── seed text ───────────────────────────────────────────────────────────────

export type CoverSeedSource = 'hook_overlay' | 'hook_script' | 'caption' | 'none';

export interface HookLike { overlays?: unknown; rewrittenScript?: unknown }

/** Seed: AI hook overlay[0] → AI rewritten script → the first caption line → empty. */
export function coverSeedText(
  hook: HookLike | null | undefined,
  words: TranscriptWord[] | null | undefined,
  segments: string[][] | null | undefined,
): { text: string; source: CoverSeedSource } {
  const overlay = Array.isArray(hook?.overlays) ? cleanCoverText(hook!.overlays[0]) : '';
  if (overlay) return { text: overlay, source: 'hook_overlay' };
  const script = cleanCoverText(hook?.rewrittenScript);
  if (script) return { text: capWords(script), source: 'hook_script' };
  const ws = words ?? [];
  const first = resolveSegments(segments, ws)[0]?.sw ?? ws.slice(0, 6);
  const line = cleanCoverText(first.map(w => w.text).join(' '));
  if (line) return { text: capWords(line), source: 'caption' };
  return { text: '', source: 'none' };
}

function capWords(t: string): string {
  return t.split(' ').slice(0, COVER_MAX_WORDS).join(' ');
}

// ── entitlement ─────────────────────────────────────────────────────────────

/**
 * A cover is CLEAN when the plan is watermark-free OR this project carries the ₹9 per-project unlock.
 * A one-shot wm credit is deliberately NOT considered — covers never spend credits.
 */
export function coverWatermarked(plan: PlanId | string | null | undefined, projectClean: boolean): boolean {
  return !(isWatermarkFreePlan((plan ?? 'free') as PlanId) || projectClean);
}

// ── persisted settings ──────────────────────────────────────────────────────

export type CoverFormat = 'png' | 'jpeg';

export interface CoverSettings {
  preset:         CoverPresetId;
  /** Source time of the captured frame, or null when no frame has been captured yet. */
  frameMs:        number | null;
  panX:           number;
  panY:           number;
  zoom:           number;
  text:           string;
  /** Headline template; null = follow the project's caption style (when supported). */
  styleId:        string | null;
  box:            CoverBox;
  /** Keep the headline clear of the cut-out subject automatically. Turns off once the user positions it. */
  boxAuto:        boolean;
  fontScale:      number;
  subjectInFront: boolean;
  format:         CoverFormat;
}

export function defaultCoverSettings(preset: CoverPresetId = 'reel'): CoverSettings {
  return {
    preset, frameMs: null, panX: 0.5, panY: 0.5, zoom: 1, text: '', styleId: null,
    box: defaultCoverBox(preset), boxAuto: true, fontScale: defaultCoverFontScale(preset),
    subjectInFront: false, format: 'png',
  };
}

/** Guarded restore from a stored snapshot: anything malformed falls back to the defaults. */
export function sanitizeCoverSettings(raw: unknown): CoverSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const preset = coverPreset(typeof r.preset === 'string' ? r.preset : null).id;
  const d = defaultCoverSettings(preset);
  const num = (v: unknown, dflt: number, lo: number, hi: number) =>
    (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : dflt);
  return {
    preset,
    frameMs:        typeof r.frameMs === 'number' && Number.isFinite(r.frameMs) && r.frameMs >= 0 ? r.frameMs : null,
    panX:           num(r.panX, d.panX, 0, 1),
    panY:           num(r.panY, d.panY, 0, 1),
    zoom:           num(r.zoom, d.zoom, COVER_ZOOM_MIN, COVER_ZOOM_MAX),
    text:           cleanCoverText(r.text),
    styleId:        typeof r.styleId === 'string' && isCoverStyleSupported(r.styleId) ? r.styleId : null,
    box:            clampCoverBox(r.box as Partial<CoverBox> | undefined, d.box),
    boxAuto:        r.boxAuto !== false,
    fontScale:      num(r.fontScale, d.fontScale, COVER_FONT_SCALE_MIN, COVER_FONT_SCALE_MAX),
    subjectInFront: r.subjectInFront === true,
    format:         r.format === 'jpeg' ? 'jpeg' : 'png',
  };
}

export function coverFileName(preset: CoverPreset, format: CoverFormat, base?: string | null): string {
  const stem = (base ?? '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${stem ? `${stem}-` : ''}cover-${preset.width}x${preset.height}.${format === 'jpeg' ? 'jpg' : 'png'}`;
}

// ── still export pass plan ──────────────────────────────────────────────────

export type CoverPass =
  | { kind: 'overlay'; headline: boolean; watermark: boolean }
  | { kind: 'cutout' };

/**
 * Layers composited ABOVE the frame, bottom → top. The headline sits under the cut-out subject; the
 * watermark always sits on top so a subject can never hide it. Without a cut-out the headline and
 * watermark share one overlay render. PURE.
 */
export function coverRenderPasses(o: { hasText: boolean; watermarked: boolean; hasCutout: boolean }): CoverPass[] {
  if (!o.hasCutout) {
    return o.hasText || o.watermarked ? [{ kind: 'overlay', headline: o.hasText, watermark: o.watermarked }] : [];
  }
  const passes: CoverPass[] = [];
  if (o.hasText) passes.push({ kind: 'overlay', headline: true, watermark: false });
  passes.push({ kind: 'cutout' });
  if (o.watermarked) passes.push({ kind: 'overlay', headline: false, watermark: true });
  return passes;
}
