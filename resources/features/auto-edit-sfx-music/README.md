# Silence, filler and retake removal, license-free sound effects, background music with ducking, audio cleanup

Snapshot of Captik's `feat/cut-sfx` branch at `085942c` (branched from master `6a07dae`), for porting into the clipper.
Captik has not shipped this to production yet; treat it as working, reviewed reference code, not a dependency.

- `src/`, `scripts/`: every file the branch added or changed, as it is at the branch tip (the editor page itself is left
  out; see the patch for how it was wired).
- `auto-edit-sfx-music.patch`: the whole branch diff against master, including how it was wired into Captik's editor page
  (`src/app/editor/page.tsx`), so you can see every call site.

## What the branch did, commit by commit

- `084c648` Auto-Edit A1: local silence/filler/retake detector (no model call)
- `4535ce9` Auto-Edit A2: one-click tab, preview skipping, cuts on the timeline
- `1c59dc5` Auto-Edit A3: every export route plays the cut
- `e668a5a` Sounds B1: license-free SFX library, placed on the video
- `a376b35` Sounds B2: every export mixes the placed sound effects
- `e4fa893` Auto-Edit + Sounds: dev-only UI harness, clearer switch and pins
- `e28cf0e` Clean up audio: measured noise reduction and loudness on export
- `304d49d` Auto-Edit: a spoken restart marker carries a retake that has one content word
- `085942c` Background music that steps back under the voice
