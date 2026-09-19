// Reference: general/bar-chart.mp4  (window 560-5200ms, bars in ~1000ms, trend line ~2400ms)
// Bars that grow in and then keep BREATHING — their heights drift for the life of the shot — with
// a trend polyline threading the tops.
//
// The drift is a per-bar sine on a modulo phase, so the line always meets the bar tops exactly;
// deriving the line from a separate dataset is what makes these two elements slide apart.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, swingIn, vel } from '../juice';

const MAX_BARS = 14;

export const trendBars = defineGraphicsTemplate({
  id: 'trend_bars',
  name: 'Trend Bars',
  category: 'chart',
  tags: ['Chart', 'Bars', 'Live'],
  design: { w: 900, h: 1800 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 68 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'plot', label: 'Plot', hideable: false },
    { key: 'bars', label: 'Bars' },
    { key: 'line', label: 'Trend line' },
  ],

  params: [
    { type: 'text', key: 'heights', label: 'Bar heights', group: 'Content', maxLength: 120,
      default: '52,78,64,92,70,84,58',
      help: 'Comma-separated, 0-100. Each is a resting height the bar breathes around.' },
    { type: 'text', key: 'accents', label: 'Accent bars', group: 'Content', default: '2,5', maxLength: 40,
      help: 'Comma-separated positions (1-based) drawn in the accent colour.' },

    { type: 'color',  key: 'bg',     label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'bar',    label: 'Bars',     group: 'Style', default: '#D97706' },
    { type: 'color',  key: 'accent', label: 'Accent',   group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'line',   label: 'Trend line', group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'gap',    label: 'Bar gap',  group: 'Style', default: 26, min: 2, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Bar corner', group: 'Style', default: 0, min: 0, max: 30, step: 1, unit: 'px' },
    { type: 'number', key: 'thick',  label: 'Line width', group: 'Style', default: 2, min: 0, max: 10, step: 1, unit: 'px' },
    { type: 'number', key: 'dot',    label: 'Node size', group: 'Style', default: 5, min: 0, max: 24, step: 1, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First bar at', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Bar stagger', group: 'Motion', default: 160, min: 0, max: 400, step: 5, unit: 'ms' },
    { type: 'number', key: 'lineAt',  label: 'Trend line at', group: 'Motion', default: 1600, min: 0, max: 8000, step: 50, unit: 'ms' },
    { type: 'number', key: 'breathe', label: 'Breathe depth', group: 'Motion', default: 12, min: 0, max: 40, step: 1, unit: '%' },
    { type: 'number', key: 'rate',    label: 'Breathe speed', group: 'Motion', default: 0.34, min: 0, max: 2, step: 0.02 },
  ],

  // Live-chart palette: air pass as the plot swings in, a pop once the last bar has landed,
  // and a sweep under the trend line threading the tops — the same firstAt/stagger/lineAt
  // clock as the motion. The endless breathing stays silent: it is ambience, not a beat.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_BARS, p.heights.split(',').map((s) => Number(s.trim())).filter((v) => Number.isFinite(v)).length));
    return [
      { atMs: p.firstAt + 40, id: 'whoosh', gain: 0.4 },
      { atMs: p.firstAt + (n - 1) * p.stagger + 350, id: 'pop', gain: 0.4 },
      { atMs: p.lineAt, id: 'sweep', gain: 0.4 },
    ];
  },

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const rest = p.heights.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
      .slice(0, MAX_BARS).map((n) => Math.max(2, Math.min(100, n)));
    const hot = new Set(p.accents.split(',').map((s) => Math.round(Number(s.trim())) - 1));
    const n = Math.max(1, rest.length);

    const lineIn = interpolate(timeMs, [p.lineAt, p.lineAt + 900], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    const plotH = height * 0.62;
    const top = height * 0.2;
    const slotW = width / n;
    const barW = Math.max(2, slotW - p.gap);

    // One height function, used by BOTH the bar and the polyline node — deriving them separately
    // is exactly how a trend line drifts off its bars. Taking `ms` as an argument lets vel()
    // sample it, so each bar's smear comes from its own true growth speed.
    const growOf = (i: number, ms: number) => spring({
      frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
      config: { damping: 200, mass: 0.6, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const heightOf = (i: number, ms: number) => {
      const ph = ((ms / 1000) * p.rate + random(`${seed}b${i}`)) % 1;
      const drift = Math.sin(ph * Math.PI * 2) * p.breathe;
      return Math.max(2, Math.min(100, rest[i] + drift)) * 0.01 * plotH * growOf(i, ms);
    };

    const pts = rest.map((_, i) => {
      const x = slotW * (i + 0.5);
      const y = top + plotH - heightOf(i, timeMs);
      return { x, y };
    });
    const visible = Math.max(2, Math.round(pts.length * lineIn));

    // Depth wraps the plot: a top-hinged swing-in and a faint resting sway. The trend line and
    // bars share one layer on purpose — the polyline must stay welded to the bar tops.
    const enter = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });
    const pose = depthPose(timeMs, seed, { enter, rx: -11, z: -70, swayDeg: 1.4 });
    const parBase = parallax(timeMs, seed, 0.25, height * 0.004);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? `linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.25) 100%), ${p.bg}` : 'transparent',
          fontFamily: ff,
          opacity: clamp01(enter * 2.5),
          transform: pose,
          transformOrigin: '50% 35%',
          ...el('plot'),
        }}
      >
        <div style={{ position: 'absolute', inset: 0, ...el('bars') }}>
          {rest.map((_, i) => {
            const colour = hot.has(i) ? p.accent : p.bar;
            // Velocity smear off the bar's true top-edge speed: strong while the column shoots
            // up, zero once it only breathes — the 0.35px/ms dead-zone keeps the endless drift
            // crisp so the held chart never reads soft.
            const vTop = Math.abs(vel((ms) => heightOf(i, ms), timeMs));
            const barBlur = Math.min(5, Math.max(0, vTop - 0.35) * 2.6);
            const g = growOf(i, timeMs);
            return (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: slotW * (i + 0.5) - barW / 2,
                  width: barW,
                  top: top + plotH - heightOf(i, timeMs),
                  height: heightOf(i, timeMs),
                  background: `linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 34%, rgba(0,0,0,0.22) 100%), ${colour}`,
                  borderRadius: p.radius,
                  boxShadow: hot.has(i)
                    ? `0 0 ${barW * 0.5}px ${rgba(colour, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.22)`
                    : 'inset 0 1px 0 rgba(255,255,255,0.16)',
                  filter: barBlur > 0.3 ? `blur(${barBlur.toFixed(2)}px)` : undefined,
                  // Z-stagger: each column tips up from the baseline at its own slight angle.
                  transform: swingIn(Math.min(1, g), { rx: 10 + (i % 4) * 2, z: -40 }),
                  transformOrigin: 'center bottom',
                }}
              />
            );
          })}
        </div>

        {/* dashed hairline baseline, documentary-chart style — on its own shallow parallax
            depth so the resting sway shears it very slightly under the bars */}
        <div
          style={{
            position: 'absolute', left: slotW * 0.2, right: slotW * 0.2, top: top + plotH, height: 1.5,
            background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 3px, transparent 3px 11px)',
            transform: `translate(${parBase.x.toFixed(2)}px, ${parBase.y.toFixed(2)}px)`,
          }}
        />

        {p.thick > 0 && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...el('line') }}>
            <polyline
              points={pts.slice(0, visible).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}
              fill="none" stroke={rgba(p.line, 0.7)} strokeWidth={p.thick} strokeLinejoin="round" strokeLinecap="round"
              opacity={clamp01(lineIn * 2)}
              style={{ filter: `drop-shadow(0 0 6px ${rgba(p.line, 0.4)})` }}
            />
            {p.dot > 0 && pts.slice(0, visible).map((q, i) => (
              <circle
                key={i} cx={q.x} cy={q.y} r={p.dot / 2} fill={p.line} opacity={clamp01(lineIn * 2)}
                style={{ filter: `drop-shadow(0 0 ${p.dot}px ${rgba(p.line, 0.5)})` }}
              />
            ))}
          </svg>
        )}
      </div>
    );
  },
});
