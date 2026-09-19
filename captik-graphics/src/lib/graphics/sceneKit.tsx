// Shared kit for SCENE templates.
//
// A scene is a different animal from an overlay. Overlays are stickers: self-contained, fixed
// aspect, dropped over someone's footage. Scenes OWN the frame — they are fullBleed, they paint
// their own background, and their interior is hand-choreographed the way a motion designer would
// build one shot: elements that relate to each other, exits that overlap the next entrance,
// nothing easing to a dead stop.
//
// This exists because composing a film from overlays produced a slideshow — a collage of widgets
// on dead black, each doing its own thing on its own clock. The fix is not more polish on the
// widgets; it is making the unit of composition a SCENE. A film is then 6-10 scene instances on
// the timeline: editable where it matters (copy, brand, timing, order) and art-directed where it
// matters (the interior).
//
// Everything here is a pure function of timeMs. No CSS motion — see types/graphics.ts.

import type { CSSProperties } from 'react';

/** Smootherstep: ease in AND out, zero velocity at both ends. Nothing snaps into place. */
export function glide(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** THE speed ramp: fast in, slow through the readable middle, fast out again (~2.2x at the
 *  edges, 0.33x in the middle). Use for anything that TRAVELS. Easing to a full stop is what
 *  makes a piece read as slides. */
export function ramp(t: number, k = 0.85): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return (x + (k / Math.PI) * (Math.cos(Math.PI * x) - 1)) / (1 - (2 * k) / Math.PI);
}

/** 0 before `a`, glides up over `ri`, holds, glides down over `ro` before `b`. The scene-level
 *  windowing primitive: every element enters AND leaves under motion. */
export function win(t: number, a: number, b: number, ri: number, ro: number): number {
  if (t < a || t >= b) return 0;
  if (t < a + ri) return glide((t - a) / ri);
  if (t > b - ro) return 1 - glide((t - (b - ro)) / ro);
  return 1;
}

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Gravity with weight: accelerating fall, landing PAST the target, then rebound and settle.
 *  Returns 0..~1.15..1. Freeze-framing on contact is what reads as cheap. */
export function drop(t: number): number {
  const x = clamp01(t);
  if (x < 0.72) { const u = x / 0.72; return u * u; }
  const u = (x - 0.72) / 0.28;
  return 1 + 0.16 * Math.sin(u * Math.PI) * (1 - u);
}

/** Hex -> rgba() at alpha. Passes non-hex through so a param already holding rgba() survives. */
export function alpha(hex: string, a: number): string {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return hex;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Perceived luminance 0..1 — for deciding readable ink over a user-chosen background. */
export function lum(hex: string): number {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return 0;
  const n = parseInt(full, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/** The scene ground: brand background + two soft accent blooms that drift the whole time, so the
 *  frame is never dead flat and never perfectly still. */
export function sceneGround(bg: string, accent: string, t: number, w: number, h: number): CSSProperties[] {
  // On a light ground the same bloom opacity reads as a dirty smudge rather than light.
  const k = lum(bg) > 0.5 ? 0.5 : 1;
  const d = Math.sin((t / 1000) * 0.55) * (w * 0.014);
  const d2 = Math.cos((t / 1000) * 0.42) * (w * 0.012);
  const r = Math.round(Math.min(w, h) * 0.62);
  return [
    { position: 'absolute', inset: 0, background: bg },
    { position: 'absolute', left: -r * 0.42 + d, top: -r * 0.38 + d2, width: r, height: r,
      borderRadius: '50%', background: accent, opacity: 0.12 * k, filter: `blur(${Math.round(r * 0.16)}px)` },
    { position: 'absolute', right: -r * 0.38 - d, bottom: -r * 0.4 - d2, width: r * 0.9, height: r * 0.9,
      borderRadius: '50%', background: accent, opacity: 0.09 * k, filter: `blur(${Math.round(r * 0.17)}px)` },
  ];
}

/** Film grain as an inline data URI — self-contained, no bundle asset, deterministic. */
export function sceneGrain(opacity = 0.05): CSSProperties {
  return {
    position: 'absolute', inset: '-8%', opacity, pointerEvents: 'none',
    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/></filter><rect width='120' height='120' filter='url(%23n)'/></svg>")`,
  };
}

export function sceneVignette(strength = 0.42): CSSProperties {
  return {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: `radial-gradient(115% 80% at 50% 45%, transparent 55%, rgba(0,0,0,${strength}) 100%)`,
  };
}

/** Split "a|b\nc|d" into rows of cells. The house idiom for multi-row params. */
export function rows(raw: string, max = 6): string[][] {
  return String(raw).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, max)
    .map((l) => l.split('|').map((c) => c.trim()));
}

/** Words of a headline, for per-word motion. */
export function words(raw: string): string[] {
  return String(raw).split(/\s+/).filter(Boolean);
}

/** A scene's own edge envelope. Scenes paint an OPAQUE ground, so two overlapping scene
 *  instances would hard-cut at the overlap. Giving every scene a short fade at both ends turns
 *  an overlap into a crossfade — the film gets continuous motion across a cut, and the fade
 *  stays inside the scene (i.e. inside the editable instance) rather than living in a player. */
export function sceneFade(t: number, durationMs: number, inMs = 170, outMs = 300): number {
  return win(t, -1, durationMs, Math.max(1, inMs), Math.max(1, outMs));
}

/** Grain + vignette strength for a background. A 0.42 black vignette is right on near-black and
 *  filthy on a white brand; a scene library that only works on dark backgrounds is not a library.
 *  Found by running the same film against a second, light-themed brand. */
export function finishFor(bg: string): { grain: number; vig: number } {
  return lum(bg) > 0.5 ? { grain: 0.022, vig: 0.05 } : { grain: 0.05, vig: 0.42 };
}
