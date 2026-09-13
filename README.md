# Captik Clipper

One long video in, **up to ten** vertical shorts out — picked by Claude, captioned with **Captik's own
caption templates**, and editable in **Captik's own editor**. Paste a YouTube / Google Drive / Instagram /
TikTok / X / Facebook / LinkedIn / Vimeo link or drop a file; every clip gets a virality score and every run
prints a cost receipt.

## How it works

```
link ──► py/fetch.py: AUDIO ONLY ──► Sarvam saaras:v3 (codemix) + ElevenLabs forced alignment
     ──► Claude Opus 5 reads the transcript, picks ≤10 parts
     ──► py/fetch.py: download ONLY those parts ──► align each part to the audio (10 ms)
     ──► ffmpeg: 9:16 base per part (tracked crop / letterbox) + frames from the part
     ──► Claude styles each clip from its frames (Captik template, colours, position, emphasis)
     ──► Captik's KineticCaption composition renders it ──► open any clip in Captik's editor, change it, re-export
```

| Stage | What happens | Code |
|---|---|---|
| **Get audio** | `py/fetch.py audio` (yt-dlp's Python API) pulls only a 48 kbps audio track. Uploads and sites without a separate audio stream use the local file. | `py/fetch.py`, `src/fetcher.js` |
| **Transcribe** | Captik's production STT. Audio is cut on silence into ≤28 s chunks (Sarvam's sync limit is 30 s) and transcribed by Sarvam `saaras:v3` in `codemix` mode; ~168 s windows of that text are timed word-by-word by ElevenLabs `/v1/forced-alignment`, gated on alignment loss (retry with normalised text, split on 413, even timing as last resort). | `src/sarvamStt.js` |
| **Pick best parts** | Claude Opus 5 reads the timestamped transcript (with loudness marks and pauses), trained by `training/`; structured JSON; the validator owns the 10-clip cap, sentence-snapped boundaries, 12–90 s and overlap removal. | `src/curate.js`, `src/llm.js` |
| **Fetch parts** | `py/fetch.py sections` downloads only the picked ranges (HLS fragments, 3 in parallel). Each part is matched to the source audio by envelope cross-correlation — HLS ranges snap to fragment boundaries, measured up to 1.25 s off. | `py/fetch.py`, `src/align.js` |
| **Romanize** | Sarvam writes Hindi in Devanagari; captions are converted one-for-one to romanized Hinglish the way creators type it (नहीं→nahi, बर्बाद→barbaad) — English words, names and numbers untouched, every word's timing and style kept. A clip that does not line up word-for-word keeps its original words. `CAPTION_SCRIPT=native` keeps Devanagari. | `src/romanize.js` |
| **Frames & style** | Each part becomes a 1080×1920 base video (subject-tracking crop per shot, letterbox for slides/charts/photos, −14 LUFS). Frames from the base go to Claude with the clip's words and Captik's template catalogue; it returns template, accent/text colour, face-safe caption height, size, emphasised words and screen-shake beats — all validated. | `src/render.js`, `src/focus.js`, `src/director.js` |
| **Score** | 0–100 virality score from the curator's judgement + measured audio/visual features. | `src/virality.js` |
| **Render** | Captik's `KineticCaption` composition (`LambdaCaptionComposition` → `CaptionOverlay`, the component the Captik editor previews with), bundled from captik-app and rendered locally with captik-app's own `@remotion/renderer`. | `src/captikRender.js` |
| **Edit** | `/editor/?job=…&clip=…` is Captik's editor: `TopBar`, `LeftPanel`, `VideoCanvas`, `RightPanel`, `EditorTimeline` imported from captik-app and laid out exactly as `src/app/editor/page.tsx`. Word/line edits, per-line templates, colours, position, undo, SRT; autosaves; **Export** re-renders through the same composition. | `web/`, `server.js` |

**Why audio first:** YouTube throttles single-stream downloads — the 581 MB 1080p file of a 52-minute episode
crawled at ~270 KiB/s (≈35 min, which looks like the tool is *recording* the video). The 48 kbps audio comes down
in 20–24 s and the nine picked parts (5:38 of video) in 138 s.

## Run it

Requirements: Node 22+, Python 3 with `pip install yt-dlp`, ffmpeg (with libass) on `PATH`, and a
**captik-app checkout with `node_modules` installed** (production master; default `../Captik/captik-app`).

```bash
npm install
cp .env.example .env        # keys, see below
npm run build:editor        # builds Captik's editor into public/editor
npm start                   # http://localhost:4321
npm test                    # unit tests, no network
```

Open a finished job on the dashboard and press **Edit** on a clip to open it in the Captik editor.

## "Training" the curator

Claude cannot be fine-tuned through the public API, so the curator is trained in three layers:
`training/rubric.md` (the manual injected into every run), `training/exemplars.json` (worked pick/reject
examples) and **your ratings** — every ▲/▼ is shown to the curator as *this creator's taste* on the next run
and re-fits the virality-score weights (logistic regression, L2-regularised toward the defaults). **Re-curate
with my ratings** reuses the saved audio and transcript, so only the LLM calls and part downloads are paid again.

## Virality score

