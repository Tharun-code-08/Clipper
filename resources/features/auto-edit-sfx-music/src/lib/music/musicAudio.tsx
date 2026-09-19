'use client';

// Remotion side of background music: ONE <Audio> for the whole video, whose volume follows the
// duck curve computed from the caption words (./duck). Mounted by both render compositions
// (Lambda/box and the in-browser WebCodecs one) so a track sounds the same wherever it renders.
//
// The curve is a pure function of the frame, so every renderer — and every frame rendered out of
// order on Lambda — computes the identical gain without sharing state.
//
// Relative imports only: this file is bundled into the Remotion site, which has no '@' alias.

import { Audio } from '@remotion/media';
import { Sequence, useVideoConfig } from 'remotion';
import { duckGainAt, duckWindows, type DuckWindow } from './duck';

export interface MusicRenderProps {
  /** Playable URL for the track (data: or blob: — the renderer fetches it). */
  src: string;
  /** Track volume before ducking. */
  gain: number;
  /** How far it steps back under speech, dB (0 = never). */
  duckDb: number;
  /** Where the track starts against the video, EXPORT-clock ms. */
  startMs: number;
  fadeInMs: number;
  fadeOutMs: number;
}

/** Linear fade at the head and tail of the video, so music never starts or stops abruptly. */
function edgeFade(ms: number, durationMs: number, fadeInMs: number, fadeOutMs: number): number {
  const inF = fadeInMs > 0 ? Math.min(1, ms / fadeInMs) : 1;
  const outF = fadeOutMs > 0 ? Math.min(1, Math.max(0, durationMs - ms) / fadeOutMs) : 1;
  return Math.max(0, Math.min(1, Math.min(inF, outF)));
}

export function MusicAudio({
  music,
  words,
}: {
  music: MusicRenderProps;
  /** Caption words on the EXPORT clock — the voice the music gets out of the way of. */
  words: readonly { startMs: number; endMs: number }[];
}) {
  const { fps, durationInFrames } = useVideoConfig();
  const durationMs = (durationInFrames / fps) * 1000;
  const windows: DuckWindow[] = duckWindows(words);
  const fromFrame = Math.max(0, Math.round((music.startMs / 1000) * fps));
  if (fromFrame >= durationInFrames) return null;   // starts after the video ends
  // A Sequence shifts the track; its volume callback counts frames from the sequence, so the duck
  // curve is read on the VIDEO clock — otherwise a delayed track ducks against the wrong moments.
  const volume = (frame: number) => {
    const ms = ((frame + fromFrame) / fps) * 1000;
    return duckGainAt(ms, windows, music.gain, music.duckDb) * edgeFade(ms, durationMs, music.fadeInMs, music.fadeOutMs);
  };
  return (
    <Sequence from={fromFrame} durationInFrames={durationInFrames - fromFrame} layout="none">
      <Audio src={music.src} volume={volume} />
    </Sequence>
  );
}
