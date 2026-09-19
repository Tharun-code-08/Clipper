// Shared motion helpers for graphics templates.
//
// Everything here is a pure function. Templates import these instead of hand-rolling the same
// arithmetic, and — more importantly — instead of reaching for CSS transitions, which do not
// survive an export (see the header of src/types/graphics.ts).

/** The FIXED frame grid all template motion is evaluated on.
 *
 *  This is NOT the export fps and must never be read from one. `timeMs` is the only clock; FPS
 *  exists solely to give remotion's spring()/interpolate() a frame unit. Because it is constant,
 *  a 24fps export, a 30fps export and a 60fps preview all evaluate the SAME pose at the same
 *  millisecond — which is the entire preview-equals-export guarantee. */
export const FPS = 30;

/** Milliseconds → frames on the fixed grid above. */
export function fr(ms: number): number {
  return (ms / 1000) * FPS;
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** '#rgb' | '#rrggbb' → 'rgba(r,g,b,a)'. Returns the input untouched if it isn't a hex colour,
 *  so a param already holding 'transparent' or an rgba() string passes through. */
export function rgba(hex: string, alpha: number): string {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Perceived luminance 0..1 of a hex colour — for picking readable ink over a user-chosen fill. */
export function luminance(hex: string): number {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return 0;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever stays readable on `hex`. */
export function inkOn(hex: string): string {
  return luminance(hex) > 0.6 ? '#0b0b0d' : '#ffffff';
}

/** 0 → 1 over `durMs` from the start, then 1. The plain "has it finished appearing" ramp. */
export function inRamp(timeMs: number, durMs: number): number {
  return clamp01(timeMs / Math.max(1, durMs));
}

/** 1 → 0 over the LAST `durMs` of the window. The plain "is it leaving" ramp. */
export function outRamp(timeMs: number, durationMs: number, durMs: number): number {
  return clamp01((durationMs - timeMs) / Math.max(1, durMs));
}
