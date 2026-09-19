// Anime-style radial speed lines: thin wedges radiating from an off-centre focal point toward
// the edges, flickering on seeded phase offsets. The flicker is a pow-sharpened sine of timeMs
// per wedge — pure and scrub-safe — and the centre stays clear (default 35%) so the subject owns
// the frame. Plateless. Even/odd wedges land in two banks so hiding one halves the density.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr } from '../motion';
import { vel } from '../juice';

export const speedLines = defineGraphicsTemplate({
  id: 'speed_lines',
  name: 'Speed Lines',
  category: 'fx',
  tags: ['Lines', 'Radial', 'Anime', 'Burst', 'Streaks'],
  badge: 'New',
  design: { w: 900, h: 900 },
  // Frame-wide effect: hugs the REAL video frame at any aspect. px-unit params are authored
  // against the 900 design and rescaled by `unit` below — fullBleed render() gets canvas px.
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 3000,
  defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 96 },
  // No text is drawn; 'inter' satisfies the export font-warm gate at zero cost.
  fonts: ['inter'],

  elements: [
    { key: 'linesA', label: 'Lines — bank A' },
    { key: 'linesB', label: 'Lines — bank B' },
  ],

  params: [
    { type: 'number', key: 'count', label: 'Line count', group: 'Content', default: 16, min: 8, max: 20, step: 1 },
    { type: 'select', key: 'bias', label: 'Direction', group: 'Content', default: 'all',
      options: [
        { value: 'all', label: 'All around' },
        { value: 'right', label: 'From the right' },
        { value: 'left', label: 'From the left' },
      ] },

    { type: 'boolean', key: 'amber', label: 'Amber', group: 'Style', default: false },
    { type: 'color',  key: 'tint',   label: 'Line colour', group: 'Style', default: '#F6F2E8', showIf: { key: 'amber', equals: false } },
    { type: 'number', key: 'weight', label: 'Line width', group: 'Style', default: 10, min: 3, max: 22, step: 1, unit: 'px' },
    { type: 'number', key: 'clear',  label: 'Clear centre', group: 'Style', default: 35, min: 22, max: 55, step: 1, unit: '%' },

    { type: 'number', key: 'flickerMs', label: 'Flicker cycle', group: 'Motion', default: 640, min: 200, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // One cinematic air pass as the field bursts in.
  sfx: (p) => [
    { atMs: p.delay, id: 'whoosh', gain: 0.6 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;

    const color = p.amber ? '#F59E0B' : p.tint;
    const n = Math.round(p.count);

    // Focal point sits above centre; a biased side pushes it the OTHER way so those wedges
    // get travel across the frame.
    // px-unit params mean "px on the 900 design canvas" — rescale to whatever frame we got.
    const unit = Math.min(width, height) / 900;
    const fx = width * (p.bias === 'right' ? 0.40 : p.bias === 'left' ? 0.60 : 0.5);
    const fy = height * 0.42;
    const clearR = Math.min(width, height) * (p.clear / 100);
    const outerR = Math.hypot(Math.max(fx, width - fx), Math.max(fy, height - fy)) + 60 * unit;

    // Burst-in: monotonic spring scales the whole field 1.12 -> 1 around the focal point.
    const burstAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 200, mass: 0.6, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(320))),
    });
    const burst = burstAt(t);
    // MOTION BLUR on the burst only: the field's radial contraction speed at the outer rim
    // drives a brief blur that dies as the spring settles — the held flicker stays crisp.
    const vBurst = Math.abs(vel(burstAt, t)) * 0.12 * outerR;
    const burstBlur = Math.min(6, vBurst * 2);

    // Biased directions cover a ~140° sector pointing at that edge; 'all' covers the circle.
    const sector = p.bias === 'all' ? Math.PI * 2 : 2.45;
    const baseAngle = p.bias === 'right' ? 0 : p.bias === 'left' ? Math.PI : -Math.PI / 2;

    const bankA: React.ReactElement[] = [];
    const bankB: React.ReactElement[] = [];
    for (let i = 0; i < n; i++) {
      const slot = p.bias === 'all'
        ? (i / n) * sector
        : baseAngle - sector / 2 + ((i + 0.5) / n) * sector;
      const a = slot + (random(`${seed}a${i}`) - 0.5) * (sector / n) * 0.9;

      // Per-wedge flicker: seeded rate + phase, sharpened so troughs read as "off".
      const rate = 0.7 + random(`${seed}f${i}`) * 0.6;
      const phase = random(`${seed}p${i}`) * Math.PI * 2;
      const pulse = 0.5 + 0.5 * Math.sin((t / p.flickerMs) * Math.PI * 2 * rate + phase);
      const op = 0.08 + 0.92 * Math.pow(pulse, 2.6);

      // Apex breathes slightly in and out of the clear zone — alive, never static.
      const r0 = clearR * (1 + random(`${seed}r${i}`) * 0.22)
        * (1 + 0.04 * Math.sin((t / p.flickerMs) * Math.PI * 2 * (0.5 + rate * 0.4) + phase * 1.7));
      const hw = p.weight * unit * (0.6 + random(`${seed}w${i}`) * 0.8);

      const cos = Math.cos(a), sin = Math.sin(a);
      const ax = fx + cos * r0, ay = fy + sin * r0;
      const b1x = fx + cos * outerR - sin * hw, b1y = fy + sin * outerR + cos * hw;
      const b2x = fx + cos * outerR + sin * hw, b2y = fy + sin * outerR - cos * hw;
      const wedge = (
        <polygon
          key={i}
          points={`${ax.toFixed(1)},${ay.toFixed(1)} ${b1x.toFixed(1)},${b1y.toFixed(1)} ${b2x.toFixed(1)},${b2y.toFixed(1)}`}
          fill={color}
          opacity={op.toFixed(3)}
        />
      );
      (i % 2 === 0 ? bankA : bankB).push(wedge);
    }

    return (
      <div style={{ position: 'absolute', inset: 0, opacity: clamp01(burst * 2.5) }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            position: 'absolute', inset: 0, overflow: 'visible',
            transform: `scale(${(1.12 - 0.12 * burst).toFixed(4)})`,
            transformOrigin: `${fx.toFixed(1)}px ${fy.toFixed(1)}px`,
            filter: `${burstBlur > 0.3 ? `blur(${burstBlur.toFixed(2)}px) ` : ''}drop-shadow(0 ${unit.toFixed(2)}px ${(2 * unit).toFixed(2)}px rgba(0,0,0,0.3))`,
          }}
        >
          <g style={{ ...el('linesA') }}>{bankA}</g>
          <g style={{ ...el('linesB') }}>{bankB}</g>
        </svg>
      </div>
    );
  },
});
