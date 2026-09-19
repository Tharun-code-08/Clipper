# Resources

Finished work from Captik to build on (see [TASKS.md](../TASKS.md)). None of it is wired into the clipper yet.

## `features/`: Captik feature branches, ready to port

Each folder holds:
- every file the branch added or changed (at the branch tip, same paths as Captik's `src/`);
- `<name>.patch`, the full branch diff against Captik master, including how it was wired into Captik's editor page;
- a `README.md` listing what each commit did.

| Folder | Captik branch | What it gives you |
|---|---|---|
| `auto-edit-sfx-music` | `feat/cut-sfx` | Local silence/filler/retake detector (no model call), cutting and time remapping, a license-free synthesized SFX library with export mixing, background music that ducks under the voice, audio cleanup (noise + loudness) |
| `brand-kit` | `feat/brand-kit` | Brand kit panel and store: logo watermark, brand colours and fonts, applied in preview and every export |
| `cover-thumbnails` | `feat/cover-thumbnails` | Cover/thumbnail generator: best-frame capture, subject cut-out, headline placed clear of the face, export |
| `face-aware-captions` | `feat/face-aware-captions` | Face grid sampling and caption placement that keeps lines off faces |
| `template-variants` | `feat/template-variants` | 123 curated override bundles across 34 caption templates |
| `look-specs` | `feat/look-specs` | Look specs: impact words, depth (text behind the subject), grouping, stacked rows, letter masks, property-reel scenes |

These paths use Captik's `@/…` imports. When porting, either copy a module next to the code that uses it and fix its
imports, or pull the whole feature through `scripts/sync-captik.mjs` by adding its entry files to a profile.

## Elsewhere in the repo

- `captik-graphics/` holds:
  - the motion-graphics system (1,641 templates) and its export composition;
  - the b-roll library (`src/lib/autopilot/brollLibrary.ts`, `brollCatalogue.json`);
  - `scripts/broll_ingest.mjs` to fill it from Pexels/Pixabay.
- `.claude/skills/` has four shortform-video skills: pipeline, edit plan, motion design, branding.
