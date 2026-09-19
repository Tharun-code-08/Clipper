# Look specs: impact words, depth (text behind subject), grouping and layout rules per look

Snapshot of Captik's `feat/look-specs` branch at `a0bc595` (branched from master `6a07dae`), for porting into the clipper.
Captik has not shipped this to production yet; treat it as working, reviewed reference code, not a dependency.

- `src/`, `scripts/`: every file the branch added or changed, as it is at the branch tip (the editor page itself is left
  out; see the patch for how it was wired).
- `look-specs.patch`: the whole branch diff against master, including how it was wired into Captik's editor page
  (`src/app/editor/page.tsx`), so you can see every call site.

## What the branch did, commit by commit

- `24603c1` Captions no longer clip at the sides: the fit guard's width estimate is measured, not guessed
- `0493d99` Blockbuster: an all-caps word in the script line no longer runs off the frame
- `dad1b4d` Template variants: 123 curated override bundles across 34 templates
- `9f5656c` wip: look-spec engine before merging the fit-guard fix
- `a4e3f14` Merge the measured fit guard into the look engine
- `ec21812` Look specs: a caption look as a data row, not a new render branch
- `92cb82e` Look specs batch 2: chips, pop entrances, and the script/display/pixel faces
- `f8c282b` Emphasis captions: fit the hero word in the face it is actually drawn in
- `6bfc947` Cut the look-alikes; add stacked lockups and behind-the-speaker looks
- `29aafdb` Look engine: their catalogue's parameters, measured, deduplicated and categorised
- `dc9cb43` Behind the speaker: match their measured geometry, not a guess
- `4435227` Look engine: gradient text fills and per-word jitter
- `b386281` Subject outline: a ring around the cut-out, for the sticker-style looks
- `ed5a85b` Narrow to three classes, and place every look from measured frames
- `c796978` Place every look from their previews measured at 30fps, not from sampled stills
- `1b6b345` Measure the caption BLOCK, not its brightest row — four templates had the wrong shape
- `7c0df30` Nine more looks were sitting on a class constant they do not match
- `e819390` Ten previews were on disk under names I never looked for
- `baab129` The last six take their position from the registry, labelled as declared not measured
- `4131ae1` Turn this session's placement bugs into tests that fail when they come back
- `394b5d4` Colour: 33 looks were painting plain white where their design is tinted, and the dim multiplied
- `1e0e7a6` Entrances come from the look: timed, directional, and honoured on every render path
- `7899067` Variety: phrases cycle through front, behind and an arc, as their registry and footage show
- `94db580` Inception: the accent word shows the video colour-inverted, through the export's scale layer
- `137c07b` Neon: a halo around the text, fitted to the falloff measured on their footage
- `3ff43f2` Stack rows: gap in the row's own units, and the tight lockups spaced as their footage shows
- `9ca1d40` Popoff: Yawl is a zigzag lockup — context flush left, accent words flush right
- `5e5e875` Inception is a difference against the accent colour; Mizzen gets it, and stacks accent by emphasis
- `1b2bec9` Exit fades from their rows; fades that keep inception alive; no blink; a probe artefact removed
- `f40f40c` Record what Focusline's height changes are, and why they are not modelled
- `a2fa116` Face track, part 1: read the speaker's face from the cut-out model's own pass
- `de25369` Face track, part 2: place Focusline against the speaker's face, in every render route
- `78083d9` Impact words: the giant word behind the speaker, on 14 behind designs
- `d223e7a` Lockup and stack looks: their faces, and the lockups their frames show
- `1aa509c` A wrapped design keeps its accent scale on the emphasised row
- `ce0f302` Impact words are chosen by their rules, and a dropped impact word stays in the row in capitals
- `c2cf812` Focusline: the band comes from the phrase's own text, as their planner decides it
- `3d8c309` Dynamic layout: a zone per phrase, seeded by the caption's key, as their planner picks it
- `08675fd` Entrances by role, a hero up from the clip start, and captions that linger
- `63c430b` looks: Rudder's letter-mask plate, and stack rows broken and scaled their way
- `6e0d1b9` looks: depth treatment — a word behind the subject softens by how much the person covers it
- `9466e3b` looks: a look groups the transcript into captions their way, and holds a short caption 0.9s
- `1802795` looks: Gable is their agent story — a planned scene, not a lockup
- `0d6e7fe` looks: Gable groups up to their sixteen words (agent-story maxWordsPerLine)
- `06b7dd1` looks: Hassock, Iron and Jamb are their property reels — Number Story, Gradient Estate, Dimension Story
- `f67a808` fonts: Roboto 700 and Alex Brush, for the property reels
- `a0bc595` looks: the cloud renders carry the subject grid, so exports treat depth and place the scenes as the preview does
