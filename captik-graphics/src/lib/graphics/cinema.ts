// THE CINEMA FINISH — the layer that makes a graphic read as filmed rather than rendered.
//
// Reference: raylight.app. Their templates look expensive not because each element is fancier,
// but because a SCENE FINISHING STACK sits over the whole composition — bloom, depth of field,
// colour grade, colour split, vignette, film grain — plus a camera that tilts and moves. Our
// per-template work (3D poses, velocity blur) is the motion half; this is the optics half.
//
// It lives in the RENDERER, not in templates: one implementation finishes all 230 at once and
// cannot drift between them. Every value is a pure function of the instance settings and the
// clip clock, so preview and export agree by construction (GraphicsOverlay is shared).
//
// Everything is plain CSS — filters, transforms, layered gradients. No canvas, no WebGL, no
// backdrop-filter (silently dropped by the html-in-canvas export path).

import type { CinemaSettings } from '@/types/graphics';

/** Colour grades. Each is a CSS filter chain applied to the whole graphic — the "LUT". */
export const CINEMA_GRADES: { value: string; label: string; filter: string }[] = [
  { value: 'none',    label: 'None',        filter: '' },
  { value: 'film',    label: 'Film',        filter: 'contrast(1.07) saturate(1.06) brightness(1.02)' },
  { value: 'warm',    label: 'Warm',        filter: 'sepia(0.14) saturate(1.18) contrast(1.05)' },
  { value: 'cool',    label: 'Cool',        filter: 'hue-rotate(-8deg) saturate(0.96) contrast(1.09) brightness(1.02)' },
  { value: 'night',   label: 'Night',       filter: 'brightness(0.93) contrast(1.16) saturate(0.88) hue-rotate(-12deg)' },
  { value: 'bleach',  label: 'Bleach',      filter: 'saturate(0.55) contrast(1.22) brightness(1.05)' },
  { value: 'mono',    label: 'Mono',        filter: 'grayscale(0.88) contrast(1.12)' },
];

/** Instance defaults = the FILM look: the optical finish only — bloom, grade, grain, a whisper
 *  of chromatic edge — and NO 3D. Every graphic gains the film-grade tell for free while sitting
 *  square to the frame, which is how the founder wants them to land by default.
 *
 *  The tilt/camera machinery below is intact and one click away (Cinema → Product 3D), it is
 *  simply not what a fresh graphic wears. Keep this object and the 'film' entry in CINEMA_LOOKS
 *  identical — a spec asserts it, so picking "Film" always equals doing nothing. */
export const CINEMA_DEFAULTS: Required<Omit<CinemaSettings, 'grade' | 'camera'>> & {
  grade: string; camera: string;
} = {
  grade: 'film',
  bloom: 0.35,
  grain: 0.10,
  split: 0.18,
  vignette: 0,
  tiltX: 0,
  tiltY: 0,
  camera: 'none',
  camAmt: 0.5,
  focus: 0,
};

export function cinemaOf(c: CinemaSettings | undefined) {
  return { ...CINEMA_DEFAULTS, ...(c ?? {}) };
}

/** Perspective depth for cinema tilt. Matches juice.ts's PERSP so template poses and instance
 *  tilt describe the SAME space — mixing two perspectives makes objects look glued on. */
export const CINEMA_PERSP = 1100;

/** ONE-CLICK LOOKS. Eight sliders is a toolkit; these are the finished results people actually
 *  want — the reason Raylight's output looks art-directed rather than configured. Each is a
 *  complete settings object, so picking one is a single undo step and nothing is left half-set. */
