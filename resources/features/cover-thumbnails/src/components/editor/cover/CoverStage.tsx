'use client';

// The cover, as DOM — the on-screen preview, and the headline + watermark layers of the downloaded image
// (the still export mounts this exact component inside CoverComposition with `transparent`, then
// composites the captured frame and cut-out pixels itself with the same coverFitRect).
//
// Layers, bottom → top:
//   1. the captured frame, cover-fit (cropped, never letterboxed) with pan/zoom
//   2. the headline — the real CaptionOverlay template at its logical size, uniformly scaled up
//   3. the cut-out subject (same rect as the frame) when "subject in front" is on
//   4. the free-tier watermark lockup (above the subject so it can never be hidden by it)
//
// Everything is absolutely positioned in OUTPUT pixels with no object-fit, so the web-renderer's
// DOM composer and the browser lay it out identically.

import { useEffect, useMemo, useRef } from 'react';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import { buildFontsCss, buildIndicFontsCss } from '@/remotion/KineticCaptionComposition';
import { WatermarkLockup } from '@/remotion/WatermarkLockup';
import { CaptionOverlay } from '@/components/editor/CaptionOverlay';
import {
  coverFitRect, coverHeadlineWords, coverLogical, COVER_WATERMARK_T,
  type CoverBox, type CoverPreset,
} from '@/lib/cover/coverLayout';
import { coverHeadlineKey, type HeadlineBounds, type HeadlineLayouts } from '@/lib/cover/headlinePlacement';

export interface CoverStageProps {
  preset:          CoverPreset;
  /** Captured frame (same-origin blob: URL) and its intrinsic size. */
  frameUrl:        string | null;
  frameW:          number;
  frameH:          number;
  /** Cut-out of the SAME frame (transparent outside the subject), drawn above the headline. */
  cutoutUrl?:      string | null;
  panX:            number;
  panY:            number;
  zoom:            number;
  text:            string;
  styleId:         CaptionStyleId;
  box:             CoverBox;
  fontScale:       number;
  accentColor:     string;
  textColor:       string;
  watermarked:     boolean;
  /** No black ground: the still export renders the overlays transparent and composites the frame itself. */
  transparent?:    boolean;
  /** Fired once every image this stage renders has settled and been decoded — the export's capture gate.
      `ok` is false when a layer has no pixels (failed load), so the export can fail instead of shipping it. */
  onReady?:        (ok: boolean) => void;
  /** Preview only: the headline's measured text runs, at the current box and at `probeWidths`, so the
      editor can keep it clear of the subject. Not used by the still export. */
  onHeadlineMeasure?: (m: HeadlineLayouts | null) => void;
  /** Preview only: extra box widths to lay the headline out at, invisibly, for measurement. */
  probeWidths?:    readonly number[];
}

const NO_BLEEPS: never[] = [];

