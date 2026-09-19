---
name: shortform-motion-design
description: Design and animate on-screen graphics for shortform video — what moves, when, how long, and how to have a model author animation safely via a validated spec rather than free-form code. Use when building kinetic captions, figure/list/comparison graphics, or any LLM-driven motion system. Contains the measured timings and the composition guarantees that must be enforced rather than requested.
---

# Motion design for shortform

Measured off real reels and off frames actually rendered. Numbers here are observations, not
preferences.

---

## The caption IS the design

The most expensive mistake available: building "graphics" as cards that sit beside a plain
subtitle. Sampling real reels frame by frame shows the opposite — there is no separate
graphic. **The spoken words themselves are the design**, set large, two to four at a time,
one picked out in colour and size while the rest stay small.

```
tum brands ke saath        "brands" large + red, the rest small + white
sabse pehle                "Sabse" large, "pehle" small beneath
23000 logon ko PDF         "23000" huge, the label small under it
```

**Romanise, do not translate.** If the speaker says Hinglish, the screen says Hinglish in
Latin script. Rendering "A LOT OF OPTIONS" where they said "bahut saare options hain" throws
away the voice, and it is the single largest reason an output looks unlike its reference.
Latin script is what a renderer needs (Devanagari glyphs are a font problem); that is not the
same requirement as English, and conflating the two is what produced the mismatch.

## Match the animation to the meaning

| The sentence is… | The animation must… |
|---|---|
| a number or result | **promote it** — the figure alone, hero scale, everything clears |
| a new term | **name it** — the term lands as an object and holds long enough to read |
| how something works | **represent it** — parts, arrows, sequence; the structure is the point |
| a comparison | **place both** — two panels, one visibly preferred |
| a list | **build it** — items arrive one at a time, earlier ones persist |
| a mistake or myth | **mark it** — the claim lands intact, THEN it is struck |

Same animation on all six is decoration. The difference between them is the product.

---

## Timing, measured

- A graphic lands **~100ms after the content word's onset** — the ear leads, the eye follows.
  Across 28 measured events only 7% fell in a pause; 23 of 26 landed on a content word.
- **Entrance 80–300ms.** Entry is a pop; nothing slides in slowly.
- **Exit is usually a hard cut.** Reference styles remove a graphic, they do not fade it.
- **Stagger 120–450ms** between elements. Things arriving together read as one thing.
- **A moment holds ~2.6s** and must not overlap the next. The renderer shows the LAST moment
  containing the playhead, so overlapping holds do not stack — they truncate, and a moment
  400ms after another appears and is killed mid-entrance.
- Below **~700ms** a graphic cannot land, hold and clear. Report those rather than render a
  flicker.

## A HOLD IS NOT A FREEZE

The most important one. An element that finishes its entrance and stops is a PNG pasted over
video. Measured on a 2.6s hold at 30fps: **only 20 of 78 frames differed from the previous
one** — everything was done by 667ms and nothing moved for the remaining 1933ms. That is
exactly what "there's no animation" looks like from the outside.

Give every element sustained motion for the rest of its life — a slow drift and a slight scale
creep are enough (~0.5% of frame, ~2.5% scale over the hold). Then assert it:

> no two consecutive frames of a hold may have an identical pose

## Flashes and wipes punctuate a CUT, not a graphic

A white flash is 2 frames of near-white then a ~165ms ramp. That is right for a hard visual
change and very wrong for a number arriving — feeding it every beat blew a rendered frame out
to 58% white.

**An auto-cut seam is not a cut.** Those are removed pauses; the entire point of trimming dead
air is that the join is invisible. Flashing each one makes a six-cut clip strobe. Only a hard
cut into or out of a genuinely different shot earns a flash; a wipe does not, because the wipe
already is the transition.

Layer order matters as much as the effect: a wipe belongs **above the picture and below the
graphics**. Drawn on top of everything it becomes a full-height wall clipping the captions,
and at a 1s wipe you are caught mid-sweep most of the time.

---

## Letting a model author the animation

Picking one of six templates is not authoring. Give the model a **validated spec** — elements,
positions, colour roles, timings, entrances — and interpret it.

Not free-form code: a spec serialises into render props (so a cloud renderer gets the identical
scene), nothing is evaluated, and every value can be clamped so bad output degrades to a
legible frame instead of a crash.

### Enforce, do not request

Each of these was in the prompt, and then broken by a strong model on a real clip:

- **Colours are ROLES** (`accent | ink | ground | support`), never hex. The brand then cannot
  be escaped.
- **One accent per scene.** When two things shout, neither is heard. Demote the rest.
- **A frame-sized filled element is a plate** — one rendered as a "box" swallowed half the
  frame in solid accent and buried the scene.
- **Nothing overlaps.** A model placing by eye put two words at the same y and both became
  unreadable. Give each element an estimated box and nudge later ones clear — but only when
  their x-ranges intersect too, or you will stack a mechanism's side-by-side boxes.
- **Text must fit.** Clamping the CENTRE leaves a long line overhanging both edges. Estimate
  width (~0.6em/char for a bold grotesque, plus any plate padding) and shrink when it exceeds
  the frame — too wide means too big.
- **Contrast is a guarantee**: ink ≥4.5:1 and accent ≥3:1 against their own ground. A palette
  faithful to a reference but unreadable is not more faithful, it is broken.

### Give it a size control

"Make it bigger" must have somewhere to go. With only four fixed type steps, a revision can
only ever move things — add a continuous scale (and include it in the width estimate).

---

## Reading a reference

Sampling pixels gives a palette and nothing else. It cannot see that the reference stacks a
small-caps kicker over a huge figure, or that type overlaps the subject by a fifth. Have a
vision model describe the **design idea**: look, theme, type feel, recurring objects, and
concrete layout rules — then follow the layout rules literally.

- **Read it once and fix it for the whole video.** A brief per moment is how each moment ends
  up designed on its own and the video stops being one video.
- **Use the reference's own colours**, not the footage's. Following a reference's layout while
  colouring off the speaker's living room is half a redesign, and it is the half nobody
  notices.
- **Skin reads as orange.** Any reference with a face returns orange as its dominant hue.
  Exclude skin pixels before choosing an accent, and prove the exclusion changes the result
  with a control.

## Density

4–7 marked moments per 60s. But that scales to **one** on a 16-second take, and a 16-second
video with one graphic reads as no edit at all — short clips are usually the common case. Set
a floor (~3) and tell the model the target for THIS clip's length rather than leaving it to do
the arithmetic.

Beware rules that delete real moments. A "nothing inside the hook" rule sounds principled and
cost a clip its only figure, because the model had claimed a 14-second "hook" on a 16-second
video. Bound the hook (≤5s or a third of the clip) and let graphics live inside it — in
shortform the hook very often IS the number.
