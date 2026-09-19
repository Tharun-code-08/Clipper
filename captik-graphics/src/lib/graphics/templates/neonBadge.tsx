// Reference: overlays/moneyyyy.mp4  (window 760-5280ms, badge complete ~3480ms)
// A ring that draws itself around a symbol, both in neon. The ring starts at twelve o'clock and
// sweeps clockwise, and the glyph punches in only once the ring has passed it — the order is what
// makes it feel like the badge is being struck rather than revealed.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { ghosts, smear, sway3d, swingIn, vel } from '../juice';

export const neonBadge = defineGraphicsTemplate({
  id: 'neon_badge',
  name: 'Neon Badge',
  category: 'fx',
  tags: ['Neon', 'Ring', 'Symbol'],
  design: { w: 900, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 70 },
  fonts: ['montserrat'],

  elements: [
    { key: 'badge', label: 'Badge', hideable: false },
    { key: 'ring',  label: 'Ring' },
    { key: 'glyph', label: 'Symbol' },
  ],

  params: [
    { type: 'text', key: 'glyph', label: 'Symbol', group: 'Content', default: '$', maxLength: 4 },

    { type: 'color',  key: 'neon',  label: 'Neon',   group: 'Style', default: '#4ADE80' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Diameter', group: 'Style', default: 460, min: 100, max: 820, step: 10, unit: 'px' },
    { type: 'number', key: 'thick', label: 'Ring width', group: 'Style', default: 20, min: 2, max: 70, step: 2, unit: 'px' },
    { type: 'number', key: 'glyphScale', label: 'Symbol size', group: 'Style', default: 0.62, min: 0.2, max: 1.1, step: 0.02,
      help: 'Relative to the ring diameter.' },
    { type: 'number', key: 'gap',   label: 'Ring gap', group: 'Style', default: 12, min: 0, max: 45, step: 1, unit: '%',
      help: 'Leaves the ring open, as in the reference.' },
    { type: 'number', key: 'glow',  label: 'Glow',   group: 'Style', default: 34, min: 0, max: 120, step: 2, unit: 'px' },

    { type: 'number', key: 'drawAt',  label: 'Ring at',   group: 'Motion', default: 120, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drawMs',  label: 'Ring draws over', group: 'Motion', default: 900, min: 200, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'glyphAt', label: 'Symbol at', group: 'Motion', default: 700, min: 0, max: 5000, step: 20, unit: 'ms' },
    { type: 'number', key: 'spin',    label: 'Ring drift', group: 'Motion', default: 0, min: -120, max: 120, step: 2, unit: '°/s' },
  ],

  // A light pass as the ring starts sweeping, the lone slam when the symbol is struck in —
  // keyed off the same drawAt/glyphAt the two motions use.
  sfx: (p) => [
    { atMs: p.drawAt + 20, id: 'swish', gain: 0.5 },
    { atMs: p.glyphAt + 140, id: 'slam', gain: 0.75 },
  ],

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const S = p.size;
    const r = S / 2 - p.thick / 2 - 2;

    const drawProgAt = (ms: number) => interpolate(ms, [p.drawAt, p.drawAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const draw = drawProgAt(timeMs);
    const shown = draw * (1 - p.gap / 100);
    // MOTION BLUR on the sweep: the arc head's velocity along the circumference blurs the tube
    // while it draws and dies the frame the ring completes — held neon stays razor-sharp.
    const vArc = vel(drawProgAt, timeMs) * Math.PI * 2 * r;
    const arcBlur = Math.min(2.4, Math.abs(vArc) * 0.55);

    // The strike: same spring, sampled as a closure so velocity can drive the smear + ghosts.
    const popAt = (ms: number) => spring({
      frame: fr(ms - p.glyphAt), fps: FPS,
      config: { damping: 13, mass: 0.6, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });
    const pop = popAt(timeMs);
    const vGlyph = vel((ms) => interpolate(popAt(ms), [0, 1], [0.4, 1]), timeMs) * S * p.glyphScale;
    const smGlyph = smear(0, vGlyph, 1.15);
    const glyphGhosts = ghosts(0, vGlyph * 0.35, 2);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          ...el('badge'),
        }}
      >
        {/* Resting 3D sway — the sign keeps hanging in space (~1.6°, rotations only). */}
        <div style={{ position: 'relative', width: S, height: S, transform: sway3d(timeMs, seed, 1.6) }}>
          <svg
            viewBox={`0 0 ${S} ${S}`}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              // Start at twelve o'clock rather than three, which is where SVG puts arc zero.
              transform: `rotate(${(-90 + (timeMs / 1000) * p.spin).toFixed(2)}deg)`,
              filter: [
                p.glow > 0
                  ? `drop-shadow(0 0 ${p.glow * 0.25}px ${rgba(p.neon, 0.95)}) drop-shadow(0 0 ${p.glow * 0.8}px ${rgba(p.neon, 0.5)}) drop-shadow(0 0 ${p.glow * 2.2}px ${rgba(p.neon, 0.28)})`
                  : '',
                arcBlur > 0.3 ? `blur(${arcBlur.toFixed(2)}px)` : '',
              ].filter(Boolean).join(' ') || undefined,
              ...el('ring'),
            }}
          >
            <circle
              cx={S / 2} cy={S / 2} r={r}
              fill="none" stroke={p.neon} strokeWidth={p.thick} strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`${shown.toFixed(4)} 1`}
            />
          </svg>

          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: p.neon, fontSize: S * p.glyphScale, fontWeight: 800, lineHeight: 1,
              opacity: clamp01(pop * 1.8),
              filter: smGlyph.blurPx > 0.3 ? `blur(${smGlyph.blurPx.toFixed(2)}px)` : undefined,
              transform: `${swingIn(pop, { rx: -16, z: -100 })} scale(${(interpolate(pop, [0, 1], [0.4, 1]) * smGlyph.sx).toFixed(4)}, ${(interpolate(pop, [0, 1], [0.4, 1]) * smGlyph.sy).toFixed(4)})`,
              textShadow: p.glow > 0
                ? `0 0 ${p.glow * 0.3}px ${rgba(p.neon, 0.95)}, 0 0 ${p.glow * 0.9}px ${rgba(p.neon, 0.5)}, 0 0 ${p.glow * 2.4}px ${rgba(p.neon, 0.28)}`
                : undefined,
              ...el('glyph'),
            }}
          >
            {/* Smear-frame ghosts against the strike direction — the classic AE read; empty at rest. */}
            {glyphGhosts.map((g, i) => (
              <span
                key={i}
                aria-hidden
                style={{
                  position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: g.opacity,
                  transform: `translateY(${g.dy.toFixed(2)}px)`,
                }}
              >
                {p.glyph}
              </span>
            ))}
            {p.glyph}
          </div>
        </div>
      </div>
    );
  },
});
