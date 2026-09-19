'use client';

// Remotion side of placed sound effects: one <Sequence><Audio/></Sequence> per sound, mixed into
// the rendered audio by whichever renderer runs the composition (Lambda / the render box via
// LambdaCaptionComposition, the in-browser WebCodecs renderer via CaptionExportComposition).
//
// The bank is code-split, so the render WAITS for it — but only when the project actually has
// sounds. It fails OPEN: a bank that cannot load means silent sounds, never a failed export.
//
// Relative imports only: this file is bundled into the Remotion site, which has no '@' alias.

import { useEffect, useState } from 'react';
import { Sequence, continueRender, delayRender, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import type { SfxInstance } from '../../types/sfx';
import { loadSfx, sfxReady, sfxUri } from './sfxLoader';

/** Longest tail any bank sound needs (applause / drumroll / suspense run a few seconds). */
const MAX_SFX_SEC = 6;

export function PlacedSfxAudio({ sfx }: { sfx: readonly Pick<SfxInstance, 'id' | 'sfxId' | 'atMs' | 'gain'>[] }) {
  const { fps, durationInFrames } = useVideoConfig();
  const [pending] = useState(() => sfx.length > 0 && !sfxReady());
  const [ready, setReady] = useState(() => !pending);
  const [handle] = useState(() => (pending ? delayRender('Loading sound effects') : null));

  useEffect(() => {
    if (handle == null) return;
    let alive = true;
    loadSfx()
      .catch(() => { /* fail open — the export ships without these sounds */ })
      .finally(() => {
        if (alive) setReady(true);
        continueRender(handle);
      });
    return () => { alive = false; };
  }, [handle]);

  if (!ready || sfx.length === 0) return null;
  return (
    <>
      {sfx.map((s, i) => {
        const uri = sfxUri(s.sfxId);
        if (!uri) return null;
        const from = Math.round((s.atMs / 1000) * fps);
        if (!Number.isFinite(from) || from < 0 || from >= durationInFrames) return null;
        const frames = Math.max(1, Math.min(Math.ceil(fps * MAX_SFX_SEC), durationInFrames - from));
        return (
          <Sequence key={`sfx-${s.id}-${i}`} from={from} durationInFrames={frames} layout="none">
            <Audio src={uri} volume={Math.max(0, Math.min(1.5, s.gain))} />
          </Sequence>
        );
      })}
    </>
  );
}
