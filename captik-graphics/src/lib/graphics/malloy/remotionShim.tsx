'use client';

// REMOTION SHIM for imported (malloy) templates.
//
// The imported library is written as Remotion COMPOSITIONS: each template calls
// useCurrentFrame() / useVideoConfig(), which only work inside a Remotion composition's context.
// Our graphics templates are the opposite by design — `render` is a plain function handed a
// millisecond, so hooks are structurally impossible (see types/graphics.ts).
//
// Rather than rewrite 1400+ files, the importer rewrites their `from "remotion"` import to point
// HERE. This module re-exports every PURE remotion helper untouched (interpolate, spring, Easing,
// random, AbsoluteFill…) and replaces only the two context hooks with ones that read a context we
// own. Our adapter renders the component inside that provider, so:
//   - the clock is OUR clip clock (timeMs), not a composition frame;
//   - the canvas is OUR drawn canvas, so instance aspect/fullBleed keep working;
//   - preview and export agree, because both go through the same adapter.

import { Children, createContext, isValidElement, useContext, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
// The REAL ones, aliased: this module deliberately re-exports no-op delayRender/continueRender for
// the imported templates (below), but <Img> needs the genuine article to hold a render frame.
import {
  delayRender as rDelayRender,
  continueRender as rContinueRender,
  getRemotionEnvironment as rGetEnv,
} from 'remotion';

export interface MalloyFrameCtx {
  frame: number;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
}

/** 30fps everywhere: the imported library was authored at 30 and its frame-count timings
 *  (`0.4 * fps`, `frame > 45`) only read correctly against the fps they were written for. */
export const MALLOY_FPS = 30;

const DEFAULT_CTX: MalloyFrameCtx = {
  frame: 0, fps: MALLOY_FPS, width: 1920, height: 1080, durationInFrames: 240,
};

export const MalloyFrameContext = createContext<MalloyFrameCtx>(DEFAULT_CTX);

/** Drop-in for remotion's useCurrentFrame inside imported templates. */
export function useCurrentFrame(): number {
  return useContext(MalloyFrameContext).frame;
}

/** Drop-in for remotion's useVideoConfig. Returns the values Remotion's own type carries that
 *  these templates actually read; anything else they touch would be a compile error, which is
 *  the point — we find out at build time, not in an export. */
export function useVideoConfig(): MalloyFrameCtx & { durationInFrames: number; id: string; defaultProps: Record<string, unknown>; props: Record<string, unknown> } {
  const c = useContext(MalloyFrameContext);
  return { ...c, id: 'malloy', defaultProps: {}, props: {} };
}

/** Some imported templates gate on asset loading with delayRender/continueRender. Outside a
 *  Remotion render there is nothing to delay, and in OUR exports the graphic must never hold up
 *  the frame (its assets are inline data URIs), so these are deliberate no-ops. */
export function delayRender(_label?: string): number { return 0; }
export function continueRender(_handle: number): void { /* nothing to release */ }
export function cancelRender(e: unknown): never { throw e instanceof Error ? e : new Error(String(e)); }

// PURE helpers pass straight through — these are just maths and a styled div, with no
// dependency on a composition being registered.
export {
  AbsoluteFill,
  Easing,
  interpolate,
  interpolateColors,
  measureSpring,
  random,
  spring,
} from 'remotion';

// ── Timing components, reimplemented against OUR context ─────────────────────────────────────
// Remotion's own <Sequence>/<Loop>/<Freeze> read the composition config internally, so
// re-exporting them threw "No video config found" the moment an imported template used one.
// These are behaviour-compatible versions driven by the clock we already provide.

/** Shifts (and optionally clips) the clock for its children — Remotion's core timing primitive. */
export const Sequence: React.FC<{
  from?: number; durationInFrames?: number; children?: React.ReactNode;
  style?: React.CSSProperties; layout?: 'absolute-fill' | 'none'; name?: string;
}> = ({ from = 0, durationInFrames = Infinity, children, style, layout = 'absolute-fill' }) => {
  const ctx = useContext(MalloyFrameContext);
  const local = ctx.frame - from;
  if (local < 0 || local >= durationInFrames) return null;
  const inner = (
    <MalloyFrameContext.Provider
      value={{ ...ctx, frame: local, durationInFrames: Math.min(ctx.durationInFrames, durationInFrames) }}
    >
      {children}
    </MalloyFrameContext.Provider>
  );
  if (layout === 'none') return inner;
  return <div style={{ position: 'absolute', inset: 0, ...style }}>{inner}</div>;
};

/** Repeats its children's clock. */
export const Loop: React.FC<{ durationInFrames: number; times?: number; children?: React.ReactNode }> = ({
  durationInFrames, times = Infinity, children,
}) => {
  const ctx = useContext(MalloyFrameContext);
  const iteration = Math.floor(ctx.frame / Math.max(1, durationInFrames));
  if (iteration >= times) return null;
  return (
    <MalloyFrameContext.Provider value={{ ...ctx, frame: ctx.frame % Math.max(1, durationInFrames) }}>
      {children}
    </MalloyFrameContext.Provider>
  );
};

/** Pins the clock to one frame. */
export const Freeze: React.FC<{ frame: number; children?: React.ReactNode }> = ({ frame, children }) => (
  <MalloyFrameContext.Provider value={{ ...useContext(MalloyFrameContext), frame }}>
    {children}
  </MalloyFrameContext.Provider>
);

/** A Freeze at 0. */
export const Still: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <Freeze frame={0}>{children}</Freeze>
);

