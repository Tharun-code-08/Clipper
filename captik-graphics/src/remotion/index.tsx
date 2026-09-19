import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { LambdaCaptionComposition, type LambdaCaptionProps } from './LambdaCaptionComposition';
import { ShowcaseComposition, type ShowcaseProps } from './ShowcaseComposition';
import { CAPTION_MECHANICS } from '@/lib/autopilot/captionMechanics';

// The Lambda export renders the SAME CaptionOverlay component as the editor preview (via
// LambdaCaptionComposition) so the export can never drift from the preview's fonts / sizes /
// weights. (The old KineticCaptionComposition re-implemented every style separately and had
// independently-tuned sizes/weights — the "export font/size/weight ≠ preview" bug. It's kept in
// the repo, imported only for its shared font CSS + Watermark, so a revert is one-line.)
type WithDimensions = LambdaCaptionProps & {
  durationInFrames?: number;
  width?:            number;
  height?:           number;
  fps?:              number;
};

const defaultProps: WithDimensions = {
  videoSrc:            '',
  words:               [],
  accentColor:         '#C8FF00',
  captionTextColor:    '#ffffff',
  bleepRanges:         [],
  captionStyle:        'hormozi',
  captionSegments:     [],
  isPro:               false,
  captionBox:          { xPercent: 50, yPercent: 85, widthPercent: 84 },
  segmentBoxOverrides: {},
  captionEmphBox:      { xPercent: 50, yPercent: 24, widthPercent: 84 },
  segmentEmphBoxOverrides: {},
  emphFontScale:       1,
  captionFontScale:    1.0,
  graphics:            [],
  noVideo:             false,
  durationInFrames:    900,
  width:               1080,
  height:              1920,
};

// The free-tier watermark is drawn inside LambdaCaptionComposition as a top-level overlay
// (whenever !isPro), so it renders reliably on every frame — no per-style branch can drop it
// (the leak the old wrapper worked around). isPro is set server-side from the entitlement.
/** Autopilot's own edit. Rendered by @remotion/player in the tool and by Lambda on export —
 *  the SAME component, so the preview cannot drift from the file. */
const showcaseDefaults: ShowcaseProps & { durationInFrames: number } = {
  videoSrc: '', cuts: [], inserts: [], moments: [], chunks: [],
  mechanic: CAPTION_MECHANICS.karaoke,
  brand: {
    ground: '#101014', support: '#2b2b33', accent: '#ff4d3d', ink: '#f5f3ee',
    hero: "Anton, 'Arial Black', sans-serif", body: "Montserrat, sans-serif",
  },
  beats: [0], focusPush: 1, footageFilter: '', timelineMs: 30_000,
  durationInFrames: 900,
};

export const RemotionRoot: React.FC = () => (
  <>
  <Composition
    id="AutopilotShowcase"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component={ShowcaseComposition as React.ComponentType<any>}
    durationInFrames={900}
    fps={30}
    width={1080}
    height={1920}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defaultProps={showcaseDefaults as any}
    calculateMetadata={({ props }) => {
      const p = props as unknown as ShowcaseProps & WithDimensions;
      // The source's real frame rate, same as the caption composition: a 25/50/60fps clip
      // rendered at a hardcoded 30 drifts against its own audio, and the moments are timed in
      // milliseconds against that audio.
      const fps = p.fps ?? 30;
      return {
        // The plan's own length decides the render length — a fixed 900 would cut the edit
        // off or pad it with black.
        durationInFrames: Math.max(1, Math.round((p.timelineMs / 1000) * fps)),
        // The speaker's own frame size, so a vertical phone clip is not letterboxed into a
        // composition shape it never had.
        width:  p.width  ?? 1080,
        height: p.height ?? 1920,
        fps,
        props,
      };
    }}
  />
  <Composition
    id="KineticCaption"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component={LambdaCaptionComposition as React.ComponentType<any>}
    durationInFrames={900}
    fps={30}
    width={1080}
    height={1920}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defaultProps={defaultProps as any}
    calculateMetadata={({ props }) => {
      const p = props as unknown as WithDimensions;
      return {
        durationInFrames: p.durationInFrames ?? 900,
        width:            p.width            ?? 1080,
        height:           p.height           ?? 1920,
        // Match the source video's frame rate (probed client-side) so caption
        // timestamps don't drift on non-30fps footage.
        fps:              p.fps ?? 30,
        props,
      };
    }}
  />
  </>
);

registerRoot(RemotionRoot);
