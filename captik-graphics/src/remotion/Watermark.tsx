import { useCurrentFrame, useVideoConfig } from 'remotion';
import { WatermarkLockup } from './WatermarkLockup';

/**
 * Animated free-tier watermark bug — the Captik LogoMark caption-glyph (active bar
 * lit with a shifting amber gradient, the highlight sweeping bar-to-bar) + "Captik"
 * wordmark, top-right INSIDE the content safe area (a letterbox-corner bug gets
 * cropped out in 5 seconds; over content it survives, because cropping it costs
 * framing).
 *
 * Purely frame-driven (t = frame/fps) so it renders identically on Lambda, the
 * in-browser web-renderer and the Player. The live-preview twin is
 * src/components/editor/PreviewWatermark.tsx — both render the SAME WatermarkLockup,
 * so the preview is exactly the bug the export carries.
 */
export function Watermark() {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  // Same logical scaling as the caption styles (270-wide portrait / 640-wide landscape).
  const RS = width < height ? width / 270 : width / 640;
  const sz = (n: number) => Math.round(n * RS);

  return <WatermarkLockup t={frame / fps} sz={sz} gradId="captik-wm-export" />;
}