export default function CoverStage(p: CoverStageProps) {
  const { preset } = p;
  const W = preset.width, H = preset.height;
  const logical = coverLogical(preset);
  const rect = coverFitRect(p.frameW, p.frameH, W, H, p.panX, p.panY, p.zoom);
  const headline = useMemo(() => coverHeadlineWords(p.text), [p.text]);
  const fontsCss = useMemo(() => buildFontsCss() + buildIndicFontsCss(p.text), [p.text]);

  // Image readiness: count the images that must decode before a capture is faithful.
  const frameRef = useRef<HTMLImageElement>(null);
  const cutRef = useRef<HTMLImageElement>(null);
  const onReadyRef = useRef(p.onReady);
  useEffect(() => { onReadyRef.current = p.onReady; }, [p.onReady]);
  const showCutout = !!(p.cutoutUrl && p.frameUrl);
  useEffect(() => {
    const imgs = [p.frameUrl ? frameRef.current : null, showCutout ? cutRef.current : null]
      .filter((x): x is HTMLImageElement => !!x);
    let started = false;
    let cancelled = false;
    const check = async () => {
      if (started || cancelled || !imgs.every(img => img.complete)) return;
      started = true;
      // `complete` is also true for a FAILED load, and a complete image is not necessarily decoded.
      // Decode the actual nodes, then report whether every layer really has pixels — the export must
      // fail (and retry) rather than download a cover whose frame silently didn't paint. Measured: a
      // capture racing an image load exported headline + watermark on black.
      await Promise.all(imgs.map(img => img.decode().catch(() => undefined)));
      if (!cancelled) onReadyRef.current?.(imgs.every(img => img.naturalWidth > 0));
    };
    const onEvent = () => { void check(); };
    imgs.forEach(img => { img.addEventListener('load', onEvent); img.addEventListener('error', onEvent); });
    void check();
    return () => {
      cancelled = true;
      imgs.forEach(img => { img.removeEventListener('load', onEvent); img.removeEventListener('error', onEvent); });
    };
  }, [p.frameUrl, p.cutoutUrl, showCutout]);

  // Headline measurement (preview only). Templates differ in how their ink sits around the box anchor and
  // how they wrap, so the editor measures rendered text rather than estimating it: every visible text run's
  // line boxes, relative to the box anchor (transforms included, so the preview's scale cancels out). The
  // probes are the same headline laid out invisibly at other widths, anchored at the cover centre.
  const rootRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const probeRefs = useRef(new Map<number, HTMLDivElement>());
  const onMeasureRef = useRef(p.onHeadlineMeasure);
  const probeWidthsRef = useRef(p.probeWidths);
  useEffect(() => { onMeasureRef.current = p.onHeadlineMeasure; probeWidthsRef.current = p.probeWidths; });
  const wantsMeasure = !!p.onHeadlineMeasure;
  const headKey = coverHeadlineKey({ text: p.text, styleId: p.styleId, fontScale: p.fontScale, box: p.box, preset: preset.id });
  const probesKey = (p.probeWidths ?? []).join(',');
  const anchorX = p.box.xPercent / 100;
  const anchorY = p.box.yPercent / 100;
  useEffect(() => {
    if (!wantsMeasure) return;
    let cancelled = false;
    let raf = 0;

    const runsIn = (el: HTMLElement, rr: DOMRect, ax: number, ay: number): HeadlineBounds[] => {
      const runs: HeadlineBounds[] = [];
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const parent = n.parentElement;
        if (parent) {
          const cs = getComputedStyle(parent);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        }
        range.selectNodeContents(n);
        for (const r of Array.from(range.getClientRects())) {
          if (!r.width || !r.height) continue;
          runs.push({
            top: (r.top - rr.top) / rr.height - ay, bottom: (r.bottom - rr.top) / rr.height - ay,
            left: (r.left - rr.left) / rr.width - ax, right: (r.right - rr.left) / rr.width - ax,
          });
        }
      }
      return runs;
    };

    const measure = () => {
      const report = onMeasureRef.current;
      if (cancelled || !report) return;
      const root = rootRef.current;
      const head = headRef.current;
      if (!root || !head) { report(null); return; }
      const rr = root.getBoundingClientRect();
      if (!rr.width || !rr.height) return;
      const current = runsIn(head, rr, anchorX, anchorY);
      if (!current.length) { report(null); return; }
      const byWidth = (probeWidthsRef.current ?? []).flatMap(w => {
        const el = probeRefs.current.get(w);
        const runs = el ? runsIn(el, rr, 0.5, 0.5) : [];
        return runs.length ? [{ widthPercent: w, shape: { runs } }] : [];
      });
      report({ key: headKey, current: { runs: current }, byWidth });
    };

    // After layout, and after the template's fonts load — a fallback face wraps differently.
    raf = requestAnimationFrame(() => {
      void document.fonts.ready.then(() => { if (!cancelled) raf = requestAnimationFrame(measure); });
    });
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [headKey, probesKey, wantsMeasure, anchorX, anchorY]);

  const imgStyle: React.CSSProperties = {
    position: 'absolute', left: rect.dx, top: rect.dy, width: rect.dw, height: rect.dh,
    maxWidth: 'none', maxHeight: 'none', display: 'block', userSelect: 'none', pointerEvents: 'none',
  };
  const layer: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, width: logical.w, height: logical.h,
    transform: `scale(${logical.scale})`, transformOrigin: 'top left', pointerEvents: 'none',
  };
  const overlayProps = {
    words: headline.words, segments: headline.segments, currentTimeMs: headline.currentTimeMs,
    captionStyle: p.styleId, accentColor: p.accentColor, captionTextColor: p.textColor,
    bleepRanges: NO_BLEEPS, captionFontScale: p.fontScale, captionLines: 'double' as const,
    noLineFade: true, canvasWidthPx: logical.w,
  };

  return (
    <div ref={rootRef} data-cover-stage="" style={{ position: 'relative', width: W, height: H, overflow: 'hidden', background: p.transparent ? 'transparent' : '#000', isolation: 'isolate' }}>
      <style dangerouslySetInnerHTML={{ __html: fontsCss }} />
      {p.frameUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL of a captured frame; next/image cannot optimise it
        <img ref={frameRef} src={p.frameUrl} alt="" draggable={false} style={imgStyle} />
      )}
      {headline.words.length > 0 && p.probeWidths?.map(w => (
        <div
          key={`probe-${w}`}
          ref={(el) => { if (el) probeRefs.current.set(w, el); else probeRefs.current.delete(w); }}
          aria-hidden
          data-cover-probe={w}
          style={{ ...layer, opacity: 0 }}
        >
          <CaptionOverlay {...overlayProps} captionXPercent={50} captionYPercent={50} captionWidthPercent={w} />
        </div>
      ))}
      {headline.words.length > 0 && (
        <div ref={headRef} style={layer}>
          <CaptionOverlay
            {...overlayProps}
            captionXPercent={p.box.xPercent} captionYPercent={p.box.yPercent} captionWidthPercent={p.box.widthPercent}
          />
        </div>
      )}
      {showCutout && (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL of the cut-out
        <img ref={cutRef} src={p.cutoutUrl!} alt="" draggable={false} style={imgStyle} />
      )}
      {p.watermarked && (
        <div style={layer}>
          <WatermarkLockup t={COVER_WATERMARK_T} sz={(n: number) => Math.round(n * logical.rs)} />
        </div>
      )}
    </div>
  );
}
