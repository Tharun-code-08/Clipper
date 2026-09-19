// Hand-drawn marker annotation — the red circle / underline / arrow scribbled over footage
// to point at the thing that matters. Strokes draw on with a dash-offset sweep and carry a
// seeded wobble so they read hand-made, not vector-clean. A second, fainter pass lands
// slightly offset, the way a real marker doubles back.
//
// Ships with NO plate — it exists to sit directly on footage (Background toggle stays
// available but the default box is transparent).

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, fr } from '../motion';
import { sway3d, vel } from '../juice';

function wobblyEllipse(w: number, h: number, seed: string, pass: number): string {
  // A hand-drawn ellipse: 14 anchor points with seeded radial noise, closed with a slight
  // overshoot past the start — markers never land exactly where they began.
  const cx = w / 2, cy = h / 2;
  const rx = w * 0.42, ry = h * 0.36;
  const pts: [number, number][] = [];
  const N = 15;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI * 0.35;
    const n = 1 + (random(`${seed}-e${pass}-${i}`) - 0.5) * 0.09;
    pts.push([cx + Math.cos(a) * rx * n, cy + Math.sin(a) * ry * n]);
  }
  return 'M ' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ');
}

function wobblyUnderline(w: number, h: number, seed: string, pass: number): string {
  const y = h * 0.62;
  const pts: [number, number][] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const x = w * 0.06 + (i / N) * w * 0.88;
    const n = (random(`${seed}-u${pass}-${i}`) - 0.5) * h * 0.1;
    pts.push([x, y + n + (pass === 1 ? h * 0.09 : 0)]);
  }
  return 'M ' + pts.map(([x, y2]) => `${x.toFixed(1)} ${y2.toFixed(1)}`).join(' L ');
}

function wobblyArrow(w: number, h: number, seed: string): string {
  // Swooping shaft ending in a two-stroke head, pointing up-right.
  const x0 = w * 0.1, y0 = h * 0.82, x1 = w * 0.82, y1 = h * 0.2;
  const mx = w * 0.36 + (random(`${seed}-a0`) - 0.5) * w * 0.1;
  const my = h * 0.86 + (random(`${seed}-a1`) - 0.5) * h * 0.08;
  const head = w * 0.13;
  return [
    `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`,
    `M ${(x1 - head).toFixed(1)} ${(y1 + head * 0.16).toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} L ${(x1 - head * 0.22).toFixed(1)} ${(y1 + head).toFixed(1)}`,
  ].join(' ');
}

export const markerAnnotate = defineGraphicsTemplate({
  id: 'marker_annotate',
  name: 'Marker Annotate',
  category: 'fx',
  tags: ['Circle', 'Underline', 'Arrow', 'Marker', 'Annotate'],
  badge: 'New',
  design: { w: 600, h: 420 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3200,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 44 },
  // No text is drawn; 'inter' satisfies the export font-warm gate at zero cost.
  fonts: ['inter'],

  elements: [
    { key: 'stroke', label: 'Stroke', hideable: false },
    { key: 'echo',   label: 'Second pass' },
  ],

  params: [
    { type: 'select', key: 'shape', label: 'Shape', group: 'Content', default: 'circle',
      options: [
        { value: 'circle', label: 'Circle' },
        { value: 'underline', label: 'Underline' },
        { value: 'arrow', label: 'Arrow' },
      ] },
    { type: 'color',  key: 'color', label: 'Marker', group: 'Style', default: '#E5484D' },
    { type: 'number', key: 'weight', label: 'Stroke', group: 'Style', default: 9, min: 3, max: 22, step: 1, unit: 'px' },

    { type: 'number', key: 'drawMs', label: 'Draw time', group: 'Motion', default: 600, min: 200, max: 1500, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Two marker passes, two light swishes — the second at the 0.7·drawMs offset the echo stroke
  // actually starts on. No slam: a scribble is a hand move, not an impact.
  sfx: (p) => [
    { atMs: p.delay + 30, id: 'swish', gain: 0.55 },
    { atMs: p.delay + p.drawMs * 0.7, id: 'swish', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    // damping 200 keeps the dash sweep monotonic — a marker never un-draws.
    const sweep = (local: number) => spring({
      frame: fr(local), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(p.drawMs))),
    });
    const draw = sweep(t);
    const draw2 = sweep(t - p.drawMs * 0.7);
    // MOTION BLUR on the draw: each pass blurs with its own sweep velocity — a fast hand pass,
    // crisp ink the frame the stroke parks. (vel of the dash progress, scaled well below the
    // over-estimated path length so the whole stroke never mushes.)
    const vTip1 = vel((ms) => sweep(ms - p.delay), timeMs);
    const vTip2 = vel((ms) => sweep(ms - p.delay - p.drawMs * 0.7), timeMs);
    const blur1 = Math.min(2.2, Math.abs(vTip1) * (width + height) * 0.55);
    const blur2 = Math.min(2.2, Math.abs(vTip2) * (width + height) * 0.55);
    if (t <= 0) return null;

    const d1 = p.shape === 'circle' ? wobblyEllipse(width, height, seed, 0)
      : p.shape === 'underline' ? wobblyUnderline(width, height, seed, 0)
      : wobblyArrow(width, height, seed);
    const d2 = p.shape === 'circle' ? wobblyEllipse(width, height, seed, 1)
      : p.shape === 'underline' ? wobblyUnderline(width, height, seed, 1)
      : null;

    // Generous over-estimate of path length for the dash sweep — exact length is not
    // knowable without DOM measurement, and an overshoot only means the sweep finishes
    // marginally early, which a marker stroke survives.
    const len = (width + height) * 3.2;

    return (
      // Resting 3D sway — the scribble keeps living on the footage (~1.1°, rotations only, never
      // enough to wander off what it circles).
      <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', transform: sway3d(t, seed, 1.1), ...el('stroke') }}>
        <path
          d={d1}
          fill="none"
          stroke={p.color}
          strokeWidth={p.weight}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={len}
          strokeDashoffset={(1 - draw) * len}
          style={{ filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.35))${blur1 > 0.3 ? ` blur(${blur1.toFixed(2)}px)` : ''}` }}
        />
        {d2 && (
          <path
            d={d2}
            fill="none"
            stroke={p.color}
            strokeWidth={Math.max(2, p.weight * 0.7)}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={len}
            strokeDashoffset={(1 - draw2) * len}
            opacity={0.55}
            style={{ filter: blur2 > 0.3 ? `blur(${blur2.toFixed(2)}px)` : undefined, ...el('echo') }}
          />
        )}
      </svg>
    );
  },
});