export const CINEMA_LOOKS: { value: string; label: string; hint: string; settings: CinemaSettings }[] = [
  { value: 'flat', label: 'Flat', hint: 'No finish — raw graphic',
    settings: { grade: 'none', bloom: 0, grain: 0, split: 0, vignette: 0, tiltX: 0, tiltY: 0, camera: 'none', focus: 0 } },
  { value: 'film', label: 'Film', hint: 'The default — subtle bloom, grain, fringe',
    settings: { grade: 'film', bloom: 0.35, grain: 0.1, split: 0.18, vignette: 0, tiltX: 0, tiltY: 0, camera: 'none', focus: 0 } },
  { value: 'product', label: 'Product 3D', hint: 'Leaned into frame, lit and grounded',
    settings: { grade: 'cool', bloom: 0.45, grain: 0.08, split: 0.15, vignette: 0.2, tiltX: 10, tiltY: -16, camera: 'dollyIn', camAmt: 0.6, focus: 0 } },
  { value: 'cinematic', label: 'Cinematic', hint: 'Graded, vignetted, slow push',
    settings: { grade: 'night', bloom: 0.5, grain: 0.22, split: 0.25, vignette: 0.45, tiltX: 5, tiltY: 0, camera: 'dollyIn', camAmt: 0.45, focus: 0 } },
  { value: 'glow', label: 'Neon glow', hint: 'Heavy bloom and fringe',
    settings: { grade: 'warm', bloom: 0.8, grain: 0.12, split: 0.4, vignette: 0.15, tiltX: 0, tiltY: 0, camera: 'zoomIn', camAmt: 0.4, focus: 0 } },
  { value: 'archive', label: 'Archive', hint: 'Bleached, grainy, hand-held feel',
    settings: { grade: 'bleach', bloom: 0.25, grain: 0.45, split: 0.3, vignette: 0.5, tiltX: -6, tiltY: 8, camera: 'panRight', camAmt: 0.5, focus: 0 } },
];

/** Camera moves: a framing at q=0 easing to a second framing at q=1 — Raylight's "two framings,
 *  smooth move between them". `dolly` variants push through Z (real parallax feel with the tilt);
 *  `zoom` is the flat version; pans/rises translate. Amount scales all of them. */
export const CINEMA_CAMERAS: { value: string; label: string }[] = [
  { value: 'none',     label: 'Locked off' },
  { value: 'dollyIn',  label: 'Dolly in' },
  { value: 'dollyOut', label: 'Dolly out' },
  { value: 'zoomIn',   label: 'Zoom in' },
  { value: 'panLeft',  label: 'Pan left' },
  { value: 'panRight', label: 'Pan right' },
  { value: 'riseUp',   label: 'Rise up' },
];

