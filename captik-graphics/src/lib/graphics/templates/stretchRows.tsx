// Reference: text/create-a-stretchy-animation-like-this-1.mp4  (window 560-5280ms, rows set ~1320ms)
// Rows of highlighted type whose LETTER SPACING breathes — each row stretches and contracts on its
// own phase, and because the highlight is the text's own background it grows and shrinks with it.
// That coupling is the trick: animating a separate pill behind the text would drift out of sync
// the moment the tracking changed.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { smear, sway3d, swingIn, vel } from '../juice';

const MAX_ROWS = 8;

export const stretchRows = defineGraphicsTemplate({
  id: 'stretch_rows',
  name: 'Stretch Rows',
  category: 'title',
  tags: ['Text', 'Kinetic', 'Highlight'],
  design: { w: 900, h: 820 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 90 },
  fonts: ['montserrat'],

  elements: [
    { key: 'rows', label: 'Rows', hideable: false },
    ...Array.from({ length: MAX_ROWS }, (_, i) => ({ key: `row${i + 1}`, label: `Row ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'lines', label: 'Lines', group: 'Content', multiline: true, maxLength: 240,
      default: 'LOVE\nCAPTIK\nLOVE\nCAPTIK\nLOVE\nCAPTIK',
      help: 'One per line. Rows alternate which way they stretch.' },

    { type: 'color',  key: 'mark',  label: 'Highlight', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'ink',   label: 'Text',      group: 'Style', default: '#0B0B0D' },
    { type: 'font',   key: 'font',  label: 'Font',      group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Size',      group: 'Style', default: 52, min: 10, max: 100, step: 2, unit: 'px' },
    { type: 'number', key: 'rowGap', label: 'Row gap',  group: 'Style', default: 38, min: 0, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'padX',  label: 'Highlight padding', group: 'Style', default: 32, min: 0, max: 80, step: 2, unit: 'px' },
    { type: 'boolean', key: 'pill', label: 'Rounded highlight', group: 'Style', default: true },

    { type: 'number', key: 'base',   label: 'Base tracking', group: 'Motion', default: 60, min: 0, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'amp',    label: 'Stretch',       group: 'Motion', default: 70, min: 0, max: 120, step: 2, unit: 'px' },
    { type: 'number', key: 'period', label: 'Period',        group: 'Motion', default: 2600, min: 300, max: 8000, step: 100, unit: 'ms' },
    { type: 'number', key: 'skew',   label: 'Row phase skew', group: 'Motion', default: 0.35, min: 0, max: 1, step: 0.05,
      help: 'How far each row lags the one above it.' },
    { type: 'number', key: 'firstAt', label: 'First row at', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Row stagger',  group: 'Motion', default: 70, min: 0, max: 600, step: 10, unit: 'ms' },
  ],

  // A light pass as the first row snaps open, a pop as the last one lands — the endless
  // breathing afterwards stays unscored, a cue per breath would loop into noise.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_ROWS, p.lines.split('\n').map((s) => s.trim()).filter(Boolean).length));
    return [
      { atMs: p.firstAt + 100, id: 'swish', gain: 0.5 },
      { atMs: p.firstAt + (n - 1) * p.stagger + 340, id: 'pop', gain: 0.55 },
    ];
  },

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const lines = p.lines.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_ROWS);
    if (!lines.length) return null;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: p.rowGap, fontFamily: ff,
          // The stack lives in depth for its whole run — the breathing happens on a plane that
          // sways ±1.6°, not on a flat web page (rotation-only: safe under the midpoint test).
          transform: sway3d(timeMs, seed, 1.6),
          ...el('rows'),
        }}
      >
        {lines.map((line, i) => {
          const sAt = (ms: number) => spring({
            frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
            config: { damping: 24, mass: 0.7, stiffness: 165 },
            durationInFrames: Math.max(1, Math.round(fr(460))),
          });
          const s = sAt(timeMs);
          // Each row rides the same wave a little later, so the block ripples.
          const phase = i * p.skew * Math.PI;
          const w = (timeMs / Math.max(1, p.period)) * Math.PI * 2 + phase;
          // Short words need MORE tracking to sweep the same width — otherwise a 4-letter row never
          // reaches the edges while a 6-letter one overshoots them.
          const spread = 5 / Math.max(1, line.length - 1);
          const track = (p.base + (Math.sin(w) * 0.5 + 0.5) * p.amp) * spread;
          // Rows swing in from alternating side hinges on their existing springs — the stack
          // builds as objects arriving in space — and each row's snap-open velocity smears it
          // horizontally for the few frames it is moving, landing crisp.
          const hinge = { rx: -9, ry: (i % 2 ? 1 : -1) * 17, z: -90 };
          const halfW = line.length * p.size * 0.32 + p.padX;
          const vx = vel((ms) => interpolate(sAt(ms), [0, 1], [0.7, 1]) * halfW, timeMs);
          const sm = smear(vx, 0);
          return (
            <div
              key={i}
              style={{
                background: p.mark, color: p.ink,
                fontSize: p.size, fontWeight: 800,
                paddingLeft: p.padX, paddingRight: p.padX,
                paddingTop: p.size * 0.3, paddingBottom: p.size * 0.3,
                borderRadius: p.pill ? 999 : 4,
                whiteSpace: 'nowrap', lineHeight: 1,
                opacity: clamp01(s * 1.8),
                filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                transform: `${swingIn(s, hinge)} scale(${(interpolate(s, [0, 1], [0.7, 1]) * sm.sx).toFixed(4)}, ${sm.sy.toFixed(4)})`,
                ...el(`row${i + 1}`),
              }}
            >
              {/* The trailing letter-space would otherwise pad the right edge more than the left,
                  which shows up as the highlight sliding sideways as the tracking breathes. */}
              <span style={{ letterSpacing: track, marginRight: -track }}>{line}</span>
            </div>
          );
        })}
      </div>
    );
  },
});
