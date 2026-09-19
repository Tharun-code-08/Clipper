// Spotlight annotation for footage: a thin amber ring sweeps itself closed around the subject,
// then holds with a slow ±2% breathing pulse. Ships plateless, like markerAnnotate. The optional
// surround-dim is a radial pool that fades back OUT before the box edge — dimming to the edge
// would print the graphic's rectangular boundary onto the footage.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { sway3d, swingIn, vel } from '../juice';

export const focusRing = defineGraphicsTemplate({
  id: 'focus_ring',
  name: 'Focus Ring',
  category: 'fx',
  tags: ['Ring', 'Circle', 'Spotlight', 'Highlight', 'Glow'],
  badge: 'New',
  design: { w: 600, h: 600 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3500,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 36 },
  fonts: ['montserrat'],

  elements: [
    { key: 'ring',  label: 'Ring', hideable: false },
    { key: 'label', label: 'Label' },
    { key: 'dim',   label: 'Surround dim' },
  ],

  params: [
    { type: 'text', key: 'label', label: 'Label', group: 'Content', default: 'WATCH THIS', maxLength: 24 },

    { type: 'color',  key: 'accent', label: 'Ring',   group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Label colour', group: 'Style', default: '#F4F1E8' },
    { type: 'number', key: 'weight', label: 'Stroke', group: 'Style', default: 2.5, min: 1, max: 8, step: 0.5, unit: 'px' },
    { type: 'number', key: 'size',   label: 'Ring size', group: 'Style', default: 34, min: 22, max: 42, step: 1, unit: '%' },
    { type: 'number', key: 'glow',   label: 'Glow',   group: 'Style', default: 1, min: 0, max: 2, step: 0.1 },
    { type: 'boolean', key: 'dim',   label: 'Dim surroundings', group: 'Style', default: false },

    { type: 'number', key: 'drawMs',   label: 'Draw time', group: 'Motion', default: 700, min: 250, max: 2000, step: 50, unit: 'ms' },
    { type: 'number', key: 'breathMs', label: 'Breath cycle', group: 'Motion', default: 2600, min: 1200, max: 6000, step: 100, unit: 'ms' },
    { type: 'number', key: 'delay',    label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // A light air pass as the sweep opens, a luxe glass ping the moment the ring closes — both
  // keyed off the same drawMs the motion uses.
  sfx: (p) => [
    { atMs: p.delay + 30, id: 'swish', gain: 0.5 },
    { atMs: p.delay + p.drawMs, id: 'glass', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;

    const cx = width / 2;
    const cy = height * 0.45;
    const r = Math.min(width, height) * (p.size / 100);
    const C = 2 * Math.PI * r;

    // damping 200 keeps the sweep monotonic — a ring must never un-draw. A closure of absolute
    // ms so vel() can sample the same motion for the sweep smear.
    const drawAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(p.drawMs))),
    });
    const draw = drawAt(t);
    // MOTION BLUR on the draw head: the sweep's velocity along the circumference blurs the fast
    // pass and dies the frame the ring closes — the held ring stays surgical-crisp.
    const vSweep = vel(drawAt, t) * C;
    const drawBlur = Math.min(2.2, Math.abs(vSweep) * 0.55);
    // Breathing gates in AFTER the draw so the pulse never fights the sweep.
    const settle = clamp01((t - p.drawMs) / 400);
    const breathe = 1 + 0.02 * settle * Math.sin(((t - p.drawMs) / p.breathMs) * Math.PI * 2);

    const labelIn = spring({
      frame: fr(t - p.drawMs * 0.8), fps: FPS,
      config: { damping: 24, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(450))),
    });

    const dimIn = easeOutQuint(clamp01((t - 100) / 600));
    const corner = Math.hypot(width / 2, Math.max(cy, height - cy));
    const glowFilter = p.glow > 0
      ? `drop-shadow(0 0 ${(6 * p.glow).toFixed(1)}px ${rgba(p.accent, 0.6)}) drop-shadow(0 0 ${(18 * p.glow).toFixed(1)}px ${rgba(p.accent, 0.3)})`
      : undefined;

    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        {/* Surround dim: transparent inside the ring, pooling dark just outside it, feathering
            back out before the box boundary. Static — a breathing vignette reads as flicker. */}
        {p.dim && (
          <div
            style={{
              position: 'absolute', inset: 0,
              opacity: dimIn,
              background: `radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ${(r + 2).toFixed(0)}px, rgba(0,0,0,0.65) ${(r + 64).toFixed(0)}px, rgba(0,0,0,0.65) ${(corner * 0.72).toFixed(0)}px, rgba(0,0,0,0) ${corner.toFixed(0)}px)`,
              ...el('dim'),
            }}
          />
        )}

        {/* Resting 3D sway (~1.2°, rotations only about the subject) composed under the breathe —
            the ring keeps living in space without ever leaving what it circles. */}
        <div
          style={{
            position: 'absolute', inset: 0,
            transform: `${sway3d(t, seed, 1.2)} scale(${breathe.toFixed(4)})`,
            transformOrigin: `${cx.toFixed(1)}px ${cy.toFixed(1)}px`,
            ...el('ring'),
          }}
        >
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <circle
              cx={cx} cy={cy} r={r.toFixed(1)}
              fill="none"
              stroke={p.accent}
              strokeWidth={p.weight}
              strokeLinecap="round"
              strokeDasharray={C.toFixed(1)}
              strokeDashoffset={((1 - draw) * C).toFixed(1)}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ filter: drawBlur > 0.3 ? `${glowFilter ? glowFilter + ' ' : ''}blur(${drawBlur.toFixed(2)}px)` : glowFilter }}
            />
          </svg>
        </div>

        {p.label && (
          <span
            style={{
              position: 'absolute', left: 0, right: 0, top: cy + r + 26,
              textAlign: 'center',
              fontFamily: fontStack('montserrat'),
              fontSize: 25, fontWeight: 700,
              letterSpacing: '0.24em', textTransform: 'uppercase',
              color: p.ink,
              textShadow: '0 1px 8px rgba(0,0,0,0.6)',
              opacity: clamp01(labelIn * 1.4),
              transform: `${swingIn(labelIn, { rx: -12, z: -50 })} translateY(${((1 - labelIn) * 12).toFixed(2)}px)`,
              whiteSpace: 'nowrap',
              ...el('label'),
            }}
          >
            {p.label}
          </span>
        )}
      </div>
    );
  },
});
