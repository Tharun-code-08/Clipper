'use client';

// PREVIEW playback for graphics sound cues. One lazy AudioContext, decoded buffers cached per
// sound id, cues fired when the playhead CROSSES them during normal playback — never on seeks
// (a scrub jump would machine-gun every cue in between) and never while paused.
//
// Exports do NOT use this: the Remotion compositions mix the same cues into the rendered audio
// via <Audio> sequences, both derived from registry.graphicsSfxCues(). One cue list, two clocks.

import { useEffect, useMemo, useRef } from 'react';
import type { GraphicsInstance } from '@/types/graphics';
import type { SfxInstance } from '@/types/sfx';
import { graphicsSfxCues } from './registry';
import { useImportedTemplatesFor } from './useImportedTemplates';
import { loadSfx, sfxReady, sfxUri } from './sfxLoader';

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();

function bufferFor(id: string): Promise<AudioBuffer> | null {
  const uri = sfxUri(id);
  if (!uri || !ctx) return null;
  let p = buffers.get(id);
  if (!p) {
    const c = ctx;
    p = fetch(uri).then((r) => r.arrayBuffer()).then((ab) => c.decodeAudioData(ab));
    buffers.set(id, p);
  }
  return p;
}

/** Play an arbitrary audio URL / data URI. GENERATED sounds are not in the bank — they belong to
 *  one project and travel inside it — so they cannot go through bufferFor(), which is keyed on
 *  bank ids. Decoded buffers are cached by src, so auditioning the same one repeatedly is free. */
export function playSfxSrc(src: string, gain = 1): void {
  if (!src) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const c = ctx;
    let p = buffers.get(src);
    if (!p) {
      p = fetch(src).then((r) => r.arrayBuffer()).then((ab) => c.decodeAudioData(ab));
      buffers.set(src, p);
    }
    void p.then((buf) => {
      if (!ctx) return;
      const node = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = Math.max(0, Math.min(1.5, gain)) * 0.9;
      node.buffer = buf;
      node.connect(g).connect(ctx.destination);
      node.start();
    }).catch(() => { /* undecodable — stay silent */ });
  } catch { /* no AudioContext (SSR / blocked) — stay silent */ }
}

/** Fire-and-forget. Safe to call from event handlers and effects; silently no-ops if the
 *  browser blocks audio (no gesture yet) or the id is unknown. */
export function playSfx(id: string, gain = 1): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const p = bufferFor(id);
    if (!p) return;
    void p.then((buf) => {
      if (!ctx) return;
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = Math.max(0, Math.min(1.5, gain)) * 0.9;
      src.buffer = buf;
      src.connect(g).connect(ctx.destination);
      src.start();
    }).catch(() => { /* decode failed — stay silent */ });
  } catch { /* no AudioContext (SSR / blocked) — stay silent */ }
}

/** Mount once wherever the preview clock lives: fires each cue as the playhead crosses it.
 *  `active` = actually playing (not paused, not muted); seek jumps (>400ms between renders)
 *  fire nothing. */
/** Preview playback for PLACED sounds (user- or autopilot-placed SfxInstances) — the
 *  exports mix these via <Audio> sequences, but the live preview had NO player for
 *  them ("I heard no sfx" was literal: only template cues ever sounded live). Same
 *  crossing rules as useGraphicsSfx: fire when the playhead crosses, never on seeks. */
export function usePlacedSfx(
  sfx: readonly SfxInstance[] | undefined,
  currentTimeMs: number,
  active: boolean,
): void {
  useEffect(() => {
    if (sfx?.length && !sfxReady()) void loadSfx().catch(() => { /* silence is a fine fallback */ });
  }, [sfx]);
  const prevRef = useRef(currentTimeMs);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = currentTimeMs;
    if (!active || !sfx?.length) return;
    const dt = currentTimeMs - prev;
    if (dt <= 0 || dt > 400) return;
    for (const s of sfx) {
      if (s.atMs > prev && s.atMs <= currentTimeMs) {
        if (s.src) playSfxSrc(s.src, s.gain);
        else playSfx(s.sfxId, s.gain);
      }
    }
  }, [currentTimeMs, active, sfx]);
}

export function useGraphicsSfx(
  graphics: readonly GraphicsInstance[] | undefined,
  currentTimeMs: number,
  active: boolean,
): void {
  // Cues are read off the template, so an imported graphic has none until its chunk lands —
  // recompute when it does, or the preview plays the authored cues and silently drops the rest.
  const importsReady = useImportedTemplatesFor(graphics);
  // `importsReady` looks unused to the linter because it is not read in the body — it is here on
  // purpose. What changed is the REGISTRY, not the arguments, so this is the only signal that the
  // same `graphics` now resolve to templates that actually have cues.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cues = useMemo(() => graphicsSfxCues(graphics), [graphics, importsReady]);

  // The bank is code-split. Fetch it as soon as we know there ARE cues, rather than when the
  // playhead reaches the first one — otherwise that first cue is silent while it downloads.
  useEffect(() => {
    if (cues.length && !sfxReady()) void loadSfx().catch(() => { /* silence is a fine fallback */ });
  }, [cues]);
  const prevRef = useRef(currentTimeMs);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = currentTimeMs;
    if (!active || !cues.length) return;
    const dt = currentTimeMs - prev;
    if (dt <= 0 || dt > 400) return;
    for (const c of cues) {
      if (c.ms > prev && c.ms <= currentTimeMs) playSfx(c.id, c.gain);
    }
  }, [currentTimeMs, active, cues]);
}
