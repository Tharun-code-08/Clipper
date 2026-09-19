'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill, continueRender, delayRender,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
// @remotion/media's <Video> decodes by REAL frame timestamps (media-parser), so it steps through
// variable-frame-rate sources that OffthreadVideo stalls on ("video freezes mid-clip while the
// captions keep going"). It's SSR/Lambda-supported and auto-falls-back to OffthreadVideo if it
// can't process a file, so this is never worse than before.
import { Video as MediaVideo } from '@remotion/media';
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
 * Lambda export composition — pixel-identical to the editor PREVIEW.
 *
 * The preview renders captions with `CaptionOverlay`; this renders the EXACT SAME component
 * (at the same "logical" canvas size, then uniformly scaled to the export resolution), so the
 * export can never drift from the preview's fonts / sizes / weights / emphasis. It replaces the
 * old per-style re-implementation (KineticCaptionComposition) that had independently-tuned
 * `sz()` / `fontWeight` values and so diverged from the preview ("export font/size/weight ≠
 * preview"). The background video sits underneath via OffthreadVideo (the Lambda-native player).
 *
 * This is the SSR/Lambda twin of CaptionExportComposition (which uses @remotion/media's <Video>
 * for the in-browser web-renderer); the only difference is the video element.
 */
export interface LambdaCaptionProps {
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
  /** Alpha-overlay mode (plugin "Transparent overlay"): render captions over a TRANSPARENT
   *  background with no video underneath. Paired with a ProRes 4444 render so the output .mov
   *  keeps the alpha channel and stacks on the track above the clip in the NLE. */
  transparent?:           boolean;
  /** Aura alpha-overlay split: 'base' = every word EXCEPT the difference-blend ones (hidden
   *  placeholders keep the layout); 'diff' = ONLY the difference words, solid white, NO CSS
   *  blend — the NLE track's own Difference blend mode reproduces the effect against the clip. */
  auraAlphaLayer?:        'base' | 'diff';
  customFontName?:        string;
  customFontDataUrl?:     string;
  textOverrides?:         TextOverrides;
  emphasisStyle?:         EmphasisStyle;
  layoutMode?:            LayoutMode;
  lineTextOverrides?:     Record<string, Partial<TextOverrides>>;
  templateSlots?:         TemplateSlotOverrides;
  lineSlotOverrides?:     Record<string, TemplateSlotOverrides>;
  /**
   * Brand Kit logo (inline data URL + corner / size / opacity), drawn by the shared BrandLogoOverlay
   * directly beneath the free-tier watermark.
   *
   * CLOUD EXPORTS ONLY SHOW THIS AFTER A REMOTION SITE REDEPLOY. Lambda renders the bundle that
   * REMOTION_SERVE_URL points at, not this source tree. From a build containing this prop, run (repo
   * root): `npx remotion lambda sites create src/remotion/index.tsx --site-name=captik` — it overwrites
   * sites/captik/, so REMOTION_SERVE_URL stays the same. Until then the deployed composition never
   * reads `brandLogo`: the route forwards it inside inputProps (renderBodySchema is a loose object),
   * the old bundle ignores the unknown key, and the export succeeds exactly as before, minus the logo.
   */
  brandLogo?:             BrandLogoProps;
}

// Weights the caption styles actually use (Inter 800/900, Montserrat 600/700, Futura 700/900,
// MonaSans 700, Open Sans/Playfair variable, …). document.fonts.load triggers a face to decode
// ONLY for the exact weight requested, so warming just weight-400 (the old bug) left heavier
// faces unloaded → the first frames painted a faux/fallback weight ("font-weight changes in
// export"). Warm the full set so every real face is decoded before the first frame is captured.
const WARM_WEIGHTS = [300, 400, 500, 600, 700, 800, 900];

export function LambdaCaptionComposition({
  videoSrc, words, accentColor, captionTextColor = '#ffffff',
  bleepRanges, captionStyle: captionStyleBase = 'hormozi', captionSegments = [],
  isPro = false,
  captionBox = { xPercent: 50, yPercent: 85, widthPercent: 84 },
  segmentBoxOverrides = {}, segmentFontScaleOverrides = {}, segmentStyleOverrides = {},
  captionEmphBox = { xPercent: 50, yPercent: 24, widthPercent: 84 },
  segmentEmphBoxOverrides = {}, emphFontScale = 1, segmentEmphFontScaleOverrides = {},
  captionFontScale = 1.0, captionLines = 'single', captionGapMs = 0,
  noVideo = false, transparent = false, auraAlphaLayer, customFontName, customFontDataUrl,
  textOverrides, emphasisStyle, layoutMode, lineTextOverrides,
  templateSlots, lineSlotOverrides, brandLogo,
}: LambdaCaptionProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  // Brand Kit logo: validated here because the route forwards the client's body verbatim (only an
  // inline image data URL is accepted — never a URL to fetch), and frame capture is held until it has
  // decoded. Aura's 'diff' overlay pass carries no logo, for the same reason it carries no watermark.
  const logo = useMemo(
    () => (auraAlphaLayer === 'diff' ? null : sanitizeBrandLogo(brandLogo)),
    [brandLogo, auraAlphaLayer],
  );
  const releaseLogo = useBrandLogoGate(logo !== null);

  // Logical canvas the preview renders captions into; scale that layer up to export res.
  const { w: logicalW, h: logicalH } = logicalCanvasSize(width / height);
  const scale = width / logicalW; // == height / logicalH (export keeps the same ratio)

  // Per-frame active segment → effective box + style + per-line overrides. Resolved through the
  // SHARED display window (activeSegmentIndexAt — the exact window CaptionOverlay paints with),
  // so an override applies for precisely the frames its caption is on screen. The old ad-hoc
  // [start−80, end+150] UNCLAMPED window here outlived the display on back-to-back captions, so
  // the export painted the newly visible caption with the PREVIOUS caption's box/template for
  // ~150ms and then jumped mid-caption ("caption position keeps changing in the export").
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

  // @font-face only for the Indic scripts actually present, so an English export registers/warms
  // nothing extra (see buildIndicFontsCss). Built from ALL words, not just the on-screen segment,
  // so a face is registered before the frame its script first appears on.
  const indicFontsCss = buildIndicFontsCss(words.map(w => w.text).join(' '));

  // Hold frame capture until every caption face (bundled @font-face + custom data-URL + any
  // present Indic face) has ACTUALLY decoded — across the weights the styles use, not just 400 —
  // so the first frames never flash a fallback/faux weight (the preview-vs-export weight mismatch)
  // or a tofu box before the script's Noto face loads.
  const [fontHandle] = useState(() => delayRender('Loading caption fonts'));
  useEffect(() => {
    let alive = true;
    const finish = () => { if (alive) continueRender(fontHandle); };
    if (typeof document === 'undefined' || !document.fonts) { finish(); return; }
    const families = fontFamiliesFromCss(buildFontsCss() + indicFontsCss);
    if (customFontName) families.push(customFontName);
    if (customFontDataUrl) families.push('CaptikCustomFontData');
    // Emphasis / per-line / Text-tab fonts are selected through their own channels and must be
    // force-decoded too, or emphasised / overridden words flash a fallback in the export.
    families.push(...referencedFontFamilies({ emphasisStyle, textOverrides, lineTextOverrides }));
    Promise.all(families.flatMap(f =>
      WARM_WEIGHTS.flatMap(wt => [
        document.fonts.load(`${wt} 64px "${f}"`).catch(() => {}),
        document.fonts.load(`italic ${wt} 64px "${f}"`).catch(() => {}),
      ]),
    ))
      .then(() => document.fonts.ready)
      .then(finish)
      .catch(finish);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontHandle]);

  return (
    <AbsoluteFill style={{ backgroundColor: transparent ? 'transparent' : '#000' }}>
      <style dangerouslySetInnerHTML={{ __html: buildFontsCss() + indicFontsCss + buildCustomFontCss(customFontName, customFontDataUrl) }} />

      {!noVideo && !transparent && (
        <MediaVideo
          src={videoSrc}
          style={{ width: '100%', height: '100%' }}
          objectFit="contain"
          volume={isBleep ? 0 : 1}
        />
      )}

      {/* Caption layer: rendered at the preview's logical size, then scaled uniformly to the
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
          auraAlphaLayer={auraAlphaLayer}
        />
      </div>

      {/* NOTE: "Behind the subject" is NOT composited on the cloud path. The cut-out is per-frame
          canvas work that the in-browser Element Capture exporter does (elementCaptureExport.tsx
          ECStage), so behind-subject exports are routed there (like the Indic-script exports), not
          to Lambda. Nothing to draw here. */}

      {/* Brand Kit logo — same top-level layer as the watermark, mounted just before it so the
          watermark always paints on top (the logo never hides or replaces it). */}
      {logo && <BrandLogoOverlay logo={logo} frameWidth={width} frameHeight={height} onSettled={releaseLogo} />}

      {/* Aura's 'diff' overlay pass carries no watermark — the 'base' pass already has it, and a
          second copy would render INVERTED through the track's Difference blend. */}
      {!isPro && auraAlphaLayer !== 'diff' && <Watermark />}
    </AbsoluteFill>
  );
}
