// Reference: graphics/github-star-comparison.mp4  (window 0-4720ms, both series drawn ~3720ms)
// Two series racing on one set of axes, each with a marker riding its head and a shared legend.
//
// Both series share one y-scale derived from the LARGER peak, so the comparison is honest — scaling
// each to its own maximum makes two very different lines look identical, which is the whole failure
// mode of a comparison chart.

import { Easing, interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

const STEPS = 48;

/** Round up to 1/2/5 x 10^k so axis labels stay readable. */
function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, raw))));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

export const compareChart = defineGraphicsTemplate({
  id: 'compare_chart',
  name: 'Comparison Chart',
  category: 'chart',
  tags: ['Chart', 'Compare', 'Growth'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['playfair', 'inter'],

  elements: [
    { key: 'panel',  label: 'Panel', hideable: false },
    { key: 'title',  label: 'Title' },
    { key: 'legend', label: 'Legend' },
    { key: 'axes',   label: 'Axes' },
    { key: 'seriesA', label: 'Series A' },
    { key: 'seriesB', label: 'Series B' },
  ],

  params: [
    { type: 'text',   key: 'title', label: 'Title',    group: 'Content', default: 'Star History', maxLength: 32 },
    { type: 'text',   key: 'nameA', label: 'Series A', group: 'Content', default: 'openai/openai-cookbook', maxLength: 32 },
    { type: 'text',   key: 'nameB', label: 'Series B', group: 'Content', default: 'torvalds/linux', maxLength: 32 },
    { type: 'number', key: 'peakA', label: 'A final',  group: 'Content', default: 68000, min: 10, max: 10000000, step: 500 },
    { type: 'number', key: 'peakB', label: 'B final',  group: 'Content', default: 205000, min: 10, max: 10000000, step: 500 },
    { type: 'text',   key: 'xLabel', label: 'X label', group: 'Content', default: 'Date', maxLength: 24 },
    { type: 'text',   key: 'yLabel', label: 'Y label', group: 'Content', default: 'GitHub Stars', maxLength: 24 },

    { type: 'color',  key: 'bg',    label: 'Panel',    group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'a',     label: 'Series A colour', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'b',     label: 'Series B colour', group: 'Style', default: '#8B9DB0' },
    { type: 'color',  key: 'ink',   label: 'Title',    group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Axes',     group: 'Style', default: '#8F8B81' },
    { type: 'font',   key: 'font',  label: 'Font',     group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Title size', group: 'Style', default: 32, min: 10, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'thick', label: 'Line width', group: 'Style', default: 3, min: 1, max: 14, step: 1, unit: 'px' },
    { type: 'number', key: 'bendA', label: 'A curve',  group: 'Style', default: 4.6, min: 1, max: 9, step: 0.1 },
    { type: 'number', key: 'bendB', label: 'B curve',  group: 'Style', default: 2.1, min: 1, max: 9, step: 0.1 },
    { type: 'boolean', key: 'grid', label: 'Gridlines', group: 'Style', default: true },
    { type: 'boolean', key: 'fill', label: 'Paint the panel', group: 'Style', default: true },

    { type: 'number', key: 'startAt', label: 'Draw starts', group: 'Motion', default: 400, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drawMs',  label: 'Draws over',  group: 'Motion', default: 3000, min: 200, max: 9000, step: 50, unit: 'ms' },
  ],

  // Quiet DOCU palette: air pass on the axes sweep (the 100ms constant the motion uses),
  // a long crescendo under the race, and a luxe ping when both lines complete.
  sfx: (p) => [
    { atMs: 100, id: 'whoosh', gain: 0.35 },
    { atMs: p.startAt, id: 'sweep', gain: 0.4 },
    { atMs: p.startAt + p.drawMs, id: 'glass', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);

    const panelIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });
    const t = interpolate(timeMs, [p.startAt, p.startAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    // The reference sweeps the axes/grid in left-to-right before the series draw.
    const axisT = interpolate(timeMs, [100, 680], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad),
    });

    const left = width * 0.15, right = width * 0.95;
    const top = height * 0.26, bottom = height * 0.85;
    const plotW = right - left, plotH = bottom - top;

    // ONE scale from the larger peak — per-series scaling is what makes comparisons lie.
    const peak = Math.max(p.peakA, p.peakB);
    const step = niceStep(peak / 4);
    const ticks = Math.ceil(peak / step);
    const yMax = step * ticks;

    const px = (u: number) => left + plotW * u;
    const py = (v: number) => bottom - plotH * (v / yMax);

    const series = (finalV: number, bend: number) => {
      const pts = Array.from({ length: STEPS + 1 }, (_, i) => {
        const u = i / STEPS;
        return `${px(u).toFixed(1)},${py(Math.pow(u, bend) * finalV).toFixed(1)}`;
      });
      return { d: `M ${pts.join(' L ')}`, hx: px(t), hy: py(Math.pow(t, bend) * finalV) };
    };
    const A = series(p.peakA, p.bendA);
    const B = series(p.peakB, p.bendB);

    // Motion blur on the racing heads: each marker's velocity along the curve smears it
    // mid-draw and dies to zero the instant the sweep clamps at 1 — the heads land crisp.
    const uAt = (ms: number) => interpolate(ms, [p.startAt, p.startAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const vHx = vel((ms) => px(uAt(ms)), timeMs);
    const headSmear = (bend: number, finalV: number) =>
      smear(vHx, vel((ms) => py(Math.pow(uAt(ms), bend) * finalV), timeMs), 0.9);
    const smA = headSmear(p.bendA, p.peakA);
    const smB = headSmear(p.bendB, p.peakB);

    // Depth: the panel swings in top-hinged on its entrance spring and holds a faint sway;
    // title and legend ride different parallax depths so the sway shears them over the plot.
    const pose = depthPose(timeMs, seed, { enter: panelIn, rx: -12, z: -80, swayDeg: 1.6 });
    const parTitle = parallax(timeMs, seed, 0.45, height * 0.006);
    const parLegend = parallax(timeMs, seed, 0.7, height * 0.006);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill
            ? `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 45%), ${p.bg}`
            : 'transparent',
          fontFamily: ff,
          opacity: clamp01(panelIn),
          transform: pose, transformOrigin: '50% 30%',
          ...el('panel'),
        }}
      >
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: height * 0.08,
            textAlign: 'center', fontSize: p.size, fontWeight: 600, color: p.ink,
            fontStyle: 'italic', fontFamily: fontStack('playfair'), letterSpacing: '0.02em',
            transform: `translate(${parTitle.x.toFixed(2)}px, ${parTitle.y.toFixed(2)}px)`,
            ...el('title'),
          }}
        >
          {p.title}
        </div>

        <div
          style={{
            position: 'absolute', left: left, top: height * 0.17,
            display: 'flex', flexDirection: 'column', gap: p.size * 0.16,
            fontSize: p.size * 0.4, color: p.dim,
            border: '1px solid rgba(255,255,255,0.13)',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: p.size * 0.22,
            padding: `${p.size * 0.22}px ${p.size * 0.3}px`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            opacity: clamp01(panelIn),
            transform: `translate(${parLegend.x.toFixed(2)}px, ${parLegend.y.toFixed(2)}px)`,
            ...el('legend'),
          }}
        >
          {[{ n: p.nameA, c: p.a }, { n: p.nameB, c: p.b }].map((s) => (
            <span key={s.n} style={{ display: 'flex', alignItems: 'center', gap: p.size * 0.2 }}>
              <span style={{ width: p.size * 0.24, height: p.size * 0.24, background: s.c, borderRadius: 2, boxShadow: `0 0 ${p.size * 0.24}px ${rgba(s.c, 0.5)}` }} />
              {s.n}
            </span>
          ))}
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g style={{ ...el('axes') }}>
            {Array.from({ length: ticks + 1 }, (_, i) => {
              const v = i * step;
              const y = py(v);
              return (
                <g key={i}>
                  {p.grid && <line x1={left} y1={y} x2={left + plotW * axisT} y2={y} stroke={rgba(p.dim, 0.28)} strokeWidth={1} strokeDasharray="2 7" />}
                  <text x={left - width * 0.012} y={y + p.size * 0.13} textAnchor="end" fontSize={p.size * 0.32} fill={p.dim} style={{ fontFamily: ff, letterSpacing: '0.1em' }}>
                    {v >= 1000 ? `${Math.round(v / 1000)}K` : v}
                  </text>
                </g>
              );
            })}
            <line x1={left} y1={bottom} x2={left + plotW * axisT} y2={bottom} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} strokeDasharray="2 7" />
            <text x={(left + right) / 2} y={bottom + height * 0.07} textAnchor="middle" fontSize={p.size * 0.3} fontWeight={600} fill={p.dim} style={{ fontFamily: ff, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              {p.xLabel}
            </text>
            <text
              x={left - width * 0.095} y={(top + bottom) / 2}
              textAnchor="middle" fontSize={p.size * 0.3} fontWeight={600} fill={p.dim}
              transform={`rotate(-90 ${left - width * 0.095} ${(top + bottom) / 2})`}
              style={{ fontFamily: ff, letterSpacing: '0.18em', textTransform: 'uppercase' }}
            >
              {p.yLabel}
            </text>
          </g>

          <g style={{ ...el('seriesB') }}>
            <path d={B.d} fill="none" stroke={p.b} strokeWidth={p.thick} strokeLinecap="round"
              pathLength={1} strokeDasharray={1} strokeDashoffset={1 - t}
              style={{ filter: `drop-shadow(0 0 6px ${rgba(p.b, 0.4)})` }} />
            <circle
              cx={B.hx} cy={B.hy} r={p.thick * 1.6} fill="none" stroke={p.b} strokeWidth={p.thick * 0.8} opacity={t > 0.01 ? 1 : 0}
              style={smB.blurPx > 0.3 ? { filter: `blur(${smB.blurPx.toFixed(2)}px)` } : undefined}
            />
          </g>
          <g style={{ ...el('seriesA') }}>
            <path d={A.d} fill="none" stroke={p.a} strokeWidth={p.thick} strokeLinecap="round"
              pathLength={1} strokeDasharray={1} strokeDashoffset={1 - t}
              style={{ filter: `drop-shadow(0 0 8px ${rgba(p.a, 0.55)})` }} />
            <circle cx={A.hx} cy={A.hy} r={p.thick * 1.6} fill={p.a} opacity={t > 0.01 ? 1 : 0}
              style={{ filter: `${smA.blurPx > 0.3 ? `blur(${smA.blurPx.toFixed(2)}px) ` : ''}drop-shadow(0 0 10px ${rgba(p.a, 0.7)})` }} />
          </g>
        </svg>

        {p.fill && <div style={luxeVignette(0.4)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
