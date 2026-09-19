// ─────────────────────────────────────────────────────────────────────────────
// LUXE — the shared premium design language for graphics templates.
//
// Modeled on the "dark luxury" documentary editing style (Iman Gadzhi-school):
// near-black glass panels with hairline borders and deep soft shadows, warm
// off-white ink, tracked-out uppercase micro-labels, ONE restrained accent with
// a soft bloom, thin glowing chart lines on dashed axes, fine grain and vignette
// on full-bleed surfaces, and confident ease-out motion (no cartoon bounce).
// Templates keep their own motion identity; this module makes their SURFACES
// and TYPE read premium, consistently.
//
// The accent and surface values ARE Captik's brand tokens (globals.css @theme:
// --color-accent #F59E0B, --color-accent-light #FBBF24, --color-background
// #0B0B0D, --color-card #1A190F) — templates and app chrome share one palette.
// Change the brand there and mirror it here, never invent a parallel gold.
//
// Everything here is a pure value or pure function — templates are pure
// time-functions and this module must never introduce state or randomness.
// ─────────────────────────────────────────────────────────────────────────────

import { rgba } from './motion';

/** The palette. Use these instead of ad-hoc hexes; user-facing color params may
 *  still default to these values so the "Style" section stays customisable. */
export const LUXE = {
  /** Warm off-white — primary ink on dark surfaces. */
  ink: '#F4F1E8',
  /** Secondary ink (labels, timestamps). Pair with letterSpacing. */
  inkDim: 'rgba(244,241,232,0.55)',
  /** Deepest surface — full-bleed backgrounds (= brand --color-background). */
  bg0: '#0B0B0D',
  /** Raised surface — panel tops (= brand --color-card, amber-tinted). */
  bg1: '#1A190F',
  /** 1px border on glass panels. */
  hairline: 'rgba(255,255,255,0.13)',
  /** Brand amber — THE accent (= --color-accent). One accent per card. */
  gold: '#F59E0B',
  /** Deep amber for fills/strokes that need less shine (amber-600). */
  goldDeep: '#D97706',
  /** Light amber for glow blooms and highlights (= --color-accent-light). */
  goldLight: '#FBBF24',
  /** Signal green — gains, success pills. */
  green: '#4ADE80',
  /** Marker red — annotations, alerts. */
  red: '#E5484D',
} as const;

/** Glass panel surface: vertical near-black gradient, hairline border, deep
 *  layered shadow, subtle inner top-light. `radius` in design px. */
export function luxePanel(radius: number, opts?: { shadow?: number; borderAlpha?: number }): React.CSSProperties {
  const sh = opts?.shadow ?? 1;
  return {
    background: `linear-gradient(180deg, ${LUXE.bg1} 0%, ${LUXE.bg0} 100%)`,
    border: `1px solid ${opts?.borderAlpha != null ? `rgba(255,255,255,${opts.borderAlpha})` : LUXE.hairline}`,
    borderRadius: radius,
    boxShadow: `0 ${Math.round(24 * sh)}px ${Math.round(70 * sh)}px rgba(0,0,0,${0.5 * sh}), inset 0 1px 0 rgba(255,255,255,0.06)`,
  };
}

/** Tracked-out uppercase micro-label ("PORTFOLIO VALUE", "CHAPTER 01"). */
export function luxeLabel(fontSizePx: number, color: string = LUXE.inkDim): React.CSSProperties {
  return {
    fontSize: fontSizePx,
    fontWeight: 600,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color,
  };
}

/** Soft bloom behind an accent element (gold glow on text or strokes). */
export function luxeGlow(color: string = LUXE.gold, strength = 1): string {
  return `0 0 ${Math.round(14 * strength)}px ${rgba(color, 0.45 * strength)}, 0 0 ${Math.round(46 * strength)}px ${rgba(color, 0.22 * strength)}`;
}

/** Fine static film grain, as a tileable data-URI. Spread as a full-bleed
 *  overlay div AFTER content; pointer-events-free by nature (pure style). */
export function luxeGrain(opacity = 0.05): React.CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    opacity,
    mixBlendMode: 'overlay',
    backgroundImage:
      `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='128' height='128' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
    backgroundSize: '128px 128px',
  };
}

/** Vignette for full-bleed templates — darkens corners, keeps center clean. */
export function luxeVignette(strength = 0.5): React.CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    background: `radial-gradient(ellipse 90% 80% at 50% 42%, transparent 55%, rgba(0,0,0,${strength}) 100%)`,
  };
}

/** Warm light-leak radial (top corner) — the "shot near a window" wash. */
export function luxeLightLeak(x = '78%', y = '0%', strength = 0.16): React.CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    background: `radial-gradient(ellipse 60% 45% at ${x} ${y}, ${rgba(LUXE.gold, strength)} 0%, transparent 70%)`,
  };
}

/** Confident deceleration — the house entrance curve. t in 0..1. */
export function easeOutQuint(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 5);
}

/** Ease-out with a SMALL, dignified overshoot (~4%) — replaces cartoon bounce
 *  where a template wants a settle without reading playful. t in 0..1. */
export function easeOutSettle(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  const s = 1.18;
  const u = c - 1;
  return 1 + u * u * ((s + 1) * u + s);
}
