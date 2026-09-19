// On-demand access to the sound-effects bank.
//
// sfxBank.ts is the bank's audio as data URIs. Most editor sessions and most exports never place
// a sound, so they have no business paying for it. One dynamic import, an idempotent promise, and
// a synchronous reader for code that cannot become async (render paths building elements).
//
// Import sfxIds.ts to NAME a sound. Import this to PLAY one. Never import sfxBank.ts directly —
// sfx.spec.ts fails if anything does, because one static import puts the whole bank back in the
// main bundle, silently.

import type { SfxId } from './sfxIds';

let bank: Record<SfxId, string> | null = null;
let inFlight: Promise<void> | null = null;

/** True once the audio is in memory — i.e. sfxUri() will return something. */
export const sfxReady = (): boolean => bank !== null;

/** Fetch the bank. Idempotent; concurrent callers share one in-flight import. Rejects only if the
 *  chunk itself fails to load (and a later call retries). Callers catch and carry on: a silent
 *  sound is a degraded edit, never a broken export. */
export function loadSfx(): Promise<void> {
  if (bank) return Promise.resolve();
  inFlight ??= import('./sfxBank')
    .then((m) => { bank = m.SFX; })
    .catch((e) => { inFlight = null; throw e; });
  return inFlight;
}

/** The data URI for a bank id, or undefined if the bank has not landed yet (or the id is unknown). */
export const sfxUri = (id: string): string | undefined =>
  (bank as Record<string, string> | null)?.[id];
