// Reference: graphics/github-stars-1.mp4  (window 400-4240ms, curve complete ~3320ms)
// A proper little line chart — titled panel, legend chip, labelled axes, gridlines — with an
// exponential series drawing left to right and a marker riding its head.
//
// Y-axis ticks are computed from the series maximum and rounded to a "nice" step, so the labels are
// readable numbers whatever the user types rather than 27482.7 and friends.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGlow, luxeGrain } from '../luxe';
import { depthPose, ghosts, parallax, vel } from '../juice';

const STEPS = 48;

/** Round up to 1/2/5 x 10^k so axis labels land on readable numbers. */
function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, raw))));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export const starChart = defineGraphicsTemplate({
  id: 'star_chart',
  name: 'Star Chart',
  category: 'chart',
  tags: ['Chart', 'Growth', 'Analytics'],
  design: { w: 900, h: 1400 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 94 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'panel',  label: 'Panel', hideable: false },
    { key: 'title',  label: 'Title' },
    { key: 'legend', label: 'Legend' },
    { key: 'axes',   label: 'Axes' },
    { key: 'series', label: 'Series' },
    { key: 'head',   label: 'Head marker' },
  ],

  params: [
    { type: 'text',   key: 'title',  label: 'Title',   group: 'Content', default: 'Star History', maxLength: 32 },
    { type: 'text',   key: 'series', label: 'Series',  group: 'Content', default: 'captik/create', maxLength: 32 },
    { type: 'text',   key: 'xLabel', label: 'X label', group: 'Content', default: 'Date', maxLength: 24 },
    { type: 'text',   key: 'yLabel', label: 'Y label', group: 'Content', default: 'GitHub Stars', maxLength: 24 },
    { type: 'number', key: 'peak',   label: 'Final value', group: 'Content', default: 27500, min: 10, max: 10000000, step: 100 },

    { type: 'color',  key: 'bg',    label: 'Panel',  group: 'Style', default: '#101014' },
    { type: 'color',  key: 'line',  label: 'Series', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',   label: 'Title',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Axes',   group: 'Style', default: '#8C887D' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Title size', group: 'Style', default: 44, min: 10, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'thick', label: 'Line width', group: 'Style', default: 4, min: 1, max: 16, step: 1, unit: 'px' },
    { type: 'number', key: 'bend',  label: 'Curve',  group: 'Style', default: 3.4, min: 1, max: 8, step: 0.1,
      help: '1 is linear, higher is more hockey-stick.' },
    { type: 'boolean', key: 'grid', label: 'Gridlines', group: 'Style', default: true },
    { type: 'boolean', key: 'fill', label: 'Paint the panel', group: 'Style', default: true },

    { type: 'number', key: 'startAt', label: 'Draw starts', group: 'Motion', default: 600, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drawMs',  label: 'Draws over',  group: 'Motion', default: 2600, min: 200, max: 8000, step: 50, unit: 'ms' },
  ],

  // Quiet DOCU palette: air pass on the panel swing-in, a long sweep under the line draw, and
  // a chime as the series tops out — all on the same startAt/drawMs clock as the curve.
  sfx: (p) => [
    { atMs: 40, id: 'whoosh', gain: 0.4 },
    { atMs: p.startAt, id: 'sweep', gain: 0.4 },
    { atMs: p.startAt + p.drawMs + 150, id: 'chime', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);

    const panelIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const t = interpolate(timeMs, [p.startAt, p.startAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    const left = width * 0.16, right = width * 0.95;
    const top = height * 0.22, bottom = height * 0.86;
    const plotW = right - left, plotH = bottom - top;

    const step = niceStep(p.peak / 4);
    const ticks = Math.ceil(p.peak / step);
    const yMax = step * ticks;

    const curve = (u: number) => Math.pow(u, p.bend);
    const px = (u: number) => left + plotW * u;
    const py = (v: number) => bottom - plotH * (v / yMax);

    const pts = Array.from({ length: STEPS + 1 }, (_, i) => {
      const u = i / STEPS;
      return `${px(u).toFixed(1)},${py(curve(u) * p.peak).toFixed(1)}`;
    });
    const d = `M ${pts.join(' L ')}`;
    const hx = px(t);
    const hy = py(curve(t) * p.peak);

    // Velocity smear on the head marker: sample its own path position with vel(), so the blur
    // and ghost trail ramp up exactly as the hockey stick rips — and die when the draw lands.
    const tAt = (ms: number) => interpolate(ms, [p.startAt, p.startAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const vhx = vel((ms) => px(tAt(ms)), timeMs);
    const vhy = vel((ms) => py(curve(tAt(ms)) * p.peak), timeMs);
    const headBlur = Math.min(6, Math.hypot(vhx, vhy) * 1.1 * 2.4);
    const headGhosts = ghosts(vhx, vhy, 2);

    // Depth: the panel swings in top-hinged on its entrance spring and holds a ±1.6° sway;
    // title, legend and axes ride different parallax depths while the series stays glued.
    const pose = depthPose(timeMs, seed, { enter: panelIn, rx: -12, z: -80, swayDeg: 1.6 });
    const parTitle = parallax(timeMs, seed, 0.5, height * 0.006);
    const parLegend = parallax(timeMs, seed, 0.65, height * 0.006);
    const parAxes = parallax(timeMs, seed, 0.2, height * 0.006);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.3) 100%), ${p.bg}` : 'transparent',
          border: p.fill ? '1px solid rgba(255,255,255,0.13)' : undefined,
          borderRadius: p.fill ? width * 0.03 : undefined,
          boxShadow: p.fill ? '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)' : undefined,
          fontFamily: ff,
          opacity: clamp01(panelIn),
          transform: pose,
          transformOrigin: '50% 30%',
          ...el('panel'),
        }}
      >
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: height * 0.05,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: p.size * 0.3,
            fontSize: p.size, fontWeight: 700, color: p.ink, letterSpacing: '0.02em',
            transform: `translate(${parTitle.x.toFixed(2)}px, ${parTitle.y.toFixed(2)}px)`,
            ...el('title'),
          }}
        >
          <span style={{ fontSize: p.size * 0.9, color: p.line, textShadow: luxeGlow(p.line, 0.7) }}>☆</span>
          {p.title}
        </div>

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: height * 0.13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: p.size * 0.24,
            fontSize: p.size * 0.38, color: p.dim,
            fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            opacity: clamp01(panelIn),
            transform: `translate(${parLegend.x.toFixed(2)}px, ${parLegend.y.toFixed(2)}px)`,
            ...el('legend'),
          }}
        >
          <span style={{ width: p.size * 0.3, height: p.size * 0.3, background: p.line, borderRadius: 3, boxShadow: `0 0 ${p.size * 0.3}px ${rgba(p.line, 0.45)}` }} />
          {p.series}
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g style={{ ...el('axes') }} transform={`translate(${parAxes.x.toFixed(2)} ${parAxes.y.toFixed(2)})`}>
            {Array.from({ length: ticks + 1 }, (_, i) => {
              const v = i * step;
              const y = py(v);
              return (
                <g key={i}>
                  {p.grid && <line x1={left} y1={y} x2={right} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth={1} strokeDasharray="2 7" />}
                  <text x={left - width * 0.014} y={y + p.size * 0.14} textAnchor="end" fontSize={p.size * 0.32} fill={p.dim} style={{ fontFamily: ff, fontWeight: 600, letterSpacing: '0.06em' }}>
                    {v >= 1000 ? `${Math.round(v / 1000)}k` : v}
                  </text>
                </g>
              );
            })}
            <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} strokeDasharray="2 7" />
            <text x={(left + right) / 2} y={bottom + height * 0.075} textAnchor="middle" fontSize={p.size * 0.32} fill={p.dim} style={{ fontFamily: ff, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              {p.xLabel}
            </text>
            <text
              x={left - width * 0.1} y={(top + bottom) / 2}
              textAnchor="middle" fontSize={p.size * 0.32} fill={p.dim}
              transform={`rotate(-90 ${left - width * 0.1} ${(top + bottom) / 2})`}
              style={{ fontFamily: ff, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}
            >
              {p.yLabel}
            </text>
          </g>

          <g style={{ ...el('series') }}>
            <path
              d={d}
              fill="none"
              stroke={p.line}
              strokeWidth={p.thick}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - t}
              style={{ filter: `drop-shadow(0 0 8px ${rgba(p.line, 0.5)})` }}
            />
          </g>
          <g style={{ ...el('head') }}>
            {/* Smear-frame ghosts trail the head against its motion — empty once it parks. */}
            {headGhosts.map((g, i) => (
              <circle
                key={`gh${i}`}
                cx={hx + g.dx} cy={hy + g.dy} r={p.thick * 1.5} fill={p.line}
                opacity={t > 0.01 && t < 0.999 ? g.opacity : 0}
                style={{ filter: `blur(${(headBlur * 0.6 + i).toFixed(2)}px)` }}
              />
            ))}
            <circle
              cx={hx} cy={hy} r={p.thick * 1.5} fill={p.line} opacity={t > 0.01 ? 1 : 0}
              style={{ filter: headBlur > 0.3 ? `blur(${headBlur.toFixed(2)}px) drop-shadow(0 0 ${p.thick * 2}px ${rgba(p.line, 0.65)})` : `drop-shadow(0 0 ${p.thick * 2}px ${rgba(p.line, 0.65)})` }}
            />
          </g>
        </svg>

        {p.fill && <div style={luxeGrain(0.045)} />}
      </div>
    );
  },
});
