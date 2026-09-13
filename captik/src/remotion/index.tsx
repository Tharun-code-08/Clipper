import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { LambdaCaptionComposition, type LambdaCaptionProps } from './LambdaCaptionComposition';

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
  noVideo:             false,
  durationInFrames:    900,
  width:               1080,
  height:              1920,
};

// The free-tier watermark is drawn inside LambdaCaptionComposition as a top-level overlay
// (whenever !isPro), so it renders reliably on every frame — no per-style branch can drop it
// (the leak the old wrapper worked around). isPro is set server-side from the entitlement.
export const RemotionRoot: React.FC = () => (
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
);

registerRoot(RemotionRoot);
