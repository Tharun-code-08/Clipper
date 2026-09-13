// Aspect-ratio options for the preview/export. "original" follows the source
// video's intrinsic ratio so non-standard videos aren't forced into 9:16 / 16:9.
export type AspectRatio = 'original' | '9:16' | '16:9' | '1:1' | '4:5';

export const ASPECT_OPTIONS: { id: AspectRatio; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: '9:16',     label: '9:16'     },
  { id: '16:9',     label: '16:9'     },
  { id: '1:1',      label: '1:1'      },
  { id: '4:5',      label: '4:5'      },
];

/** Width / height ratio. For "original", uses the source video dims (fallback 16:9). */
export function aspectValue(ar: AspectRatio, dims?: { w: number; h: number } | null): number {
  switch (ar) {
    case '9:16': return 9 / 16;
    case '16:9': return 16 / 9;
    case '1:1':  return 1;
    case '4:5':  return 4 / 5;
    case 'original':
    default:     return dims && dims.h ? dims.w / dims.h : 16 / 9;
  }
}

/**
 * The "logical" canvas the preview renders captions into, fitted inside a 640×480 design
 * box (9:16 → 270×480, 16:9 → 640×360, 1:1 → 480×480). CaptionOverlay's font pixels are
 * tuned to this canvas; the preview then CSS-scales the whole canvas to fit the viewport.
 *
 * The pixel-perfect export reuses this: it renders CaptionOverlay at this logical size and
 * uniformly scales the layer up to export resolution, so geometry matches the preview
 * exactly. MUST stay in sync with VideoCanvas's canvasW/canvasH math.
 */
export function logicalCanvasSize(ratio: number): { w: number; h: number } {
  const BOX_W = 640, BOX_H = 480;
  let w = BOX_W;
  let h = Math.round(BOX_W / ratio);
  if (h > BOX_H) { h = BOX_H; w = Math.round(BOX_H * ratio); }
  return { w, h };
}

/**
 * Long-edge pixels a SOURCE video must have before the 4K export option is offered
 * (and before a '4k' selection survives the export-time clamp). UHD is 3840; the
 * small tolerance admits near-4K encodes without letting 1440p/2.7K footage get
 * upscaled — a 2560-long-edge source must NOT pass this gate.
 */
export const MIN_4K_SOURCE_LONG_EDGE = 3800;

/** Even, capped export pixel dims for a given ratio (long edge clamped to `longCap`). */
export function exportDims(ratio: number, longCap: number): { w: number; h: number } {
  let w: number, h: number;
  if (ratio >= 1) { w = longCap; h = Math.round(longCap / ratio); }
  else            { h = longCap; w = Math.round(longCap * ratio); }
  w -= w % 2;
  h -= h % 2;
  return { w: Math.max(2, w), h: Math.max(2, h) };
}

/**
 * Target H.264 bitrate (bits/sec) for the IN-BROWSER export encoders (the WYSIWYG
 * web-renderer and the Element Capture path). Both call this so they stay visually
 * consistent with each other and with the Lambda path (crf 18).
 *
 * ~0.16 bits/px/frame ≈ 9.95 Mbps at 1080p30 — well above the web-renderer's "medium"
 * DEFAULT of just 3 Mbps at 1080p (referenceBitrate 3e6 × avc 1.0 × factor 1). That
 * default looked fine on low-motion talking-head clips but blocked up badly ("very
 * pixelated") on high-motion / detailed / gradient-heavy footage — content-dependent,
 * which is why only some users hit it. Scales with resolution + fps, capped at 24 Mbps.
 */
export function webExportBitrate(width: number, height: number, fps: number): number {
  return Math.round(Math.min(24_000_000, width * height * fps * 0.16));
}
