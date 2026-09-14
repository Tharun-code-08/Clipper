# Captik Clipper

One long video in, **up to ten** vertical shorts out: picked by Claude, captioned with **Captik's own caption
templates**, and finished in a **clip studio built from Captik's editor**, where you can trim each clip, restyle it
and export it. Paste a YouTube / Google Drive / Instagram / TikTok / X / Facebook / LinkedIn / Vimeo link or drop a
file. Every clip gets a virality score, and every run prints a cost receipt.

## How it works

```
link ──► py/fetch.py: AUDIO ONLY ──► Sarvam saaras:v3 (codemix) + ElevenLabs forced alignment
     ──► Claude Opus 5 reads the transcript, picks ≤10 parts
     ──► py/fetch.py: download ONLY those parts ──► align each part to the audio (10 ms)
     ──► ffmpeg: 9:16 base per part (tracked crop / letterbox) + frames from the part
     ──► Claude styles each clip from its frames (Captik template, colours, position, emphasis)
     ──► Captik's KineticCaption composition renders it
     ──► clip studio: trim, restyle, re-export any clip
```

| Stage | What happens | Code |
|---|---|---|
| **Get audio** | `py/fetch.py audio` (yt-dlp's Python API) pulls only a 48 kbps audio track. Uploads and sites without a separate audio stream use the local file. | `py/fetch.py`, `src/fetcher.js` |
| **Transcribe** | Captik's production STT. Audio is cut on silence into ≤28 s chunks (Sarvam's sync limit is 30 s) and transcribed by Sarvam `saaras:v3` in `codemix` mode. Windows of about 168 s of that text are then timed word by word with ElevenLabs `/v1/forced-alignment`. Each window is gated on alignment loss: retry with normalised text, split on HTTP 413, even timing as the last resort. | `src/sarvamStt.js` |
| **Pick best parts** | Claude Opus 5 reads the timestamped transcript (with loudness marks and pauses), guided by `training/`, and returns structured JSON. The validator owns the 10-clip cap, sentence-snapped boundaries, the 12–90 s length and overlap removal. | `src/curate.js`, `src/llm.js` |
| **Fetch parts** | `py/fetch.py sections` downloads only the picked ranges (HLS fragments, 3 in parallel). HLS ranges snap to fragment boundaries (measured up to 1.25 s off), so each part is matched to the source audio by envelope cross-correlation. | `py/fetch.py`, `src/align.js` |
| **Romanize** | Sarvam writes Hindi in Devanagari. Captions are converted one-for-one to romanized Hinglish the way creators type it (नहीं→nahi, बर्बाद→barbaad). English words, names and numbers are untouched, and every word keeps its timing and style. A clip that does not line up word for word keeps its original words. `CAPTION_SCRIPT=native` keeps Devanagari. | `src/romanize.js` |
| **Frames & style** | Each part becomes a 1080×1920 base video: a subject-tracking crop per shot, letterbox for slides, charts and photos, and −14 LUFS loudness. Frames from the base go to Claude with the clip's words and Captik's template catalogue. It returns the template, accent and text colour, a face-safe caption height, size, emphasised words and screen-shake beats, all validated. | `src/render.js`, `src/focus.js`, `src/director.js` |
| **Score** | 0–100 virality score from the curator's judgement plus audio and visual features measured over the clip. | `src/virality.js` |
| **Render** | Captik's `KineticCaption` composition (`LambdaCaptionComposition` → `CaptionOverlay`, the component Captik's editor previews with), bundled from `captik/src` and rendered locally with Remotion 4.0.470, the version captik-app ships. | `src/captikRender.js`, `captik/` |
| **Home** | `/` follows Captik's signed-in dashboard: Captik's collapsible sidebar, a link bar above Captik's drop zone, and a **Prepare Your Clips** modal (clip count, curator, transcriber, live cost estimate) modelled on Captik's *Prepare Your Media*. Runs show as project cards. A run page has Captik's processing card while it works, then clip cards (hover preview, score, Edit, download, copy caption, 👍/👎, why this clip), the source map and the receipt. **Cost per video** and **Train the curator** are pages in the same sidebar. | `web/src/home/` |
| **Clip studio** | `/editor/?job=…&clip=…`. Captik's `TopBar`, `VideoCanvas`, `RightPanel` (templates, text, style) and `EditorTimeline`, plus a **Clips / Captions** rail. The Clips tab lists every clip with its rank, score and export state; the Captions tab is Captik's `LeftPanel`. Word and line edits, per-line templates, colours, position, undo and SRT all work, with Captik's keyboard shortcuts (Space, ←/→, Ctrl+Z / Ctrl+Y, 1–0 for templates) and its template switching; changes autosave, and **Export** re-renders through the same composition. | `web/`, `server.js` |
| **Trim** | The trim strip above the timeline shows the source around the clip: transcript words, loudness, and which video is already downloaded. Drag the in/out handles (they snap to word boundaries; hold Alt to drag freely), or drag the length pill to slide the clip. Preview with **Hear in / Hear out / Play**, then apply. The server re-cuts the 9:16 base, downloading extra video with 15 s of headroom when the new range goes past the part. It re-times the captions, keeping every edit (hand-edited or romanized text, emphasis, deleted words, line styles), captions the newly revealed speech the way the pipeline would (romanized), and re-scores the clip. **AI pick** returns to the curator's range. | `src/trim.js`, `src/pipeline.js`, `web/src/TrimBar.jsx` |

