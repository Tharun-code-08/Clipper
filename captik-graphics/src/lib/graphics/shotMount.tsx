// TEST-HARNESS MOUNT — GraphicsOverlay's non-editable render path, extracted verbatim.
//
// Used by /graphics-shot-full (parity ground truth for imported templates, which the stock
// /graphics-shot cannot resolve in dev — see that page's header) and by the standalone
// graphics bundle (reference-to-video/lib), so both sides of a parity sweep run ONE mount
// implementation. Everything here is copied line-for-line from GraphicsOverlay's return:
// the luxe backdrop plate, the cinema stack (bloom copy → graded copy → grain → vignette),
// the camera slot in the transform chain, fullBleed, and the aspect-overridden drawn canvas.
// If GraphicsOverlay's mount changes, this must change with it — the authored-template
// parity sweep (stock /graphics-shot vs bundle) is the drift alarm: it goes red if the two
// mounts ever disagree.
//
// Rendering-only: no selection chrome, no ghosts, no pointer handling.

import type { ReactElement } from 'react';
import type { GraphicsTemplate } from '@/types/graphics';
import { resolveParams, elementStyler } from '@/lib/graphics/registry';
import {
  cinemaBloomStyle, cinemaContactShadow, cinemaFilter, cinemaGrainStyle, cinemaOf,
  cinemaTransform, cinemaVignetteStyle,
} from '@/lib/graphics/cinema';
import type { CinemaSettings } from '@/lib/graphics/cinema';

export interface ShotMountProps {
  tpl: GraphicsTemplate;
  timeMs: number;
  durationMs: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  box: { xPercent: number; yPercent: number; widthPercent: number };
  params?: Record<string, string | number | boolean>;
  seed?: string;
  backdrop?: boolean;          // instance override, like g.backdrop
  aspect?: number;             // instance aspect override, like g.aspect
  cinema?: CinemaSettings;     // instance cinema, like g.cinema
  rotationDeg?: number;
  opacity?: number;
}

export function ShotMount({
  tpl, timeMs: rawTime, durationMs, canvasWidthPx, canvasHeightPx, box,
  params: overrides, seed = 'g_shot', backdrop, aspect, cinema, rotationDeg, opacity,
}: ShotMountProps): ReactElement {
  const timeMs = Math.min(Math.max(rawTime, 0), durationMs);
  const fullBleed = !!tpl.fullBleed;
  const drawnW = tpl.design.w;
  const drawnH = !fullBleed && aspect && aspect > 0 ? drawnW / aspect : tpl.design.h;
  const scale = fullBleed ? 1 : (canvasWidthPx * (box.widthPercent / 100)) / drawnW;
  const params = resolveParams(tpl, overrides);
  const withBackdrop = !fullBleed && (backdrop ?? tpl.backdrop !== false);

  const cine = cinemaOf(cinema);
  const fw = fullBleed ? canvasWidthPx : drawnW;
  const fh = fullBleed ? canvasHeightPx : drawnH;
  const camCss = cinemaTransform(cine, timeMs, durationMs, fw, fh, fullBleed);
  const contentFilter = cinemaFilter(cine, fw, fh);
  const bloomStyle = cinemaBloomStyle(cine, fw, fh);
  const grainStyle = cinemaGrainStyle(cine);
  const vignetteStyle = cinemaVignetteStyle(cine);

  const content = tpl.render({
    params,
    el: elementStyler(tpl, params, fullBleed
      ? Math.min(canvasWidthPx, canvasHeightPx) / Math.min(tpl.design.w, tpl.design.h)
      : 1),
    timeMs,
    durationMs,
    width: fw,
    height: fh,
    seed,
  });

  return (
    <div
      data-graphic={seed}
      style={fullBleed ? {
        position: 'absolute', inset: 0,
        transform: camCss || undefined,
        transformOrigin: 'center center',
        opacity: opacity ?? 1,
        pointerEvents: 'none',
      } : {
        position: 'absolute',
        left: `${box.xPercent}%`,
        top: `${box.yPercent}%`,
        width: drawnW,
        height: drawnH,
        transform:
          `scale(${scale})` +
          (rotationDeg ? ` rotate(${rotationDeg}deg)` : '') +
          (camCss ? ` ${camCss}` : '') +
          ' translate(-50%,-50%)',
        transformOrigin: '0 0',
        opacity: opacity ?? 1,
        pointerEvents: 'none',
      }}
    >
      {withBackdrop && (
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, #1A190F 0%, #0B0B0D 100%)',
            border: '1px solid rgba(255,255,255,0.13)',
            boxShadow: [
              '0 24px 70px rgba(0,0,0,0.5)',
              'inset 0 1px 0 rgba(255,255,255,0.06)',
              fullBleed ? undefined : cinemaContactShadow(cine, drawnW, drawnH),
            ].filter(Boolean).join(', '),
            borderRadius: Math.round(Math.min(drawnW, drawnH) * 0.05),
          }}
        />
      )}
      {bloomStyle && <div style={bloomStyle} aria-hidden>{content}</div>}
      <div style={{ position: 'absolute', inset: 0, filter: contentFilter }}>
        {content}
      </div>
      {grainStyle && <div style={grainStyle} aria-hidden />}
      {vignetteStyle && <div style={vignetteStyle} aria-hidden />}
    </div>
  );
}
