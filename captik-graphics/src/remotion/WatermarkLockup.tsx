/**
 * Shared free-tier watermark lockup — the Captik LogoMark caption-glyph (dark tile
 * holding caption bars, the active bar lit with a shifting amber gradient) plus the
 * "Captik" wordmark, in a dark pill. Mirrors src/components/Logo.tsx LogoMark.
 *
 * Frame-agnostic: it is driven purely by `t` (seconds), so the live editor preview
 * (rAF-driven) and the exported video (Remotion useCurrentFrame) render the EXACT
 * same thing. Surfaces:
 *   - preview  → src/components/editor/PreviewWatermark.tsx (rAF)
 *   - export   → src/remotion/Watermark.tsx (useCurrentFrame; Lambda + web-renderer)
 *   - fast path → src/lib/assGenerator.ts approximates this in libass.
 */

const STEP_S   = 0.5;   // karaoke: seconds each caption bar stays lit
const GRAD_S   = 2.4;   // amber gradient shift period
const APPEAR_S = 0.45;  // pop-in duration

// LogoMark caption bars (viewBox 0 0 24 24), in reading order — the lit bar sweeps
// through these so the highlight "follows the voice", exactly like the product.
export const WM_BARS = [
  { x: 3.4,  y: 6.1,  w: 10.4, h: 5.4, r: 2.7 },
  { x: 15.8, y: 6.1,  w: 4.8,  h: 5.4, r: 2.4 },
  { x: 3.4,  y: 13.6, w: 6.6,  h: 5.4, r: 2.7 },
  { x: 12,   y: 13.6, w: 8.6,  h: 5.4, r: 2.7 },
];

function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function interp(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) { const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + (ys[i] - ys[i - 1]) * f; }
  }
  return ys[ys.length - 1];
}

/** Shifting amber stop colour (gold↔orange shimmer) at time t and phase offset. */
export function wmAmber(t: number, phase: number): string {
  const p = (2 * Math.PI * t) / GRAD_S + phase;
  const hue   = 40 + 9 * Math.sin(p);          // ~31..49  (gold → orange)
  const light = 56 + 6 * Math.sin(p + 1.1);    // ~50..62
  return `hsl(${hue.toFixed(1)}, 95%, ${light.toFixed(1)}%)`;
}

/** Which caption bar is lit at time t. */
export function wmLitIndex(t: number): number {
  return Math.floor(t / STEP_S) % WM_BARS.length;
}

/** Pop-in + breathe envelope, shared so both surfaces match frame-for-frame. */
export function wmEnvelope(t: number): { opacity: number; scale: number } {
  const fadeIn  = clamp01(t / (APPEAR_S * 0.6));
  const scaleIn = interp(t, [0, APPEAR_S * 0.7, APPEAR_S], [0.5, 1.07, 1]);
  const breathePhase = (2 * Math.PI * t) / 3;
  const breathe = 0.9   + 0.1   * (0.5 + 0.5 * Math.sin(breathePhase));
  const pulse   = 1     + 0.015 * Math.sin(breathePhase);
  return { opacity: fadeIn * breathe, scale: scaleIn * pulse };
}

interface WatermarkLockupProps {
  /** Time in seconds (frame/fps for export, rAF elapsed for preview). */
  t:  number;
  /** Logical-size scaler: round(n * RS), RS = width<height ? width/270 : width/640. */
  sz: (n: number) => number;
  /** Vestigial — kept so existing callers compile. The glyph is now plain <div>s (no SVG),
   *  so there's no per-surface gradient id to disambiguate anymore. */
  gradId?: string;
}

export function WatermarkLockup({ t, sz }: WatermarkLockupProps) {
  const env  = wmEnvelope(t);
  const lit  = wmLitIndex(t);
  const from = wmAmber(t, 0);
  const to   = wmAmber(t, 2.2);

  const tile  = sz(22);
  const glyph = Math.round(tile * 0.78);
  const gs    = glyph / 24;   // viewBox(0 0 24 24) → px scale for the div-based glyph bars

  return (
    <div
      aria-hidden="true"
      style={{
        // Dead-centre on the canvas (was top-right). translate(-50%,-50%) anchors the
        // pill's own centre to the 50%/50% point — identical in the rAF preview and the
        // frame-driven export, since both render THIS component.
        position: 'absolute', top: '50%', left: '50%',
        // zIndex 45: the watermark must NEVER be covered by user content. GraphicsOverlay carries
        // z 25/31 and TextLayerOverlay z 35 — as a z-auto sibling this lockup lost to both, which
        // let a free user hide the watermark behind an opaque centred graphic (monetization bug).
        zIndex: 45,
        display: 'flex', alignItems: 'center', gap: sz(7),
        padding: `${sz(5)}px ${sz(11)}px ${sz(5)}px ${sz(6)}px`,
        borderRadius: 999,
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.18)',
        opacity: env.opacity * 0.3,   // ~30% visible — faint over centred content (preview == export)
        // +50% scale, centred about the pill's own middle.
        transform: `translate(-50%, -50%) scale(${env.scale * 1.5})`,
        transformOrigin: 'center center',
        pointerEvents: 'none',
      }}
    >
      {/* Dark tile holding the caption glyph — identical to LogoMark */}
      <div
        style={{
          width: tile, height: tile, borderRadius: sz(7),
          background: '#141418',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: `0 ${sz(2)}px ${sz(6)}px rgba(245,158,11,0.28)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {/* Caption-bar glyph as plain <div>s — NOT inline SVG. @remotion/web-renderer's
            html-in-canvas (the in-browser exporter) can't rasterise inline SVG, which silently
            DROPPED the watermark from every web export (free-tier leak). <div>s + border-radius
            + a CSS linear-gradient are all supported and render byte-identically across the
            preview, Lambda and the web renderer — so export == preview. */}
        <div style={{ position: 'relative', width: glyph, height: glyph, flexShrink: 0 }}>
          {WM_BARS.map((b, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: b.x * gs, top: b.y * gs,
                width: b.w * gs, height: b.h * gs,
                borderRadius: b.r * gs,
                background: i === lit ? `linear-gradient(135deg, ${from}, ${to})` : '#ffffff',
                opacity:    i === lit ? 1 : 0.30,
              }}
            />
          ))}
        </div>
      </div>
      <span
        style={{
          fontSize: sz(13), fontWeight: 800, color: 'rgba(255,255,255,0.95)',
          fontFamily: 'system-ui, sans-serif', letterSpacing: '0.01em', lineHeight: 1,
        }}
      >
        Captik
      </span>
    </div>
  );
}
