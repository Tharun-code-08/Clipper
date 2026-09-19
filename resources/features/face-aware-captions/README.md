# Face-aware captions: keep caption lines off faces

Snapshot of Captik's `feat/face-aware-captions` branch at `936e2b6` (branched from master `6a07dae`), for porting into the clipper.
Captik has not shipped this to production yet; treat it as working, reviewed reference code, not a dependency.

- `src/`, `scripts/`: every file the branch added or changed, as it is at the branch tip (the editor page itself is left
  out; see the patch for how it was wired).
- `face-aware-captions.patch`: the whole branch diff against master, including how it was wired into Captik's editor page
  (`src/app/editor/page.tsx`), so you can see every call site.

## What the branch did, commit by commit

- `b42a598` Keep captions off faces: auto per-line positions that clear the speaker's face
- `d926dbd` Keep captions off faces: say why a caption stayed where it is
- `936e2b6` Keep captions off faces: move when nothing clears but one spot is far better
