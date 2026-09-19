// Reference: graphics/chart-with.mp4  (window 80-4880ms, gauge settles ~1720ms)
// A ring gauge counting to a win rate, a tick badge dropping under it, then candlesticks and a
// trend line filling beneath.
//
// The percentage text and the ring arc read the same value, so the number can never disagree with
// the sweep. Candles are seeded but biased upward, so the series always tells the story the gauge
// is claiming.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeLabel } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

const MAX_CANDLES = 16;

export const winRateGauge = defineGraphicsTemplate({
  id: 'win_rate_gauge',
  name: 'Win Rate Gauge',
  category: 'money',
  tags: ['Gauge', 'Trading', 'Stats', 'Luxury'],
  design: { w: 900, h: 1200 },
  defaultDurationMs: 4800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 94 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'panel',   label: 'Panel', hideable: false },
    { key: 'gauge',   label: 'Gauge' },
    { key: 'value',   label: 'Percentage' },
    { key: 'badge',   label: 'Tick badge' },
    { key: 'candles', label: 'Candles' },
    { key: 'trend',   label: 'Trend line' },
  ],

  params: [
    { type: 'number', key: 'target', label: 'Win rate', group: 'Content', default: 78, min: 0, max: 100, step: 1, unit: '%' },
    { type: 'text',   key: 'label',  label: 'Label',    group: 'Content', default: 'WIN RATE', maxLength: 24 },
    { type: 'number', key: 'candles', label: 'Candles', group: 'Content', default: 12, min: 3, max: 16, step: 1 },

    { type: 'color',  key: 'up',    label: 'Up',      group: 'Style', default: '#4ADE80' },
    { type: 'color',  key: 'down',  label: 'Down',    group: 'Style', default: '#E5484D' },
    { type: 'color',  key: 'track', label: 'Track',   group: 'Style', default: '#2E2D33' },
    { type: 'color',  key: 'ink',   label: 'Text',    group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Label',   group: 'Style', default: '#8B8780' },
    { type: 'font',   key: 'font',  label: 'Font',    group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'ring',  label: 'Gauge size', group: 'Style', default: 260, min: 80, max: 500, step: 10, unit: 'px' },
    { type: 'number', key: 'thick', label: 'Ring width', group: 'Style', default: 20, min: 4, max: 60, step: 2, unit: 'px' },
    { type: 'number', key: 'size',  label: 'Value size', group: 'Style', default: 62, min: 14, max: 160, step: 2, unit: 'px' },
    { type: 'boolean', key: 'badge', label: 'Tick badge', group: 'Style', default: true },
    { type: 'boolean', key: 'trend', label: 'Trend line', group: 'Style', default: true },

    { type: 'number', key: 'gaugeAt', label: 'Gauge at',  group: 'Motion', default: 150, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'gaugeMs', label: 'Counts over', group: 'Motion', default: 1400, min: 200, max: 5000, step: 50, unit: 'ms' },
    { type: 'number', key: 'badgeAt', label: 'Badge at',  group: 'Motion', default: 1500, min: 0, max: 6000, step: 20, unit: 'ms' },
    { type: 'number', key: 'firstAt', label: 'First candle at', group: 'Motion', default: 700, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Candle stagger', group: 'Motion', default: 120, min: 0, max: 500, step: 10, unit: 'ms' },
  ],

  // Trader's palette: ONE tick as the gauge starts counting, the coin exactly where the win
  // rate lands, and a glossy pop as the tick badge drops — timed off the same gauge clocks.
  sfx: (p) => [
    { atMs: p.gaugeAt, id: 'tick', gain: 0.4 },
    { atMs: p.gaugeAt + p.gaugeMs, id: 'coin', gain: 0.55 },
    { atMs: p.badgeAt + 150, id: 'pop', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const n = Math.min(MAX_CANDLES, Math.round(p.candles));

    // ONE value behind the arc and the number.
    const t = interpolate(timeMs, [p.gaugeAt, p.gaugeAt + p.gaugeMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const pct = p.target * t;

    const badgeInAt = (ms: number) => spring({
      frame: fr(ms - p.badgeAt), fps: FPS,
      config: { damping: 13, mass: 0.5, stiffness: 230 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const badgeIn = badgeInAt(timeMs);

    // Depth: the whole panel swings in top-hinged and holds a ±1.6° sway; the tick badge
    // (foreground) and the candle plot (backplate) shear at their own parallax depths. The
    // badge's drop velocity drives a smear that dies the frame its overshoot spring settles.
    const rootIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 28, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const pose = depthPose(timeMs, seed, { enter: rootIn, rx: -12, z: -80, swayDeg: 1.6 });
    const parBadge = parallax(timeMs, seed, 0.75, height * 0.008);
    const parPlot = parallax(timeMs, seed, 0.25, height * 0.008);
    const smBadge = smear(0, vel((ms) => badgeInAt(ms) * p.ring * 0.25, timeMs), 1);
    // The percentage rolls with a blur that fades out over the count — crisp exactly at landing.
    const countBlur = timeMs > p.gaugeAt && t < 1 ? (1 - t) * 4.5 : 0;

    const R = p.ring;
    const r = R / 2 - p.thick / 2 - 2;

    const plotL = width * 0.1, plotR = width * 0.9;
    const plotB = height * 0.86, plotH = height * 0.22;
    const cw = (plotR - plotL) / n;

    // Seeded but drifting upward, so the candles agree with the gauge's claim.
    const closes = Array.from({ length: n }, (_, i) =>
      0.15 + (i / n) * 0.65 + (random(`${seed}c${i}`) - 0.5) * 0.16);
    const lastAt = p.firstAt + (n - 1) * p.stagger;
    const drawn = interpolate(timeMs, [p.firstAt, lastAt + 400], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          fontFamily: ff,
          transform: pose,
          transformOrigin: '50% 30%',
          ...el('panel'),
        }}
      >
        <div style={{ position: 'relative', width: R, height: R, marginTop: height * 0.12, ...el('gauge') }}>
          <svg viewBox={`0 0 ${R} ${R}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle cx={R / 2} cy={R / 2} r={r} fill="none" stroke={p.track} strokeWidth={p.thick} />
            <circle
              cx={R / 2} cy={R / 2} r={r}
              fill="none" stroke={p.up} strokeWidth={p.thick} strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`${(pct / 100).toFixed(4)} 1`}
              style={{ filter: `drop-shadow(0 0 ${Math.round(p.thick * 0.5)}px ${rgba(p.up, 0.45)}) drop-shadow(0 0 ${Math.round(p.thick * 1.6)}px ${rgba(p.up, 0.2)})` }}
            />
          </svg>
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              ...el('value'),
            }}
          >
            <span style={{ fontSize: p.size, fontWeight: 700, color: p.ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: '0 2px 16px rgba(0,0,0,0.45)', filter: countBlur > 0.3 ? `blur(${countBlur.toFixed(2)}px)` : undefined }}>{Math.round(pct)}%</span>
            <span style={{ ...luxeLabel(p.size * 0.24, p.dim), marginTop: p.size * 0.1, textShadow: '0 1px 10px rgba(0,0,0,0.4)' }}>{p.label}</span>
          </div>
        </div>

        {p.badge && (
          <div
            style={{
              marginTop: R * 0.1,
              width: R * 0.22, height: R * 0.22, borderRadius: '50%',
              background: `linear-gradient(180deg, ${p.up}, ${rgba(p.up, 0.8)})`, color: '#08150C',
              boxShadow: `0 0 18px ${rgba(p.up, 0.35)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: R * 0.12, lineHeight: 1, fontWeight: 700,
              opacity: clamp01(badgeIn * 2),
              filter: smBadge.blurPx > 0.3 ? `blur(${smBadge.blurPx.toFixed(2)}px)` : undefined,
              transform: `translate(${parBadge.x.toFixed(2)}px, ${parBadge.y.toFixed(2)}px) scale(${(interpolate(badgeIn, [0, 1], [0.3, 1]) * smBadge.sx).toFixed(4)}, ${(interpolate(badgeIn, [0, 1], [0.3, 1]) * smBadge.sy).toFixed(4)})`,
              ...el('badge'),
            }}
          >
            ✓
          </div>
        )}

        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: `translate(${parPlot.x.toFixed(2)}px, ${parPlot.y.toFixed(2)}px)` }}>
          {/* dashed hairline baseline under the candles, documentary-chart style */}
          <line
            x1={plotL} y1={plotB} x2={plotR} y2={plotB}
            stroke="rgba(255,255,255,0.16)" strokeWidth={1.5} strokeDasharray="2 7"
          />
          <g style={{ ...el('candles') }}>
            {closes.map((c, i) => {
              const s = spring({
                frame: fr(timeMs - p.firstAt - i * p.stagger), fps: FPS,
                config: { damping: 26, mass: 0.6, stiffness: 180 },
                durationInFrames: Math.max(1, Math.round(fr(400))),
              });
              const open = i === 0 ? c - 0.06 : closes[i - 1];
              const up = c >= open;
              const bodyTop = plotB - Math.max(c, open) * plotH * s;
              const bodyH = Math.max(3, Math.abs(c - open) * plotH * s);
              const wick = (0.03 + random(`${seed}w${i}`) * 0.05) * plotH * s;
              const x = plotL + i * cw + cw * 0.5;
              return (
                <g key={i} opacity={clamp01(s * 2)}>
                  <line x1={x} y1={bodyTop - wick} x2={x} y2={bodyTop + bodyH + wick} stroke={up ? p.up : p.down} strokeWidth={Math.max(1.5, cw * 0.06)} />
                  <rect x={x - cw * 0.28} y={bodyTop} width={cw * 0.56} height={bodyH} fill={up ? p.up : p.down} rx={2} />
                </g>
              );
            })}
          </g>

          {p.trend && (
            <g style={{ ...el('trend') }}>
              <polyline
                points={closes.map((c, i) => `${(plotL + i * cw + cw * 0.5).toFixed(1)},${(plotB - c * plotH - plotH * 0.06).toFixed(1)}`).join(' ')}
                fill="none" stroke={rgba(p.up, 0.85)} strokeWidth={Math.max(2, width * 0.004)}
                pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawn}
                style={{ filter: `drop-shadow(0 0 6px ${rgba(p.up, 0.5)}) drop-shadow(0 0 16px ${rgba(p.up, 0.22)})` }}
              />
            </g>
          )}
        </svg>
      </div>
    );
  },
});
