// Reference: text/good-mood.mp4  (window 0-5480ms, set by ~920ms then waves forever)
// Two words of heavy blocky type where every letter squashes and stretches on its own phase, so a
// wave travels along the word. Letters carry individual colours from a palette, cycled by absolute
// index, so adding a letter never re-colours the ones before it.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { smear, sway3d, swingIn, vel } from '../juice';

const MAX_LETTERS = 14;

export const bounceBlocks = defineGraphicsTemplate({
  id: 'bounce_blocks',
  name: 'Bounce Blocks',
  category: 'title',
  tags: ['Text', 'Bounce', 'Playful'],
  design: { w: 900, h: 620 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 88 },
  fonts: ['inter', 'komika', 'luckiest'],

  elements: [
    { key: 'block', label: 'Block', hideable: false },
    { key: 'top',   label: 'Top line' },
    { key: 'bottom', label: 'Bottom line' },
    ...Array.from({ length: MAX_LETTERS }, (_, i) => ({ key: `letter${i + 1}`, label: `Letter ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'top',    label: 'Top line',    group: 'Content', default: 'GOOD', maxLength: 14 },
    { type: 'text', key: 'bottom', label: 'Bottom line', group: 'Content', default: 'MOOD', maxLength: 14 },
    { type: 'text', key: 'palette', label: 'Letter colours', group: 'Content', maxLength: 120,
      default: '#F4F1E8,#F4F1E8,#F4F1E8,#F4F1E8,#F59E0B,#D97706,#E5484D,#D98A94',
      help: 'Comma-separated. Cycled across both lines.' },

    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'komika' },
    { type: 'number', key: 'size',   label: 'Size',   group: 'Style', default: 252, min: 30, max: 320, step: 4, unit: 'px' },
    { type: 'number', key: 'weight', label: 'Weight', group: 'Style', default: 900, min: 300, max: 900, step: 100 },
    { type: 'number', key: 'track',  label: 'Tracking', group: 'Style', default: 2, min: -20, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'lead',   label: 'Line height', group: 'Style', default: 0.92, min: 0.6, max: 1.6, step: 0.02 },

    { type: 'number', key: 'squash', label: 'Squash',  group: 'Motion', default: 0.38, min: 0, max: 0.7, step: 0.02,
      help: 'How far each letter compresses and stretches.' },
    { type: 'number', key: 'period', label: 'Period',  group: 'Motion', default: 1500, min: 200, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'travel', label: 'Wave lag', group: 'Motion', default: 0.5, min: 0, max: 2, step: 0.05,
      help: 'How far each letter lags the one before it. 0 makes them move as one.' },
    { type: 'number', key: 'firstAt', label: 'Enter at', group: 'Motion', default: 60, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Enter stagger', group: 'Motion', default: 55, min: 0, max: 400, step: 5, unit: 'ms' },
  ],

  // Playful rubber: a light pass as the letters take off, glossy pops as the first and last
  // letters land — timed off the same firstAt/stagger that drives the entrance springs.
  sfx: (p) => {
    const n = Math.max(1, [...p.top].slice(0, MAX_LETTERS).length + [...p.bottom].slice(0, MAX_LETTERS).length);
    const land = (i: number) => p.firstAt + i * p.stagger + 160;
    const cues: { atMs: number; id: 'swish' | 'pop'; gain: number }[] = [
      { atMs: p.firstAt, id: 'swish', gain: 0.45 },
      { atMs: land(0), id: 'pop', gain: 0.55 },
    ];
    if (n > 1) cues.push({ atMs: land(n - 1), id: 'pop', gain: 0.7 });
    return cues;
  },

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const colours = p.palette.split(',').map((s) => s.trim()).filter(Boolean);
    const fallback = ['#F4F1E8'];
    const pal = colours.length ? colours : fallback;

    const lines = [
      { key: 'top' as const, text: [...p.top].slice(0, MAX_LETTERS) },
      { key: 'bottom' as const, text: [...p.bottom].slice(0, MAX_LETTERS) },
    ];

    let idx = 0;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          // The assembled lockup keeps living in 3D — a ±1.8° sway under the letter wave, so the
          // block reads as an object in space, not type on a web page.
          transform: sway3d(timeMs, seed, 1.8),
          ...el('block'),
        }}
      >
        {lines.map((line, li) => (
          <div
            key={line.key}
            style={{
              display: 'flex', alignItems: 'flex-end', lineHeight: p.lead,
              ...(li === 0 ? el('top') : el('bottom')),
            }}
          >
            {line.text.map((ch, c) => {
              const i = idx++;
              const sAt = (ms: number) => spring({
                frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
                config: { damping: 15, mass: 0.6, stiffness: 210 },
                durationInFrames: Math.max(1, Math.round(fr(460))),
              });
              const s = sAt(timeMs);
              // Each letter arrives through 3D on its own seeded hinge (bottom origin, so it tips
              // up from the baseline), and its entrance velocity drives a smear that dies the frame
              // it lands — the wave then runs on a crisp letter.
              const hinge = {
                rx: -14 - random(`${seed}-hx${i}`) * 8,
                ry: (random(`${seed}-hy${i}`) - 0.5) * 20,
                z: -80,
              };
              const vL = vel(sAt, timeMs) * p.size;
              const sm = smear(0, vL, 0.9);
              // The wave: each letter is the same oscillation a little later.
              const w = (timeMs / Math.max(1, p.period)) * Math.PI * 2 - i * p.travel;
              const k = Math.sin(w) * p.squash;
              // Squash and stretch conserve area, which is what makes it read as rubber
              // rather than a letter simply changing height.
              const sy = 1 + k;
              const sx = 1 - k * 0.55;
              return (
                <span
                  key={c}
                  style={{
                    display: 'inline-block',
                    fontSize: p.size, fontWeight: p.weight,
                    color: pal[i % pal.length],
                    letterSpacing: p.track, whiteSpace: 'pre',
                    textShadow: `0 ${(p.size * 0.03).toFixed(1)}px ${(p.size * 0.08).toFixed(1)}px rgba(0,0,0,0.28), 0 ${(p.size * 0.09).toFixed(1)}px ${(p.size * 0.22).toFixed(1)}px rgba(0,0,0,0.22)`,
                    transformOrigin: '50% 100%',
                    opacity: clamp01(s * 1.7),
                    filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                    transform:
                      `${swingIn(s, hinge)} `
                      + `scale(${(sx * interpolate(s, [0, 1], [0.6, 1]) * sm.sx).toFixed(4)}, `
                      + `${(sy * interpolate(s, [0, 1], [0.6, 1]) * sm.sy).toFixed(4)})`,
                    ...el(`letter${i + 1}`),
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
});
