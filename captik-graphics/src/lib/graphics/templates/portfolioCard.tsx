// Reference: graphics/fintech-dashboard.mp4  (window 240-4320ms, settled ~2520ms)
// A dark portfolio card: label, a rolling total, a delta chip, and an area chart filling in beneath.
//
// The chart's series is GENERATED from a seeded random walk with an upward drift, not hand-authored
// points — so changing the sample count reshapes the line instead of stretching a fixed picture, and
// every placed instance gets its own plausible history.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGrain, luxeLabel } from '../luxe';
import { depthPose, parallax } from '../juice';

const MAX_POINTS = 60;

/** 1234567.8 -> "1,234,568" */
function group(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const portfolioCard = defineGraphicsTemplate({
  id: 'portfolio_card',
  name: 'Portfolio Card',
  category: 'money',
  tags: ['Finance', 'Chart', 'Dashboard', 'Luxury'],
  design: { w: 900, h: 620 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 90 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'card',  label: 'Card', hideable: false },
    { key: 'label', label: 'Label' },
    { key: 'value', label: 'Value' },
    { key: 'delta', label: 'Delta chip' },
    { key: 'chart', label: 'Chart' },
    { key: 'dots',  label: 'Legend dots' },
  ],

  params: [
    { type: 'text',   key: 'label',  label: 'Label',  group: 'Content', default: 'PORTFOLIO VALUE', maxLength: 32 },
    { type: 'text',   key: 'prefix', label: 'Prefix', group: 'Content', default: '$', maxLength: 4 },
    { type: 'number', key: 'target', label: 'Value',  group: 'Content', default: 127482, min: 1, max: 100000000, step: 100 },
    { type: 'text',   key: 'delta',  label: 'Delta',  group: 'Content', default: '+8.4%', maxLength: 12 },
    { type: 'text',   key: 'sub',    label: 'Sub-label', group: 'Content', default: 'vs last month', maxLength: 32 },

    { type: 'color',  key: 'bg',     label: 'Card',   group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'line',   label: 'Chart',  group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Value',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',    label: 'Label',  group: 'Style', default: '#8B8780' },
    { type: 'color',  key: 'up',     label: 'Delta',  group: 'Style', default: '#4ADE80' },
    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Value size', group: 'Style', default: 74, min: 16, max: 180, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 22, min: 0, max: 70, step: 2, unit: 'px' },
    { type: 'number', key: 'points', label: 'Samples', group: 'Style', default: 34, min: 4, max: 60, step: 1 },
    { type: 'number', key: 'jitter', label: 'Volatility', group: 'Style', default: 0.35, min: 0, max: 1, step: 0.05 },
    { type: 'boolean', key: 'area',  label: 'Fill under the line', group: 'Style', default: true },

    { type: 'number', key: 'cardAt', label: 'Card at',  group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drawAt', label: 'Chart at', group: 'Motion', default: 260, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drawMs', label: 'Chart draws over', group: 'Motion', default: 1900, min: 200, max: 6000, step: 50, unit: 'ms' },
  ],

  // Quiet DOCU money: a glass ping as the card lands, ONE tick as the total starts rolling,
  // a glossy pop when the delta chip springs in, and the cash hit exactly where the chart and
  // the count land together — all riding the same cardAt/drawAt/drawMs as the motion.
  sfx: (p) => [
    { atMs: p.cardAt + 60, id: 'glass', gain: 0.4 },
    { atMs: p.drawAt, id: 'tick', gain: 0.35 },
    { atMs: p.drawAt + p.drawMs * 0.5, id: 'pop', gain: 0.35 },
    { atMs: p.drawAt + p.drawMs, id: 'cash', gain: 0.55 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);

    const cardIn = spring({
      frame: fr(timeMs - p.cardAt), fps: FPS,
      config: { damping: 24, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });
    const t = interpolate(timeMs, [p.drawAt, p.drawAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const chip = spring({
      frame: fr(timeMs - p.drawAt - p.drawMs * 0.5), fps: FPS,
      config: { damping: 14, mass: 0.5, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    // Depth: the card swings in top-hinged on its existing spring and holds a ±1.8° sway; the
    // label, the area chart (backplate) and the delta chip (foreground) sit at three parallax
    // depths so the sway shears the dashboard's layers.
    const pose = depthPose(timeMs, seed, { enter: cardIn, rx: -12, z: -80, swayDeg: 1.8 });
    const parLab = parallax(timeMs, seed, 0.45, height * 0.01);
    const parChart = parallax(timeMs, seed, 0.25, height * 0.01);
    const parDelta = parallax(timeMs, seed, 0.8, height * 0.01);

    const n = Math.min(MAX_POINTS, Math.round(p.points));
    // Seeded random walk with drift, normalised to 0..1.
    const raw: number[] = [];
    let acc = 0.25;
    for (let i = 0; i < n; i += 1) {
      acc += 0.75 / n + (random(`${seed}w${i}`) - 0.5) * p.jitter * 0.22;
      raw.push(acc);
    }
    const lo = Math.min(...raw), hi = Math.max(...raw);
    const norm = raw.map((v) => (v - lo) / Math.max(1e-6, hi - lo));

    const pad = width * 0.055;
    const plotY = height * 0.5;
    const plotH = height * 0.4;
    const plotW = width - pad * 2;
    const px = (i: number) => pad + (plotW * i) / Math.max(1, n - 1);
    const py = (v: number) => plotY + plotH - v * plotH;

    const d = norm.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
    const area = `${d} L ${px(n - 1).toFixed(1)} ${(plotY + plotH).toFixed(1)} L ${px(0).toFixed(1)} ${(plotY + plotH).toFixed(1)} Z`;
    const value = p.target * interpolate(t, [0, 1], [0.32, 1]);
    // MOTION BLUR on the roll: the total blurs with its remaining count and lands CRISP the
    // frame the chart finishes drawing.
    const rollBlur = timeMs > p.drawAt && t < 1 ? (1 - t) * 5 : 0;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: `linear-gradient(180deg, ${p.bg} 0%, ${LUXE.bg0} 100%)`,
          border: `1px solid ${LUXE.hairline}`,
          borderRadius: p.radius,
          boxShadow: '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          fontFamily: ff,
          opacity: clamp01(cardIn * 1.8),
          transform: `${pose} scale(${interpolate(cardIn, [0, 1], [0.95, 1]).toFixed(4)})`,
          transformOrigin: '50% 30%',
          ...el('card'),
        }}
      >
        <div
          style={{
            position: 'absolute', left: pad, top: height * 0.11,
            ...luxeLabel(p.size * 0.24, p.dim),
            opacity: clamp01(cardIn),
            transform: `translate(${parLab.x.toFixed(2)}px, ${parLab.y.toFixed(2)}px)`,
            ...el('label'),
          }}
        >
          {p.label}
        </div>

        <div style={{ position: 'absolute', left: pad, top: height * 0.2, display: 'flex', alignItems: 'baseline', gap: p.size * 0.24 }}>
          <span
            style={{
              fontSize: p.size, fontWeight: 700, color: p.ink, lineHeight: 1,
              letterSpacing: -p.size * 0.02,
              fontVariantNumeric: 'tabular-nums',
              opacity: clamp01(cardIn),
              filter: rollBlur > 0.3 ? `blur(${rollBlur.toFixed(2)}px)` : undefined,
              ...el('value'),
            }}
          >
            {p.prefix}{group(value)}
          </span>
          <span
            style={{
              fontSize: p.size * 0.26, fontWeight: 700, color: p.up,
              background: rgba(p.up, 0.12), borderRadius: 999,
              border: `1px solid ${rgba(p.up, 0.35)}`,
              boxShadow: `0 0 14px ${rgba(p.up, 0.22)}`,
              padding: `${p.size * 0.06}px ${p.size * 0.16}px`,
              opacity: clamp01(chip * 2),
              transform: `translate(${parDelta.x.toFixed(2)}px, ${parDelta.y.toFixed(2)}px) scale(${interpolate(chip, [0, 1], [0.6, 1]).toFixed(4)})`,
              ...el('delta'),
            }}
          >
            {p.delta}
          </span>
        </div>

        <div
          style={{
            position: 'absolute', left: pad, top: height * 0.34,
            fontSize: p.size * 0.22, color: p.dim,
            opacity: clamp01(cardIn),
          }}
        >
          {p.sub}
        </div>

        <div style={{ position: 'absolute', right: pad, top: height * 0.12, display: 'flex', gap: width * 0.012, opacity: clamp01(chip), ...el('dots') }}>
          {[p.line, p.up, p.dim].map((c) => (
            <span key={c} style={{ width: width * 0.022, height: width * 0.022, borderRadius: 4, background: rgba(c, 0.9) }} />
          ))}
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: `translate(${parChart.x.toFixed(2)}px, ${parChart.y.toFixed(2)}px)` }}>
          <g style={{ ...el('chart') }}>
            {/* dashed hairline baseline, documentary-chart style */}
            <line
              x1={pad} y1={plotY + plotH} x2={pad + plotW} y2={plotY + plotH}
              stroke="rgba(255,255,255,0.16)" strokeWidth={1.5} strokeDasharray="2 7"
            />
            {p.area && (
              <>
                <defs>
                  <linearGradient id="pc_fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={rgba(p.line, 0.32)} />
                    <stop offset="100%" stopColor={rgba(p.line, 0)} />
                  </linearGradient>
                  <clipPath id="pc_clip">
                    <rect x={0} y={0} width={pad + plotW * t} height={height} />
                  </clipPath>
                </defs>
                <path d={area} fill="url(#pc_fill)" clipPath="url(#pc_clip)" />
              </>
            )}
            <path
              d={d}
              fill="none"
              stroke={p.line}
              strokeWidth={Math.max(2, width * 0.005)}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - t}
              style={{ filter: `drop-shadow(0 0 6px ${rgba(p.line, 0.5)}) drop-shadow(0 0 20px ${rgba(p.line, 0.25)})` }}
            />
          </g>
        </svg>

        <div style={luxeGrain(0.045)} />
      </div>
    );
  },
});