| Feature | Source | Default weight |
|---|---|---|
| Hook, emotion, value, shareability, standalone, trend fit, payoff | Curator judgement, 0–10 | 20 / 12 / 12 / 14 / 10 / 8 / 8 % |
| Hook energy · pace · no dead air · length fit · visual change | Measured | 4 / 4 / 3 / 3 / 2 % |

Tiers: **85+ Viral bet · 70+ Strong · 55+ Solid · below Long shot.** The score ranks moments within a video; it
is not a view-count prediction until it has been trained on real posting results.

## Cost

End-to-end run on a real YouTube link: *India's Got Latent* S2E6 (52:26, Hinglish), Opus 5 as curator and stylist,
job `20260913191708-cb10ec` — 9 clips in 21:39 (audio 24 s · transcribe 213 s · pick 133 s · parts 138 s · style 77 s · render 714 s).

| Step | Provider | Usage | Cost |
|---|---|---|---|
| Transcription | Sarvam `saaras:v3` (₹30/hr) | 52.4 min, 137 chunks | $0.298 |
| Word timing | ElevenLabs forced alignment ($0.22/hr) | 52.4 min, 21 windows, mean loss 0.48 | $0.192 |
| Pick best parts | Claude Opus 5 | 35,990 input · 9,334 output tokens | $0.413 |
| Caption styling | Claude Opus 5 | 17,394 input · 1,466 output tokens (27 frames) | $0.124 |
| Romanize captions | Claude Opus 5, low effort | 3,543 input · 2,676 output tokens (8 clips) | $0.085 |
| Download, cut, render | yt-dlp · ffmpeg · Remotion, locally | ~830 s of CPU | $0 here (≈ $0.08 on a rented 8-vCPU box) |
| **Total** | | 9 clips | **$1.11 (≈ ₹98)** |

**A 20-minute video with 10 clips ≈ $0.73 (≈ ₹64)** — the in-app estimator, calibrated from three real runs:
Sarvam $0.114 + ElevenLabs $0.073 (speech scales with minutes) + curation $0.314 (mostly fixed prompt and thinking,
plus ~590 input tokens per minute of transcript) + styling $0.121 + romanization $0.107 (both scale with the number of
clips, not the length). It recalibrates from every finished run (`data/calibration.json`).

## Configuration (`.env`)

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | curation + styling |
| `SARVAM_API_KEY` | required | transcription |
| `ELEVENLABS_API_KEY` | — | direct forced alignment; **or** `SUPABASE_SERVICE_ROLE_KEY` + `CAPTIK_ALIGN_URL` to use Captik's `elevenlabs-align` edge function |
| `STT_MODEL` | `sarvam:saaras:v3` | `whisper-large-v3` (Groq, needs `GROQ_API_KEY`) as a fallback — it translates Hinglish into English |
| `CAPTION_SCRIPT` | `roman` | `native` keeps Sarvam's Devanagari captions |
| `CAPTIK_APP_DIR` | `../Captik/captik-app` | templates, editor components, fonts, Remotion |
| `CURATOR_MODEL` / `CURATOR_FALLBACK_MODEL` | `claude-opus-5` / `claude-sonnet-5` | per job in the UI |
| `SARVAM_INR_PER_HOUR` / `ELEVENLABS_ALIGN_USD_PER_HOUR` | 30 / 0.22 | list prices used on receipts |
| `MAX_DOWNLOAD_HEIGHT` | 1080 | part resolution |
| `YTDLP_COOKIES_FROM_BROWSER` | — | `chrome` / `edge` / `firefox` when Instagram or Facebook need a login |
| `PORT` · `USD_INR` · `MAX_SOURCE_MINUTES` · `RENDER_CONCURRENCY` | 4321 · 88 · 180 · 2 | |

## Known limits

- The Captik bundle is cached per captik-app **commit** in `data/captik-bundle/`; uncommitted template changes need that folder deleted.
- Jobs from before romanization convert with `POST /api/jobs/<id>/romanize` (re-renders the changed clips).
- Local rendering takes roughly 1.5–2× each clip's length on a 16-core laptop (plus ~2 minutes of one-time bundling).
- Subject tracking is a heuristic (skin tone that also moves, histogram-spike cut detection), not face detection.
- No auth; binds 127.0.0.1. Jobs run one at a time; editor re-renders queue separately.

## Repo layout

```
server.js            Express API, dashboard, editor, media
py/fetch.py          yt-dlp Python API: audio-only and section downloads, JSON-line progress
src/fetcher.js       runs fetch.py
src/sarvamStt.js     silence chunking, Sarvam, ElevenLabs forced alignment
src/transcribe.js    Groq Whisper fallback
src/curate.js        curator prompt + validator (10-clip cap)
src/align.js         part ↔ source audio alignment
src/render.js        9:16 base videos (tracked crop / letterbox)
src/focus.js         subject tracking, cut detection, per-shot layout
src/director.js      caption styling from frames with Captik's template catalogue
src/segments.js      Captik's caption line builder (ported from the editor)
src/captikRender.js  Captik composition bundle + render, editor-state sanitising
src/pipeline.js      stages, re-render queue
src/virality.js      score, training      src/cost.js   receipts, estimator
web/                 Captik editor app (Vite, components from captik-app)
public/              dashboard
training/            rubric, exemplars, train CLI
test/                node:test
```
