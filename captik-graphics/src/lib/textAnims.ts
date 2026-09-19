// Text-layer entry animations — PURE functions of elapsed time. One code path drives the live
// preview (called every video timeupdate/rAF) AND every export surface (called per frame), so
// they are deterministic at any clock and sidestep the CSS-transition capture-jitter failure
// class entirely (iamdumb.md 2.8: a frame capture samples a wall-clock transition mid-flight).
//
// The nine capcut_* presets re-implement the founder-provided CapCut pack's named text
// animations; their durations match the pack's values (draft_content.json, microseconds).
// Unit-tested in textAnims.spec.ts — keep every function here side-effect free.

import type { TextAnimPresetId } from '@/types/textLayers';

export interface AnimPose {
  opacity: number;
  transform: string;
  filter?: string;
  /** typewriter: how many characters are visible (undefined = all). */
  clipChars?: number;
  /** manifest: animated letter-spacing in em (undefined = the layer's own). */
  letterSpacingEm?: number;
}

/** Entry duration (ms) per preset — the CapCut pack's exact values where applicable. */
export const ANIM_IN_MS: Record<TextAnimPresetId, number> = {
  none: 0,
  fade_up: 350,
  pop: 340,
  typewriter: 900,
  bobbing_up: 967,
  drift_down: 667,
  floating_line: 1000,
  fold: 500,
  grow: 1000,
  manifest: 967,
  slide_up: 967,
  slide_rise: 500,
  slingshot: 500,
};

/** Exit fade length (ms) — layers fade out instead of hard-cutting. */
export const ANIM_OUT_MS = 250;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutExpo  = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeOutBack  = (p: number) => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

/**
 * Pose for a layer at `elapsedMs` since its start, with `totalMs` on screen.
 * Fully deterministic; entrance over ANIM_IN_MS[preset], exit fade over the final ANIM_OUT_MS.
 */
export function animPose(preset: TextAnimPresetId, elapsedMs: number, totalMs: number): AnimPose {
  // Exit fade applies to every preset (multiplied into the entrance opacity).
  const outStart = Math.max(0, totalMs - ANIM_OUT_MS);
  const exitK = totalMs > ANIM_OUT_MS && elapsedMs > outStart
    ? 1 - clamp01((elapsedMs - outStart) / ANIM_OUT_MS)
    : 1;

  const inMs = ANIM_IN_MS[preset];
  const p = inMs > 0 ? clamp01(elapsedMs / inMs) : 1;

  const done: AnimPose = { opacity: exitK, transform: 'none' };
  if (p >= 1 && preset !== 'typewriter') return done;

  switch (preset) {
    case 'none':
      return done;
    case 'fade_up': {
      const e = easeOutCubic(p);
      return { opacity: e * exitK, transform: `translateY(${((1 - e) * 14).toFixed(2)}px)` };
    }
    case 'pop': {
      const e = easeOutBack(p);
      return { opacity: clamp01(p / 0.4) * exitK, transform: `scale(${(0.4 + 0.6 * e).toFixed(3)})` };
    }
    case 'typewriter':
      return { opacity: exitK, transform: 'none', clipChars: p >= 1 ? undefined : Math.max(1, Math.floor(p * 60)) };
    case 'bobbing_up': {
      // Rise with two diminishing bounces (the pack's bobbing settle).
      const e = easeOutCubic(p);
      const bob = Math.sin(p * Math.PI * 3) * (1 - p) * 8;
      return { opacity: clamp01(p / 0.35) * exitK, transform: `translateY(${((1 - e) * 30 + bob).toFixed(2)}px)` };
    }
    case 'drift_down': {
      const e = easeOutExpo(p);
      return { opacity: clamp01(p / 0.4) * exitK, transform: `translateY(${(-(1 - e) * 26).toFixed(2)}px)` };
    }
    case 'floating_line': {
      // Slide in from the left with a soft floating settle.
      const e = easeOutCubic(p);
      const floatY = Math.sin(p * Math.PI * 2) * (1 - p) * 4;
      return { opacity: clamp01(p / 0.45) * exitK, transform: `translateX(${(-(1 - e) * 36).toFixed(2)}px) translateY(${floatY.toFixed(2)}px)` };
    }
    case 'fold': {
      // Unfold from the top edge (perspective flap).
      const e = easeOutCubic(p);
      return { opacity: clamp01(p / 0.3) * exitK, transform: `perspective(300px) rotateX(${((1 - e) * -85).toFixed(1)}deg)` };
    }
    case 'grow': {
      const e = easeOutExpo(p);
      return { opacity: clamp01(p / 0.35) * exitK, transform: `scale(${(0.2 + 0.8 * e).toFixed(3)})` };
    }
    case 'manifest': {
      // Blur→sharp with letter-spacing narrowing — the classic "manifest" reveal.
      const e = easeOutCubic(p);
      return {
        opacity: e * exitK,
        transform: 'none',
        filter: p < 1 ? `blur(${((1 - e) * 10).toFixed(1)}px)` : undefined,
        letterSpacingEm: 0.02 + (1 - e) * 0.3,
      };
    }
    case 'slide_up': {
      const e = easeOutExpo(p);
      return { opacity: clamp01(p / 0.35) * exitK, transform: `translateY(${((1 - e) * 40).toFixed(2)}px)` };
    }
    case 'slide_rise': {
      // Quick diagonal: in from lower-left.
      const e = easeOutExpo(p);
      return { opacity: clamp01(p / 0.4) * exitK, transform: `translate(${(-(1 - e) * 28).toFixed(2)}px, ${((1 - e) * 18).toFixed(2)}px)` };
    }
    case 'slingshot': {
      // Overshoot from the left: -60px → +8px → 0.
      const e = easeOutBack(p);
      return { opacity: clamp01(p / 0.3) * exitK, transform: `translateX(${((e - 1) * 60).toFixed(2)}px)` };
    }
    default:
      return done;
  }
}

/** The pack's "Glow 2" soft neon — a layered text-shadow derived from the layer color. */
export function glowShadow(color: string): string {
  return `0 0 6px ${color}, 0 0 16px ${color}, 0 0 34px ${color}`;
}
