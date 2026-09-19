// Reference: text/financials.mp4  (window 1120-4280ms, curve and counter run the whole 3160ms)
// A glowing exponential curve drawing left to right with a chip riding its leading edge, over a
// huge ghosted running total. Three things move on one clock and must agree exactly: the path's
// dash offset, the dot's position, and the number. They are all derived from the SAME progress
// value and the same curve function, so the chip can never drift off the line.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, ghosts, parallax, smear, vel } from '../juice';

/** The curve, in unit space: 0..1 in, 0..1 up. `bend` 1 is a straight line, higher is hockey-stick. */
function curveY(t: number, bend: number): number {
  return Math.pow(clamp01(t), bend);
}

/** 1234567.8 -> "1,234,568" */
function group(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const growthCurve = defineGraphicsTemplate({
  id: 'growth_curve',
  name: 'Growth Curve',
  category: 'money',
  tags: ['Chart', 'Counter', 'Finance', 'Luxury'],
  design: { w: 900, h: 1050 },
  defaultDurationMs: 3600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'curve',  label: 'Curve', hideable: false },
    { key: 'total',  label: 'Running total' },
    { key: 'chip',   label: 'Chip' },
    { key: 'dot',    label: 'Leading dot' },
    { key: 'fill',   label: 'Under-curve glow' },
  ],

  params: [
    { type: 'text',   key: 'label',  label: 'Chip label', group: 'Content', default: 'Expenses', maxLength: 24 },
    { type: 'text',   key: 'prefix', label: 'Prefix',     group: 'Content', default: '$', maxLength: 4 },
    { type: 'number', key: 'target', label: 'Final value', group: 'Content', default: 10000, min: 1, max: 10000000, step: 100 },

    { type: 'color',  key: 'line',  label: 'Curve',  group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ghost', label: 'Total',  group: 'Style', default: '#6B675C' },
    { type: 'color',  key: 'chipBg', label: 'Chip',  group: 'Style', default: '#1A1A20' },
    { type: 'color',  key: 'ink',   label: 'Chip text', group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Total size', group: 'Style', default: 290, min: 30, max: 300, step: 4, unit: 'px' },
    { type: 'number', key: 'thick', label: 'Curve width', group: 'Style', default: 6, min: 1, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'glow',  label: 'Glow',   group: 'Style', default: 22, min: 0, max: 80, step: 2, unit: 'px' },
    { type: 'number', key: 'bend',  label: 'Bend',   group: 'Style', default: 3.2, min: 1, max: 8, step: 0.1,
      help: '1 is a straight line. Higher is more hockey-stick.' },
    { type: 'boolean', key: 'shade', label: 'Glow under the curve', group: 'Style', default: true },

    { type: 'number', key: 'drawMs', label: 'Draws over', group: 'Motion', default: 1400, min: 200, max: 9000, step: 100, unit: 'ms' },
    { type: 'number', key: 'startAt', label: 'Starts at', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  // A long airy sweep under the draw, ONE tick as the total starts rolling, and the cash hit
  // exactly where the curve reaches the corner — all timed off the same startAt/drawMs.
  sfx: (p) => [
    { atMs: p.startAt, id: 'sweep', gain: 0.4 },
    { atMs: p.startAt + 80, id: 'tick', gain: 0.35 },
    { atMs: p.startAt + p.drawMs, id: 'cash', gain: 0.6 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);

    // The sweep EASES OUT: the reference is most of the way across within the first second and
    // then creeps to the corner. A linear sweep reads as half the speed at every shared timestamp.
    const tOf = (ms: number) => Math.pow(interpolate(ms, [p.startAt, p.startAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    }), 0.75);
    const t = tOf(timeMs);
    const appear = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });
    // Depth: the whole chart swings in and keeps a ±1.5° sway; the ghosted total (backplate)
    // and the chip (foreground) shear at different parallax depths over it.
    const pose = depthPose(timeMs, seed, { enter: appear, rx: -8, z: -50, swayDeg: 1.5 });
    const parTotal = parallax(timeMs, seed, 0.3, height * 0.009);
    const parChip = parallax(timeMs, seed, 0.7, height * 0.009);

    // Plot area: the curve starts bottom-left and finishes near the top-right corner.
    const x0 = width * 0.06, x1 = width * 0.99;
    const y0 = height * 0.94, y1 = height * 0.1;
    const px = (u: number) => x0 + (x1 - x0) * u;
    const py = (u: number) => y0 - (y0 - y1) * u;

    const STEPS = 64;
    const pts = Array.from({ length: STEPS + 1 }, (_, i) => {
      const u = i / STEPS;
      return `${px(u).toFixed(2)},${py(curveY(u, p.bend)).toFixed(2)}`;
    });
    const d = `M ${pts.join(' L ')}`;
    const area = `${d} L ${px(1).toFixed(2)},${y0.toFixed(2)} L ${px(0).toFixed(2)},${y0.toFixed(2)} Z`;

    // The dot, the chip and the number all read the SAME t and the SAME curve function.
    const hx = px(t);
    const hy = py(curveY(t, p.bend));
    // MOTION BLUR on the leading edge: the chip and dot ride the curve at real velocity — a
    // speed-scaled smear plus trailing ghost dots that vanish the moment the sweep rests.
    const vx = vel((ms) => px(tOf(ms)), timeMs);
    const vy = vel((ms) => py(curveY(tOf(ms), p.bend)), timeMs);
    const smChip = smear(vx, vy);
    const gh = ghosts(vx, vy, 2);
    // The rolling total blurs with its remaining count velocity — crisp the frame it lands.
    const blurTot = timeMs > p.startAt && t < 1 ? (1 - t) * 6 : 0;
    // The counter tracks the SWEEP, not the curve's height — in the reference the total is already
    // a quarter of the way up while the line is still hugging the floor.
    const value = p.target * t;

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: ff, transform: pose, transformOrigin: '50% 40%' }}>
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: '46%',
            textAlign: 'center',
            fontSize: p.size, fontWeight: 800, color: p.ghost,
            letterSpacing: -p.size * 0.03, whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 2px 24px rgba(0,0,0,0.35)',
            transform: `translate(${parTotal.x.toFixed(2)}px, ${parTotal.y.toFixed(2)}px) translateY(-50%)`,
            filter: blurTot > 0.3 ? `blur(${blurTot.toFixed(2)}px)` : undefined,
            opacity: clamp01(appear),
            ...el('total'),
          }}
        >
          {p.prefix}{group(value)}
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {p.shade && (
            <g style={{ ...el('fill') }}>
              <defs>
                <linearGradient id="gc_shade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={rgba(p.line, 0.28)} />
                  <stop offset="100%" stopColor={rgba(p.line, 0)} />
                </linearGradient>
                <clipPath id="gc_clip">
                  <rect x={0} y={0} width={Math.max(0, hx)} height={height} />
                </clipPath>
              </defs>
              <path d={area} fill="url(#gc_shade)" clipPath="url(#gc_clip)" />
            </g>
          )}
          {/* dashed hairline baseline, documentary-chart style */}
          <line
            x1={x0} y1={y0} x2={x1} y2={y0}
            stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} strokeDasharray="2 7"
          />
          <g style={{ ...el('curve') }}>
            <path
              d={d}
              fill="none"
              stroke={p.line}
              strokeWidth={p.thick}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - t}
              style={{ filter: p.glow > 0 ? `drop-shadow(0 0 ${Math.round(p.glow * 0.35)}px ${rgba(p.line, 0.55)}) drop-shadow(0 0 ${p.glow}px ${rgba(p.line, 0.3)})` : undefined }}
            />
          </g>
          <g style={{ ...el('dot') }}>
            {/* trailing smear-frame ghosts against the motion direction — gone at rest */}
            {gh.map((g, i) => (
              <circle
                key={i}
                cx={(hx + g.dx).toFixed(1)} cy={(hy + g.dy).toFixed(1)} r={p.thick * 1.15 * (1 - i * 0.2)}
                fill={p.line}
                opacity={(g.opacity * clamp01(appear)).toFixed(3)}
              />
            ))}
            <circle
              cx={hx} cy={hy} r={p.thick * 1.15}
              fill={p.line}
              opacity={clamp01(appear)}
              style={{ filter: p.glow > 0 ? `drop-shadow(0 0 ${Math.round(p.glow * 0.3)}px ${rgba(p.line, 0.7)}) drop-shadow(0 0 ${Math.round(p.glow * 0.8)}px ${rgba(p.line, 0.35)})` : undefined }}
            />
          </g>
        </svg>

        <div
          style={{
            position: 'absolute',
            left: hx, top: hy,
            transform: `translate(-108%, -140%) translate(${parChip.x.toFixed(2)}px, ${parChip.y.toFixed(2)}px) scale(${smChip.sx.toFixed(4)}, ${smChip.sy.toFixed(4)})`,
            filter: smChip.blurPx > 0.3 ? `blur(${smChip.blurPx.toFixed(2)}px)` : undefined,
            background: `linear-gradient(180deg, ${p.chipBg} 0%, #0B0B0D 100%)`,
            border: '1px solid rgba(255,255,255,0.13)',
            color: p.ink,
            borderRadius: width * 0.012,
            padding: `${width * 0.012}px ${width * 0.02}px`,
            lineHeight: 1.25, whiteSpace: 'nowrap',
            boxShadow: '0 10px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
            opacity: clamp01(appear),
            ...el('chip'),
          }}
        >
          <div style={{ fontSize: width * 0.019, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.6 }}>{p.label}</div>
          <div style={{ fontSize: width * 0.03, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.prefix}{group(value)}</div>
        </div>
      </div>
    );
  },
});
