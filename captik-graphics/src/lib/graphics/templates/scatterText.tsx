// Reference: text/scattered-text.mp4  (window 680-5240ms, converges ~2680ms)
// Every LETTER starts at a seeded scattered position and flies home on its own spring. That is the
// whole effect, and it only works because the scatter is seeded — with Math.random() each export
// frame would re-scatter and the text would never converge.
//
// Letters are indexed across the whole block so the stagger sweeps through the grid rather than
// resolving line by line.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { smear, sway3d, vel } from '../juice';

export const scatterText = defineGraphicsTemplate({
  id: 'scatter_text',
  name: 'Scatter Text',
  category: 'title',
  tags: ['Kinetic', 'Letters', 'Converge'],
  design: { w: 900, h: 820 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 47, widthPercent: 92 },
  fonts: ['montserrat'],

  elements: [
    { key: 'block', label: 'Text block', hideable: false },
    ...Array.from({ length: 12 }, (_, i) => ({ key: `line${i + 1}`, label: `Line ${i + 1}` })),
  ],

  params: [
    { type: 'text',   key: 'text',  label: 'Text',   group: 'Content', default: 'HIP-HOP IN THE HOLY LAND', maxLength: 60 },
    { type: 'number', key: 'lines', label: 'Repeat lines', group: 'Content', default: 12, min: 1, max: 12, step: 1 },

    { type: 'color',  key: 'ink',   label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Text size', group: 'Style', default: 55, min: 10, max: 90, step: 1, unit: 'px' },
    { type: 'number', key: 'track', label: 'Letter spacing', group: 'Style', default: 2, min: -4, max: 20, step: 0.5, unit: 'px' },
    { type: 'number', key: 'lead',  label: 'Line height', group: 'Style', default: 1.19, min: 0.9, max: 2.4, step: 0.02 },

    { type: 'number', key: 'spread',  label: 'Scatter distance', group: 'Motion', default: 20, min: 10, max: 300, step: 5, unit: '%' },
    { type: 'number', key: 'gatherMs', label: 'Converge time',   group: 'Motion', default: 900, min: 200, max: 2500, step: 50, unit: 'ms' },
    { type: 'number', key: 'stagger',  label: 'Letter stagger',  group: 'Motion', default: 1, min: 0, max: 90, step: 1, unit: 'ms' },
    { type: 'boolean', key: 'spin',    label: 'Letters rotate in', group: 'Motion', default: true },
  ],

  // The storm of letters is all air: a whoosh into a riser while they fly, cut clean by one
  // dry snap at convergence — computed off the same stagger + gatherMs the springs run on.
  sfx: (p) => {
    const n = Math.max(1, [...p.text].length * p.lines);
    const landAt = Math.min(4600, (n - 1) * p.stagger + p.gatherMs * 0.9);
    return [
      { atMs: 80, id: 'whoosh', gain: 0.5 },
      { atMs: 200, id: 'riser', gain: 0.4 },
      { atMs: landAt, id: 'snap', gain: 0.7 },
    ];
  },

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const chars = [...p.text];
    let idx = 0;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff, fontWeight: 700, color: p.ink,
          // Once converged, the wall of type keeps living in space — a ±1.5° sway instead of
          // freezing into a flat page.
          transform: sway3d(timeMs, seed, 1.5),
          transformOrigin: 'center center',
          ...el('block'),
        }}
      >
        {Array.from({ length: p.lines }).map((_, li) => (
          <div
            key={li}
            style={{
              display: 'flex', justifyContent: 'center',
              fontSize: p.size, lineHeight: p.lead,
              letterSpacing: p.track,
              whiteSpace: 'pre',
              ...el(`line${li + 1}`),
            }}
          >
            {chars.map((ch, ci) => {
              const k = idx++;
              const tAt = (ms: number) => clamp01(spring({
                frame: fr(ms - k * p.stagger), fps: FPS,
                config: { damping: 23, mass: 0.7, stiffness: 155 },
                durationInFrames: Math.max(1, Math.round(fr(p.gatherMs))),
              }));
              const t = tAt(timeMs);
              // Seeded home-to-scatter vector; at t=1 every letter is exactly in place.
              const ang = random(`${seed}a${k}`) * Math.PI * 2;
              const dist = (0.25 + random(`${seed}d${k}`) * 0.75) * (p.spread / 100);
              const cx = Math.cos(ang) * width * 0.42 * dist;
              const cy = Math.sin(ang) * height * 0.42 * dist;
              const dx = cx * (1 - t);
              const dy = cy * (1 - t);
              const rot = p.spin ? (random(`${seed}r${k}`) - 0.5) * 160 * (1 - t) : 0;
              // MOTION BLUR: each letter smears along its own flight vector — velocity is the
              // spring's rate times the scatter vector — and lands pin-sharp at convergence.
              const vT = vel(tAt, timeMs);
              const sm = smear(-cx * vT, -cy * vT, 0.8);
              return (
                <span
                  key={ci}
                  style={{
                    display: 'inline-block',
                    opacity: interpolate(t, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
                    filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                    transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
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
