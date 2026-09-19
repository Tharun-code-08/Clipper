// The dark-luxury "PORTFOLIO VALUE" panel: tracked uppercase label, a big numeral that counts
// up with a motion-blur roll while it moves, a green delta pill, and a thin gold sparkline
// drawing itself behind the number. This is the signature graphic of the documentary-money
// editing style the luxe pass is modeled on.
//
// The count-up target is parsed from the TEXT param (digits only), so the user can type any
// currency/format ("₹4,113,027", "$1.2M" falls back to plain digits) and grouping is re-applied
// with the original prefix. Blur decays with the count-up's remaining velocity — the digits are
// sharp the moment the number lands.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, easeOutQuint, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax } from '../juice';

function group(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const wealthCounter = defineGraphicsTemplate({
  id: 'wealth_counter',
  name: 'Wealth Counter',
  category: 'money',
  tags: ['Portfolio', 'Money', 'Counter', 'Luxury', 'Glass'],
  badge: 'New',
  design: { w: 900, h: 560 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 38, widthPercent: 78 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'panel', label: 'Panel', hideable: false },
    { key: 'label', label: 'Label' },
    { key: 'amount', label: 'Amount', hideable: false },
    { key: 'pill',  label: 'Delta pill' },
    { key: 'spark', label: 'Sparkline' },
  ],

  params: [
    { type: 'text',  key: 'label',  label: 'Label',   group: 'Content', default: 'PORTFOLIO VALUE', maxLength: 28 },
    { type: 'text',  key: 'value',  label: 'Value',   group: 'Content', default: '₹41,13,027', maxLength: 18 },
    { type: 'text',  key: 'delta',  label: 'Delta',   group: 'Content', default: '+158%', maxLength: 10 },

    { type: 'color', key: 'accent', label: 'Accent',  group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'deltaCol', label: 'Delta colour', group: 'Style', default: '#4ADE80' },
    { type: 'font',  key: 'font',   label: 'Font',    group: 'Style', default: 'montserrat' },

    { type: 'number', key: 'countMs', label: 'Count-up', group: 'Motion', default: 1600, min: 400, max: 4000, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay',    group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: an air sweep as the panel swings in, ONE tick as the count starts
  // rolling, and the cash hit exactly where the number lands — all timed off countMs.
  sfx: (p) => [
    { atMs: p.delay + 40, id: 'whoosh', gain: 0.45 },
    { atMs: p.delay + 120, id: 'tick', gain: 0.4 },
    { atMs: p.delay + p.countMs, id: 'cash', gain: 0.6 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    // Panel entrance: spring rise with heavy damping — a settle, not a bounce.
    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 34, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    // Depth: the panel swings in top-hinged and never flattens back — a ±1.8° sway keeps it
    // living in space; the sparkline (backplate) and delta pill (foreground chip) sit at
    // different parallax depths so the sway visibly shears the layers.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -80, swayDeg: 1.8 });
    const parSpark = parallax(t, seed, 0.3, height * 0.012);
    const parPill = parallax(t, seed, 0.75, height * 0.012);
    // Count-up: parse digits out of the value text; keep everything before the first digit
    // as the currency prefix ("₹", "$", "Rs ").
    const digits = p.value.replace(/[^0-9]/g, '');
    const target = digits ? parseInt(digits, 10) : 0;
    const prefix = digits ? p.value.slice(0, p.value.search(/[0-9]/)) : p.value;
    const cu = easeOutQuint(clamp01(t / Math.max(1, p.countMs)));
    const shown = Math.round(target * cu);
    // Blur follows the remaining velocity of the count — sharp at landing.
    const blur = (1 - cu) * 7 * (t > 0 ? 1 : 0);

    // Sparkline: seeded rising walk, drawn on over the count-up window.
    const N = 22;
    const pts: string[] = [];
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * (width * 0.86) + width * 0.07;
      const rise = i / (N - 1);
      const wob = (random(`${seed}-sp${i}`) - 0.5) * height * 0.09 * (1 - rise * 0.5);
      const y = height * 0.82 - rise * height * 0.34 + wob;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const pathLen = width * 1.1;
    const drawn = easeOutQuint(clamp01((t - 150) / (p.countMs * 0.9)));

    const fsLabel = Math.round(height * 0.052);
    const fsAmount = Math.round(height * 0.19);
    const fsPill = Math.round(height * 0.055);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          ...luxePanel(Math.round(height * 0.07)),
          opacity: enter,
          transform: `${pose} translateY(${((1 - enter) * height * 0.06).toFixed(2)}px)`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          overflow: 'hidden',
          ...el('panel'),
        }}
      >
        {/* Sparkline sits behind the type, drawing itself upward. */}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            position: 'absolute', inset: 0,
            transform: `translate(${parSpark.x.toFixed(2)}px, ${parSpark.y.toFixed(2)}px)`,
            ...el('spark'),
          }}
        >
          <polyline
            points={pts.join(' ')}
            fill="none"
            stroke={p.accent}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={pathLen}
            strokeDashoffset={(1 - drawn) * pathLen}
            style={{ filter: `drop-shadow(0 0 8px ${rgba(p.accent, 0.55)})`, opacity: 0.85 }}
          />
          {/* dashed hairline baseline, documentary-chart style */}
          <line
            x1={width * 0.07} y1={height * 0.82} x2={width * 0.93} y2={height * 0.82}
            stroke="rgba(255,255,255,0.16)" strokeWidth={1.5} strokeDasharray="2 7"
          />
        </svg>

        <div style={{ position: 'absolute', left: width * 0.08, top: height * 0.14, display: 'flex', flexDirection: 'column', gap: height * 0.045 }}>
          <span style={{ ...luxeLabel(fsLabel), ...el('label') }}>{p.label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: width * 0.03 }}>
            <span
              style={{
                fontSize: fsAmount, fontWeight: 700, color: LUXE.ink,
                letterSpacing: '0.01em', fontVariantNumeric: 'tabular-nums',
                filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
                ...el('amount'),
              }}
            >
              {prefix}{digits ? group(shown) : ''}
            </span>
            <span
              style={{
                fontSize: fsPill, fontWeight: 700, color: '#08150C',
                background: p.deltaCol, borderRadius: 999,
                padding: `${Math.round(height * 0.018)}px ${Math.round(height * 0.038)}px`,
                opacity: interpolate(cu, [0.75, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                transform: `translate(${parPill.x.toFixed(2)}px, ${parPill.y.toFixed(2)}px)`,
                boxShadow: `0 0 18px ${rgba(p.deltaCol, 0.35)}`,
                ...el('pill'),
              }}
            >
              {p.delta}
            </span>
          </div>
        </div>

        <div style={luxeGrain(0.045)} />
      </div>
    );
  },
});
