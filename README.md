# Captik Clipper

One long video in, **up to ten** vertical shorts out. A local prototype of Captik's clipping model:
paste a link (or drop a file), and an LLM curator watches the whole video, picks the moments that can
travel on Shorts / Reels / TikTok, gives each a **virality score**, and renders them 9:16 with captions.

```
link or file ─► Fetch ─► Listen & watch ─► Curate ─► Validate ─► Score ─► Render ─► ≤10 shorts + cost receipt
```

## Run it

Requirements: Node 22+ (built on 26.1), ffmpeg with libass on `PATH`, yt-dlp (`pip install yt-dlp`),
an Anthropic API key and a Groq API key.

```bash
npm install
cp .env.example .env      # add ANTHROPIC_API_KEY and GROQ_API_KEY
npm start                 # http://localhost:4321
npm test                  # 13 unit tests, no network
npm run train             # re-fit the virality score from your ratings (also a button in the UI)
```

## Pipeline

| Stage | What happens | Code |
|---|---|---|
| **Fetch** | YouTube, Google Drive, Instagram, TikTok, X, Facebook, LinkedIn, Vimeo, Reddit, Twitch, Dropbox or a direct file link. yt-dlp for platforms (≤1080p); Drive tries a direct download first, then yt-dlp. Uploads up to 8 GB. | `src/ingest.js` |
| **Listen & watch** | 16 kHz audio → Groq Whisper with word timestamps (10-min chunks, 2 s overlap, dedupe by word start). In parallel: a loudness map (RMS per 0.5 s) and one ffmpeg pass that finds scene cuts and samples ~48 frames. | `src/media.js`, `src/transcribe.js` |
| **Curate** | Claude Opus 5 reads the transcript, annotated with a loudness quintile (`e1`–`e5`), scene-cut marks and pauses, plus the timestamped frames. It returns structured JSON: times, title, on-screen hook, caption, hashtags, format, reasoning and seven 0–10 judgement scores. Adaptive thinking; server-side refusal fallback; if Opus is overloaded the same key falls back to Sonnet 5. | `src/curate.js`, `src/transcript.js` |
| **Validate** | The code, not the prompt, owns the rules: **hard cap of 10 clips** (`MAX_CLIPS`), boundaries snapped to sentence edges from word timestamps, 12–90 s (long picks trimmed at a sentence end), overlapping picks dropped. | `finalizeClips` in `src/curate.js` |
| **Score** | Virality score 0–100 = weighted mean of the curator's judgement and features measured from the audio and video (below). | `src/virality.js` |
| **Render** | 1080×1920 H.264, loudness-normalised to −14 LUFS. Per shot: a **subject-tracking crop** when a person is on screen, a **letterbox over blurred video** for slides and screens. Word-by-word highlighted captions (Montserrat Black; Nirmala UI for Devanagari and other Indic scripts) and a boxed hook for the first 3 s. | `src/render.js`, `src/focus.js` |

Jobs run one at a time and persist to `data/jobs/<id>/` (source, transcript, frames, prompt, raw curator
response, clips). The UI streams progress over Server-Sent Events.

## "Training" the curator

Claude cannot be fine-tuned through the public API, so the prototype trains the curator in three layers:

1. **`training/rubric.md`**: the training manual injected into every run. It covers hard laws (hook in 3 s, standalone, complete arc, no padding), why people share, formats that keep winning, score calibration, packaging and layout. Edit it like code.
2. **`training/exemplars.json`**: worked pick/reject examples that teach the rubric by contrast: cold-open at the tension line, reject context-dependent clips, end on the payoff, write Hinglish in Roman script, and so on.
3. **Your ratings.** Every ▲/▼ on a clip is stored in `data/feedback.jsonl` and
   - is shown to the curator on the next run as *this creator's taste* (liked vs disliked picks), and
   - trains the virality score: a logistic regression over the 12 features, L2-regularised toward the default weights so a handful of ratings can't flip the model. It reports ranking accuracy (AUC) before and after.

   **Re-curate with my ratings** reruns curation on a finished job's saved transcript and frames. That costs only the LLM call, with no new download or transcription.

   Verified end to end on the TED talk: after rating 3 picks ▲ and 3 ▼, re-curation returned all 3 liked moments at the top (91 / 84 / 83 with the trained weights), dropped all 3 disliked ones, and found 2 new picks, for $0.239.

## Virality score

