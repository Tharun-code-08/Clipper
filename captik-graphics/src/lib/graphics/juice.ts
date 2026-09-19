// Motion JUICE — the difference between "good" and "I need this in my video".
//
// Professional edits are never still and never land softly: entrances end in a settle-shake,
// held poses breathe and drift, impact moments get a flash and a one-frame chromatic pop.
// These are the shared pure helpers for that language. EVERYTHING here is a pure function of
// a millisecond clock (+ remotion's seeded random) — no wall clock, no state, export-safe.

import { random } from 'remotion';

/** Decaying shake after an impact at `atMs` — the "camera got hit" read. Two detuned sines so
 *  the path never repeats visibly. Returns px offsets in DESIGN space. */
export function shakeDecay(
  t: number, atMs: number, ampPx: number, opts?: { freq?: number; decayMs?: number; seed?: string },
): { x: number; y: number } {
  const dt = t - atMs;
  if (dt < 0) return { x: 0, y: 0 };
  const freq = opts?.freq ?? 52;
  const decayMs = opts?.decayMs ?? 340;
  const ph = opts?.seed ? random(`${opts.seed}-shk`) * Math.PI * 2 : 0;
  const env = Math.exp(-dt / decayMs) * ampPx;
  return {
    x: Math.sin((dt / 1000) * freq + ph) * env,
    y: Math.cos((dt / 1000) * freq * 0.83 + ph * 1.7) * env * 0.7,
  };
}

/** Endless gentle drift for HELD poses — nothing in a tempting template ever sits still.
 *  Two detuned sines per axis; amplitude in design px (2-6 reads as alive, more reads as broken). */
export function idleFloat(
  t: number, seed: string, ampPx = 4, periodMs = 2600,
): { x: number; y: number; rot: number } {
  const p1 = random(`${seed}-f1`) * Math.PI * 2;
  const p2 = random(`${seed}-f2`) * Math.PI * 2;
  const w = (Math.PI * 2) / periodMs;
  return {
    x: (Math.sin(t * w + p1) + 0.5 * Math.sin(t * w * 1.73 + p2)) * ampPx * 0.66,
    y: (Math.cos(t * w * 0.87 + p2) + 0.5 * Math.sin(t * w * 1.31 + p1)) * ampPx * 0.66,
    rot: Math.sin(t * w * 0.61 + p1) * ampPx * 0.12,
  };
}

/** Soft breathing pulse between lo..hi — for glows, scales, ring opacities. Eased sine. */
export function pulse(t: number, periodMs: number, lo = 0, hi = 1, phase = 0): number {
  const s = 0.5 + 0.5 * Math.sin((t / periodMs) * Math.PI * 2 + phase);
  const eased = s * s * (3 - 2 * s);
  return lo + (hi - lo) * eased;
}

/** Impact flash envelope: instant spike at `atMs`, fast exponential falloff. 0 outside. */
export function impactFlash(t: number, atMs: number, decayMs = 160): number {
  const dt = t - atMs;
  if (dt < 0) return 0;
  return Math.exp(-dt / decayMs);
}

/** One-beat chromatic pop as a text-shadow string: red ghost left, cyan ghost right, strongest
 *  at the impact instant, gone ~200ms later. Layered ON TOP of any existing shadow via join. */
export function chromaPop(t: number, atMs: number, maxPx = 6): string {
  const k = impactFlash(t, atMs, 130);
  if (k < 0.02) return '';
  const d = (maxPx * k).toFixed(2);
  return `-${d}px 0 0 rgba(255,45,85,${(0.75 * k).toFixed(3)}), ${d}px 0 0 rgba(10,215,255,${(0.75 * k).toFixed(3)})`;
}

/** A scatter of sparkle placements around a box — draw each as a 4-point star SVG. Each sparkle
 *  pops (scale up, fade out) on its own beat after `atMs`. Positions in % of the container. */
export function sparkleField(
  seed: string, n: number, t: number, atMs: number,
  opts?: { spreadMs?: number; lifeMs?: number },
): { x: number; y: number; s: number; o: number; rot: number }[] {
  const spread = opts?.spreadMs ?? 480;
  const life = opts?.lifeMs ?? 520;
  const out: { x: number; y: number; s: number; o: number; rot: number }[] = [];
  for (let i = 0; i < n; i++) {
    const at = atMs + random(`${seed}-sd${i}`) * spread;
    const dt = t - at;
    if (dt < 0 || dt > life) continue;
    const q = dt / life;
    const grow = 1 - Math.pow(1 - Math.min(1, q * 2.4), 3);
    out.push({
      x: 6 + random(`${seed}-sx${i}`) * 88,
      y: 4 + random(`${seed}-sy${i}`) * 92,
      s: (0.5 + random(`${seed}-ss${i}`) * 0.9) * grow,
      o: q < 0.55 ? 1 : 1 - (q - 0.55) / 0.45,
      rot: random(`${seed}-sr${i}`) * 90,
    });
  }
  return out;
}

/** Standard 4-point sparkle path for a 24x24 viewBox — pair with sparkleField(). */
export const SPARKLE_PATH = 'M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z';

// ─────────────────────────────────────────────────────────────────────────────
// DEPTH + MOTION BLUR — what separates a $50 edit from a $5,000 one.
// Real AE work moves through 3D space and SMEARS when it moves fast. All fakes
// below are pure functions of the clock and render identically on every export
// surface (plain CSS transforms + filter: blur — no banned APIs).
// ─────────────────────────────────────────────────────────────────────────────

