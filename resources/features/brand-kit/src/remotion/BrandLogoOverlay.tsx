import { useEffect, useRef, type CSSProperties } from 'react';
import { brandLogoBox, type BrandLogoProps } from '../lib/brandLogo';

/**
 * The Brand Kit logo, drawn by EVERY render surface through this one component:
 *   · preview                → src/components/editor/VideoCanvas.tsx
 *   · WebCodecs export       → src/remotion/CaptionExportComposition.tsx
 *   · cloud (Lambda) export  → src/remotion/LambdaCaptionComposition.tsx
 *   · Element Capture export → src/lib/export/elementCaptureExport.tsx
 * Each surface mounts it directly BEFORE its free-tier watermark, so the watermark always paints on
 * top — the logo can never cover or replace it.
 *
 * A plain <img> of an inline data URL: the preview, Lambda's Chromium and the web-renderer's
 * html-in-canvas all rasterise HTMLImageElement (inline SVG is the thing web-renderer can't do, which
 * is why uploaded SVG logos are converted to PNG before they are stored). No Remotion imports, so the
 * live editor can mount it too; the compositions gate frame capture on `onSettled`.
 */
export function BrandLogoOverlay({ logo, frameWidth, frameHeight, onSettled }: {
  logo: BrandLogoProps;
  /** Width/height of the element the logo is positioned in, in that element's own pixels. */
  frameWidth: number;
  frameHeight: number;
  /** Called once the image has decoded (or failed to) — export surfaces hold capture until then. */
  onSettled?: () => void;
}) {
  const ref = useRef<HTMLImageElement>(null);

  // A cached data URL can finish loading before React attaches onLoad — settle from here too.
  // (The gate on the other end is idempotent, so settling twice is harmless.)
  useEffect(() => {
    const el = ref.current;
    if (!onSettled || !el?.complete) return;
    const done = () => onSettled();
    if (typeof el.decode === 'function') el.decode().then(done, done);
    else done();
  }, [logo.src, onSettled]);

  const box = brandLogoBox(frameWidth, frameHeight, logo);
  const style: CSSProperties = {
    position: 'absolute',
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
    opacity: logo.opacity,
    objectFit: 'contain',
    display: 'block',
    // The editor's CSS reset sets img { max-width:100%; height:auto } — pin the computed box.
    maxWidth: 'none',
    maxHeight: 'none',
    pointerEvents: 'none',
    userSelect: 'none',
  };

  const handleSettled = (el: HTMLImageElement) => {
    if (!onSettled) return;
    const done = () => onSettled();
    if (typeof el.decode === 'function') el.decode().then(done, done);
    else done();
  };

  return (
    // eslint-disable-next-line @next/next/no-img-element -- inline data URL painted identically by the preview and every exporter; next/image can't render inside Remotion
    <img
      ref={ref}
      data-brand-logo=""
      src={logo.src}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={style}
      onLoad={(e) => handleSettled(e.currentTarget)}
      onError={() => onSettled?.()}
    />
  );
}