| Feature | Source | Default weight |
|---|---|---|
| Hook, emotion, value, shareability, standalone, trend fit, payoff | Curator judgement, 0–10 each | 20 / 12 / 12 / 14 / 10 / 8 / 8 % |
| Hook energy: loudness of the first 3 s vs the whole video | Measured | 4 % |
| Pace: words per second | Measured | 4 % |
| No dead air: pauses > 0.7 s | Measured | 3 % |
| Length fit: 20–60 s sweet spot | Measured | 3 % |
| Visual change: scene cuts per minute | Measured | 2 % |

Tiers: **85+ Viral bet · 70+ Strong · 55+ Solid · below Long shot.** The score ranks moments *within* a video;
it is not a view-count prediction until it has been trained on real posting results.

## Cost per 20-minute video (measured)

End-to-end run through the app: a YouTube link to a 21:03 English talk (TED, 1080p, 3,707 words), with Opus 5 as curator.
Job `20260913173117-02c2ef` produced 9 clips in 6 min 51 s: download 166 s, listen & watch 28 s, curation 109 s, render 108 s.

| Step | Provider | Usage | Cost |
|---|---|---|---|
| Transcription | Groq `whisper-large-v3` ($0.111/hr) | 1,271 s billed | $0.039 |
| Curation | Claude Opus 5 ($5 / $25 per MTok) | 22,007 input · 8,138 output tokens (incl. thinking) | $0.313 |
| Analysis + render | local ffmpeg | 241 s of CPU work | $0 here |
| **Total** | | 9 clips | **$0.353** ≈ ₹31.0 |

**→ $0.335 (≈ ₹29.5) per 20-minute video**, $0.039 per clip. A separate curation-only test on the same video
measured 21,746 / 7,992 tokens ($0.309), so the cost is stable run to run. Using the same token counts, Sonnet 5 as curator
would total ≈ $0.16 and Haiku 4.5 ≈ $0.10; output quality was not evaluated for those models, and their thinking token
counts will differ. On a rented 8-vCPU box ($0.357/hr), the ffmpeg work would add $0.024.

The in-app estimator starts from heuristics and recalibrates from every finished run (`data/calibration.json`).
Expect higher token counts for Hindi and other Devanagari transcripts than for English. ₹ uses `USD_INR` from `.env` (default 88).

## Configuration (`.env`)

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY`, `GROQ_API_KEY` | required | |
| `PORT` | 4321 | binds 127.0.0.1 only |
| `CURATOR_MODEL` / `CURATOR_FALLBACK_MODEL` | `claude-opus-5` / `claude-sonnet-5` | per job overridable in the UI |
| `CURATOR_EFFORT` | `high` | `low`–`max` |
| `STT_MODEL` | `whisper-large-v3` | or `whisper-large-v3-turbo` ($0.04/hr) |
| `YTDLP_COOKIES_FROM_BROWSER` | empty | `chrome` / `edge` / `firefox` when Instagram or Facebook need a logged-in session |
| `MAX_SOURCE_MINUTES` | 180 | |
| `USD_INR` | 88 | |
| `HOSTED_CPU_USD_PER_HOUR` | 0.357 | used for the "if hosted" line |
| `RENDER_CONCURRENCY` | 2 | |

## Known limits

- **Subject tracking is a heuristic** (YCbCr skin tone + motion + edges, cut detection by histogram spikes), not face detection. A shot is cropped only when skin-toned pixels also *move*; static skin-coloured graphics (orange chart bars) and still photos letterbox instead. It is verified on stage, close-up, chart-slide and photo footage. Lighting that pushes skin outside the colour range, or a wide two-person podcast shot, can pick the wrong region. There is no active-speaker detection yet.
- Instagram and Facebook often require cookies (see above). Private Drive files need "Anyone with the link".
- Groq's free tier caps audio per hour/day; long videos may hit rate limits (the client retries 429s).
- No auth, no queue persistence across restarts (running jobs are marked failed on restart).

## Repo layout

```
server.js            Express API + static UI
src/ingest.js        link detection and download
src/media.js         probe, audio, loudness, scene/frame scan
src/transcribe.js    Groq Whisper, chunked, word timestamps
src/transcript.js    phrases, curator transcript format, sentence snapping
src/curate.js        prompt, Claude call, structured output, validator (10-clip cap)
src/virality.js      features, score, tiers, training
src/focus.js         subject tracking, cut detection, per-shot layout
src/render.js        9:16 filter graphs, ASS captions, encode
src/cost.js          receipts, 20-minute estimator, calibration
src/pipeline.js      stage orchestration
public/              UI (vanilla JS, no build step)
training/            rubric, exemplars, train CLI
test/                unit tests (node:test)
```
