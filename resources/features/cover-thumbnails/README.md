# Cover thumbnails: best frame, cut-out subject, headline placed clear of the face

Snapshot of Captik's `feat/cover-thumbnails` branch at `55da275` (branched from master `6a07dae`), for porting into the clipper.
Captik has not shipped this to production yet; treat it as working, reviewed reference code, not a dependency.

- `src/`, `scripts/`: every file the branch added or changed, as it is at the branch tip (the editor page itself is left
  out; see the patch for how it was wired).
- `cover-thumbnails.patch`: the whole branch diff against master, including how it was wired into Captik's editor page
  (`src/app/editor/page.tsx`), so you can see every call site.

## What the branch did, commit by commit

- `9dfee5a` cover: pure layout for thumbnail covers (presets, cover-fit crop, seed, entitlement)
- `c43e49b` cover: exact frame capture + single-frame subject cut-out
- `32d56a8` cover: CoverStage (preview = export) + in-browser still export
- `917959d` cover: Cover tab in the editor (desktop + mobile), persisted per project
- `bd2199e` cover: composite the frame and cut-out pixels in the still export
- `55da275` cover: keep the headline clear of the cut-out subject by default
