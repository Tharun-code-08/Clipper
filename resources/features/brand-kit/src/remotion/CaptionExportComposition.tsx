'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill, continueRender, delayRender,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
// @remotion/web-renderer (in-browser WebCodecs) does NOT support <OffthreadVideo>; it
// requires <Video> from @remotion/media. See remotion.dev/docs/client-side-rendering/limitations
import { Video } from '@remotion/media';
import type { TranscriptWord, CaptionBoxConfig, TextOverrides, EmphasisStyle, LayoutMode, TemplateSlotOverrides } from '../types/transcript';
import { resolveSegments, activeSegmentIndexAt } from '../lib/captionSegments';
import type { BleepRange } from '../lib/profanity';
import { CaptionOverlay } from '../components/editor/CaptionOverlay';
import { mergeTemplateSlots } from '../lib/kineticSlots';
import { fontFamiliesFromCss, referencedFontFamilies } from '../lib/fontFamilies';
import { logicalCanvasSize } from '../lib/aspect';
import { sanitizeBrandLogo, type BrandLogoProps } from '../lib/brandLogo';
import { BrandLogoOverlay } from './BrandLogoOverlay';
import { useBrandLogoGate } from './useBrandLogoGate';
import {
  buildFontsCss, buildIndicFontsCss, buildCustomFontCss, Watermark,
  type CaptionStyleId,
} from './KineticCaptionComposition';

/**
 * Pixel-perfect export composition.
 *
 * Instead of re-implementing every caption style (as KineticCaptionComposition does), this
 * renders the EXACT same `CaptionOverlay` component the live preview uses. CaptionOverlay's
 * font sizes are absolute pixels tuned to the preview's "logical" canvas (270×480 / 640×360),
 * so we render it at that logical size and then uniformly CSS-scale the whole caption layer
 * up to the export resolution. The video sits underneath at full resolution.
 *
 * Result: captions + templates are byte-for-byte identical to the preview (same component,
 * same CSS, same fonts, same emphasis/spelling), and there is no second renderer to drift.
 */
export interface CaptionExportProps {
  videoSrc:               string;
  words:                  TranscriptWord[];
  accentColor:            string;
  captionTextColor?:      string;
  bleepRanges:            BleepRange[];
  captionStyle:           CaptionStyleId;
  captionSegments?:       string[][];
  isPro?:                 boolean;
  captionBox?:            CaptionBoxConfig;
  segmentBoxOverrides?:   Record<string, CaptionBoxConfig>;
  /** Per-caption font scale, keyed like segmentBoxOverrides — a box resize scoped to one caption. */
  segmentFontScaleOverrides?: Record<string, number>;
  // "Big Reveal" template: the second (title) box + its per-line overrides + title font scale.
  captionEmphBox?:        CaptionBoxConfig;
  segmentEmphBoxOverrides?: Record<string, CaptionBoxConfig>;
  emphFontScale?:         number;
  segmentEmphFontScaleOverrides?: Record<string, number>;
  segmentStyleOverrides?: Record<string, CaptionStyleId>;
  captionFontScale?:      number;
  captionLines?:          'single' | 'double';
  captionGapMs?:          number;
  noVideo?:               boolean;
  customFontName?:        string;
  customFontDataUrl?:     string;
  textOverrides?:         TextOverrides;
  emphasisStyle?:         EmphasisStyle;
  layoutMode?:            LayoutMode;
  /** Per-line typography overrides keyed by segment first-word id. */
  lineTextOverrides?:     Record<string, Partial<TextOverrides>>;
  /** Per-template slot overrides (editor_masala/illusion/aura) — global + per-line. */
  templateSlots?:         TemplateSlotOverrides;
  lineSlotOverrides?:     Record<string, TemplateSlotOverrides>;
  /** Brand Kit logo overlay — drawn by the shared BrandLogoOverlay beneath the watermark. */
  brandLogo?:             BrandLogoProps;
}

