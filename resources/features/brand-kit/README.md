# Brand kit: logo, colours and fonts applied in preview and every export

Snapshot of Captik's `feat/brand-kit` branch at `0cfface` (branched from master `6a07dae`), for porting into the clipper.
Captik has not shipped this to production yet; treat it as working, reviewed reference code, not a dependency.

- `src/`, `scripts/`: every file the branch added or changed, as it is at the branch tip (the editor page itself is left
  out; see the patch for how it was wired).
- `brand-kit.patch`: the whole branch diff against master, including how it was wired into Captik's editor page
  (`src/app/editor/page.tsx`), so you can see every call site.

## What the branch did, commit by commit

- `6ffaf25` Brand Kit: the colour-role mapping, the logo overlay every renderer draws
- `0cfface` Brand Kit: the panel, and the kit wired through preview and every export
