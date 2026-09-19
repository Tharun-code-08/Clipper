// A thick donut ring sweeps to its percent with a rounded amber cap while the big numeral
// counts up at center; a tracked uppercase label sits underneath. Ring sweep and count-up
// share ONE eased clock, so the digits land sharp (blur follows the remaining sweep
// velocity) at the exact moment the cap stops — the number never waits on the ring. A tiny
// outer tick at 12 o'clock marks 100%, keeping "how far to go" readable mid-sweep.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax } from '../juice';

export const donutPercent = defineGraphicsTemplate({
  id: 'donut_percent',
  name: 'Percent Donut',
  category: 'chart',
  tags: ['Donut', 'Ring', 'Percent', 'Gauge', 'Circle'],
  badge: 'New',
  design: { w: 700, h: 700 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 38, widthPercent: 42 },
  fonts: ['montserrat'],

  elements: [
    { key: 'ring',   label: 'Ring' },
    { key: 'number', label: 'Number' },
    { key: 'label',  label: 'Label' },
  ],

  params: [
    { type: 'number', key: 'percent', label: 'Percent', group: 'Content', default: 87, min: 0, max: 100, step: 1, unit: '%' },
    { type: 'text',   key: 'label',   label: 'Label',   group: 'Content', default: 'PROFIT MARGIN', maxLength: 24 },

    { type: 'color',   key: 'accent', label: 'Accent',      group: 'Style', default: '#F59E0B' },
    { type: 'color',   key: 'ink',    label: 'Number ink',  group: 'Style', default: '#F4F1E8' },
    { type: 'boolean', key: 'plate',  label: 'Glass panel', group: 'Style', default: true },

    { type: 'number', key: 'sweepMs', label: 'Sweep time', group: 'Motion', default: 1600, min: 500, max: 3500, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay',      group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Counter language: air pass on the swing-in, ONE tick as the count starts, and a chime
  // exactly when ring + digits land together — the same 150ms offset the motion uses.
  sfx: (p) => [
    { atMs: p.delay + 60, id: 'whoosh', gain: 0.45 },
    { atMs: p.delay + 150, id: 'tick', gain: 0.4 },
    { atMs: p.delay + 150 + p.sweepMs, id: 'chime', gain: 0.55 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 30, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });

    // One clock for both the arc and the digits — they land together.
    const prog = easeOutQuint(clamp01((t - 150) / Math.max(1, p.sweepMs)));
    const frac = (p.percent / 100) * prog;
    const shown = Math.round(p.percent * prog);
    const blur = t > 0 ? (1 - prog) * 6 : 0;

    const cx = width / 2;
    const cy = height / 2;
    const r = width * 0.33;
    const sw = width * 0.063;
    const circ = 2 * Math.PI * r;

    const labelIn = easeOutQuint(clamp01((t - 450) / 400));
    const fsNum = Math.round(height * 0.2);
    const scaleIn = 0.96 + 0.04 * enter;

    // Depth: the glass swings in top-hinged on the entrance spring and never flattens back —
    // a ±1.8° sway persists, and number/label ride different parallax depths over the ring.
    const pose = depthPose(t, seed, { enter, rx: -14, z: -90, swayDeg: 1.8 });
    const parNum = parallax(t, seed, 0.3, height * 0.006);
    const parLabel = parallax(t, seed, 0.55, height * 0.006);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          ...(p.plate ? luxePanel(Math.round(height * 0.086)) : {}),
          opacity: enter,
          transform: `${pose} translateY(${((1 - enter) * height * 0.045).toFixed(2)}px) scale(${scaleIn.toFixed(4)})`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          overflow: 'hidden',
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, ...el('ring') }}>
          {/* full track — the remainder of the ring */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={sw} />
          {/* tiny tick marking the 100% top */}
          <line
            x1={cx} y1={cy - r - sw / 2 - 8}
            x2={cx} y2={cy - r - sw / 2 - 20}
            stroke="rgba(255,255,255,0.35)" strokeWidth={3} strokeLinecap="round"
          />
          {/* the sweep — rounded cap would paint a dot at zero, so gate it */}
          {frac > 0.002 && (
            <circle
              cx={cx} cy={cy} r={r} fill="none"
              stroke={p.accent} strokeWidth={sw} strokeLinecap="round"
              strokeDasharray={circ.toFixed(1)}
              strokeDashoffset={(circ * (1 - frac)).toFixed(1)}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ filter: `drop-shadow(0 0 ${Math.round(sw * 0.32)}px ${rgba(p.accent, 0.55)})` }}
            />
          )}
        </svg>

        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: Math.round(height * 0.014),
          }}
        >
          <span
            style={{
              fontSize: fsNum, fontWeight: 800, color: p.ink, lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
              transform: `translate(${parNum.x.toFixed(2)}px, ${parNum.y.toFixed(2)}px)`,
              ...el('number'),
            }}
          >
            {shown}
            <span style={{ fontSize: Math.round(fsNum * 0.44), fontWeight: 800, color: p.accent, marginLeft: Math.round(width * 0.008) }}>
              %
            </span>
          </span>
          <span
            style={{
              ...luxeLabel(Math.round(height * 0.037)),
              opacity: labelIn,
              transform: `translate(${parLabel.x.toFixed(2)}px, ${(parLabel.y + (1 - labelIn) * 8).toFixed(2)}px)`,
              ...el('label'),
            }}
          >
            {p.label}
          </span>
        </div>

        {p.plate && <div style={luxeGrain(0.045)} />}
      </div>
    );
  },
});
