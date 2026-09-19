// On-demand access to the sound bank.
//
// sfxBank.ts is ~2.4MB of 44.1kHz stereo audio as data URIs. Most exports and most editor
// sessions never place a graphic at all, and a project with no graphics has no cues to play, so
// it has no business paying for the bank. This is the same shape as loadImportedTemplates() in
// registry.ts: one dynamic import, an idempotent promise, and a synchronous reader for everything
// downstream that cannot become async.
//
// Import sfxIds.ts to NAME a sound. Import this to PLAY one. Never import sfxBank.ts directly —
// registry.spec.ts fails the build if anything does, because a single static import would put all
// 2.4MB back in the main bundle with nothing to show for it.

import type { SfxId } from './sfxIds';

let bank: Record<SfxId, string> | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** True once the audio is in memory — i.e. sfxUri() will return something. */
export const sfxReady = (): boolean => bank !== null;

export function subscribeSfx(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Fetch the bank. Idempotent, and concurrent callers share one in-flight import.
 *
 *  Rejects only if the chunk itself fails to load. Callers should catch and carry on: silence is
 *  a degraded graphic, not a broken one, and it must never fail an export. */
export function loadSfx(): Promise<void> {
  if (bank) return Promise.resolve();
  inFlight ??= import('./sfxBank').then((m) => {
    bank = m.SFX;
    for (const fn of listeners) fn();
  });
  return inFlight;
}

/** The data URI for a cue, or undefined if the bank has not landed yet (or the id is unknown).
 *  Synchronous by design — the render path reads this while building elements. */
export const sfxUri = (id: string): string | undefined =>
  (bank as Record<string, string> | null)?.[id];
