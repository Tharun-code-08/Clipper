// Reference: graphics/pencil-drawing-1.mp4  (window 400-4240ms, stroke laid down by ~800ms)
// A pencil laying down a stroke, the pencil riding the tip of the line it is drawing.
//
// Same discipline as route_map: the pencil's position AND its angle come from the curve and its
// analytic derivative, so the nib is always exactly on the end of the ink and pointing along it.
// Offsetting the pencil by hand is what makes these look like two separate animations.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

const STEPS = 64;

const PATHS: Record<string, [number, number][]> = {
  // Control quads in unit space: [x, y] start, c1, c2, end — chained.
  swoop: [[0.24, 0.04], [0.66, 0.18], [0.28, 0.46], [0.40, 0.66], [0.50, 0.88], [0.78, 0.86], [0.94, 0.74]],
  wave:  [[0.06, 0.5], [0.3, 0.08], [0.5, 0.92], [0.7, 0.5], [0.82, 0.28], [0.9, 0.72], [0.98, 0.5]],
  hook:  [[0.14, 0.08], [0.94, 0.18], [0.86, 0.62], [0.45, 0.62], [0.14, 0.62], [0.2, 0.94], [0.72, 0.92]],
};

export const pencilDraw = defineGraphicsTemplate({
  id: 'pencil_draw',
  name: 'Pencil Draw',
  category: 'fx',
  tags: ['Draw', 'Sketch', 'Hand'],
  design: { w: 900, h: 1240 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'scene',  label: 'Scene', hideable: false },
    { key: 'stroke', label: 'Stroke' },
    { key: 'pencil', label: 'Pencil' },
  ],

  params: [
    { type: 'select', key: 'shape', label: 'Stroke', group: 'Content', default: 'swoop', options: [
      { value: 'swoop', label: 'Swoop' },
      { value: 'wave',  label: 'Wave' },
      { value: 'hook',  label: 'Hook' },
    ] },

    { type: 'color',  key: 'bg',    label: 'Background', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'ink',   label: 'Stroke',     group: 'Style', default: '#1A1A20' },
    { type: 'color',  key: 'body',  label: 'Pencil body', group: 'Style', default: '#1A1A20' },
    { type: 'color',  key: 'wood',  label: 'Pencil nib', group: 'Style', default: '#e8c9a0' },
    { type: 'color',  key: 'band',  label: 'Ferrule',    group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'thick', label: 'Stroke width', group: 'Style', default: 18, min: 2, max: 50, step: 1, unit: 'px' },
    { type: 'number', key: 'length', label: 'Pencil length', group: 'Style', default: 420, min: 60, max: 500, step: 10, unit: 'px' },
    { type: 'boolean', key: 'fill', label: 'Paint the background', group: 'Style', default: true },
    { type: 'boolean', key: 'showPencil', label: 'Show the pencil', group: 'Style', default: true },

    { type: 'number', key: 'startAt', label: 'Starts at', group: 'Motion', default: 60, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drawMs',  label: 'Draws over', group: 'Motion', default: 380, min: 200, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'restMs',  label: 'Pencil rests', group: 'Motion', default: 2600, min: 0, max: 6000, step: 50, unit: 'ms',
      help: 'How long the pencil sits on the finished stroke before it lifts away.' },
    { type: 'number', key: 'liftMs',  label: 'Pencil lifts over', group: 'Motion', default: 3000, min: 0, max: 3000, step: 50, unit: 'ms' },
  ],

  // PAPER language: the sheet flicks onto the desk, then the stroke itself is one fast pass.
  sfx: (p) => [
    { atMs: 40, id: 'paper', gain: 0.45 },
    { atMs: p.startAt, id: 'swish', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const pts = PATHS[p.shape] ?? PATHS.swoop;

    // Sample the chained cubic in unit space, then scale to the canvas.
    const seg = (u: number) => {
      const n = Math.floor((pts.length - 1) / 3);
      const k = Math.min(n - 1, Math.floor(u * n));
      const lu = u * n - k;
      const [a, b, c, d] = [pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2], pts[k * 3 + 3]];
      const mt = 1 - lu;
      const x = mt * mt * mt * a[0] + 3 * mt * mt * lu * b[0] + 3 * mt * lu * lu * c[0] + lu * lu * lu * d[0];
      const y = mt * mt * mt * a[1] + 3 * mt * mt * lu * b[1] + 3 * mt * lu * lu * c[1] + lu * lu * lu * d[1];
      const dx = 3 * mt * mt * (b[0] - a[0]) + 6 * mt * lu * (c[0] - b[0]) + 3 * lu * lu * (d[0] - c[0]);
      const dy = 3 * mt * mt * (b[1] - a[1]) + 6 * mt * lu * (c[1] - b[1]) + 3 * lu * lu * (d[1] - c[1]);
      return { x: x * width, y: y * height, dx, dy };
    };

    const t = interpolate(timeMs, [p.startAt, p.startAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const liftAt = p.startAt + p.drawMs + p.restMs;
    const lift = interpolate(timeMs, [liftAt, liftAt + Math.max(1, p.liftMs)], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    const poly = Array.from({ length: STEPS + 1 }, (_, i) => {
      const { x, y } = seg(i / STEPS);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const head = seg(Math.min(0.999, Math.max(0.001, t)));
    const angle = (Math.atan2(head.dy, head.dx) * 180) / Math.PI;

    const enter = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(320))),
    });

    const L = p.length;

    // The sheet is PAPER tossed on a desk: a casual top-hinged swing with a slight rz, then a
    // small resting sway so the page keeps living in space. Kept loose, not glossy. scale(1.015)
    // covers the sway's perspective excursion so footage never peeks past the page edge at rest.
    const pose = depthPose(timeMs, seed, { enter, rx: -12, z: -60, swayDeg: 1.2, periodMs: 4200 });
    const rz = (1 - enter) * -1.6;

    // MOTION BLUR on the pencil: its velocity along the curve (analytic head position sampled
    // with vel) drives blur + a stretch along the pencil's own axis — which IS the motion axis,
    // since the nib always points along the tangent. Dies to zero the instant the stroke lands.
    const vhx = vel((ms) => seg(Math.min(0.999, Math.max(0.001, interpolate(ms, [p.startAt, p.startAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })))).x, timeMs);
    const vhy = vel((ms) => seg(Math.min(0.999, Math.max(0.001, interpolate(ms, [p.startAt, p.startAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })))).y, timeMs);
    const pSm = smear(vhx, vhy, 0.8);
    const pStretch = 1 + Math.min(0.18, Math.hypot(vhx, vhy) * 0.8 * 0.055);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          opacity: clamp01(enter),
          transform: `${pose} rotate(${rz.toFixed(2)}deg) scale(1.015)`,
          transformOrigin: '50% 40%',
          ...el('scene'),
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g style={{ ...el('stroke') }}>
            <polyline
              points={poly.join(' ')}
              fill="none"
              stroke={p.ink}
              strokeWidth={p.thick}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - t}
            />
          </g>
        </svg>

        {p.showPencil && (
          <div
            style={{
              position: 'absolute', left: head.x, top: head.y,
              width: L, height: L * 0.11,
              opacity: clamp01((1 - lift) * 2),
              // Nib sits at the tip; the body trails back along the tangent.
              transformOrigin: '0 50%',
              transform:
                `rotate(${(angle + 180).toFixed(2)}deg) `
                + `translate(0, ${(-L * 0.055).toFixed(1)}px) `
                + `translateY(${(lift * -L * 0.4).toFixed(1)}px) `
                // Stretch along the pencil's local x — the tangent, i.e. the motion axis.
                + `scaleX(${pStretch.toFixed(3)})`,
              filter: `${pSm.blurPx > 0.3 ? `blur(${pSm.blurPx.toFixed(2)}px) ` : ''}drop-shadow(0 ${width * 0.004}px ${width * 0.01}px ${rgba('#000000', 0.16)}) drop-shadow(0 ${width * 0.014}px ${width * 0.03}px ${rgba('#000000', 0.14)})`,
              ...el('pencil'),
            }}
          >
            <div style={{ position: 'absolute', left: 0, top: 0, width: L * 0.1, height: '100%', background: p.wood, clipPath: 'polygon(0 50%, 100% 0, 100% 100%)' }} />
            <div style={{ position: 'absolute', left: L * 0.1, top: 0, width: L * 0.62, height: '100%', background: p.body }} />
            <div style={{ position: 'absolute', left: L * 0.72, top: 0, width: L * 0.1, height: '100%', background: p.band }} />
            <div style={{ position: 'absolute', left: L * 0.82, top: 0, width: L * 0.18, height: '100%', background: p.wood, borderRadius: `0 ${L * 0.05}px ${L * 0.05}px 0` }} />
          </div>
        )}
      </div>
    );
  },
});
