---
name: shortform-branding
description: Derive a video's visual brand — palette, type, secondary objects, theme — from reference images the user supplies (Pinterest boards, competitor frames, moodboards), and express it as a spec every animation obeys. Use when the user drops reference imagery, asks for a colour palette for an edit, or wants animations to feel consistent. Pairs with shortform-edit-plan, which decides WHAT gets animated; this decides how it looks.
---

# Branding a video from references

The point of branding is consistency: a viewer should not be able to tell that animation 3
and animation 7 were designed separately. Pick the rules once, then obey them.

**Derive the brand from the references, not from taste.** If the user gave you images, the
palette is in those images — measure it. Describing a look in adjectives ("clean", "premium",
"bold") produces a different result every time it is read.

---

## Extract the palette from the references

Sample the images and read the colours out; do not eyeball them.

```bash
# per-image dominant colours, quantised
ffmpeg -v error -i ref.jpg -vf "scale=80:-1,format=rgb24" -f rawvideo - \
  | node -e "…"   # bucket RGB, sort by frequency
```

Two measurement traps, both of which have produced wrong palettes before:

- **ffmpeg's `signalstats` SATAVG is not a 0–100 saturation.** Reading it that way classified
  a yellow duotone and a cobalt card as greyscale. Convert actual RGB to HSV instead.
- **Skin tone reads as orange.** Any reference with a face in it returns "orange" as its
  dominant hue whatever the grade is. Only trust a hue that *beats* skin, and prefer the
  **colour share** (what fraction of pixels are saturated at all) which is not confounded.

Then assign four roles. Not five, not eight:

| Role | What it does | Rule |
|---|---|---|
| **ground** | the canvas behind everything | the darkest or lightest, whichever the references favour |
| **support** | secondary surfaces, bands, panels | close to ground in value, never competing |
| **accent** | the "look here" colour | ONE. Used rarely. If two colours both shout, neither does |
| **ink** | type and rules | maximum contrast against ground |

If the references are paper-like, assign by **luminance**, not by position in a list — the
lightest colour is the page and the darkest is the ink, whichever order they came in.

---

## Type

One hero face, one support face. The hero carries figures and titles; the support carries
kickers, labels and small caps. A third face is almost always a mistake.

Match the references' *weight and width*, not the exact family — a condensed heavy sans
reads as the same brand whether it is Anton or Oswald. State fallbacks, because the render
surface may not have the file.

## Secondary objects

The recurring props this video is allowed to use — tape, torn paper, chips, arrows, rules,
stickers. Pick **a small set and reuse it**. Variety here does not read as richness; it reads
as inconsistency. Three or four object types across a whole video is plenty.

## Theme

Name the world the frame lives in, because it decides what the frame *is* rather than how it
is decorated: paper, document, technical drawing, poster, night/neon, photo stack. Two videos
with the same palette and different themes look unrelated; that is the point of naming it.

---

## Output format

A spec, in hex, that an animation can be checked against:

```
PALETTE   ground #101014 · support #2b2b33 · accent #ff4d3d · ink #f5f3ee
          accent appears on: the figure, the strike-through, one chip. Nowhere else.
TYPE      hero Anton (fallback 'Arial Black') · support Montserrat 700
OBJECTS   torn-paper band · tape pin · courier chip · single arrow
THEME     paper — everything is a thing that could exist on a desk
GRADE     none — the speaker's footage is never colour graded
```

The last line matters and is easy to lose: **grade is a style decision that can be forbidden
by the client.** If the user has said not to grade their footage, the brand spec must say so
explicitly, because several code paths will otherwise synthesise one from the palette.

---

## Checking a finished animation against the spec

Ask, in order:

1. Does it use a colour outside the four roles? (The commonest failure.)
2. Does the accent appear more than twice on screen at once?
3. Is there a third typeface?
4. Is an object used once and never again?
5. Would this frame be recognisable as the same video as the hook?

A "no" to 5 means the brand did not hold, whatever the individual frame looks like.
