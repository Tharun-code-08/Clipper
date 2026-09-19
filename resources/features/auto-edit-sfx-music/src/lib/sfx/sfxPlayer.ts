'use client';

// PREVIEW playback for placed sound effects. One lazy AudioContext, decoded buffers cached per
// sound id. Exports do NOT use this — the Remotion compositions (and the in-browser mux) mix the
// same SfxInstance list into the rendered audio.

import { useEffect, useRef } from 'react';
import type { SfxInstance } from '@/types/sfx';
import { loadSfx, sfxReady, sfxUri } from './sfxLoader';

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();

function audioCtx(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null; // SSR / blocked
  }
}

function bufferFor(c: AudioContext, id: string): Promise<AudioBuffer> | null {
  const uri = sfxUri(id);
  if (!uri) return null;
  let p = buffers.get(id);
  if (!p) {
    p = fetch(uri).then((r) => r.arrayBuffer()).then((ab) => c.decodeAudioData(ab));
    p.catch(() => buffers.delete(id));
    buffers.set(id, p);
  }
  return p;
}

/** Fire-and-forget. `delayMs` schedules on the audio clock (sample-accurate lookahead). Silently
 *  no-ops when audio is blocked, the bank has not loaded, or the id is unknown. */
export function playSfx(id: string, gain = 1, delayMs = 0): void {
  const c = audioCtx();
  if (!c) return;
  const run = () => {
    const p = bufferFor(c, id);
    if (!p) return;
    const startAt = c.currentTime + Math.max(0, delayMs) / 1000;
    void p.then((buf) => {
      const src = c.createBufferSource();
      const g = c.createGain();
      g.gain.value = Math.max(0, Math.min(1.5, gain));
      src.buffer = buf;
      src.connect(g).connect(c.destination);
      src.start(Math.max(c.currentTime, startAt));
    }).catch(() => { /* undecodable — stay silent */ });
  };
  if (sfxReady()) run();
  else void loadSfx().then(run).catch(() => { /* chunk failed — stay silent */ });
}

const LOOKAHEAD_MS = 90;   // page time updates arrive every ~50ms; schedule a beat ahead
const LATE_MS = 150;       // a sound whose moment passed longer ago than this is skipped
const JUMP_MS = 400;       // bigger playhead moves are seeks/skips, which fire nothing

/** Mount once where the preview clock lives. Fires each placed sound as the playhead reaches it
 *  during playback, scheduled on the audio clock so it lands on its frame rather than up to one
 *  UI tick late. Seeks (and Auto-Edit skips) fire nothing — pass only the AUDIBLE sounds. */
export function usePlacedSfx(
  sfx: readonly SfxInstance[] | undefined,
  currentTimeMs: number,
  active: boolean,
): void {
  useEffect(() => {
    if (sfx?.length && !sfxReady()) void loadSfx().catch(() => { /* silence is a fine fallback */ });
  }, [sfx]);

  const prevRef = useRef(currentTimeMs);
  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = currentTimeMs;
    const list = sfx ?? [];
    const dt = currentTimeMs - prev;
    if (!active || dt < 0 || dt > JUMP_MS) {
      // Paused, or the playhead jumped: re-arm everything still ahead, disarm everything behind.
      firedRef.current = new Set(list.filter((s) => s.atMs <= currentTimeMs).map((s) => s.id));
      return;
    }
    for (const s of list) {
      if (firedRef.current.has(s.id)) continue;
      const lead = s.atMs - currentTimeMs;
      if (lead > LOOKAHEAD_MS) continue;
      firedRef.current.add(s.id);
      if (lead < -LATE_MS) continue;
      playSfx(s.sfxId, s.gain, Math.max(0, lead));
    }
  }, [currentTimeMs, active, sfx]);
}