/** Remotion's <Img> blocks the render until the image decodes.
 *
 *  Which behaviour is correct depends entirely on where we are. In the EDITOR, blocking would
 *  freeze the preview on a slow or dead URL, so this must stay a plain <img>. In a RENDER, NOT
 *  blocking means the frame is captured before the picture arrives and the export ships an empty
 *  box — so there we do hold the frame, like Remotion's own <Img>.
 *
 *  Fails OPEN after a budget: one dead URL degrades to a missing image rather than running out
 *  Remotion's delayRender timeout and failing a paid export. */
export const Img: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = (props) => {
  const [handle] = useState(() =>
    rGetEnv().isRendering && props.src ? rDelayRender(`malloy <Img> ${String(props.src).slice(0, 60)}`) : null);
  useEffect(() => {
    if (handle == null) return;
    let released = false;
    const release = () => { if (!released) { released = true; rContinueRender(handle); } };
    const budget = setTimeout(release, 8000);
    const im = new Image();
    im.onload  = () => { Promise.resolve(im.decode?.()).catch(() => {}).then(release); };
    im.onerror = release;
    im.src = String(props.src);
    return () => { clearTimeout(budget); release(); };
  }, [handle, props.src]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ''} />;
};

/** Imported templates that reference a bundled asset. Nothing in the vendored set actually calls
 *  it (the transform leaves the import behind), but a missing named export is a webpack warning
 *  in the Lambda bundle, so it passes straight through to Remotion's own. */
export { staticFile } from 'remotion';

/** <Series> lays its children out back to back. One imported template uses it. */
type SeriesSeqProps = { durationInFrames: number; offset?: number; children?: React.ReactNode };
const SeriesSequence: React.FC<SeriesSeqProps> = ({ children }) => <>{children}</>;
export const Series: React.FC<{ children?: React.ReactNode }> & { Sequence: React.FC<SeriesSeqProps> } =
  Object.assign(
    ({ children }: { children?: React.ReactNode }) => {
      let cursor = 0;
      const kids = Children.toArray(children).filter(isValidElement) as ReactElement<SeriesSeqProps>[];
      return (
        <>
          {kids.map((child, i) => {
            const from = cursor + (child.props.offset ?? 0);
            cursor = from + (child.props.durationInFrames ?? 0);
            return (
              <Sequence key={i} from={from} durationInFrames={child.props.durationInFrames}>
                {child.props.children}
              </Sequence>
            );
          })}
        </>
      );
    },
    { Sequence: SeriesSequence },
  );
