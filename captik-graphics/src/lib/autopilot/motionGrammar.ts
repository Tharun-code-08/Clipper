// MOTION GRAMMAR — how the frame MOVES, measured off the references at 30fps.
//
// Every earlier analysis sampled frames 500ms apart, which throws away 15 frames of
// animation between samples. Composition, palette, typography and furniture were all
// studied; motion never was. That is why the output kept reading as static and generic no
// matter how the layouts changed: in the references almost nothing is ever still, and in
// ours almost nothing ever moves.
//
// Measured, frame-counted, at 30fps:
//   · the CONTAINER animates — the video rect morphs between compositions (small rounded
//     card ↔ full bleed ↔ multi-card grid) in 3 frames, ~100ms. Snappy, not a slow ease.
//     (pulse 4.60s and 7.63s: card → full bleed across frames 0-3)
//   · a CUT is punctuated by a white FLASH — 2 frames of near-pure white, then a ramp down
//     to the new ground over ~5 frames. (impact_2 7.43s: white, white, grey, dark, black)
//   · the caption keyword is PROMOTED to hero size exactly ON that cut, and stays locked in
//     position while the ground changes underneath it. (impact_2: "MARATHON")
//   · footage and stills are NEVER static — a continuous slow push runs under everything.
//     (zine 3.60s: the frame scales visibly across all 14 frames of a 466ms window)
//   · caption words build ~2 frames apart — 66ms, far faster than our 250-400ms.
//
// Pure(time), like chunkPose / shotAt / motionPose: one evaluator, so preview and both
// export compositions replay identical motion.

export type Composition = 'full' | 'card' | 'gridPair';

export interface FramePose {
  /** Video rect, % of frame [x,y,w,h] — interpolated during a morph. */
  rect: [number, number, number, number];
  /** Corner radius %, also interpolated (a card is rounded, full bleed is not). */
  radius: number;
  /** 0..1 morph progress, for callers that want to fade furniture across the change. */
  morph: number;
}

/** Composition → its resting rect and radius. */
const COMPOSITIONS: Record<Composition, { rect: [number, number, number, number]; radius: number }> = {
  full:     { rect: [0, 0, 100, 100], radius: 0 },
  card:     { rect: [12, 17, 76, 50], radius: 5 },
  gridPair: { rect: [6, 9, 56, 40], radius: 4 },
};

/** 3 frames at 30fps. Measured on pulse; a slower ease reads as sluggish, not smooth. */
export const MORPH_MS = 100;
/** 2 frames of white, then 5 frames ramping to the new ground. Measured on impact_2. */
export const FLASH_HOLD_MS = 66;
export const FLASH_RAMP_MS = 165;
/** Continuous push. Slow enough to be subliminal, never zero.
 *  @deprecated Superseded by pushAt(). See the note on pushScale below. */
export const PUSH_PER_SEC = 0.018;
export const PUSH_MAX = 1.14;

/**
 * THE MEASURED PUSH — a burst on a beat, not a constant creep.
 *
 * The first version of this file claimed "footage is never static" and applied a continuous
 * 1.8%/sec ramp under everything. That came from frame-DIFFERENCE, which conflates zoom with
 * the subject moving, captions changing and cuts — a talking head reads as "live" while the
 * camera sits perfectly still.
 *
 * Estimating the actual scale between every consecutive frame pair at 30fps says the
 * opposite: the reference is STILL for 92% of its runtime and pushes in short localised
 * bursts of +0.12 to +0.15% per frame (3.6-4.5%/sec) lasting under a second. That is a
 * different feel entirely — a constant creep reads as drift, a burst on a beat reads as
 * emphasis.
 */
export const PUSH_BURST_MS = 700;
export const PUSH_RATE_PER_SEC = 0.042;
/** Ceiling across a whole clip, so many beats cannot stack into an absurd zoom. */
export const PUSH_CEILING = 1.18;
/** Caption words land 2 frames apart. */
export const WORD_STEP_MS = 66;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Snappy in, settled out — matches the 3-frame morph, which is nearly linear with a soft tail. */
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 2.2);

export interface CompositionChange {
  atMs: number;
  to: Composition;
}

/**
 * The container at tMs.
 *
 * Changes are a sorted list of "at this moment the frame becomes X". Between changes the
 * rect rests; across a change it MORPHS over MORPH_MS. The morph is the single biggest
 * difference between our output and the references — ours cuts from one static rect to
 * another, theirs travels.
 */
export function framePose(
  changes: readonly CompositionChange[],
  tMs: number,
  initial: Composition = 'full',
): FramePose {
  let from = COMPOSITIONS[initial];
  let to = from;
  let k = 1;
  for (const c of [...changes].sort((a, b) => a.atMs - b.atMs)) {
    if (tMs < c.atMs) break;
    from = to;
    to = COMPOSITIONS[c.to] ?? to;
    k = clamp01((tMs - c.atMs) / MORPH_MS);
  }
  const e = easeOut(k);
  const lerp = (a: number, b: number) => a + (b - a) * e;
  return {
    rect: [
      lerp(from.rect[0], to.rect[0]),
      lerp(from.rect[1], to.rect[1]),
      lerp(from.rect[2], to.rect[2]),
      lerp(from.rect[3], to.rect[3]),
    ],
    radius: lerp(from.radius, to.radius),
    morph: e,
  };
}

