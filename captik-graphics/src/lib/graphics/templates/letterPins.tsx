// Reference: text/pins.mp4  (window 520-5280ms, all pins landed ~1720ms)
// One letter per round badge, dropped into a zig-zag column. Each pin falls on its own spring with
// a seeded tilt and overshoot, so the column assembles like objects being placed rather than a word
// fading in.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { smear, sway3d, swingIn, vel } from '../juice';

const MAX_PINS = 12;

export const letterPins = defineGraphicsTemplate({
  id: 'letter_pins',
  name: 'Letter Pins',
  category: 'title',
  tags: ['Text', 'Badge', 'Drop'],
  design: { w: 720, h: 1220 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 90 },
  fonts: ['montserrat'],

  elements: [
    { key: 'pins', label: 'Pins', hideable: false },
    ...Array.from({ length: MAX_PINS }, (_, i) => ({ key: `pin${i + 1}`, label: `Pin ${i + 1}` })),
  ],

  params: [
    { type: 'text',   key: 'text',  label: 'Word', group: 'Content', default: 'CAPTIK', maxLength: 12 },
    { type: 'number', key: 'perRow', label: 'Per row', group: 'Content', default: 2, min: 1, max: 4, step: 1 },

    { type: 'color',  key: 'pin',   label: 'Pin',   group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',   label: 'Letter', group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',  group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'dia',   label: 'Pin size', group: 'Style', default: 280, min: 40, max: 320, step: 4, unit: 'px' },
    { type: 'number', key: 'size',  label: 'Letter size', group: 'Style', default: 74, min: 12, max: 160, step: 2, unit: 'px' },
    { type: 'number', key: 'zig',   label: 'Zig-zag',  group: 'Style', default: 40, min: 0, max: 220, step: 2, unit: 'px',
      help: 'How far alternate rows offset sideways.' },
    { type: 'number', key: 'gapY',  label: 'Row gap',  group: 'Style', default: 120, min: -60, max: 120, step: 2, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow',  group: 'Style', default: 0.22, min: 0, max: 0.6, step: 0.02 },

    { type: 'number',  key: 'firstAt', label: 'First pin at', group: 'Motion', default: 0, min: 0, max: 2500, step: 20, unit: 'ms' },
    { type: 'number',  key: 'stagger', label: 'Stagger',      group: 'Motion', default: 150, min: 0, max: 800, step: 10, unit: 'ms' },
    { type: 'number',  key: 'drop',    label: 'Drop height',  group: 'Motion', default: 600, min: 0, max: 900, step: 10, unit: 'px' },
    { type: 'number',  key: 'tilt',    label: 'Tilt',         group: 'Motion', default: 16, min: 0, max: 60, step: 1, unit: '°' },
  ],

  // Air as the first pin falls, a glossy pop when it lands (~400ms into its damping-12 spring),
  // and a heavier pop for the last pin — all on the firstAt/stagger grid the drops run on.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_PINS, [...p.text].length));
    const land = (i: number) => p.firstAt + i * p.stagger + 400;
    const cues: { atMs: number; id: 'swish' | 'pop'; gain: number }[] = [
      { atMs: p.firstAt + 120, id: 'swish', gain: 0.4 },
      { atMs: land(0), id: 'pop', gain: 0.55 },
    ];
    if (n > 1) cues.push({ atMs: land(n - 1), id: 'pop', gain: 0.7 });
    return cues;
  },

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const chars = [...p.text].slice(0, MAX_PINS);
    if (!chars.length) return null;

    const rows: string[][] = [];
    for (let i = 0; i < chars.length; i += p.perRow) rows.push(chars.slice(i, i + p.perRow));

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: p.gapY, fontFamily: ff,
          // The assembled column keeps living in space — a ±1.6° sway so the landed pins never
          // flatten back into a static web page.
          transform: sway3d(timeMs, seed, 1.6),
          transformOrigin: 'center center',
          ...el('pins'),
        }}
      >
        {rows.map((row, r) => (
          <div
            key={r}
            style={{
              display: 'flex', gap: p.gapY,
              // Alternate rows lean opposite ways, which is what gives the column its zig-zag.
              transform: `translateX(${(r % 2 === 0 ? -1 : 1) * p.zig * 0.5}px)`,
            }}
          >
            {row.map((ch, c) => {
              const i = r * p.perRow + c;
              const sAt = (ms: number) => spring({
                frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
                config: { damping: 12, mass: 0.7, stiffness: 190 },
                durationInFrames: Math.max(1, Math.round(fr(620))),
              });
              const s = sAt(timeMs);
              const rot = (random(`${seed}r${i}`) - 0.5) * 2 * p.tilt;
              const side = (random(`${seed}s${i}`) - 0.5) * 2 * p.zig * 0.55;
              // A seeded resting offset — the reference's pins never sit on a shared baseline.
              const rest = (random(`${seed}b${i}`) - 0.5) * p.dia * 0.28;
              // Each pin falls through 3D on its own seeded hinge — objects being placed, not
              // divs appearing — and its drop velocity smears it until the spring lands crisp.
              const hinge = {
                rx: -14 - random(`${seed}hx${i}`) * 8,
                ry: (random(`${seed}hy${i}`) - 0.5) * 20,
                z: -100,
              };
              const vPin = vel(sAt, timeMs) * (p.drop + p.dia * 0.3);
              const sm = smear(0, vPin, 0.8);
              return (
                <div
                  key={c}
                  style={{
                    width: p.dia, height: p.dia, borderRadius: '50%',
                    // Top-light + bottom-shade over the pin colour so each badge reads as a
                    // dimensional disc, not a flat dot.
                    background: `linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.3) 100%), ${p.pin}`,
                    color: p.ink,
                    border: '1px solid rgba(255,255,255,0.13)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: p.size, fontWeight: 800, lineHeight: 1,
                    boxShadow: p.shadow > 0
                      ? `0 ${(p.dia * 0.05).toFixed(1)}px ${(p.dia * 0.13).toFixed(1)}px ${rgba('#000000', p.shadow)}, `
                        + `0 ${(p.dia * 0.16).toFixed(1)}px ${(p.dia * 0.36).toFixed(1)}px ${rgba('#000000', p.shadow * 0.85)}, `
                        + 'inset 0 1px 0 rgba(255,255,255,0.06)'
                      : undefined,
                    flexShrink: 0,
                    opacity: clamp01(s * 2.4),
                    filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                    transform:
                      `${swingIn(s, hinge)} `
                      + `translate(${(side * (1 - s)).toFixed(2)}px, ${((1 - s) * -p.drop + rest * s).toFixed(2)}px) `
                      + `rotate(${(rot * s).toFixed(2)}deg) `
                      + `scale(${(interpolate(s, [0, 1], [0.65, 1]) * sm.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.65, 1]) * sm.sy).toFixed(4)})`,
                    transformOrigin: 'center center',
                    ...el(`pin${i + 1}`),
                  }}
                >
                  {ch}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
});
