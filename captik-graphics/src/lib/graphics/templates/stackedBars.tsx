// Reference: graphics/population.mp4  (window 480-4280ms, chart full ~1920ms)
// A stacked bar chart with a fitted curve over the top, filling left to right. Each bar's segments
// grow together as one column rather than segment-by-segment, which is what keeps the stack reading
// as a single quantity split up.
//
// The distribution and the curve come from the SAME bell function, so the trend line always sits on
// the data instead of being an independently drawn flourish.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, swingIn } from '../juice';

const MAX_BARS = 22;
const MAX_BANDS = 5;

export const stackedBars = defineGraphicsTemplate({
  id: 'stacked_bars',
  name: 'Stacked Bars',
  category: 'chart',
  tags: ['Chart', 'Distribution', 'Demographics'],
  design: { w: 900, h: 1560 },
  defaultDurationMs: 4400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 82 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'chart',  label: 'Chart', hideable: false },
    { key: 'title',  label: 'Title' },
    { key: 'curve',  label: 'Trend curve' },
    { key: 'legend', label: 'Legend' },
    { key: 'axis',   label: 'Axis' },
  ],

  params: [
    { type: 'text',   key: 'title', label: 'Title', group: 'Content', multiline: true, maxLength: 140,
      default: 'Population aged 0-49, 50-59, 60-69, 70-79 and 80 years and over, Brazil: 1950-2100' },
    { type: 'text',   key: 'bands', label: 'Bands', group: 'Content', maxLength: 160,
      default: '0-49|#F59E0B,50-59|#C2A363,60-69|#997F4D,70-79|#6E5B38,80+|#453A26',
      help: 'Comma-separated, each "name|colour", bottom band first.' },
    { type: 'text',   key: 'yLabel', label: 'Y label', group: 'Content', default: 'Number of people (thousands)', maxLength: 40 },
    { type: 'number', key: 'bars',  label: 'Columns', group: 'Content', default: 18, min: 3, max: 22, step: 1 },

    { type: 'color',  key: 'ink',   label: 'Text',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'line',  label: 'Curve', group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',  group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Title size', group: 'Style', default: 24, min: 6, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'gap',   label: 'Column gap', group: 'Style', default: 4, min: 0, max: 30, step: 1, unit: 'px' },
    { type: 'number', key: 'spread', label: 'Spread', group: 'Style', default: 0.34, min: 0.1, max: 1, step: 0.02,
      help: 'How wide the bell is across the columns.' },
    { type: 'boolean', key: 'curve', label: 'Trend curve', group: 'Style', default: true },

    { type: 'number', key: 'startAt', label: 'First column at', group: 'Motion', default: 200, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Column stagger', group: 'Motion', default: 55, min: 0, max: 300, step: 5, unit: 'ms' },
  ],

  // Quiet DOCU palette: air pass on the chart swing-in, a soft sweep under the left-to-right
  // column fill, and a chime as the fitted curve completes — the same startAt/stagger/bars
  // clock that times the columns and the trend line.
  sfx: (p) => {
    const n = Math.min(MAX_BARS, Math.round(p.bars));
    return [
      { atMs: 40, id: 'whoosh', gain: 0.4 },
      { atMs: p.startAt, id: 'sweep', gain: 0.35 },
      { atMs: p.startAt + (n - 1) * p.stagger + 450, id: 'chime', gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const bands = p.bands.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_BANDS)
      .map((s) => { const [name = '', colour = '#888'] = s.split('|').map((x) => x.trim()); return { name, colour }; });
    const n = Math.min(MAX_BARS, Math.round(p.bars));

    // ONE bell drives both the bar heights and the curve.
    const bell = (u: number) => Math.exp(-Math.pow((u - 0.5) / Math.max(0.05, p.spread), 2));

    const plotL = width * 0.12, plotR = width * 0.97;
    const plotT = height * 0.26, plotB = height * 0.82;
    const plotW = plotR - plotL, plotH = plotB - plotT;
    const bw = (plotW - p.gap * (n - 1)) / n;

    const titleIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(360))),
    });

    const curvePts = Array.from({ length: n }, (_, i) => {
      const u = (i + 0.5) / n;
      const x = plotL + i * (bw + p.gap) + bw / 2;
      const y = plotB - bell(u) * plotH * 0.94;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const lastAt = p.startAt + (n - 1) * p.stagger;
    const drawn = interpolate(timeMs, [p.startAt, lastAt + 400], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    // Depth: the whole chart swings in top-hinged on the title spring and keeps a gentle 3D
    // sway; title, axis and legend ride different parallax depths so the sway shears the
    // chrome over the columns (which stay glued to the plot with their curve).
    const pose = depthPose(timeMs, seed, { enter: titleIn, rx: -12, z: -80, swayDeg: 1.6 });
    const parTitle = parallax(timeMs, seed, 0.5, height * 0.005);
    const parAxis = parallax(timeMs, seed, 0.3, height * 0.005);
    const parLegend = parallax(timeMs, seed, 0.7, height * 0.005);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: ff, transform: pose, transformOrigin: '50% 30%', ...el('chart') }}>
        <div
          style={{
            position: 'absolute', left: '4%', right: '4%', top: '6%',
            fontSize: p.size, color: p.ink, lineHeight: 1.4, fontWeight: 600, letterSpacing: '0.01em',
            opacity: clamp01(titleIn),
            transform: `translate(${parTitle.x.toFixed(2)}px, ${parTitle.y.toFixed(2)}px)`,
            ...el('title'),
          }}
        >
          {p.title}
        </div>

        <div
          style={{
            position: 'absolute', left: 0, top: (plotT + plotB) / 2,
            transform: `translate(${parAxis.x.toFixed(2)}px, ${parAxis.y.toFixed(2)}px) rotate(-90deg) translate(-50%, -50%)`, transformOrigin: 'left center',
            fontSize: p.size * 0.55, color: rgba(p.ink, 0.55), whiteSpace: 'nowrap',
            fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            opacity: clamp01(titleIn),
            ...el('axis'),
          }}
        >
          {p.yLabel}
        </div>

        {Array.from({ length: n }).map((_, i) => {
          const u = (i + 0.5) / n;
          const s = spring({
            frame: fr(timeMs - p.startAt - i * p.stagger), fps: FPS,
            config: { damping: 26, mass: 0.7, stiffness: 165 },
            durationInFrames: Math.max(1, Math.round(fr(460))),
          });
          const total = bell(u) * plotH * 0.94 * s;
          // Band shares wobble a little per column so the stack does not look like a gradient.
          const shares = bands.map((_, b) => 0.6 + random(`${seed}b${i}_${b}`) * 0.8);
          const sum = shares.reduce((a, v) => a + v, 0) || 1;
          // Z-stagger: each column tips up from the baseline at a slightly different angle,
          // with a landing smear that dies the instant its spring settles.
          const colBlur = s > 0.001 && s < 0.985 ? (1 - Math.min(1, s)) * 2.2 : 0;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: plotL + i * (bw + p.gap), width: bw,
                top: plotB - total, height: total,
                display: 'flex', flexDirection: 'column-reverse',
                filter: colBlur > 0.3 ? `blur(${colBlur.toFixed(2)}px)` : undefined,
                transform: swingIn(Math.min(1, s), { rx: 10 + (i % 5) * 2, z: -40 }),
                transformOrigin: 'center bottom',
              }}
            >
              {bands.map((band, b) => (
                <div
                  key={b}
                  style={{
                    height: (shares[b] / sum) * total,
                    background: `linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.12) 100%), ${band.colour}`,
                    borderRadius: b === bands.length - 1 ? '3px 3px 0 0' : undefined,
                  }}
                />
              ))}
            </div>
          );
        })}

        {/* dashed hairline baseline, documentary-chart style */}
        <div
          style={{
            position: 'absolute', left: plotL, width: plotW, top: plotB, height: 1.5,
            background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 3px, transparent 3px 11px)',
            opacity: clamp01(titleIn),
          }}
        />

        {p.curve && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <g style={{ ...el('curve') }}>
              <polyline
                points={curvePts.join(' ')}
                fill="none"
                stroke={p.line}
                strokeWidth={Math.max(1.5, width * 0.003)}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - drawn}
                style={{ filter: `drop-shadow(0 0 7px ${rgba(p.line, 0.45)})` }}
              />
            </g>
          </svg>
        )}

        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: '5%',
            display: 'flex', justifyContent: 'center', gap: width * 0.03,
            fontSize: p.size * 0.55, color: rgba(p.ink, 0.62),
            fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
            opacity: clamp01(drawn * 1.4),
            transform: `translate(${parLegend.x.toFixed(2)}px, ${parLegend.y.toFixed(2)}px)`,
            ...el('legend'),
          }}
        >
          {bands.map((b) => (
            <span key={b.name} style={{ display: 'flex', alignItems: 'center', gap: width * 0.008 }}>
              <span style={{ width: width * 0.016, height: width * 0.016, background: b.colour, borderRadius: 2, border: '1px solid rgba(255,255,255,0.14)', boxSizing: 'border-box' }} />
              {b.name}
            </span>
          ))}
        </div>
      </div>
    );
  },
});
