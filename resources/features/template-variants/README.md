# Template variants: 123 curated override bundles across 34 caption templates

Snapshot of Captik's `feat/template-variants` branch at `dad1b4d` (branched from master `6a07dae`), for porting into the clipper.
Captik has not shipped this to production yet; treat it as working, reviewed reference code, not a dependency.

- `src/`, `scripts/`: every file the branch added or changed, as it is at the branch tip (the editor page itself is left
  out; see the patch for how it was wired).
- `template-variants.patch`: the whole branch diff against master, including how it was wired into Captik's editor page
  (`src/app/editor/page.tsx`), so you can see every call site.

## What the branch did, commit by commit

- `dad1b4d` Template variants: 123 curated override bundles across 34 templates