/**
 * The white flash that punctuates a cut.
 *
 * Returns 1 during the hold (near-pure white over the frame) then ramps to 0. Applied as a
 * white overlay's opacity. Without this a composition change reads as a glitch; with it,
 * it reads as an edit.
 */
export function flashAt(cuts: readonly number[], tMs: number): number {
  for (const c of cuts) {
    const rel = tMs - c;
    if (rel < 0 || rel >= FLASH_HOLD_MS + FLASH_RAMP_MS) continue;
    if (rel < FLASH_HOLD_MS) return 1;
    return 1 - clamp01((rel - FLASH_HOLD_MS) / FLASH_RAMP_MS);
  }
  return 0;
}

/**
 * The continuous push.
 *
 * @deprecated Kept for the scratch renderers only. It encodes a constant creep, which the
 * frame-by-frame scale measurement disproved — use pushAt(), which holds still and bursts
 * on a beat as the reference actually does.
 */
export function pushScale(shotStartMs: number, tMs: number): number {
  const secs = Math.max(0, (tMs - shotStartMs) / 1000);
  return Math.min(PUSH_MAX, 1 + secs * PUSH_PER_SEC);
}

/**
 * Scale at tMs: rests, then bursts for PUSH_BURST_MS after each beat.
 *
 * Each burst adds to what came before rather than springing back — a push does not undo
 * itself — but the total is capped so a long clip with many beats stays sane.
 */
export function pushAt(beats: readonly number[], tMs: number): number {
  let scale = 1;
  for (const b of beats) {
    if (tMs <= b) continue;
    const held = Math.min(tMs - b, PUSH_BURST_MS) / 1000;
    scale += held * PUSH_RATE_PER_SEC;
  }
  return Math.min(PUSH_CEILING, scale);
}

/** The shot a moment belongs to — the latest cut at or before tMs. */
export function shotStartAt(cuts: readonly number[], tMs: number): number {
  let start = 0;
  for (const c of cuts) if (c <= tMs && c > start) start = c;
  return start;
}

/**
 * A keyword promoted to hero size ON a cut, holding position while the ground changes.
 * Returns 0..1 presence; the caller draws the word at heroScale when it is > 0.
 */
export function promotionAt(
  promotions: readonly { atMs: number; durMs: number }[],
  tMs: number,
): number {
  for (const p of promotions) {
    if (tMs < p.atMs || tMs >= p.atMs + p.durMs) continue;
    const inK = clamp01((tMs - p.atMs) / 80);
    const outK = clamp01((p.atMs + p.durMs - tMs) / 120);
    return Math.min(easeOut(inK), outK);
  }
  return 0;
}

/** CSS transform for a pushed layer, about a stable origin. */
export const pushCss = (scale: number) =>
  scale <= 1 ? '' : `transform:scale(${scale.toFixed(4)});transform-origin:50% 45%;`;


/**
 * Morph between an ARTEFACT'S OWN composition states.
 *
 * framePose() interpolates the three generic compositions. An artefact has its own — a
 * document page moves its pasted card, a technical drawing re-frames its specimen — so it
 * needs the same travel over its own rects. Without this an artefact renders one fixed
 * rect for the whole clip and the only thing moving is the push, which is exactly how the
 * artefact pass shipped with no motion in it.
 *
 * `states[0]` is the resting composition; each beat advances to the next, wrapping.
 */
export function rectPoseAt(
  states: readonly (readonly [number, number, number, number])[],
  beatsMs: readonly number[],
  tMs: number,
): { rect: [number, number, number, number]; morph: number; index: number } {
  const first = (states[0] ?? [0, 0, 100, 100]) as [number, number, number, number];
  if (states.length < 2 || !beatsMs.length) return { rect: first, morph: 1, index: 0 };

  const past = beatsMs.filter((b) => tMs >= b).sort((a, b) => a - b);
  if (!past.length) return { rect: first, morph: 1, index: 0 };

  const i = past.length;                          // how many beats have fired
  const from = states[(i - 1) % states.length];
  const to = states[i % states.length];
  const k = clamp01((tMs - past[past.length - 1]) / MORPH_MS);
  const e = easeOut(k);
  const lerp = (a: number, b: number) => a + (b - a) * e;
  return {
    rect: [lerp(from[0], to[0]), lerp(from[1], to[1]), lerp(from[2], to[2]), lerp(from[3], to[3])],
    morph: e,
    index: i % states.length,
  };
}

/**
 * Furniture RESTAGES on each beat rather than animating once at t=0.
 *
 * The bespoke layer plays its data-fx entrances off `--bt`. Feeding it absolute clip time
 * means every element animates in during the first second and is then frozen for the rest
 * of the video. Feeding it time-since-the-last-beat makes the furniture re-enter on every
 * composition change, which is what the references do.
 */
export function restageClock(beatsMs: readonly number[], tMs: number): number {
  let last = 0;
  for (const b of beatsMs) if (b <= tMs && b > last) last = b;
  return tMs - last;
}
