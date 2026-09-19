// "Dynamic layout": a phrase's place in the frame is picked per phrase from a table of zones, seeded
// by the caption's own key so the pick never changes between frames or between the preview and an
// export. Their planner's rule, read from the public bundle their site ships:
//
//   around  — each phrase lands in a zone of the region the design names (Cloister: the lower zones,
//             with the two upper corners for a plain phrase every fourth two-second bucket), nudged
//             by up to 3% of the frame.
//   impact  — only HERO phrases move: a phrase with a hero, and at least heroGapSec after the last
//             such phrase, is nudged by the intensity's dx/dy and drawn heroScale larger (Taffrail,
//             subtle: 1%/4% and 1.1). Every other phrase stays at the caption box.
//
// The hash (FNV-1a) and the generator (mulberry32) are the standard ones the planner seeds with, so
// a caption with the same key lands where it would for them. Pure: every render route shares it.

export type DynamicStyle = 'around' | 'impact';
export type DynamicIntensity = 'subtle' | 'balanced' | 'wild';
export type PlacementRegion = 'upper' | 'lower' | 'mostly-lower';

export interface DynamicSpec {
  style: DynamicStyle;
  intensity: DynamicIntensity;
  placementRegion?: PlacementRegion;
  /** The zone never changes a phrase's size (Cloister). */
  consistentScale?: boolean;
  seed?: number;
}

export const INTENSITY: Record<DynamicIntensity, { dx: number; dy: number; heroScale: number; wordScale: number[]; heroGapSec: number }> = {
  subtle:   { dx: 0.01,  dy: 0.04, heroScale: 1.1,  wordScale: [1, 1.18, 1.55], heroGapSec: 5 },
  balanced: { dx: 0.02,  dy: 0.07, heroScale: 1.2,  wordScale: [1, 1.3, 1.9],   heroGapSec: 3.5 },
  wild:     { dx: 0.035, dy: 0.11, heroScale: 1.32, wordScale: [1, 1.4, 2.2],   heroGapSec: 2.5 },
};

interface Zone { x: number; y: number; wide: boolean }
const UPPER: Zone[] = [
  { x: 0.5, y: 0.12, wide: true }, { x: 0.34, y: 0.11, wide: true }, { x: 0.66, y: 0.13, wide: true },
  { x: 0.21, y: 0.25, wide: false }, { x: 0.79, y: 0.25, wide: false }, { x: 0.19, y: 0.42, wide: false }, { x: 0.81, y: 0.42, wide: false },
];
const LOWER: Zone[] = [
  { x: 0.4, y: 0.55, wide: true }, { x: 0.6, y: 0.57, wide: true }, { x: 0.5, y: 0.64, wide: true },
  { x: 0.38, y: 0.72, wide: true }, { x: 0.62, y: 0.74, wide: true }, { x: 0.5, y: 0.81, wide: true },
];
const MOSTLY_LOWER: Zone[] = [{ x: 0.22, y: 0.1, wide: false }, { x: 0.78, y: 0.11, wide: false }, ...LOWER];

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t |= 0; t = (t + 0x6d2b79f5) | 0;
    let e = Math.imul(t ^ (t >>> 15), 1 | t);
    e = (e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ e;
    return ((e ^ (e >>> 14)) >>> 0) / 0x100000000;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A long hero phrase is set a little smaller: over 16 letters 0.96, over 24 0.9. */
export function heroTextScale(text: string): number {
  const n = text.replace(/\s+/g, '').length;
  return n > 24 ? 0.9 : n > 16 ? 0.96 : 1;
}

/** The captions that count as hero phrases: those with a hero, at least heroGapSec after the last. */
export function heroClipKeys(clips: { key: string; startSec: number; hasHero: boolean }[], intensity: DynamicIntensity): Set<string> {
  const gap = INTENSITY[intensity].heroGapSec;
  const out = new Set<string>();
  let last = -Infinity;
  for (const c of [...clips].sort((a, b) => a.startSec - b.startSec)) {
    if (!c.hasHero || c.startSec - last < gap) continue;
    out.add(c.key);
    last = c.startSec;
  }
  return out;
}

export interface Placement { xPct: number; yPct: number; fontScale: number }

export interface PlacementInput {
  clipKey: string;
  startSec: number;
  isHero: boolean;
  text: string;
  /** The caption box, 0-1: a drag moves every zone with it. */
  baseXPct: number;
  baseYPct: number;
}

export function aroundLayout(spec: DynamicSpec, e: PlacementInput): Placement {
  const m = INTENSITY[spec.intensity];
  const r = mulberry32(fnv1a(`${e.clipKey}:${spec.seed ?? 0}:around`));
  const region = spec.placementRegion;
  const zones = region === 'lower' ? LOWER : region === 'mostly-lower' ? MOSTLY_LOWER : UPPER;
  const mostly = region === 'mostly-lower';
  const bucket = Math.floor(Math.max(0, e.startSec) / 2);
  const pool = mostly && !e.isHero && bucket % 4 === 1 ? zones.filter((z) => !z.wide)
    : mostly || e.isHero ? zones.filter((z) => z.wide) : zones;
  const zone = pool[Math.floor(r() * pool.length)] ?? zones[0];
  const sx = e.baseXPct - 0.5, sy = e.baseYPct - 0.5;
  const xPct = clamp(zone.x + sx + (2 * r() - 1) * 0.03, 0.1, 0.9);
  const yPct = clamp(zone.y + sy + (2 * r() - 1) * 0.03, 0.05, 0.95);
  return { xPct, yPct, fontScale: spec.consistentScale ? 1 : (e.isHero ? m.heroScale : 1) * heroTextScale(e.text) };
}

export function impactLayout(spec: DynamicSpec, e: PlacementInput): Placement {
  if (!e.isHero) return { xPct: e.baseXPct, yPct: e.baseYPct, fontScale: 1 };
  const m = INTENSITY[spec.intensity];
  const r = mulberry32(fnv1a(`${e.clipKey}:${spec.seed ?? 0}`));
  const dx = 2 * r() - 1, dy = 2 * r() - 1;
  return {
    xPct: clamp(e.baseXPct + dx * m.dx, 0.1, 0.9),
    yPct: clamp(e.baseYPct + dy * m.dy, 0.05, 0.95),
    fontScale: m.heroScale * heroTextScale(e.text),
  };
}

export function dynamicPlacement(spec: DynamicSpec, e: PlacementInput): Placement {
  return spec.style === 'around' ? aroundLayout(spec, e) : impactLayout(spec, e);
}
