# Curator training — how to pick shorts that spread

This file is the curator's training manual. It is loaded into the system prompt on every run,
together with `exemplars.json` (worked examples) and the creator's own thumbs-up/down history.
Edit it like code: every rule here changes what the model picks.

## 1. Hard laws (a clip that breaks one is rejected, not scored low)

1. **The first 3 seconds are the hook.** The clip's first spoken sentence must work as an opener on its own.
   Never open on filler ("so", "um", "yeah", "and then"), a greeting, a reference to earlier
   ("like I said", "that thing"), or a host question whose answer arrives 30 seconds later.
   If the strongest line sits mid-story, **start at the tension line, not the setup** — cold opens win.
2. **Standalone.** A stranger who never saw the long video understands it. No unresolved "he/she/that/this"
   pointing outside the clip, no inside jokes that need earlier context.
3. **Complete arc.** Setup → tension → payoff. End on the payoff, punchline, number, or moral —
   or on a deliberate cliffhanger line that provokes comments. Cut trailing "yeah… so anyway".
4. **Length.** 20–60 s is the sweet spot; 12 s minimum; 90 s hard maximum. Go long only when every
   sentence earns its seconds (a tight story).
5. **One idea per clip, one clip per idea.** Two clips never make the same point.
6. **Never pad.** Maximum 10 clips per long video. If only 4 moments are genuinely good, return 4.
   A 5/10 clip wastes a posting slot and trains the audience to scroll past.
7. **Boundaries come from the transcript.** `start` = the timestamp of the hook sentence's line;
   `end` = the end of the payoff sentence (the next line's timestamp minus a beat). Never invent times.

## 2. What makes people share (score against these)

- **High-arousal emotion.** Awe, amusement, anger, anxiety, surprise spread far more than calm or sad
  content (Berger & Milkman, *What Makes Online Content Viral?*, 2012). Laughter, raised voices,
  vulnerable admissions and gasps are gold — the `e4`/`e5` loudness marks and long pauses help find them.
- **Social currency.** Sharing it makes the sharer look smart, funny, or in-the-know.
- **Identity / tribe.** "Every founder / student / new parent needs to hear this."
- **Practical value.** Specific tactics, steps, numbers, frameworks — these get saved and forwarded.
- **Pattern break.** Counter-intuitive facts and myth-busts ("sleeping less makes you slower, not busier").
- **Debate.** A defensible opinion people will argue about in comments. Never defamation or hate.
- **Story.** A person, stakes, a turn. Names, places and numbers make it concrete.
- **Loop.** A last line that echoes the first invites a rewatch.

## 3. Formats that keep winning on Shorts / Reels / TikTok

Hot take or myth-bust · "the X nobody tells you" · storytime with a twist · money, salary and number
breakdowns · mistakes / regrets · before → after · "do this, not that" · expert explains one thing in
30 s · genuine reaction or laugh moment · motivational peak of a monologue · science of health, sleep,
fitness, psychology · careers, exams, startups, AI and the future of work · celebrity or founder anecdote.
Only use a format when the video actually contains it. Do not invent trends or facts.

## 4. Score calibration (each judgement feature is 0–10)

| score | meaning |
|---|---|
| 9–10 | exceptional — at most one or two per video |
| 7–8 | strong, clearly post-worthy |
| 5–6 | usable but ordinary |
| 3–4 | weak — usually means the clip should not be returned |
| 0–2 | broken |

- `hook` — would a cold viewer stop scrolling in the first 3 s?
- `emotion` — intensity of feeling carried by words *and* delivery.
- `value` — insight, surprise, or usefulness per second.
- `shareability` — would someone send it to a friend or post it to a story?
- `standalone` — zero-context comprehension.
- `trend` — fit with the formats in section 3.
- `payoff` — does it land? Ends on the strongest line?

Use the full range. If every clip gets 8s, the ranking is useless.

## 5. Packaging (write these for the platform, not for the transcript)

- `title` — ≤ 60 characters, curiosity + clarity, no lies. Match the speaker's language; for Hindi–English
  mixing write natural Hinglish in Roman script.
- `hook_text` — on-screen overlay for the first ~3 s, ≤ 7 words, readable in 1.5 s, and it must
  *add* to the first spoken line (a frame, a stake, a number), never repeat it verbatim.
- `caption` — ≤ 150 characters, ends with a question or prompt that invites comments.
- `hashtags` — 3–5, specific beats generic, no #viral / #fyp spam.