**Why audio first:** YouTube throttles single-stream downloads. The 581 MB 1080p file of a 52-minute episode
crawled at ~270 KiB/s (≈35 min, which looks like the tool is *recording* the video). The 48 kbps audio comes down
in 20–24 s, and the nine picked parts (5:38 of video) in 138 s.

## Run it

Requirements: Node 22+, Python 3 with `pip install yt-dlp`, and ffmpeg (with libass) on `PATH`. Captik's
templates, editor components and fonts are in `captik/`, so no captik-app checkout is needed.

```bash
npm install
cp .env.example .env        # keys, see below
npm run build               # builds the home and the clip studio into dist/
npm start                   # http://localhost:4321
npm test                    # unit tests, no network
```

Paste a link or drop a file on the home page, choose the clip settings, and press **Edit** on any finished clip to open the clip studio. The first render
downloads Remotion's headless Chrome and bundles the Captik composition, which takes about 2 minutes once.

## Captik templates and editor (`captik/`)

`captik/src` is a file-for-file copy of the part of captik-app (production `master`) the clipper runs on:
- the Remotion composition and every caption template's code;
- the editor components and the libs they import;
- the transcript types and the global stylesheet.

`captik/public/fonts` holds every caption font. Nothing in `captik/src` is edited here. The one exception is
`@/lib/supabase/client`, which needs a captik.in session; it is replaced by a signed-out stand-in in `captik/shims/`.
`captik/UPSTREAM.json` records the commit, the package versions and a hash of every file.

```bash
npm run sync:captik                     # re-copy from CAPTIK_APP_DIR (default ../Captik/captik-app)
npm run sync:captik -- --check          # exit 1 if captik/ has drifted from the checkout
```

The sync follows imports from the composition and the editor surfaces. Type-only imports that would pull in
server code are skipped. If captik-app ever needs captik.in's servers at runtime (Next, Supabase, Gemini,
MediaPipe), the sync refuses and names the file. Some fonts are commercially licensed, which is one reason this
repository is private.

**UI continuity.** Every screen is Captik's. The studio is Captik's editor components. The home imports Captik's
`Logo`, `Tooltip`, `ProgressBar` and slider controls from `captik/src`, and copies Captik's dashboard, prepare
modal and processing overlay class for class: `#0B0B0D` / `#09090d` surfaces, amber-500 actions, ClashDisplay page
titles, Geist text, the same cards, labels, selects and empty states.

## "Training" the curator

Claude cannot be fine-tuned through the public API, so the curator is trained in three layers:
1. `training/rubric.md`, the manual injected into every run.
2. `training/exemplars.json`, worked pick/reject examples.
3. **Your ratings.** Every ▲/▼ is shown to the curator as *this creator's taste* on the next run, and re-fits the virality-score weights (logistic regression, L2-regularised toward the defaults).

**Re-curate with my ratings** reuses the saved audio and transcript, so only the LLM calls and part downloads are paid again.

## Virality score

| Feature | Source | Default weight |
|---|---|---|
| Hook, emotion, value, shareability, standalone, trend fit, payoff | Curator judgement, 0–10 | 20 / 12 / 12 / 14 / 10 / 8 / 8 % |
| Hook energy · pace · no dead air · length fit · visual change | Measured over the clip (re-measured after a trim) | 4 / 4 / 3 / 3 / 2 % |

Tiers: **85+ Viral bet · 70+ Strong · 55+ Solid · below Long shot.** The score ranks moments within a video. It
is not a view-count prediction until it has been trained on real posting results.

## Cost

End-to-end run on a real YouTube link: *India's Got Latent* S2E6 (52:26, Hinglish), with Opus 5 as curator and
stylist (job `20260913191708-cb10ec`). It produced 9 clips in 21:39: audio 24 s · transcribe 213 s · pick 133 s ·
parts 138 s · style 77 s · render 714 s.

