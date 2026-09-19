// The "look here" punch-in: a thick amber bracket frame slams onto footage 1.5x -> 1.0 on an
// underdamped spring (the overshoot IS the impact), rides a decaying-sine settle shake, then
// pulses ±1.5% exactly twice. Corner ticks overhang the frame edges bracket-style, longer than
// the sides are thick. The optional surround-dim feathers out BEFORE the box edge so the
// graphic's rectangular boundary never prints onto the footage (same rule as focusRing).

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, inkOn } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

export const zoomFrame = defineGraphicsTemplate({
  id: 'zoom_frame',
  name: 'Zoom Frame',
  category: 'fx',
  tags: ['Frame', 'Bracket', 'Zoom', 'Highlight', 'Stamp'],
  badge: 'New',
  design: { w: 700, h: 700 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3500,
  defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 50 },
  fonts: ['montserrat'],

  elements: [
    { key: 'frame',   label: 'Frame', hideable: false },
    { key: 'corners', label: 'Corner ticks' },
    { key: 'label',   label: 'Label chip' },
    { key: 'dim',     label: 'Surround dim' },
  ],

  params: [
    { type: 'text', key: 'label', label: 'Label', group: 'Content', default: 'LOOK HERE', maxLength: 16 },

    { type: 'color',  key: 'accent', label: 'Frame', group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'thickness', label: 'Thickness', group: 'Style', default: 11, min: 5, max: 20, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 26, min: 0, max: 60, step: 1, unit: 'px' },
    { type: 'boolean', key: 'dim', label: 'Dim surroundings', group: 'Style', default: false },

    { type: 'number', key: 'slamMs', label: 'Slam time', group: 'Motion', default: 500, min: 240, max: 900, step: 20, unit: 'ms' },
    { type: 'number', key: 'shake', label: 'Settle shake', group: 'Motion', default: 3, min: 0, max: 8, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Whoosh into the punch-in, slam at the ~45%-of-slamMs impact the shake already keys off,
  // a glossy pop when the label chip lands — all off the same slamMs the motion uses.
  sfx: (p) => [
    { atMs: p.delay + 30, id: 'whoosh', gain: 0.55 },
    { atMs: p.delay + p.slamMs * 0.45 + 60, id: 'slam', gain: 0.85 },
    { atMs: p.delay + p.slamMs + 200, id: 'pop', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;

    const m = Math.min(width, height) * 0.1;

    // Slam: damping 15 overshoots past 1.0 by a hair — that single dip below target size is the
    // stamp reading as impact rather than a zoom. A closure of absolute ms so vel() can sample
    // the same motion for the smear.
    const slamAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 15, mass: 0.7, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(p.slamMs))),
    });
    const slam = slamAt(t);
    const scale = 1.5 - 0.5 * slam;
    const op = clamp01(t / 120);
    // MOTION BLUR: punch-zoom velocity at the bracket's edge — smears the fall, lands crisp.
    const vSlam = vel((ms) => 1.5 - 0.5 * slamAt(ms), t) * Math.min(width, height) * 0.4;
    const smSlam = smear(0, vSlam, 1.1);
    // DEPTH: the bracket swings in on a MODEST top hinge (it must land exactly on what it frames)
    // and then keeps breathing in space — ~1° sway, never enough to drift off the subject. The
    // label chip parallaxes as foreground against it.
    const pose = depthPose(t, seed, { enter: slam, rx: -10, z: -70, swayDeg: 1 });
    const parChip = parallax(t, seed, 0.6, Math.min(width, height) * 0.012);

    // Settle shake: decaying sine of timeMs on translate — pure, never random per frame.
    const impactT = t - p.slamMs * 0.45;
    const decay = impactT > 0 ? Math.exp(-impactT / 130) * p.shake : 0;
    const shX = decay * Math.sin(impactT / 23);
    const shY = decay * 0.7 * Math.sin(impactT / 31 + 1.3);

    // Exactly two ±1.5% pulses after the settle; sin hits 0 at both window edges, so no pop.
    const pulsePeriod = 480;
    const ph = t - (p.slamMs + 800);
    const pulse = ph > 0 && ph < pulsePeriod * 2
      ? 1 + 0.015 * Math.sin((ph / pulsePeriod) * Math.PI * 2)
      : 1;

    const chipIn = spring({
      frame: fr(t - p.slamMs - 100), fps: FPS,
      config: { damping: 22, mass: 0.6, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });

    const dimIn = easeOutQuint(clamp01((t - p.slamMs * 0.6) / 500));
    const frameHalfDiag = Math.hypot(width / 2 - m, height / 2 - m);
    const corner = Math.hypot(width / 2, height / 2);

    // Corner ticks: bracket arms outside the frame line, longer than the frame is thick.
    const o = p.thickness * 1.15;
    const arm = p.thickness * 3.2;
    const ticks = ([[m, m, 1, 1], [width - m, m, -1, 1], [m, height - m, 1, -1], [width - m, height - m, -1, -1]] as const)
      .map(([cx, cy, dx, dy], k) => {
        const bx = cx - dx * o, by = cy - dy * o;
        return (
          <path
            key={k}
            d={`M ${(bx + dx * arm).toFixed(1)} ${by.toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)} L ${bx.toFixed(1)} ${(by + dy * arm).toFixed(1)}`}
            fill="none"
            stroke={p.accent}
            strokeWidth={p.thickness * 0.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      });

    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        {/* Static full-bleed dim — scaling it with the slam would read as the WORLD moving. */}
        {p.dim && (
          <div
            style={{
              position: 'absolute', inset: 0,
              opacity: dimIn,
              background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ${(frameHalfDiag * 0.92).toFixed(0)}px, rgba(0,0,0,0.55) ${(frameHalfDiag * 1.18).toFixed(0)}px, rgba(0,0,0,0.55) ${(corner * 0.78).toFixed(0)}px, rgba(0,0,0,0) ${corner.toFixed(0)}px)`,
              ...el('dim'),
            }}
          />
        )}

        <div
          style={{
            position: 'absolute', inset: 0,
            opacity: op,
            filter: smSlam.blurPx > 0.3 ? `blur(${smSlam.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} translate(${shX.toFixed(2)}px, ${shY.toFixed(2)}px) scale(${(scale * pulse * smSlam.sx).toFixed(4)}, ${(scale * pulse * smSlam.sy).toFixed(4)})`,
            transformOrigin: 'center center',
          }}
        >
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <rect
              x={m.toFixed(1)} y={m.toFixed(1)}
              width={(width - 2 * m).toFixed(1)} height={(height - 2 * m).toFixed(1)}
              rx={p.radius}
              fill="none"
              stroke={p.accent}
              strokeWidth={p.thickness}
              style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))', ...el('frame') }}
            />
            <g style={{ ...el('corners') }}>{ticks}</g>
          </svg>

          {p.label && (
            <span
              style={{
                position: 'absolute',
                left: m * 0.9,
                top: m - 24,
                padding: '8px 18px',
                background: p.accent,
                color: inkOn(p.accent),
                fontFamily: fontStack('montserrat'),
                fontSize: 24, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                borderRadius: 10,
                boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap',
                opacity: clamp01(chipIn * 1.3),
                transform: `translate(${parChip.x.toFixed(2)}px, ${(parChip.y + (1 - chipIn) * 10).toFixed(2)}px)`,
                ...el('label'),
              }}
            >
              {p.label}
            </span>
          )}
        </div>
      </div>
    );
  },
});
