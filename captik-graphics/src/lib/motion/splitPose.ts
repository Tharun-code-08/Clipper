// SPLIT SCREEN — the video MOVES, it never gets covered.
//
// A split layout is not a panel pasted over the footage: the footage is scaled and
// pushed into the free area so the speaker stays whole, exactly like a real editor
// sizing a clip into the top half. Pure(time) so preview and both exports agree.

import type { BespokeGraphic } from '@/lib/bespokeGraphics';

/** Fraction of the frame each split layout claims. */
const CLAIM: Record<string, { side: 'top' | 'bottom' | 'left' | 'right'; frac: number }> = {
  'split-top': { side: 'top', frac: 0.42 },
  'split-bottom': { side: 'bottom', frac: 0.42 },
  'side-l': { side: 'left', frac: 0.5 },
  'side-r': { side: 'right', frac: 0.5 },
};

const EASE_MS = 320;

export interface SplitPose {
  /** Uniform scale applied to the video. */
  scale: number;
  /** Percent translate of the video (of its own size). */
  txPct: number;
  tyPct: number;
}

/** Video pose at tMs given the laid-out graphics. Null when nothing splits. */
export function splitPose(graphics: readonly BespokeGraphic[] | undefined, tMs: number): SplitPose | null {
  if (!graphics?.length) return null;
  let best: { claim: { side: 'top' | 'bottom' | 'left' | 'right'; frac: number }; k: number } | null = null;
  for (const g of graphics) {
    const claim = g.layout ? CLAIM[g.layout] : undefined;
    if (!claim) continue;
    const rel = tMs - g.atMs;
    if (rel < -EASE_MS || rel > g.durMs + EASE_MS) continue;
    // Ramp in over EASE_MS, hold, ramp out — the squeeze is animated, not a jump.
    const k = rel < 0 ? 0
      : rel < EASE_MS ? rel / EASE_MS
      : rel <= g.durMs ? 1
      : Math.max(0, 1 - (rel - g.durMs) / EASE_MS);
    if (k > 0 && (!best || k > best.k)) best = { claim, k };
  }
  if (!best) return null;
  const { claim, k } = best;
  const ease = k * k * (3 - 2 * k); // smoothstep
  // A split CROPS, it does not shrink: the clip keeps filling the frame edge-to-edge
  // and slides so the SUBJECT sits in the free area, exactly like resizing a clip into
  // the top half of a timeline. (Uniformly scaling it down left the video floating
  // small in the middle with dead ground all around it — the first version's bug.)
  const scale = 1 + 0.03 * ease;
  // Push the video away from the claimed edge by half the freed space, so the vacated
  // strip lands INSIDE the graphic's band and is never visible as empty ground.
  const shift = (claim.frac / 2) * 100 * ease;
  return {
    scale,
    txPct: claim.side === 'left' ? shift : claim.side === 'right' ? -shift : 0,
    tyPct: claim.side === 'top' ? shift : claim.side === 'bottom' ? -shift : 0,
  };
}

/** CSS for a split pose (empty string when null) — same string on every surface. */
export function splitTransformCss(p: SplitPose | null): string | undefined {
  if (!p) return undefined;
  const parts: string[] = [];
  if (p.txPct || p.tyPct) parts.push(`translate(${p.txPct.toFixed(2)}%, ${p.tyPct.toFixed(2)}%)`);
  if (p.scale !== 1) parts.push(`scale(${p.scale.toFixed(4)})`);
  return parts.join(' ') || undefined;
}
