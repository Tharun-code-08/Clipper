// Auto-mute ("bleep") of profanity was removed: the detector matched substrings
// (e.g. "ass" inside "asset"), muting legitimate words. The BleepRange type is kept
// so the (now always-empty) audio-mute plumbing in the editor/exports still compiles;
// nothing populates it any more, so no word is ever muted.
export interface BleepRange {
  startMs: number;
  endMs:   number;
}
