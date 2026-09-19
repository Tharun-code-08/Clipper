// Candlestick chart on documentary glass — the trading-video staple. Candles are a seeded
// random walk with an upward drift toward a final blow-off candle; each candle grows wick-
// then-body on its beat, green/red by direction, and a dashed price line tracks the latest
// close with a rolling price chip. The walk is generated in one pure pass from the seed, so
// scrubbing shows the exact same chart as playing — and the last candle is always the payoff.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, easeOutQuint, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax } from '../juice';

const N = 14;

export const candleChart = defineGraphicsTemplate({
  id: 'candle_chart',
  name: 'Candle Chart',
  category: 'money',
  tags: ['Trading', 'Candles', 'Stock', 'Chart', 'Finance'],
  badge: 'New',
  design: { w: 900, h: 640 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5500,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 80 },
  fonts: ['montserrat'],

  elements: [
    { key: 'panel',   label: 'Panel', hideable: false },
    { key: 'title',   label: 'Title' },
    { key: 'candles', label: 'Candles', hideable: false },
    { key: 'price',   label: 'Price line' },
  ],

  params: [
    { type: 'text', key: 'title', label: 'Title', group: 'Content', default: 'PORTFOLIO — 1Y', maxLength: 28 },
    { type: 'text', key: 'price', label: 'Final price', group: 'Content', default: '₹12.4L', maxLength: 12 },

    { type: 'color', key: 'up',     label: 'Up candles',   group: 'Style', default: '#4ADE80' },
    { type: 'color', key: 'down',   label: 'Down candles', group: 'Style', default: '#E5484D' },
    { type: 'color', key: 'accent', label: 'Price line',   group: 'Style', default: '#F59E0B' },
    { type: 'boolean', key: 'plate', label: 'Glass panel', group: 'Style', default: true },

    { type: 'number', key: 'beatMs', label: 'Candle beat', group: 'Motion', default: 260, min: 80, max: 700, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: air sweep on the glass swing-in, ONE tick as the first candle prints,
  // and the cash hit when the payoff candle finishes — all riding beatMs like the motion does.
  sfx: (p) => [
    { atMs: p.delay + 60, id: 'whoosh', gain: 0.4 },
    { atMs: p.delay + 200, id: 'tick', gain: 0.45 },
    { atMs: p.delay + 200 + (N - 1) * p.beatMs + 310, id: 'cash', gain: 0.6 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    // ── Pure seeded walk with upward drift; the final candle is a large green blow-off.
    const raw: { o: number; c: number; hi: number; lo: number }[] = [];
    let px = 0.5;
    for (let i = 0; i < N; i++) {
      const drift = 0.03 + (i / N) * 0.02;
      const move = (random(`${seed}-c${i}`) - 0.45) * 0.22 + drift;
      const o = px;
      let c = o + move;
      if (i === N - 1) c = Math.max(c, o + 0.28);           // payoff candle always rips up
      const hi = Math.max(o, c) + random(`${seed}-h${i}`) * 0.07;
      const lo = Math.min(o, c) - random(`${seed}-l${i}`) * 0.07;
      raw.push({ o, c, hi, lo });
      px = c;
    }
    // Auto-scale like a real chart: the data's own min/max fill the plot, with headroom.
    // Without this the walk hugs mid-height and the bodies render as slivers.
    const lows = Math.min(...raw.map((c) => c.lo));
    const highs = Math.max(...raw.map((c) => c.hi));
    const span = Math.max(0.001, highs - lows);
    const norm = (v: number) => 0.06 + ((v - lows) / span) * 0.88;
    const candles = raw.map((c) => ({ o: norm(c.o), c: norm(c.c), hi: norm(c.hi), lo: norm(c.lo) }));

    const padX = width * 0.08;
    const chartTop = height * 0.24;
    const chartH = height * 0.62;
    const slotW = (width - padX * 2) / N;
    const bodyW = slotW * 0.52;
    // Y from normalized price (higher price = higher on screen).
    const Y = (v: number) => chartTop + (1 - v) * chartH;

    const titleIn = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 30, mass: 0.7, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    // Depth: the glass swings in top-hinged on the same spring and holds a ±1.8° sway; the
    // title and the price chip ride different parallax depths so the sway shears the layers
    // over the candles (which stay glued to the glass).
    const pose = depthPose(t, seed, { enter: titleIn, rx: -12, z: -80, swayDeg: 1.8 });
    const parTitle = parallax(t, seed, 0.45, height * 0.01);
    const parPrice = parallax(t, seed, 0.75, height * 0.01);

    // Latest fully-grown candle index drives the price line.
    const grown = Math.min(N - 1, Math.floor((t - 200) / p.beatMs));
    const lastClose = grown >= 0 ? candles[grown].c : candles[0].o;
    const priceY = Y(lastClose);
    const finished = grown >= N - 1;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, fontFamily: ff, overflow: 'hidden',
          ...(p.plate ? luxePanel(Math.round(height * 0.055)) : {}),
          opacity: clamp01(titleIn * 2),
          transform: pose,
          transformOrigin: '50% 30%',
          ...el('panel'),
        }}
      >
        <span
          style={{
            position: 'absolute', left: padX, top: height * 0.09,
            ...luxeLabel(Math.round(height * 0.036)),
            opacity: titleIn,
            transform: `translate(${parTitle.x.toFixed(2)}px, ${(parTitle.y + (1 - titleIn) * height * 0.014).toFixed(2)}px)`,
            ...el('title'),
          }}
        >
          {p.title}
        </span>

        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, ...el('candles') }}>
          {/* dashed hairline baseline */}
          <line x1={padX} y1={chartTop + chartH} x2={width - padX} y2={chartTop + chartH}
            stroke="rgba(255,255,255,0.16)" strokeWidth={1.5} strokeDasharray="2 7" />

          {candles.map((cd, i) => {
            const at = 200 + i * p.beatMs;
            const wick = easeOutQuint(clamp01((t - at) / 180));
            const body = easeOutQuint(clamp01((t - at - 90) / 220));
            if (wick <= 0) return null;
            const cx = padX + slotW * (i + 0.5);
            const upC = cd.c >= cd.o;
            const col = upC ? p.up : p.down;
            const midY = (Y(cd.hi) + Y(cd.lo)) / 2;
            const top = Y(Math.max(cd.o, cd.c));
            const hgt = Math.max(2, Math.abs(Y(cd.o) - Y(cd.c)));
            const isPayoff = i === N - 1;
            // Z-stagger: each candle drops the last few px onto the glass as its wick draws,
            // and the body carries a velocity smear while it grows — crisp the moment it lands.
            const bodyBlur = body > 0.001 && body < 0.999 ? (1 - body) * 2.5 : 0;
            const fx: string[] = [];
            if (bodyBlur > 0.3) fx.push(`blur(${bodyBlur.toFixed(2)}px)`);
            if (isPayoff && finished) fx.push(`drop-shadow(0 0 10px ${rgba(col, 0.7)})`);
            return (
              <g key={i} opacity={Math.min(1, wick * 2).toFixed(3)} transform={`translate(0 ${((1 - wick) * 6).toFixed(2)})`}>
                <line
                  x1={cx} x2={cx}
                  y1={midY + (Y(cd.hi) - midY) * wick}
                  y2={midY + (Y(cd.lo) - midY) * wick}
                  stroke={rgba(col, 0.8)} strokeWidth={2}
                />
                <rect
                  x={cx - bodyW / 2}
                  y={top + (hgt * (1 - body)) / 2}
                  width={bodyW}
                  height={hgt * body}
                  rx={2}
                  fill={col}
                  style={fx.length ? { filter: fx.join(' ') } : undefined}
                />
              </g>
            );
          })}
        </svg>

        {/* Price line + chip track the latest close. */}
        {grown >= 0 && (
          <div
            style={{
              position: 'absolute', inset: 0,
              transform: `translate(${parPrice.x.toFixed(2)}px, ${parPrice.y.toFixed(2)}px)`,
              ...el('price'),
            }}
          >
            <div
              style={{
                position: 'absolute', left: padX, right: width * 0.155,
                top: priceY, height: 0,
                borderTop: `1.5px dashed ${rgba(p.accent, 0.65)}`,
              }}
            />
            <div
              style={{
                position: 'absolute', right: width * 0.015, top: priceY,
                transform: 'translateY(-50%)',
                background: finished ? p.accent : LUXE.bg1,
                border: `1px solid ${finished ? p.accent : 'rgba(255,255,255,0.2)'}`,
                color: finished ? '#1F1808' : LUXE.ink,
                fontSize: Math.round(height * 0.042), fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                padding: `${Math.round(height * 0.012)}px ${Math.round(height * 0.024)}px`,
                borderRadius: Math.round(height * 0.02),
                boxShadow: finished ? `0 0 18px ${rgba(p.accent, 0.45)}` : '0 4px 14px rgba(0,0,0,0.4)',
              }}
            >
              {p.price}
            </div>
          </div>
        )}

        {p.plate && <div style={luxeGrain(0.045)} />}
      </div>
    );
  },
});
