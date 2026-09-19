---
name: shortform-edit-plan
description: Turn a transcript into a shot-by-shot edit plan for shortform video — identify the hook, body beats and CTA, mark the sentences that need visual explanation, and specify what animation each one gets. Use when planning an edit from a script or transcript, deciding where graphics go, or asking what a reel needs on screen. Not for rendering; this produces the plan a renderer executes.
---

# Planning a shortform edit

An edit is not decoration applied to footage. It is a **roadmap** that makes the viewer
understand something. Everything below exists to answer one question per sentence: *does the
viewer need to SEE this to understand it?*

Work in three passes, in order. Do not skip to branding — a beautiful animation on an
unimportant sentence is wasted, and an unbranded animation on the right sentence still works.

---

## Pass 1 — ANALYSE: find the sentences that carry the value

Read the transcript and mark every sentence where the answer to *"is this crucial for the
viewer to understand?"* is **yes**. Those are the only sentences that get animation.

Most sentences are not crucial. A 60-second reel has typically **4–7** crucial moments. If
you have marked more than one every 6 seconds you are marking filler.

What qualifies:

- **A number or claim** — "6k per brand deal", "3 mistakes", "₹497 → ₹97". Figures are the
  single strongest signal; the measured references cut hardest on them.
- **A new concept** the viewer has not met yet.
- **A comparison** — before/after, wrong/right, them/us.
- **A list** the viewer is expected to remember.
- **A mechanism** — *how* something works, not that it exists.

What does not qualify, however emphatic the delivery: greetings, transitions ("so", "now",
"basically"), restatements, and anything abstract with no imageable noun ("to be honest",
"trust me", "you know"). Marking these is what produces stock-footage slop.

---

## Pass 2 — PLAN: decide what each marked moment shows

For each marked sentence, choose the animation by **what kind of thing it is**, not by what
looks good:

| The sentence is… | The animation must… |
|---|---|
| introducing a new concept | **name it** — the term lands on screen as an object, held long enough to read |
| explaining how something works | **represent it** — parts, arrows, sequence; the structure is the point |
| a number or result | **promote it** — the figure alone, hero scale, everything else clears |
| a comparison | **place both** — two panels, or one replacing the other on the cut |
| a list | **build it** — items arrive one at a time, previous ones persist |
| a warning or mistake | **mark it** — a strike, cross, or red accent on the thing being warned about |

Then check the plan as a whole. Read the marked moments in sequence and ask whether someone
who watched *only those* would follow the argument. If there is a jump, the missing step
needs a moment of its own. That sequence is the roadmap.

**Timing rule, measured on reference reels:** a graphic lands **on the content word**, about
100ms after its onset — not in the pause before it, and not on the sentence boundary. The
ear leads, the eye follows. Across 28 measured motion events only 7% fell in a pause and 11%
near a phrase boundary, while 23 of 26 landed on a content word.

---

## Pass 3 — BRAND: make it one video, not a pile of animations

Fix these once, before any animation is designed, and apply them to all of them:

- **Palette** — a ground, a support, ONE accent, and an ink. The accent appears rarely and
  always means "look here". More than one accent and neither reads.
- **Type** — one hero face and one support face. Not three.
- **Secondary objects** — the recurring props/shapes this video uses (tape, torn paper,
  chips, arrows). Pick a small set and reuse it; variety here reads as inconsistency.
- **Theme** — the world the frame lives in: paper, technical, poster, document, night.

Source the direction from actual references (Pinterest, a competitor's reel) rather than
describing it in words, and state the palette as hex before designing anything.

---

## Shortform structure — measured, not assumed

From six Indian creator reels (Hinglish, growth/education content):

```
duration      65.5s mean
delivery      3.2 words/sec          — fast; captions must keep up, ≤4 words on screen
cut rate      0.22 cuts/sec          — a cut roughly every 4.5s
FIRST CUT     0.79s mean             — four of six cut within 0.15s of frame one
```

**The hook occupies 0–3s and always does one of these.** All six observed:

- **Pain callout** — "your followers aren't growing and you're not working with brands"
- **Question** — "do your friends even engage with your reels?"
- **Promise/reveal** — "today I'm finally going to show you how I make…"
- **Offer** — "you want Premiere Pro and After Effects free?"
- **Audience callout + tease** — "Ranchi people, you are not ready for this"
- **Mistake callout** — "bro, if you repost…"

The hook is spoken over a frame that **already has a cut in it**. Do not open on a static
held shot.

**The CTA is the last 3–5 seconds** and is one of three asks, never a vague "follow for
more":

- **Comment trigger** — "comment *plugin* and I'll send it to you"
- **DM trigger** — "I'll send the step-by-step to your DM"
- **Follow** — often stacked onto another ask: "go check that, and bro, follow"

A trigger word beats a bare follow because it converts a viewer into a message thread.

**The body** sits between them, chunked into 3–5 value beats, each one a marked sentence
from Pass 1 with its own animation.

---

## Output format

Produce a plan, not prose:

```
HOOK   0.0–3.1s   "your followers aren't growing"     → pain callout, cut on frame 1
BEAT 1 4.2s       "value provide karo"                → new concept, name it
BEAT 2 12.8s      "3 steps"                           → list, build one at a time
BEAT 3 24.0s      "10k followers"                     → figure, promote to hero
CTA    58.0–62.0s "comment GROWTH"                    → comment trigger, chip + arrow
BRAND  ground #101014 · support #2b2b33 · accent #ff4d3d · ink #f5f3ee
       hero Anton · support Montserrat · theme: paper
```

Every line ties a timestamp to a spoken phrase to a reason. If you cannot state the reason,
the moment does not need an animation.
