'use client';

import { useEffect, useState } from 'react';
import {
  AbsoluteFill, Audio, Sequence, continueRender, delayRender,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
import { graphicsSfxCues } from '../lib/graphics/registry';
import { loadSfx, sfxReady, sfxUri } from '../lib/graphics/sfxLoader';
// @remotion/media's <Video> decodes by REAL frame timestamps (media-parser), so it steps through
// variable-frame-rate sources that OffthreadVideo stalls on ("video freezes mid-clip while the
// captions keep going"). It's SSR/Lambda-supported and auto-falls-back to OffthreadVideo if it
// can't process a file, so this is never worse than before.
import { Video as MediaVideo } from '@remotion/media';
import type { TranscriptWord, CaptionBoxConfig, TextOverrides, EmphasisStyle, LayoutMode, TemplateSlotOverrides } from '../types/transcript';
import type { TextLayer } from '../types/textLayers';
import { TextLayerOverlay } from '../components/editor/TextLayerOverlay';
import { fadeGain } from '@/lib/audioFade';
import { videoFilterCss, videoTransformCss, type VideoAdjust } from '../lib/videoFilter';
import { motionPose, motionTransformCss, spotlightDim } from '../lib/motion/motionTimeline';
import { splitPose, splitTransformCss } from '../lib/motion/splitPose';
import { BespokeGraphicsLayer } from '../components/editor/BespokeGraphicsLayer';
import type { BespokeGraphic } from '../lib/bespokeGraphics';
import { invertActive } from '../lib/hookFlicker';
import { resolveSegments, activeSegmentIndexAt } from '../lib/captionSegments';
import type { BleepRange } from '../lib/profanity';
import { CaptionOverlay } from '../components/editor/CaptionOverlay';
import GraphicsOverlay from '../components/editor/GraphicsOverlay';
import type { GraphicsInstance } from '../types/graphics';
import type { SfxInstance } from '../types/sfx';
import {
  graphicsFontFamilies, graphicsImageSources,
  importedTemplatesReady, loadImportedTemplates, needsImportedTemplates,
} from '../lib/graphics/registry';
import { mergeTemplateSlots } from '../lib/kineticSlots';
import { fontFamiliesFromCss, referencedFontFamilies } from '../lib/fontFamilies';
import { logicalCanvasSize } from '../lib/aspect';
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
  /** Free-floating text overlays (already remapped onto the cut timeline for edited exports). */
  textLayers?:            TextLayer[];
  /** Video look adjustments — identical CSS filter on every surface. */
  videoAdjust?:           VideoAdjust;
  /** Speed multiplier: video plays rate x faster; captions stay source-synced. */
  playbackRate?:          number;
  /** Music fade in/out over the output timeline, seconds. */
  musicFadeInSec?:        number;
  musicFadeOutSec?:       number;
  /** Zoom-punch transitions: kept-clip windows in CUT-VIDEO ms — alternate
   *  windows render with a static 1.06x punch-in (jump-cut disguise). */
  punchSegments?:         { startMs: number; endMs: number }[];
  /** Autopilot emphasis beats (cut-video OUTPUT ms) — shared motionTimeline grammar. */
  motionEvents?:          { atMs: number; kind: 'zoom' | 'shake'; intensity: 1 | 2 }[];
  motionAnchor?:          { x: number; y: number };
  /** Subject-spotlight windows (OUTPUT ms): scene dims; the matte cut-out (worker-composited
   *  on top) keeps the person bright. */
  spotlightWindows?:      { startMs: number; endMs: number }[];
  /** Director-designed graphic cards (sanitized HTML, OUTPUT ms). */
  bespokeGraphics?:       BespokeGraphic[];
  /** Hook flicker inversion flashes (OUTPUT ms). */
  invertFlashes?:         { atMs: number; durMs: number }[];
  /** Director-authored dynamic-caption typography. */
  dynamicSpec?:           { heroFont?: string; supportFont?: string; heroColor?: string };
  /** Background music (presigned URL) + mix levels — identical on every surface. */
  musicSrc?:              string;
  musicVolume?:           number;
  musicLoop?:             boolean;
  origVolume?:            number;
  /** Scene / overlay motion-graphics placed on this project. Rendered by the SAME GraphicsOverlay
   *  the editor preview mounts, in a sibling layer above the captions. */
  graphics?:              GraphicsInstance[];
  /** Sounds the USER placed, independent of any graphic. */
  sfx?:                   SfxInstance[];
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
  templateSlots, lineSlotOverrides, textLayers, videoAdjust, playbackRate, punchSegments, motionEvents, motionAnchor, spotlightWindows, bespokeGraphics = [], invertFlashes, dynamicSpec, musicFadeInSec, musicFadeOutSec,
  musicSrc, musicVolume = 0.35, musicLoop = true, origVolume = 1, graphics = [], sfx = [],
}: LambdaCaptionProps) {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  // Speed: frames advance in OUTPUT time; the video plays rate× faster and the
  // caption/text-layer clock is SOURCE time = output × rate — identical to how the
  // editor preview stays in sync (source-clocked overlay on a rate-adjusted video).
  const rate = playbackRate && playbackRate > 0 ? playbackRate : 1;
  const currentMs = (frame / fps) * 1000 * rate;
  // currentMs IS cut-video time (output x rate), so the punch windows compare directly.
  let punchCss = '';
  if (punchSegments?.length) {
    for (let i = 0; i < punchSegments.length; i++) {
      if (currentMs >= punchSegments[i].startMs && currentMs <= punchSegments[i].endMs) {
        if (i % 2 === 1) punchCss = ' scale(1.06)';
        break;
      }
    }
  }
  // Emphasis beats: the SAME shared evaluator the preview runs — pure(time), so this
  // frame renders the identical pose the user saw live.
  if (motionEvents?.length) {
    const mCss = motionTransformCss(
      motionPose(motionEvents, currentMs), motionAnchor?.x ?? 50, motionAnchor?.y ?? 42);
    if (mCss) punchCss += ` ${mCss}`;
  }
  // Split layouts squeeze the video the same way the preview does — without this the
  // export would paste the graphic band OVER the speaker while the preview slid him clear.
  {
    const sCss = splitTransformCss(splitPose(bespokeGraphics, currentMs));
    if (sCss) punchCss += ` ${sCss}`;
  }

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

  // The imported library ships as its own chunk (it is most of the bundle, and most exports never
  // touch it). Everything downstream — which faces to decode, which photos to preload, which
  // sound cues exist — is read OFF the template, so nothing else may run until it has landed.
  // A project with no imported graphic skips this entirely and pays nothing.
  const needsImports = needsImportedTemplates(graphics);
  // The sound bank is code-split too, and ANY graphic can carry cues — authored ones do not
  // need the imported chunk but still need audio.
  const needsSfx = graphics.length > 0;
  const assetsPending = (needsImports && !importedTemplatesReady()) || (needsSfx && !sfxReady());
  const [importsReady, setImportsReady] = useState(() => !assetsPending);
  const [importHandle] = useState(() =>
    assetsPending ? delayRender('Loading graphics assets') : null);
  useEffect(() => {
    if (importHandle == null) return;
    let alive = true;
    // Fails OPEN, like every other asset gate here: if the chunk cannot be fetched those graphics
    // draw nothing (the same way a retired template id already does) and the export still ships.
    Promise.all([
      needsImports ? loadImportedTemplates().catch(() => {}) : null,
      needsSfx ? loadSfx().catch(() => {}) : null,
    ]).then(() => {
      if (!alive) return;
      setImportsReady(true);
      continueRender(importHandle);
    });
    return () => { alive = false; };
    // One-shot gate: the handle is created at mount and the two needs* flags are captured with
    // it, so re-running on their identity would only ever release an already-released render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importHandle]);

  // Hold frame capture until every caption face (bundled @font-face + custom data-URL + any
  // present Indic face) has ACTUALLY decoded — across the weights the styles use, not just 400 —
  // so the first frames never flash a fallback/faux weight (the preview-vs-export weight mismatch)
  // or a tofu box before the script's Noto face loads.
  const [fontHandle] = useState(() => delayRender('Loading caption fonts'));
  useEffect(() => {
    // graphicsFontFamilies() can only see templates that are loaded, so waiting is what keeps an
    // imported graphic's face out of the fallback-flash it would otherwise hit.
    if (!importsReady) return;
    let alive = true;
    const finish = () => { if (alive) continueRender(fontHandle); };
    if (typeof document === 'undefined' || !document.fonts) { finish(); return; }
    const families = fontFamiliesFromCss(buildFontsCss() + indicFontsCss);
    if (customFontName) families.push(customFontName);
    if (customFontDataUrl) families.push('CaptikCustomFontData');
    // Emphasis / per-line / Text-tab fonts are selected through their own channels and must be
    // force-decoded too, or emphasised / overridden words flash a fallback in the export.
    families.push(...referencedFontFamilies({ emphasisStyle, textOverrides, lineTextOverrides }));
    // Same reasoning for graphics: a template's declared faces plus whatever its `font` params
    // currently resolve to, or the first frames paint a fallback face.
    families.push(...graphicsFontFamilies(graphics));
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
  }, [fontHandle, importsReady]);

  // Same problem, different asset: the photos a user drops into a graphics template are drawn with
  // a plain <img>, which does NOT hold the frame the way Remotion's <Img> does — so the first
  // frames a photo is on screen could capture an empty box in a paid export. Decode every source
  // up front and the <img> resolves from cache on the frame it actually appears.
  const [imgHandle] = useState(() => delayRender('Loading graphics images'));
  useEffect(() => {
    // Same dependency as the fonts: an imported template's photo params cannot be enumerated
    // until the template itself exists.
    if (!importsReady) return;
    let alive = true;
    let done = false;
    const finish = () => { if (alive && !done) { done = true; continueRender(imgHandle); } };
    const sources = graphicsImageSources(graphics);
    if (typeof document === 'undefined' || sources.length === 0) { finish(); return; }
    // NOTE: deliberately no crossOrigin — we only need the bytes warm, and setting it both breaks
    // hosts that send no CORS headers AND caches under a different key than the <img> that follows,
    // which would defeat the whole point.
    const all = Promise.all(sources.map((src) => new Promise<void>((res) => {
      const im = new Image();
      im.onload  = () => { Promise.resolve(im.decode?.()).catch(() => {}).then(() => res()); };
      im.onerror = () => res();
      im.src = src;
    })));
    // Fails OPEN: one slow or dead URL degrades to a missing photo, it never sinks the render by
    // running out Remotion's delayRender timeout.
    const budget = setTimeout(finish, 8000);
    all.then(finish).catch(finish).finally(() => clearTimeout(budget));
    return () => { alive = false; clearTimeout(budget); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgHandle, importsReady]);

  return (
    <AbsoluteFill style={{ backgroundColor: transparent ? 'transparent' : '#000' }}>
      <style dangerouslySetInnerHTML={{ __html: buildFontsCss() + indicFontsCss + buildCustomFontCss(customFontName, customFontDataUrl) }} />

      {!noVideo && !transparent && (
        <MediaVideo
          playbackRate={rate}
          src={videoSrc}
          style={{ width: '100%', height: '100%', filter: [videoFilterCss(videoAdjust), invertActive(invertFlashes, currentMs) ? 'invert(1)' : undefined].filter(Boolean).join(' ') || undefined, transform: ((videoTransformCss(videoAdjust) ?? '') + punchCss).trim() || undefined }}
          objectFit="contain"
          volume={isBleep ? 0 : origVolume}
        />
      )}

      {/* Subject spotlight: dims the scene under the captions; the worker composites the
          matte cut-out ON TOP of this render, so the person stays bright. Same shared
          ramp as the preview — pure(time). */}
      {(() => {
        const dim = spotlightDim(spotlightWindows, currentMs);
        return dim > 0.01
          ? <AbsoluteFill style={{ background: '#000', opacity: dim, pointerEvents: 'none' }} />
          : null;
      })()}

      {/* Director-designed cards — SAME shared layer as the preview, output clock. */}
      {bespokeGraphics.length > 0 && (
        <BespokeGraphicsLayer graphics={bespokeGraphics} currentTimeMs={currentMs} frameWidthPx={width} frameHeightPx={height} />
      )}

      {musicSrc && (
        <Audio
          src={musicSrc}
          loop={musicLoop}
          volume={(f) => fadeGain(f / fps, durationInFrames / fps, musicFadeInSec ?? 0, musicFadeOutSec ?? 0) * (musicVolume ?? 0.35)}
        />
      )}

      {/* Graphics SOUND CUES — the same cue list the preview plays via WebAudio, mixed into the
          rendered audio as short sequences. Cue ms is source-clock; frames advance in output
          time, so the inverse of the currentMs mapping places each cue. */}
      {/* SOUNDS THE USER PLACED. Same clock mapping as the template cues below, so a speed
          ramp carries them identically. A generated sound brings its own data URI; a bank
          sound resolves through the loader, which the asset gate above has already awaited. */}
      {sfx.map((s, i) => {
        const uri = s.src ?? sfxUri(s.sfxId);
        if (!uri) return null;
        const from = Math.round((s.atMs / rate / 1000) * fps);
        if (from < 0 || from >= durationInFrames) return null;
        return (
          <Sequence key={`sfx-${s.id}-${i}`} from={from} durationInFrames={Math.ceil(fps * 3)}>
            <Audio src={uri} volume={Math.max(0, Math.min(1.5, s.gain))} />
          </Sequence>
        );
      })}

      {graphics.length > 0 && graphicsSfxCues(graphics).map((c, i) => {
        const uri = sfxUri(c.id);
        if (!uri) return null;
        const from = Math.round((c.ms / rate / 1000) * fps);
        if (from < 0 || from >= durationInFrames) return null;
        return (
          <Sequence key={`gfx-sfx-${i}`} from={from} durationInFrames={Math.ceil(fps)}>
            <Audio src={uri} volume={0.9 * c.gain} />
          </Sequence>
        );
      })}

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
        <CaptionOverlay dynamicSpec={dynamicSpec}
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

      {/* Graphics layer: a SIBLING of the caption layer, not a child — captions stay untouched and
          graphics get their own stacking context. The wrapper is byte-identical to the caption
          one above (same logical size, same uniform scale, same transformOrigin), so the two
          layers cannot drift apart geometrically. GraphicsOverlay is the same component the editor
          preview mounts, so what the user positioned is what renders. */}
      {graphics.length > 0 && (
        <div
          style={{
            position: 'absolute', top: 0, left: 0,
            width: logicalW, height: logicalH,
            transform: `scale(${scale})`, transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        >
          <GraphicsOverlay
            graphics={graphics}
            currentTimeMs={currentMs}
            canvasWidthPx={logicalW}
            canvasHeightPx={logicalH}
          />
        </div>
      )}

      {/* Text layers ABOVE the graphics — text/PiP are the topmost user content on every surface
          (preview, EC and both Remotion comps agree, or the export lies about the preview).
          Same byte-identical wrapper geometry as the two layers above. */}
      {!!textLayers?.length && (
        <div
          style={{
            position: 'absolute', top: 0, left: 0,
            width: logicalW, height: logicalH,
            transform: `scale(${scale})`, transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        >
          <TextLayerOverlay layers={textLayers} currentTimeMs={currentMs} />
        </div>
      )}

      {/* NOTE: "Behind the subject" is NOT composited on the cloud path. The cut-out is per-frame
          canvas work that the in-browser Element Capture exporter does (elementCaptureExport.tsx
          ECStage), so behind-subject exports are routed there (like the Indic-script exports), not
          to Lambda. Nothing to draw here. */}

      {/* Aura's 'diff' overlay pass carries no watermark — the 'base' pass already has it, and a
          second copy would render INVERTED through the track's Difference blend. */}
      {!isPro && auraAlphaLayer !== 'diff' && <Watermark />}
    </AbsoluteFill>
  );
}