export function CaptionExportComposition({
  videoSrc, words, accentColor, captionTextColor = '#ffffff',
  bleepRanges, captionStyle: captionStyleBase = 'hormozi', captionSegments = [],
  isPro = false,
  captionBox = { xPercent: 50, yPercent: 85, widthPercent: 84 },
  segmentBoxOverrides = {}, segmentFontScaleOverrides = {}, segmentStyleOverrides = {},
  captionEmphBox = { xPercent: 50, yPercent: 24, widthPercent: 84 },
  segmentEmphBoxOverrides = {}, emphFontScale = 1, segmentEmphFontScaleOverrides = {},
  captionFontScale = 1.0, captionLines = 'single', captionGapMs = 0,
  noVideo = false, customFontName, customFontDataUrl,
  textOverrides, emphasisStyle, layoutMode, lineTextOverrides,
  templateSlots, lineSlotOverrides, brandLogo,
}: CaptionExportProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  // Brand Kit logo — validated, and frame capture held until it has decoded (see LambdaCaptionComposition).
  const logo = useMemo(() => sanitizeBrandLogo(brandLogo), [brandLogo]);
  const releaseLogo = useBrandLogoGate(logo !== null);

  // Logical canvas the preview renders captions into; scale that layer up to export res.
  const { w: logicalW, h: logicalH } = logicalCanvasSize(width / height);
  const scale = width / logicalW; // == height / logicalH (export keeps the same ratio)

  // Per-frame active segment → effective box + style. Resolved through the SHARED display window
  // (activeSegmentIndexAt — the exact window CaptionOverlay paints with), so an override applies
  // for precisely the frames its caption is on screen; the old ad-hoc unclamped window here could
  // paint a newly visible caption with the previous caption's box/template for ~150ms.
  const { effectiveBox, effectiveEmphBox, effectiveStyle, effectiveFontScale, effectiveEmphFontScale,
    effectiveTextOverrides, effectiveTemplateSlots } = (() => {
    const resolved = resolveSegments(captionSegments, words);
    const idx = activeSegmentIndexAt(resolved, currentMs, captionGapMs);
    const key = idx >= 0 ? resolved[idx].key : null;
    const lineText = key ? lineTextOverrides?.[key] : undefined;
    const lineSlots = key ? lineSlotOverrides?.[key] : undefined;
    return {
      effectiveBox:   (key ? segmentBoxOverrides[key]   : undefined) ?? captionBox,
      effectiveEmphBox: (key ? segmentEmphBoxOverrides[key] : undefined) ?? captionEmphBox,
      effectiveStyle: (key ? segmentStyleOverrides[key] : undefined) ?? captionStyleBase,
      effectiveFontScale:     (key ? segmentFontScaleOverrides[key]     : undefined) ?? captionFontScale,
      effectiveEmphFontScale: (key ? segmentEmphFontScaleOverrides[key] : undefined) ?? emphFontScale,
      effectiveTextOverrides: lineText ? { ...textOverrides, ...lineText } : textOverrides,
      effectiveTemplateSlots: mergeTemplateSlots(templateSlots, lineSlots),
    };
  })();

  const isBleep = bleepRanges.some(r => currentMs >= r.startMs && currentMs <= r.endMs);

  // @font-face only for the Indic scripts present in the caption text (empty for English) so the
  // export carries the exact Noto faces it needs and non-Latin captions don't render as tofu.
  const indicFontsCss = buildIndicFontsCss(words.map(w => w.text).join(' '));

  // Hold frame capture until all caption fonts (bundled @font-face + custom data-URL + any
  // present Indic face) are ready, so the first frames don't flash a fallback font.
  const [fontHandle] = useState(() => delayRender('Loading caption fonts'));
  useEffect(() => {
    let alive = true;
    const finish = () => { if (alive) continueRender(fontHandle); };
    if (typeof document === 'undefined' || !document.fonts) { finish(); return; }
    // @font-face faces load LAZILY — document.fonts.ready alone can resolve while the
    // uploaded custom face is still unloaded, so the first frames paint a fallback: the
    // "custom font / font-weight / line-spacing all change in export" bug. Force every
    // face — including the custom data-URL alias — to actually decode first, THEN wait
    // for the rest. (Mirrors KineticCaptionComposition, which never had this bug.)
    const families = fontFamiliesFromCss(buildFontsCss() + indicFontsCss);
    if (customFontName) families.push(customFontName);
    if (customFontDataUrl) families.push('CaptikCustomFontData');   // the data-URL alias face
    // Emphasis / per-line / Text-tab fonts come through their own channels — force-decode them too
    // so emphasised / overridden words don't paint a fallback while the preview looks right.
    families.push(...referencedFontFamilies({ emphasisStyle, textOverrides, lineTextOverrides }));
    Promise.all(families.flatMap(f => [
      document.fonts.load(`64px "${f}"`).catch(() => {}),
      document.fonts.load(`italic 64px "${f}"`).catch(() => {}),
    ]))
      .then(() => document.fonts.ready)
      .then(finish)
      .catch(finish);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontHandle]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <style dangerouslySetInnerHTML={{ __html: buildFontsCss() + indicFontsCss + buildCustomFontCss(customFontName, customFontDataUrl) }} />

      {!noVideo && (
        <Video
          src={videoSrc}
          style={{ width: '100%', height: '100%' }}
          objectFit="contain"
          volume={isBleep ? 0 : 1}
        />
      )}

      {/* Caption layer: rendered at the preview's logical size, then scaled uniformly to
          export resolution. transformOrigin top-left + inset 0 keeps geometry identical. */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0,
          width: logicalW, height: logicalH,
          transform: `scale(${scale})`, transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      >
        <CaptionOverlay
          words={words}
          currentTimeMs={currentMs}
          captionStyle={effectiveStyle}
          accentColor={accentColor}
          bleepRanges={bleepRanges}
          segments={captionSegments}
          captionYPercent={effectiveBox.yPercent}
          captionXPercent={effectiveBox.xPercent}
          captionWidthPercent={effectiveBox.widthPercent}
          emphBoxYPercent={effectiveEmphBox.yPercent}
          emphBoxXPercent={effectiveEmphBox.xPercent}
          emphBoxWidthPercent={effectiveEmphBox.widthPercent}
          emphFontScale={effectiveEmphFontScale}
          captionFontScale={effectiveFontScale}
          captionLines={captionLines}
          captionTextColor={captionTextColor}
          captionGapMs={captionGapMs}
          canvasWidthPx={logicalW}
          textOverrides={effectiveTextOverrides}
          emphasisStyle={emphasisStyle}
          layoutMode={layoutMode}
          templateSlots={effectiveTemplateSlots}
        />
      </div>

      {/* "Behind the subject" is NOT composited on this Remotion path. Behind-subject exports go
          through Element Capture (ECStage), which draws the per-frame cut-out onto its own canvas. */}

      {/* Brand Kit logo — mounted just before the watermark so the watermark always paints on top. */}
      {logo && <BrandLogoOverlay logo={logo} frameWidth={width} frameHeight={height} onSettled={releaseLogo} />}

      {!isPro && <Watermark />}
    </AbsoluteFill>
  );
}
