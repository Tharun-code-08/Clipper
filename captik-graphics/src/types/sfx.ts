/** A sound the USER placed, as opposed to a cue a graphics template carries.
 *
 *  Template cues are derived (registry.graphicsSfxCues) and move with their graphic. These are
 *  independent: they sit on their own timeline lane, keep their own source-clock time, and survive
 *  the graphic being deleted. Same bank, two very different lifetimes. */
export interface SfxInstance {
  /** 'sx_<base36>'. Stable for the life of the placement. */
  id: string;
  /** A bank id (see sfxIds.ts) — or, for a generated sound, the key under `src`. */
  sfxId: string;
  /** SOURCE-clock ms, the same clock as TranscriptWord and GraphicsInstance.startMs. */
  atMs: number;
  /** 0..1.5, matching the range the cue invariants allow. */
  gain: number;
  /** Shown on the timeline chip. Defaults to the bank label. */
  label?: string;
  /** GENERATED sounds only: the audio itself, as a data URI. Bank sounds leave this undefined and
   *  resolve through sfxLoader instead, so a project never carries 2.4MB of bank with it. */
  src?: string;
}

export const newSfxInstance = (
  sfxId: string,
  atMs: number,
  extra?: Partial<SfxInstance>,
): SfxInstance => ({
  id: `sx_${Math.random().toString(36).slice(2, 10)}`,
  sfxId,
  atMs: Math.max(0, Math.round(atMs)),
  gain: 0.8,
  ...extra,
});
