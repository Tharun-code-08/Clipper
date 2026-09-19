'use client';

// Remotion wrapper for the cover still: mounts the SAME CoverStage the editor previews, and holds the
// capture until (a) every caption face is actually decoded and (b) any image layer has loaded and
// decoded. document.fonts.ready alone resolves while a never-used face is still unloaded, so each
// family is force-loaded first — the same gate the video export compositions use.
//
// The download renders this with `transparent` and no image layers (coverExport composites the frame
// and cut-out itself); the image gate still protects any caller that passes them.

import { useCallback, useEffect, useState } from 'react';
import { AbsoluteFill, cancelRender, continueRender, delayRender } from 'remotion';
import CoverStage, { type CoverStageProps } from '@/components/editor/cover/CoverStage';
import { buildFontsCss, buildIndicFontsCss } from './KineticCaptionComposition';
import { fontFamiliesFromCss } from '@/lib/fontFamilies';

export type CoverCompositionProps = Omit<CoverStageProps, 'onReady'>;

export function CoverComposition(props: CoverCompositionProps) {
  const [handle] = useState(() => delayRender('Cover: fonts + images'));
  const [fontsReady, setFontsReady] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const done = () => { if (alive) setFontsReady(true); };
    if (typeof document === 'undefined' || !document.fonts) { done(); return; }
    const families = fontFamiliesFromCss(buildFontsCss() + buildIndicFontsCss(props.text));
    Promise.all(families.flatMap(f => [
      document.fonts.load(`64px "${f}"`).catch(() => {}),
      document.fonts.load(`italic 64px "${f}"`).catch(() => {}),
    ]))
      .then(() => document.fonts.ready)
      .then(done, done);
    return () => { alive = false; };
  }, [props.text]);

  useEffect(() => {
    if (fontsReady && imagesReady) continueRender(handle);
  }, [fontsReady, imagesReady, handle]);

  // A layer without pixels must FAIL the render (the caller retries / shows an error) — never export a
  // cover missing its frame or cut-out.
  const onReady = useCallback((ok: boolean) => {
    if (ok) setImagesReady(true);
    else cancelRender(new Error('cover-image-not-loaded'));
  }, []);

  return (
    <AbsoluteFill style={{ backgroundColor: props.transparent ? 'transparent' : '#000' }}>
      <CoverStage {...props} onReady={onReady} />
    </AbsoluteFill>
  );
}