/** easeInOutCubic — a camera never starts or stops abruptly. */
function camEase(q: number): number {
  const x = Math.min(1, Math.max(0, q));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** The camera + tilt transform PREFIX for the whole graphic. Sizes are relative to the drawn
 *  canvas so the move reads identically at any placed scale or aspect.
 *
 *  `frameLocked` (fullBleed templates) is the load-bearing guard: those templates PAINT THE
 *  FRAME — letterbox bars hug its edges, VHS scanlines cover it, a burn fills it. Leaning or
 *  sliding them drags their coverage off the frame and exposes a bare wedge of footage at the
 *  corners. They still take every optical effect; they just refuse motion that uncovers.
 *  Dolly/zoom survive the lock because they only ever grow the layer, never uncover it. */
export function cinemaTransform(
  c: ReturnType<typeof cinemaOf>, timeMs: number, durationMs: number, w: number, h: number,
  frameLocked = false,
): string {
  const q = camEase(durationMs > 0 ? timeMs / durationMs : 0);
  const a = Math.min(1.5, Math.max(0, c.camAmt));
  const m = Math.min(w, h);
  let z = 0, x = 0, y = 0, s = 1;
  switch (c.camera) {
    case 'dollyIn':  z = q * 90 * a; break;
    case 'dollyOut': z = (1 - q) * 90 * a; break;
    case 'zoomIn':   s = 1 + q * 0.07 * a; break;
    case 'panLeft':  x = (0.5 - q) * m * 0.09 * a; break;
    case 'panRight': x = (q - 0.5) * m * 0.09 * a; break;
    case 'riseUp':   y = (0.5 - q) * m * 0.09 * a; break;
    default: break;
  }
  const tiltX = frameLocked ? 0 : c.tiltX;
  const tiltY = frameLocked ? 0 : c.tiltY;
  if (frameLocked) { x = 0; y = 0; }
  // dollyOut starts pushed-in and settles back; on a frame-locked layer that means it would
  // shrink below full coverage on the way out, so it is clamped to a pure grow.
  if (frameLocked && c.camera === 'dollyOut') z = Math.max(0, z);
  const parts: string[] = [];
  if (tiltX || tiltY || z) {
    parts.push(`perspective(${CINEMA_PERSP}px)`);
    if (z) parts.push(`translateZ(${z.toFixed(1)}px)`);
    if (tiltX) parts.push(`rotateX(${tiltX.toFixed(2)}deg)`);
    if (tiltY) parts.push(`rotateY(${tiltY.toFixed(2)}deg)`);
  }
  if (x || y) parts.push(`translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`);
  if (s !== 1) parts.push(`scale(${s.toFixed(4)})`);
  return parts.join(' ');
}

/** Grade + chromatic split as ONE filter chain on the crisp content layer.
 *  The split is two opposed drop-shadows: drop-shadow follows the ALPHA SHAPE, so a red ghost
 *  left and a cyan ghost right produce true edge fringing on whatever the template drew — no
 *  duplicate render, no per-template work, and it disappears at split 0. */
export function cinemaFilter(c: ReturnType<typeof cinemaOf>, w: number, h: number): string | undefined {
  const parts: string[] = [];
  const grade = CINEMA_GRADES.find((g) => g.value === c.grade)?.filter;
  if (grade) parts.push(grade);
  if (c.focus > 0.01) parts.push(`blur(${(c.focus * Math.min(w, h) * 0.012).toFixed(2)}px)`);
  if (c.split > 0.01) {
    const d = (Math.min(w, h) * 0.0022 * c.split * 3).toFixed(2);
    const al = (0.55 * c.split).toFixed(3);
    parts.push(`drop-shadow(-${d}px 0 0 rgba(255,42,90,${al}))`);
    parts.push(`drop-shadow(${d}px 0 0 rgba(0,208,255,${al}))`);
  }
  return parts.length ? parts.join(' ') : undefined;
}

/** The BLOOM layer's style. A blurred, brightened copy of the same content screened over the
 *  crisp one — bright areas bleed light the way a real lens does. This is the single biggest
 *  "expensive" tell and it costs one extra paint of an element we already built. */
export function cinemaBloomStyle(
  c: ReturnType<typeof cinemaOf>, w: number, h: number,
): React.CSSProperties | null {
  if (c.bloom <= 0.01) return null;
  const m = Math.min(w, h);
  return {
    position: 'absolute', inset: 0,
    filter: `blur(${(m * 0.018 + m * 0.02 * c.bloom).toFixed(2)}px) brightness(1.5) saturate(1.25)`,
    mixBlendMode: 'screen',
    opacity: Math.min(0.9, c.bloom * 0.85),
    pointerEvents: 'none',
  };
}

/** Film grain — the same feTurbulence data-URI idiom the luxe system uses, sized to the graphic
 *  so the grain is FINE at any scale (grain that scales with the object reads as noise texture,
 *  not film). */
export function cinemaGrainStyle(c: ReturnType<typeof cinemaOf>): React.CSSProperties | null {
  if (c.grain <= 0.01) return null;
  return {
    position: 'absolute', inset: 0,
    opacity: c.grain * 0.55,
    mixBlendMode: 'overlay',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='128' height='128' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E")`,
    backgroundSize: '128px 128px',
    pointerEvents: 'none',
  };
}

/** Vignette — frames the graphic. Opt-in (0 by default): on a small floating chip dark corners
 *  read as a dirty plate, but on a full-bleed or card-sized graphic it is the cinema tell. */
export function cinemaVignetteStyle(c: ReturnType<typeof cinemaOf>): React.CSSProperties | null {
  if (c.vignette <= 0.01) return null;
  return {
    position: 'absolute', inset: 0,
    background: `radial-gradient(ellipse 88% 82% at 50% 46%, transparent 42%, rgba(0,0,0,${(c.vignette * 0.72).toFixed(3)}) 100%)`,
    pointerEvents: 'none',
  };
}

/** Contact shadow that FOLLOWS THE TILT — the physical tell that sells 3D. A tilted card with a
 *  shadow still centred underneath reads as a sticker; offsetting the shadow opposite the tilt
 *  is what makes it read as an object standing in a lit space. Returns a box-shadow string. */
export function cinemaContactShadow(c: ReturnType<typeof cinemaOf>, w: number, h: number): string | undefined {
  if (!c.tiltX && !c.tiltY) return undefined;
  const m = Math.min(w, h);
  const dx = (-c.tiltY / 34) * m * 0.05;
  const dy = (c.tiltX / 34) * m * 0.05 + m * 0.02;
  const blur = m * 0.09;
  const lean = Math.min(1, (Math.abs(c.tiltX) + Math.abs(c.tiltY)) / 34);
  return `${dx.toFixed(1)}px ${dy.toFixed(1)}px ${blur.toFixed(1)}px rgba(0,0,0,${(0.28 + lean * 0.3).toFixed(3)})`;
}
