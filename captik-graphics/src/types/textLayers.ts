// Free-floating text overlays ("text layers") — independent of the caption/transcript system.
// A layer is a piece of styled text the user places anywhere on the canvas for a time range
// (hook titles, CTAs, labels). Rendered by TextLayerOverlay on EVERY surface (preview, Lambda,
// web-renderer, Element Capture) with time-parameterized animations (lib/textAnims.ts) so the
// preview and all exports are deterministic and identical.
//
// TIMES ARE SOURCE-CLOCK MILLISECONDS — the same clock as TranscriptWord. Auto-Edit exports
// remap layers onto the cut timeline exactly like words (lib/autoedit adapters).

/** Entry-animation presets. The capcut_* nine are re-implementations of the founder-provided
 *  CapCut preset pack's named text animations (durations match the pack's microsecond values). */
export type TextAnimPresetId =
  | 'none'
  | 'fade_up'
  | 'pop'
  | 'typewriter'
  | 'bobbing_up'      // CapCut "Bobbing Up"   (967ms)
  | 'drift_down'      // CapCut "Drift Down"   (667ms)
  | 'floating_line'   // CapCut "Floating Line"(1000ms)
  | 'fold'            // CapCut "Fold"         (500ms)
  | 'grow'            // CapCut "Grow"         (1000ms)
  | 'manifest'        // CapCut "Manifest"     (967ms)
  | 'slide_up'        // CapCut "Slide Up"     (967ms)
  | 'slide_rise'      // CapCut "Slide & Rise" (500ms)
  | 'slingshot';      // CapCut "Slingshot"    (500ms)

export interface TextLayer {
  id: string;
  /** 'text' (default), 'image' (sticker) or 'video' (PiP) — all reuse the same
   *  timing, position and entry animations; `text` doubles as the label. */
  kind?: 'text' | 'image' | 'video';
  /** Image layers: small data-URL (client-side downscaled ≤512px, ≤~500KB). */
  imageDataUrl?: string;
  /** Image/video layers: rendered width in logical px (270-wide canvas space). */
  widthPx?: number;
  /** Video (PiP) layers: media-pool asset id — the page resolves it to a
   *  playable URL per surface (object URL live, presigned S3 for cloud). */
  videoAssetId?: string;
  /** Video layers: the resolved playable URL for the CURRENT surface. */
  pipUrl?: string;
  /** Video layers: uploaded S3 key — cloud render routes presign it → pipUrl. */
  pipKey?: string;
  /** Video layers: mute the overlay's own audio. */
  pipMuted?: boolean;
  /** Video layers: key out a green/blue screen (undefined = off). */
  chromaKey?: 'green' | 'blue';
  /** Chroma intensity 0–1 (default 0.5) — higher keys a wider colour range. */
  chromaStrength?: number;
  text: string;
  /** SOURCE-clock ms (same clock as TranscriptWord). */
  startMs: number;
  endMs: number;
  /** Center position as % of the canvas (same convention as the caption box). */
  xPercent: number;
  yPercent: number;
  /** Logical px in the 270-wide canvas space (same convention as caption sz()). */
  fontSizePx: number;
  color: string;
  anim: TextAnimPresetId;
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  uppercase?: boolean;
  letterSpacingEm?: number;
  /** Soft neon glow (the pack's "Glow 2" effect). */
  glow?: boolean;
  /** Drop shadow for readability over footage. */
  shadow?: boolean;
  /** Pill background color (transparent when unset). */
  background?: string;
  rotationDeg?: number;
  /** Wrap width as % of canvas (unset = single line, no wrap). */
  widthPercent?: number;
  align?: 'left' | 'center' | 'right';
}

/** A fresh layer with sensible defaults, centered in the upper third (hook-title position). */
export function newTextLayer(partial?: Partial<TextLayer>): TextLayer {
  return {
    id: `tl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    text: 'Your text',
    startMs: 0,
    endMs: 3000,
    xPercent: 50,
    yPercent: 28,
    fontSizePx: 22,
    color: '#FFFFFF',
    anim: 'slide_up',
    fontWeight: 800,
    shadow: true,
    ...partial,
  };
}
