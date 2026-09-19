---
name: shortform-video-pipeline
description: Build the shortform video pipeline: transcribe, time to the word, auto-cut a raw take, and render — Sarvam/ElevenLabs STT and forced alignment, silence and retake removal, and Remotion locally or on Lambda. Use when wiring speech-to-text, word-level timing, silence/retake removal, cut lists, or a Remotion composition. Covers the API limits and failure modes that are only discoverable by probing them.
---

# Processing and editing video with these APIs

Everything here was found by running against the live services and looking at the output.
Where a number appears, it was measured; where a limit appears, an API returned an error
saying so. Assume none of it is guessable from documentation.

---

## Speech to text: no single service does both jobs

**Sarvam returns no word timestamps.** Not on `saaras:v3`, not on `saarika:v2.5`, with
`with_timestamps=true` set. `timestamps.words` comes back as a SINGLE entry spanning the whole
request:

```json
{ "words": ["<the entire transcript>"], "start_time_seconds": [0], "end_time_seconds": [25] }
```

**Sarvam's sync endpoint hard-fails over 30 seconds:**
`"Audio duration exceeds the maximum limit of 30 seconds. Please use the batch API"`. Chunk
before sending — and chunk on silence, not on a fixed clock, or you slice words in half.

So the working shape is two services:

| Job | Service | Why |
|---|---|---|
| Transcript | Sarvam `saaras:v3`, `mode=codemix` | best on Hinglish; keeps English nouns in English |
| Word timing | ElevenLabs `/v1/forced-alignment` | times the text you already have |

Forced alignment beats a second ASR because it times *your* transcript — the words that come
back are spelled the way the first service heard them, so there is nothing to reconcile.

**Alignment loss is a usable quality gate.** Measured on the same clip: `0.20` with correct
text, `2.46` with mangled text. A ceiling of ~1.5 catches wrong-text alignments while
surviving noisy audio.

**Encoding will silently ruin it.** Sending Devanagari through a shell `curl -F "text=…"`
turned every word into `????`, and alignment returned words with 1ms durations crammed at the
start. It looked like a timing bug and was an encoding bug. Send the text as a file
(`-F "text=<file"`) or from a real multipart client, and check the returned words before
trusting any conclusion drawn from them.

---

## Auto-cutting a raw take

Order matters: **retakes → fillers → gaps → edges**. Fillers must go before gaps are measured,
or one removed "umm" leaves two half-gaps that each look too small to close.

### Retake detection is where the danger is

Deleting speech the person actually said is the worst thing a cutter can do, so the bar is
high. Matching on any three consecutive words **deleted 7 seconds of good speech** from a real
reel, because `अपने video में` and `है और यही` recur naturally in Hindi the way "and then the"
does in English.

Three conditions together, not any one of them:

1. **≥4 matching tokens AND ≥2 CONTENT words** (stopwords excluded). Length without substance
   matches grammar; substance without length matches a single reused noun.
2. **A bounded interruption** between the two attempts (~3.5s). A retake is immediate — you
   fluff it, you go again. A phrase reused a clause later is deliberate emphasis.
3. Inside a forward window (~12s); a phrase repeated a minute later is a callback.

### The audit must be true

Overlapping drops double-count: a retake that swallows the lead-in gets reported twice, so the
panel claims 14s cut from a clip that lost 7s. Subtract already-dropped ranges before
recording a new one, and assert in a test that the audit sums to the actual removal.

### Report what was cut

A cut list is not trustworthy unless it says what went and why. Keep `{ srcIn, srcOut, reason,
detail }` per removal and show it.

---

## Rendering with Remotion

**One component for preview and export.** `@remotion/player` in the browser and the same
registered composition on Lambda. Two renderers drift — this codebase has paid for that twice.

**Express a cut as Sequences, not as seeking.** One `<Sequence from={…} durationInFrames={…}>`
per kept range, each with `<OffthreadVideo trimBefore={…}>`. Remotion then owns the seeking,
which is also why it survives being rendered out of order on Lambda. A hand-rolled player that
sets `video.currentTime` cannot.

**`startFrom` is deprecated — it is `trimBefore` now.** Check the installed version's props
rather than reaching for what you remember.

**Media URLs must be absolute.** A root-relative `/broll/x.mp4` resolves against the page in a
browser and works; the renderer resolves it against its own bundle server and 404s, and Lambda
resolves it against the deployed site. This is invisible until you render.

**A large `public/` is a real cost.** Every bundle copies it — 2.4GB of b-roll in `public/`
added ~20s to every render and would not survive a Lambda site upload. Put media on S3/CDN and
reference it absolutely.

---

## Verify by rendering frames, then LOOK at them

The single highest-value habit here. `npx remotion still <entry> <comp> out.png --frame=N
--props=props.json` costs seconds and catches what reasoning cannot:

- a graphic rendered across the presenter's head
- a caption clipped by the frame edge
- a full-frame white wash from a flash on the wrong beats

**Measure pixels when your eyes might lie.** Mean luminance and near-white fraction turned "is
this washed out?" into `217/255, 4% white` → after the fix `37/255, 0%`. Sample the same frame
twice a second apart to tell a real fault from a paint-timing artefact.

**Drive the real UI.** Playwright with `setInputFiles`, clicking what the user clicks, found
four bugs in ten minutes that API-level testing had reported as working — including that every
click produced a one-word selection, which made the whole feature useless. If a user says a
feature does not work and your API tests pass, the bug is between them.

**Compare against the reference, not against your notes on the reference.** Put the source
frames and your output side by side in one image and look. A brief that says "big coloured
keyword" does not tell you the reference is romanised Hinglish, which was the entire gap.
