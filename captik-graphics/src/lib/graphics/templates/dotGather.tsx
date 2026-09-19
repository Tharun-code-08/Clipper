// Reference: general/loading.mp4  (window 0-11480ms, ring closes ~3400ms then turns)
// Scattered dots pulling into a ring, which then keeps slowly turning.
//
// Every dot interpolates between a seeded scatter point and its OWN slot on the ring, so the ring
// closes evenly. Letting them all converge on the nearest free slot piles them up on one arc.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { luxeGrain, luxeVignette } from '../luxe';
import { FPS, clamp01, fr, rgba } from '../motion';
import { smear, sway3d, vel } from '../juice';

export const dotGather = defineGraphicsTemplate({
  id: 'dot_gather',
  name: 'Dot Gather',
  category: 'fx',
  tags: ['Loading', 'Dots', 'Ring'],
  design: { w: 900, h: 1200 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 11500,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'field', label: 'Field', hideable: false },
    { key: 'dots',  label: 'Dots' },
  ],

  params: [
    { type: 'number', key: 'count', label: 'Dots', group: 'Content', default: 46, min: 6, max: 90, step: 1 },

    { type: 'color',  key: 'bg',   label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'dot',  label: 'Dots',     group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'size', label: 'Dot size', group: 'Style', default: 7, min: 1, max: 30, step: 1, unit: 'px' },
    { type: 'number', key: 'ring', label: 'Ring radius', group: 'Style', default: 245, min: 40, max: 600, step: 5, unit: 'px' },
    { type: 'number', key: 'jitter', label: 'Ring wobble', group: 'Style', default: 18, min: 0, max: 90, step: 2, unit: 'px',
      help: 'The reference ring is hand-scattered, not a perfect circle.' },
    { type: 'number', key: 'spread', label: 'Scatter spread', group: 'Style', default: 78, min: 10, max: 100, step: 2, unit: '%' },
    { type: 'boolean', key: 'fill', label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'gatherAt', label: 'Gathers at', group: 'Motion', default: 900, min: 0, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'stagger',  label: 'Dot stagger', group: 'Motion', default: 14, min: 0, max: 120, step: 1, unit: 'ms' },
    { type: 'number', key: 'spin',     label: 'Ring turn', group: 'Motion', default: 0.055, min: -0.5, max: 0.5, step: 0.005, unit: 'turn/s' },
  ],

  // A light air pass as the swarm lifts off, a soft chime as the last dot parks on the ring —
  // both keyed off the same gatherAt/stagger the per-dot springs use.
  sfx: (p) => [
    { atMs: p.gatherAt + 80, id: 'swish', gain: 0.5 },
    { atMs: p.gatherAt + Math.round(p.count) * p.stagger + 800, id: 'chime', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const n = Math.round(p.count);
    const cx = width / 2;
    const cy = height / 2;
    // Modulo turn — the ring's angle is a function of ms, never accumulated.
    const turn = ((timeMs / 1000) * p.spin) % 1;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          ...el('field'),
        }}
      >
        {/* Subtle system sway — the whole dot field keeps living in space (rotations only). */}
        <div style={{ position: 'absolute', inset: 0, transform: sway3d(timeMs, seed, 1.5), ...el('dots') }}>
          {Array.from({ length: n }).map((_, i) => {
            // A closure of absolute ms so vel() can sample the same pull for the flight smear.
            const pullAt = (ms: number) => spring({
              frame: fr(ms - p.gatherAt - i * p.stagger), fps: FPS,
              config: { damping: 26, mass: 0.9, stiffness: 105 },
              durationInFrames: Math.max(1, Math.round(fr(1100))),
            });
            const pull = pullAt(timeMs);
            // Each dot owns ONE slot on the ring, so the ring closes evenly.
            const a = ((i / n) + turn) * Math.PI * 2;
            const r = p.ring + (random(`${seed}rj${i}`) - 0.5) * 2 * p.jitter;
            const ringX = cx + Math.cos(a) * r;
            const ringY = cy + Math.sin(a) * r;

            const sx = cx + (random(`${seed}sx${i}`) - 0.5) * width * (p.spread / 100);
            const sy = cy + (random(`${seed}sy${i}`) - 0.5) * height * (p.spread / 100) * 0.9;

            const x = sx + (ringX - sx) * pull;
            const y = sy + (ringY - sy) * pull;
            // MOTION BLUR: each dot smears along its own flight (velocity of ITS pull spring) and
            // lands crisp on the ring — scattered rest and parked rest both stay sharp.
            const dPull = vel(pullAt, timeMs);
            const sm = smear(dPull * (ringX - sx), dPull * (ringY - sy), 1.3);
            return (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: x - p.size / 2, top: y - p.size / 2,
                  width: p.size, height: p.size, borderRadius: '50%',
                  background: p.dot,
                  boxShadow: `0 0 ${Math.round(p.size * 1.6)}px ${rgba(p.dot, 0.35)}`,
                  filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                  transform: `scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
                  opacity: clamp01(interpolate(timeMs, [0, 400], [0, 1], {
                    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                  })),
                }}
              />
            );
          })}
        </div>
        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
