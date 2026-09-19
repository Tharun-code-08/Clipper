'use client';

// Cover still export — in the user's browser, no cloud, no credits.
//
// The headline and watermark are rendered by @remotion/web-renderer from the SAME CoverStage the editor
// previews (so the template looks identical), on a TRANSPARENT canvas. The captured frame and the
// cut-out are NOT given to the renderer as <img> layers: they are composited here straight from the
// canvases we already hold, using the same coverFitRect the preview uses. Measured: with image layers,
// a render that raced the page's own use of the blob: URL exported headline + watermark on black while
// every image reported loaded and decoded — compositing the pixels ourselves removes that failure class.

import type { ComponentType } from 'react';
import type { CoverCompositionProps } from '@/remotion/CoverComposition';
import { coverFitRect, coverRenderPasses, cleanCoverText, type CoverFormat } from './coverLayout';

export interface CoverPixels {
  /** The captured frame at source resolution. */
  frame:   HTMLCanvasElement;
  /** Cut-out of the same frame (same size), or null when the subject is not in front. */
  cutout?: HTMLCanvasElement | null;
}

async function renderOverlay(
  props: CoverCompositionProps,
  headline: boolean,
  watermark: boolean,
  signal?: AbortSignal,
): Promise<OffscreenCanvas> {
  const [{ renderStillOnWeb }, { CoverComposition }] = await Promise.all([
    import('@remotion/web-renderer'),
    import('@/remotion/CoverComposition'),
  ]);
  const inputProps: CoverCompositionProps = {
    ...props,
    frameUrl: null, cutoutUrl: null, frameW: 0, frameH: 0,
    text: headline ? props.text : '',
    watermarked: watermark,
    transparent: true,
  };
  const result = await renderStillOnWeb({
    composition: {
      component: CoverComposition as unknown as ComponentType<Record<string, unknown>>,
      id: 'CaptikCover',
      width: props.preset.width,
      height: props.preset.height,
      fps: 30,
      durationInFrames: 1,
    },
    frame:             0,
    inputProps:        inputProps as unknown as Record<string, unknown>,
    allowHtmlInCanvas: true,
    licenseKey:        'free-license',
    delayRenderTimeoutInMilliseconds: 30_000,
    signal:            signal ?? null,
  });
  return result.canvas();
}

export async function renderCoverBlob(
  props: CoverCompositionProps,
  format: CoverFormat,
  pixels: CoverPixels,
  opts: { quality?: number; signal?: AbortSignal } = {},
): Promise<Blob> {
  const W = props.preset.width, H = props.preset.height;
  const out = new OffscreenCanvas(W, H);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const r = coverFitRect(pixels.frame.width, pixels.frame.height, W, H, props.panX, props.panY, props.zoom);
  ctx.drawImage(pixels.frame, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);

  const passes = coverRenderPasses({
    hasText: !!cleanCoverText(props.text),
    watermarked: props.watermarked,
    hasCutout: !!pixels.cutout,
  });
  for (const pass of passes) {
    if (pass.kind === 'cutout') {
      ctx.drawImage(pixels.cutout!, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
    } else {
      ctx.drawImage(await renderOverlay(props, pass.headline, pass.watermark, opts.signal), 0, 0, W, H);
    }
  }
  return out.convertToBlob({
    type: format === 'jpeg' ? 'image/jpeg' : 'image/png',
    quality: format === 'jpeg' ? (opts.quality ?? 0.92) : undefined,
  });
}

/** Same-origin anchor download (the pattern the video export uses). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

/** Encode a canvas to a same-origin blob: URL for the preview's <img> layers (PNG keeps cut-out alpha). */
export function canvasToObjectUrl(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('encode-failed'))), type, quality);
  });
}