/** Numeric velocity of ANY pure motion value, by central difference. Feed the same closure you
 *  use for the position — `vel((ms) => spring({frame: fr(ms), ...}), t)` — and you get units/ms,
 *  which drives blur amount, smear stretch and ghost spacing. */
export function vel(sample: (ms: number) => number, t: number, dtMs = 26): number {
  return (sample(t + dtMs / 2) - sample(t - dtMs / 2)) / dtMs;
}

/** Motion-blur styles for a mover with velocity (vx, vy) in px/ms.
 *  - `blurPx`: uniform blur that scales with speed (0 at rest — the pose stays crisp)
 *  - `sx`/`sy`: squash-and-stretch factors ALONG the motion axis (compose into transform)
 *  Tuned so a fast 500px slam peaks around blur 7 / stretch 1.16 and dies ~80ms after landing. */
export function smear(vx: number, vy: number, strength = 1): { blurPx: number; sx: number; sy: number } {
  const speed = Math.hypot(vx, vy) * strength;
  const blurPx = Math.min(8, speed * 2.4);
  const stretch = Math.min(0.18, speed * 0.055);
  const horiz = Math.abs(vx) >= Math.abs(vy);
  return {
    blurPx,
    sx: horiz ? 1 + stretch : 1 - stretch * 0.55,
    sy: horiz ? 1 - stretch * 0.55 : 1 + stretch,
  };
}

/** Trailing ghost copies against the motion direction — the classic smear-frame read. Render the
 *  SAME content n more times at these offsets/opacities (cheap: 2 is plenty). Empty at rest. */
export function ghosts(
  vx: number, vy: number, n = 2, gapMs = 34,
): { dx: number; dy: number; opacity: number }[] {
  const speed = Math.hypot(vx, vy);
  if (speed < 0.25) return [];
  const out: { dx: number; dy: number; opacity: number }[] = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      dx: -vx * gapMs * i,
      dy: -vy * gapMs * i,
      opacity: Math.min(0.5, speed * 0.5) * Math.pow(0.45, i),
    });
  }
  return out;
}

/** House perspective depth, in px. Same value everywhere or mixed scenes look glued together. */
export const PERSP = 1100;

/** 3D swing-in entrance: interpolates rotateX/rotateY/translateZ to identity as `prog` 0→1.
 *  Returns a transform PREFIX — append your own translate/scale after it. Overshoot in the
 *  spring you drive `prog` with reads as the card swinging past vertical and settling. */
export function swingIn(
  prog: number,
  from: { rx?: number; ry?: number; z?: number } = {},
): string {
  const k = 1 - prog;
  const rx = (from.rx ?? -16) * k;
  const ry = (from.ry ?? 0) * k;
  const z = (from.z ?? -90) * k;
  return `perspective(${PERSP}px) translateZ(${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
}

/** Resting 3D sway — the held pose keeps living in space instead of flattening back to a web
 *  page. Two detuned axes, ±deg small (1.5-3 reads premium; more reads seasick). */
export function sway3d(t: number, seed: string, deg = 2, periodMs = 3600): string {
  const p1 = random(`${seed}-s3a`) * Math.PI * 2;
  const p2 = random(`${seed}-s3b`) * Math.PI * 2;
  const w = (Math.PI * 2) / periodMs;
  const rx = Math.sin(t * w + p1) * deg * 0.6;
  const ry = Math.cos(t * w * 0.77 + p2) * deg;
  return `perspective(${PERSP}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`;
}

/** Entrance swing AND resting sway in ONE perspective prefix — two `perspective()` functions
 *  cannot compose in a single transform, so this is the way to have both. `enter` is your
 *  entrance spring (0→1, overshoot welcome); at 1 only the sway remains. */
export function depthPose(
  t: number, seed: string,
  opts: { enter?: number; rx?: number; ry?: number; z?: number; swayDeg?: number; periodMs?: number } = {},
): string {
  const enter = opts.enter ?? 1;
  const k = 1 - enter;
  const deg = opts.swayDeg ?? 2;
  const periodMs = opts.periodMs ?? 3600;
  const p1 = random(`${seed}-s3a`) * Math.PI * 2;
  const p2 = random(`${seed}-s3b`) * Math.PI * 2;
  const w = (Math.PI * 2) / periodMs;
  const rx = (opts.rx ?? -16) * k + Math.sin(t * w + p1) * deg * 0.6;
  const ry = (opts.ry ?? 0) * k + Math.cos(t * w * 0.77 + p2) * deg;
  const z = (opts.z ?? -90) * k;
  return `perspective(${PERSP}px) translateZ(${z.toFixed(1)}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`;
}

/** Parallax offset for a layer at `depth` (0 = glued to the card, 1 = far foreground) given the
 *  current sway phase — pair with sway3d on the parent so inner layers shear over each other. */
export function parallax(t: number, seed: string, depth: number, ampPx = 10, periodMs = 3600): { x: number; y: number } {
  const p1 = random(`${seed}-s3a`) * Math.PI * 2;
  const p2 = random(`${seed}-s3b`) * Math.PI * 2;
  const w = (Math.PI * 2) / periodMs;
  return {
    x: Math.cos(t * w * 0.77 + p2) * ampPx * depth,
    y: Math.sin(t * w + p1) * ampPx * depth * 0.6,
  };
}
