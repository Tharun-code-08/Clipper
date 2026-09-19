// Reference: graphics/makin-bank.mp4  (a chroma-key plate; the card and the figure are the piece)
// A labelled card with a large figure rolling up. The reference is shot on green because it is
// meant to be keyed over footage — here it just draws on transparency, which is what an overlay
// should do.
//
// The figure eases with a cubic-out, not linearly: a linear count reads as a stopwatch, an eased
// one reads as a total arriving.

import { Easing, interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGrain, luxeLabel } from '../luxe';
import { depthPose, parallax } from '../juice';

/** 1234567.8 -> "1,234,568" */
function group(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const amountTicker = defineGraphicsTemplate({
  id: 'amount_ticker',
  name: 'Amount Ticker',
  category: 'money',
  tags: ['Counter', 'Money', 'Overlay', 'Luxury'],
  design: { w: 900, h: 260 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 70 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'card',  label: 'Card', hideable: false },
    { key: 'label', label: 'Label' },
    { key: 'value', label: 'Figure' },
  ],

  params: [
    { type: 'text',   key: 'label',  label: 'Label',  group: 'Content', default: 'TOTAL AMOUNT', maxLength: 32 },
    { type: 'text',   key: 'prefix', label: 'Prefix', group: 'Content', default: '$', maxLength: 4 },
    { type: 'text',   key: 'suffix', label: 'Suffix', group: 'Content', default: '', maxLength: 8 },
    { type: 'number', key: 'target', label: 'Final figure', group: 'Content', default: 97980, min: 0, max: 100000000, step: 10 },
    { type: 'number', key: 'from',   label: 'Start figure', group: 'Content', default: 0, min: 0, max: 100000000, step: 10 },

    { type: 'color',  key: 'card',  label: 'Card',   group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',   label: 'Figure', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Label',  group: 'Style', default: '#8B8780' },
    { type: 'color',  key: 'edge',  label: 'Border', group: 'Style', default: '#D97706' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Figure size', group: 'Style', default: 108, min: 14, max: 180, step: 2, unit: 'px' },
    { type: 'number', key: 'labelSize', label: 'Label size', group: 'Style', default: 26, min: 6, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 18, min: 0, max: 60, step: 2, unit: 'px' },
    { type: 'number', key: 'border', label: 'Border width', group: 'Style', default: 1, min: 0, max: 16, step: 1, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow', group: 'Style', default: 0.18, min: 0, max: 0.6, step: 0.02 },

    { type: 'number', key: 'cardAt', label: 'Card at',  group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'runMs',  label: 'Rolls over', group: 'Motion', default: 3400, min: 200, max: 12000, step: 100, unit: 'ms' },
  ],

  // Counter palette: an air pass as the card swings in, ONE tick as the roll starts, and the
  // cash hit exactly where the figure lands — all timed off the same cardAt/runMs as the count.
  sfx: (p) => [
    { atMs: p.cardAt, id: 'whoosh', gain: 0.4 },
    { atMs: p.cardAt + 80, id: 'tick', gain: 0.4 },
    { atMs: p.cardAt + p.runMs, id: 'cash', gain: 0.6 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);

    const cardIn = spring({
      frame: fr(timeMs - p.cardAt), fps: FPS,
      config: { damping: 22, mass: 0.7, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });
    // Eased, not linear — a linear count reads as a stopwatch.
    const t = interpolate(timeMs, [p.cardAt, p.cardAt + p.runMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    });
    const value = p.from + (p.target - p.from) * t;
    // MOTION BLUR on the roll: the cubic-out count is fastest at the start, so the blur follows
    // (1-u)^2 — the remaining count velocity — and the digits are CRISP the frame they land.
    const u = clamp01((timeMs - p.cardAt) / Math.max(1, p.runMs));
    const rollBlur = u > 0 && u < 1 ? Math.pow(1 - u, 2) * 6 : 0;
    // Depth: the strip swings in top-hinged on its existing spring and never flattens back —
    // a ±1.6° sway keeps it living in space while label and figure shear at different depths.
    const pose = depthPose(timeMs, seed, { enter: cardIn, rx: -10, z: -70, swayDeg: 1.6 });
    const parLab = parallax(timeMs, seed, 0.5, width * 0.007);
    const parVal = parallax(timeMs, seed, 0.18, width * 0.007);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
        }}
      >
        <div
          style={{
            width: '100%', height: '100%',
            position: 'relative', overflow: 'hidden',
            background: `linear-gradient(180deg, ${p.card} 0%, ${LUXE.bg0} 100%)`,
            border: p.border > 0 ? `${p.border}px solid ${p.edge}` : undefined,
            borderRadius: p.radius,
            padding: `${p.size * 0.2}px ${p.size * 0.36}px`,
            boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between',
            boxShadow: [
              p.shadow > 0 ? `0 ${Math.round(width * 0.026)}px ${Math.round(width * 0.078)}px ${rgba('#000000', Math.min(1, p.shadow * 2.6))}` : '',
              p.border > 0 ? `0 0 ${Math.round(width * 0.034)}px ${rgba(p.edge, 0.14)}` : '',
              'inset 0 1px 0 rgba(255,255,255,0.06)',
            ].filter(Boolean).join(', '),
            opacity: clamp01(cardIn * 2),
            transform: `${pose} scale(${interpolate(cardIn, [0, 1], [0.94, 1]).toFixed(4)})`,
            transformOrigin: '50% 30%',
            ...el('card'),
          }}
        >
          <span
            style={{
              ...luxeLabel(p.labelSize, p.dim),
              whiteSpace: 'nowrap', alignSelf: 'flex-start',
              transform: `translate(${parLab.x.toFixed(2)}px, ${parLab.y.toFixed(2)}px)`,
              ...el('label'),
            }}
          >
            {p.label}
          </span>
          <span
            style={{
              fontSize: p.size, fontWeight: 700, color: p.ink, lineHeight: 1,
              letterSpacing: '0.01em', fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap', alignSelf: 'flex-end',
              filter: rollBlur > 0.3 ? `blur(${rollBlur.toFixed(2)}px)` : undefined,
              transform: `translate(${parVal.x.toFixed(2)}px, ${parVal.y.toFixed(2)}px)`,
              ...el('value'),
            }}
          >
            {p.prefix}{group(value)}{p.suffix}
          </span>

          <div style={luxeGrain(0.045)} />
        </div>
      </div>
    );
  },
});