| Step | Provider | Usage | Cost |
|---|---|---|---|
| Transcription | Sarvam `saaras:v3` (₹30/hr) | 52.4 min, 137 chunks | $0.298 |
| Word timing | ElevenLabs forced alignment ($0.22/hr) | 52.4 min, 21 windows, mean loss 0.48 | $0.192 |
| Pick best parts | Claude Opus 5 | 35,990 input · 9,334 output tokens | $0.413 |
| Caption styling | Claude Opus 5 | 17,394 input · 1,466 output tokens (27 frames) | $0.124 |
| Romanize captions | Claude Opus 5, low effort | 3,543 input · 2,676 output tokens (8 clips) | $0.085 |
| Download, cut, render | yt-dlp · ffmpeg · Remotion, locally | ~830 s of CPU | $0 here (≈ $0.08 on a rented 8-vCPU box) |
| **Total** | | 9 clips | **$1.11 (≈ ₹98)** |

**A 20-minute video with 10 clips ≈ $0.73 (≈ ₹64).** This is the in-app estimator, calibrated from three real runs:

| Part | Cost | Scales with |
|---|---|---|
| Sarvam | $0.114 | minutes of speech |
| ElevenLabs | $0.073 | minutes of speech |
| Curation | $0.314 | mostly fixed (prompt and thinking), plus ~590 input tokens per minute of transcript |
| Styling | $0.121 | number of clips, not length |
| Romanization | $0.107 | number of clips, not length |

The estimator recalibrates from every finished run (`data/calibration.json`). A trim costs nothing on the API
side, except romanizing the newly revealed words (a fraction of a cent).

## Configuration (`.env`)

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | curation + styling |
| `SARVAM_API_KEY` | required | transcription |
| `ELEVENLABS_API_KEY` | — | direct forced alignment; **or** `SUPABASE_SERVICE_ROLE_KEY` + `CAPTIK_ALIGN_URL` to use Captik's `elevenlabs-align` edge function |
| `STT_MODEL` | `sarvam:saaras:v3` | `whisper-large-v3` (Groq, needs `GROQ_API_KEY`) is a fallback, but it translates Hinglish into English |
| `CAPTION_SCRIPT` | `roman` | `native` keeps Sarvam's Devanagari captions |
| `CAPTIK_APP_DIR` | `../Captik/captik-app` | only for `npm run sync:captik` |
| `CURATOR_MODEL` / `CURATOR_FALLBACK_MODEL` | `claude-opus-5` / `claude-sonnet-5` | per job in the UI |
| `SARVAM_INR_PER_HOUR` / `ELEVENLABS_ALIGN_USD_PER_HOUR` | 30 / 0.22 | list prices used on receipts |
| `MAX_DOWNLOAD_HEIGHT` | 1080 | part resolution |
| `YTDLP_COOKIES_FROM_BROWSER` | — | `chrome` / `edge` / `firefox` when Instagram or Facebook need a login |
| `PORT` · `USD_INR` · `MAX_SOURCE_MINUTES` · `RENDER_CONCURRENCY` | 4321 · 88 · 180 · 2 | |

## Known limits

- The Remotion bundle is cached in `data/captik-bundle/` under a hash of `captik/src` and the shims, so a re-sync rebuilds it on the next render.
- Trims run from 3 to 180 s inside the source. Extending past the downloaded part needs the original link. An upload trims anywhere in the file.
- A trim re-cuts the base but does not re-export. The clip shows *Edited · export to update* until you press Export.
- Jobs from before romanization convert with `POST /api/jobs/<id>/romanize`, which re-renders the changed clips.
- Local rendering takes roughly 1.5–2× each clip's length on a 16-core laptop.
- Subject tracking is a heuristic (skin tone that also moves, plus histogram-spike cut detection), not face detection.
- No auth; the server binds 127.0.0.1. Jobs run one at a time; editor re-renders queue separately.

## Repo layout

```
server.js              Express API; serves dist/ (home + clip studio) and media
py/fetch.py            yt-dlp Python API: audio-only and section downloads, JSON-line progress
src/fetcher.js         runs fetch.py
src/sarvamStt.js       silence chunking, Sarvam, ElevenLabs forced alignment
src/transcribe.js      Groq Whisper fallback
src/curate.js          curator prompt + validator (10-clip cap)
src/align.js           part ↔ source audio alignment
src/render.js          9:16 base videos (tracked crop / letterbox)
src/focus.js           subject tracking, cut detection, per-shot layout
src/director.js        caption styling from frames with Captik's template catalogue
src/segments.js        Captik's caption line builder (ported from the editor)
src/trim.js            trim validation, caption re-timing that keeps edits
src/captikRender.js    Captik composition bundle + render, editor-state sanitising
src/pipeline.js        stages, re-render queue, trim job
src/virality.js        score, training      src/cost.js   receipts, estimator
captik/                Captik templates, editor components, fonts (synced from captik-app)
scripts/sync-captik.mjs  re-copies captik/ from a captik-app checkout
web/                   Vite app: home (web/src/home) and clip studio (Studio, ClipEditor, ClipRail, TrimBar)
training/              rubric, exemplars, train CLI
test/                  node:test
```
