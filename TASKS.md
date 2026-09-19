# Captik Clipper — what to build next

**Owner:** @Tharun-code-08 · **Written:** 2026-09-20 · Read [README.md](README.md) first (how the pipeline works today), then this.

The clipper already turns one long video into up to ten captioned, scored shorts, with a studio to trim and restyle
them. This brief takes it to a complete clipping product:

1. start-of-run toggles for **B-roll** and **Motion graphics**;
2. **b-roll in every clip** when it is on;
3. **complete use of all 1,641 motion-graphics templates**;
4. the essentials every clipping tool needs.

Everything you need to start is in this repo (see [Resources](#5-resources-in-this-repo)).

---

## 0. Ground rules

- **Captik UI/UX continuity.** Every screen stays Captik's. The studio *is* Captik's editor components (`captik/src`), and the
  home copies Captik's dashboard class for class. New UI reuses Captik's pieces:
  - components: `Tooltip`, `ProgressBar`, `SliderRow`, `Segmented`, `ToggleRow` (`captik/src/components/editor/panel/controls.tsx`), and the cards in `web/src/home/ui.jsx`;
  - look: `#0B0B0D` / `#09090d` surfaces, amber-500 actions, ClashDisplay page titles, Geist text.

  No new visual language.
- **Never edit `captik/src` or `captik-graphics/src` by hand.** They mirror Captik; re-sync with `npm run sync:captik`. Your code
  goes in `src/` (server) and `web/src/` (UI), importing from the vendored trees.
- **Licensing:**
  - **Sound effects:** never add Captik's premium `sfxBank.ts`. It is Epidemic Sound and other packs; `captik-graphics/shims/sfxBank.ts` is the license-free stand-in. Only synthesized or properly licensed audio.
  - **B-roll:** Pexels and Pixabay clips may be *composited into renders*, never served as a browsable or downloadable library.
  - **Malloy templates:** the 1,399 imported `ml_*` templates come from Malloy Studio's library and **their licence is not confirmed**. Keep them behind a setting (default off in anything shipped) until the owner confirms, and rehost the images they hotlink from `malloy.blob.core.windows.net`.
- **Secrets:** `.env` is never committed. Your keys are in issue #1.
- **Verify by rendering.** Render real frames of every visual change and look at them before calling it done (see the
  `shortform-video-pipeline` skill). Preview and export must match.

---

## 1. Start-of-run toggles: B-roll and Motion graphics

**Where:**
1. The *Prepare Your Clips* modal (`web/src/home/PrepareClipsModal.jsx`),
2. then `jobOptions()` in `server.js`,
3. stored as `job.input.broll` / `job.input.graphics`,
4. read by `src/pipeline.js`.

- Two switches in the modal's Clip Settings card, styled like Captik's `ToggleRow`: **B-roll** and **Motion graphics**,
  both **on** by default, remembered per browser.
- **Re-curate** keeps the run's choices. The cost estimate includes the extra model tokens when they are on.
- The run page header and the run card show which are on.
- The studio gets per-clip controls too: a b-roll lane and a graphics lane, and "remove all from this clip".

**Done when:**
- A run with both off produces exactly today's output.
- With both on, every clip gets inserts and graphics.
- The choice is visible on the run page.

---

## 2. B-roll in every clip

**Resources:**
- `captik-graphics/src/lib/autopilot/brollLibrary.ts` + `brollVocabulary.ts` pick *which* clip a sentence wants.
- `brollCatalogue.json` is the metadata for 1,008 clips across 44 topics.
- `captik-graphics/scripts/broll_ingest.mjs` + `broll_reindex.mjs` build the library.
- `captik-graphics/src/lib/autopilot/shotPlan.ts` plans inserts.
- `captik-graphics/src/remotion/` is the export composition that already draws inserts.

**1. Library.**
- Get a free Pexels API key (Pixabay is optional).
- Put `PEXELS_API_KEY=` in `captik-graphics/.env.local`.
- Run `node captik-graphics/scripts/broll_ingest.mjs --per 12`. Clips land in `captik-graphics/public/broll/` (gitignored; the full set is about 4.6 GB). Each one is single-shot checked, motion-classified and cropped to 1080×1920.
- Serve them to the renderer only: no listing endpoint.

**2. Selection.** Per clip, the stylist (`src/director.js`) returns 1–4 insert moments tied to concrete words in the
transcript (things, numbers, places). `brollLibrary` chooses a clip by topic, tags and motion. Rules:
- inserts are 1.2–3 s long;
- nothing covers the first 1.5 s (the hook) or a face-to-camera punchline;
- inserts are at least 4 s apart and fill at most 35% of the clip;
- captions stay on top, and the speaker's audio continues underneath.

When the library has no match, search Pexels live; if that also fails, skip the insert rather than force a generic one.

**3. Preview and export.**
- Inserts render as Remotion `Sequence`s with `OffthreadVideo` in both the studio preview and the export.
- A b-roll lane in the timeline lets you move, shorten, delete or **Replace** an insert. Replace offers the next best matches for that moment.

**4. Receipt.** Any API or search cost goes on the run's receipt.

**Done when:**
- In a 10-clip run, every clip with a concrete subject has at least one insert.
- A spot-check of 20 inserts shows they are on topic.
- Nothing covers the hook.
- Preview matches export.
- Turning b-roll off removes all inserts.

---

## 3. Complete use of all 1,641 motion-graphics templates

**Resources:**
- `captik-graphics/src/lib/graphics/`:
  - `registry.ts` is the catalogue;
  - `templates/` holds Captik's 242;
  - `malloy/` holds the 1,399 imported ones, loaded on demand.
- `components/editor/GraphicsOverlay.tsx` is *the* renderer, shared by preview and export.
- `components/editor/panel/GraphicsTab.tsx` + `GraphicsParamsPanel.tsx` are the picker and the auto-generated settings panel.
- `timelineDrag.ts`, `sfxPlayer.ts`, and `captik-graphics/src/remotion/` (the export composition that draws graphics).
- `npm run graphics:smoke` renders all 1,641 today and passes.

1. **Studio.**
   - Add Captik's Graphics tab to the right panel: search across all 1,641, categories, animated cards.
   - Place a graphic by clicking or dragging onto the timeline.
   - Edit its parameters, move and resize it on the canvas, delete it, and undo.
   - Add a graphics lane to `EditorTimeline`.
2. **Export.**
   - Render graphics in every clip export: adopt `captik-graphics/src/remotion/` or add `GraphicsOverlay` as a layer in the current `KineticCaption` bundle.
   - `@/` imports resolve per tree through `captik/vite-plugin.mjs`. The Remotion webpack bundle (`src/captikRender.js`) needs the same importer-aware resolution.
3. **AI placement.**
   - Give the stylist `graphicsCatalogForAi()` (registry.ts).
   - It returns per-clip placements: `{templateId, atMs, durationMs, box, params}`, with params filled from the transcript (numbers, names, lists, the hook line).
   - Validate the result:
     - the template id exists;
     - params match their `ParamDef` types;
     - graphics are at least 3.5 s apart and fill at most 40% of the clip;
     - nothing covers a face;
     - a title card is allowed in the first second.
   - Ask for variety: no template twice in a clip, and spread categories across a run.
4. **"Complete use" is measured, not assumed.**
   - Every template can be reached from the picker *and* from the AI.
   - Every template renders in preview *and* export. Extend `graphics:smoke` to export a short MP4 for a sample of each category and compare it with the preview frames; they must be visually identical.
   - Keep a coverage report of which templates the AI used across runs, and weight the catalogue toward unused ones.
5. **Sound.**
   - Templates cue sounds, and the stand-in bank voices every cue license-free.
   - Mix those cues into the export too. `resources/features/auto-edit-sfx-music/src/lib/sfx/sfxMix.ts` shows how Captik did it.
6. **Imported library.** The `ml_*` templates are gated by a setting until their licence is confirmed (see Ground rules).

**Done when:**
- `graphics:smoke` renders 1,641 of 1,641.
- With graphics on, the AI places graphics on at least 80% of clips.
- Preview matches export.
- Toggling graphics off removes them all.

---

## 4. Clipping-tool essentials

✅ done · 🟡 partly there · ⬜ to build. Each ⬜ has a resource where Captik already solved it.

### Input and processing
- ✅ Links (YouTube, Google Drive, Instagram, TikTok, X, Facebook, LinkedIn, Vimeo) and uploads up to 3 hours.
- ⬜ **Process only part of a video.** Add a start/end picker to the Prepare modal, so nothing outside the range is transcribed or paid for.
- ⬜ **Clip length presets** (15–30 s, 30–60 s, 60–90 s) and **"find clips about …"**, a topic prompt passed to the curator.
- 🟡 **Language and caption script per run.**
  - Add a language picker (auto, Hindi, Hinglish, English, Tamil, …).
  - Choose Roman or native script per run. Today that is `.env CAPTION_SCRIPT`.
- ⬜ **A queue that survives a restart.**
  - Persist the job queue and resume after a restart. Today a restart marks running jobs as failed.
  - Retry failed downloads with backoff.

### AI selection
- ✅ Up to 10 clips, virality score, ratings that train the curator.
- ⬜ **Hook title** in the first 2 s: a rewritten hook line placed as a graphics title card.
- 🟡 **Per-platform copy.** Titles, descriptions and hashtags for YouTube Shorts, Reels and TikTok. Today there is one caption plus hashtags per clip.
- ⬜ **"Find more"**:
  - "5 more clips from this video", with overlap against existing clips prevented;
  - "more like this clip".
- ⬜ **Manual clip:** select text in the transcript and make a clip from it.

### Editing (studio)
- ✅ Captik's 35 caption templates, trimming, restyling, SRT export.
- ⬜ **Silence, filler and retake removal** per clip, as a one-click tab. Resource: `resources/features/auto-edit-sfx-music` (`detectLocal.ts`, `cutVideo.ts`, `remap.ts`).
- ⬜ **Zoom punch-ins** on key words, plus a shake on the biggest line. Resource: `captik-graphics/src/lib/motion/motionTimeline.ts`.
- 🟡 **Reframing.**
  - Today it uses a skin-tone heuristic (`src/focus.js`). Move to real face and speaker detection.
  - Two speakers become a split screen.
  - Follow the active speaker.
- ⬜ **Face-aware captions:** keep captions off faces. Resource: `resources/features/face-aware-captions`.
- ⬜ **Background music** that ducks under speech, plus the license-free sound library. Resource: `auto-edit-sfx-music` (`music/duck.ts`, `sfx/`).
- ⬜ **Audio cleanup:** noise reduction and loudness. Resource: `auto-edit-sfx-music` (`audioCleanup.ts`).
- ⬜ **Brand kit:** logo watermark, and brand colours and fonts applied to captions and graphics. Resource: `resources/features/brand-kit`.
- ⬜ **Template variants and looks:** curated caption variants, impact words, text behind the subject. Resources: `resources/features/template-variants`, `resources/features/look-specs`.
- ⬜ **Progress bar, CTA end card, emoji and icon pop-ins**, all built from graphics templates.
- ⬜ **Aspect ratios** per export: 9:16, 1:1, 4:5, 16:9.
- ⬜ **Clip management:** split, merge, reorder and duplicate clips (duplicate to try another style).

### Export and delivery
- ✅ 1080p MP4 per clip, download, SRT.
- ⬜ **Export everything:** all clips in one click as a zip, 720p/1080p/4K presets, and a captions-only (SRT) option.
- ⬜ **Cover thumbnails** per clip. Resource: `resources/features/cover-thumbnails`.
- ⬜ **Cloud rendering** (Remotion Lambda) with a visible render queue.
- ⬜ **Publish and schedule** to YouTube Shorts, Instagram Reels and TikTok through their APIs (OAuth), with the generated copy.

### Product
- ⬜ A settings page: key status, default clip count and model, default toggles.
- ⬜ **Results feedback:** pull views and retention of posted clips and train the virality score on real results (`src/virality.js` already trains on ratings).
- ⬜ **To host it:** accounts, per-user usage and cost, limits. Not needed while it runs locally.
- ⬜ An end-to-end test (Playwright): link → run → edit → export, plus rendered-frame checks for captions and graphics.

---

## 5. Resources in this repo

| Path | What it is |
|---|---|
| `captik/` | Captik production master: caption templates, KineticCaption composition, editor components, fonts |
| `captik-graphics/` | Captik's premium editor line: the motion-graphics system (242 Captik + 1,399 imported templates), its export composition, b-roll library + catalogue + ingest scripts, license-free sound stand-in (`shims/`) |
| `resources/features/` | Six finished Captik features to port, each with its source files, the full branch patch and a README: auto-edit + SFX + music, brand kit, cover thumbnails, face-aware captions, template variants, looks. See [resources/README.md](resources/README.md) |
| `.claude/skills/` | `shortform-video-pipeline`, `shortform-edit-plan`, `shortform-motion-design`, `shortform-branding`. Claude Code loads them in this repo; they carry measured API limits and the render-and-look habits |
| `scripts/sync-captik.mjs` | Re-copies `captik/` and `captik-graphics/` from a Captik checkout (`--check` reports drift) |
| `scripts/graphics-smoke.mjs` | `npm run graphics:smoke`: renders every graphics template |
| Issue #1 | Your `.env` (Claude, Sarvam, word-timing token) |

## 6. Suggested order

1. Toggles (§1)
2. Graphics in the studio and export, placed by hand (§3.1–3.2)
3. AI graphics placement (§3.3–3.6)
4. B-roll library and inserts (§2)
5. Essentials, in this order:
   1. silence/filler removal
   2. music and sound
   3. face-aware captions
   4. brand kit
   5. cover thumbnails
   6. export everything
   7. aspect ratios
   8. reframing
   9. publishing

## 7. Definition of done, for every task

- Preview and export match. Render frames of both and compare them.
- Captik's look and interactions, with no new visual language.
- These all pass: `npm test`, `npm run graphics:smoke`, `npm run build`.
- The README is updated where behaviour changed.
- Small commits and a PR to `main`, with screenshots of the UI and frames of the output.
