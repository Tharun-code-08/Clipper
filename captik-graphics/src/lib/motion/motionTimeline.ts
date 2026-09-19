// ─────────────────────────────────────────────────────────────────────────────
// Autopilot motion timeline — the Captions-style emphasis grammar, as ONE pure
// evaluator shared by the live preview (source clock) and both export
// compositions (cut-video output clock). Preview and export must never drift,
// so ALL motion math lives here and nowhere else.
//
// Grammar (from the Captions.ai research, 2026-08-13):
//  - A zoom is a QUICK punch-in timed to a key word/moment: fast attack, a hold,
//    an eased release. Intensity 1 = moderate, 2 = strong.
//  - A shake is the escalation ABOVE a zoom: a decaying oscillation on top of a
//    strong punch, reserved for the 1-2 biggest beats.
//  - Punches anchor on the FACE (cx/cy as % of frame), not frame center.
// ─────────────────────────────────────────────────────────────────────────────

export interface MotionEvent {
  /** Beat start, ms on the CALLER's clock (source for preview, output for export). */
  atMs: number;
  kind: 'zoom' | 'shake';
  /** 1 = moderate punch (1.07), 2 = strong (1.13). Shakes always ride a strong punch. */
  intensity: 1 | 2;
}

const ATTACK_MS = 140;   // fast punch-in — "quick, punctuating"
const HOLD_MS = 1100;    // punched hold before release
const RELEASE_MS = 380;  // eased return to rest
export const MOTION_EVENT_SPAN_MS = ATTACK_MS + HOLD_MS + RELEASE_MS;

const SCALE: Record<1 | 2, number> = { 1: 1.07, 2: 1.13 };

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export interface MotionPose {
  /** Multiplicative scale on the video frame (1 = rest). */
  scale: number;
  /** Shake offset in % of frame width/height (0 at rest). */
  dxPct: number;
  dyPct: number;
}

/**
 * Evaluate the pose at `tMs`. Pure(time) — every playback surface replays it
 * identically frame by frame. Events are expected sorted; overlapping events
 * resolve to the strongest active pose (no stacking — stacked punches wobble).
 */
export function motionPose(events: readonly MotionEvent[], tMs: number): MotionPose {
  let scale = 1;
  let dxPct = 0;
  let dyPct = 0;
  for (const e of events) {
    const rel = tMs - e.atMs;
    if (rel < 0 || rel > MOTION_EVENT_SPAN_MS) continue;
    const target = SCALE[e.intensity];
    let s: number;
    if (rel < ATTACK_MS) {
      s = 1 + (target - 1) * easeOutCubic(rel / ATTACK_MS);
    } else if (rel < ATTACK_MS + HOLD_MS) {
      s = target;
    } else {
      s = 1 + (target - 1) * (1 - easeInOutQuad((rel - ATTACK_MS - HOLD_MS) / RELEASE_MS));
    }
    if (s > scale) scale = s;

    // Shake: a decaying two-axis oscillation over the first ~420ms of the beat.
    // Pure(rel) — no randomness, so exports replay the identical wobble.
    if (e.kind === 'shake' && rel < 420) {
      const d = Math.exp(-rel / 120);
      dxPct += Math.sin(rel / 26) * 1.1 * d;
      dyPct += Math.cos(rel / 21) * 0.8 * d;
    }
  }
  return { scale, dxPct, dyPct };
}

/**
 * Subject-spotlight dim strength at `tMs`: 0 outside every window, DIM inside,
 * with a 180ms linear ramp at both edges. Shared by the preview and both export
 * compositions (the subject cut-out composites ABOVE this dim, so the person
 * stays bright while the scene drops). Pure(time).
 */
export function spotlightDim(
  windows: readonly { startMs: number; endMs: number }[] | undefined,
  tMs: number,
  dim = 0.55,
  rampMs = 180,
): number {
  if (!windows?.length) return 0;
  let out = 0;
  for (const w of windows) {
    if (tMs < w.startMs - rampMs || tMs > w.endMs + rampMs) continue;
    const rampIn = Math.min(1, Math.max(0, (tMs - (w.startMs - rampMs)) / rampMs));
    const rampOut = Math.min(1, Math.max(0, ((w.endMs + rampMs) - tMs) / rampMs));
    out = Math.max(out, dim * Math.min(rampIn, rampOut));
  }
  return out;
}

/**
 * CSS transform for a pose punching into an anchor (face center, % of frame).
 * transform-origin stays default; the translate keeps the anchor fixed on
 * screen while the frame scales around it.
 */
export function motionTransformCss(
  pose: MotionPose,
  anchorXPct: number,
  anchorYPct: number,
): string | undefined {
  if (pose.scale === 1 && pose.dxPct === 0 && pose.dyPct === 0) return undefined;
  const tx = (50 - anchorXPct) * (pose.scale - 1) + pose.dxPct;
  const ty = (50 - anchorYPct) * (pose.scale - 1) + pose.dyPct;
  return `translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%) scale(${pose.scale.toFixed(4)})`;
}
