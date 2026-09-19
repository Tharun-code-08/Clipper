// Reference: social/photos-animation.mp4  (window 960-3280ms, strip fills ~1880ms)
// Photos slide in one after another from the right and settle into a strip. Each frame arrives on
// its own spring with a seeded tilt, and the whole strip drifts left as it fills so the newest
// photo always lands near centre — which is what stops it reading as a row that simply fades in.
//
// Up to 6 images; any slot left empty draws a tinted placeholder so the template is usable before
// the user has supplied art.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, fr, rgba } from '../motion';
import { smear, sway3d, swingIn, vel } from '../juice';

const PLACEHOLDERS = [
  'linear-gradient(160deg,#3A3E46,#1B1D22)',
  'linear-gradient(160deg,#F59E0B,#D97706)',
  'linear-gradient(160deg,#F4F1E8,#D6CFBF)',
  'linear-gradient(160deg,#23262E,#101216)',
  'linear-gradient(160deg,#6B5D48,#3E362A)',
  'linear-gradient(160deg,#8A8F98,#4A4E56)',
];

export const photoStrip = defineGraphicsTemplate({
  id: 'photo_strip',
  name: 'Photo Strip',
  category: 'social',
  tags: ['Photos', 'Gallery', 'Carousel'],
  design: { w: 900, h: 320 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 78 },
  fonts: ['inter'],

  elements: [
    { key: 'strip', label: 'Strip', hideable: false },
    // Each slot is its own element so a single photo can be nudged, scaled or dropped
    // without touching the rest of the strip.
    ...Array.from({ length: 6 }, (_, i) => ({ key: `photo${i + 1}`, label: `Photo ${i + 1}` })),
  ],

  params: [
    { type: 'image', key: 'p1', label: 'Photo 1', group: 'Photos', default: '' },
    { type: 'image', key: 'p2', label: 'Photo 2', group: 'Photos', default: '' },
    { type: 'image', key: 'p3', label: 'Photo 3', group: 'Photos', default: '' },
    { type: 'image', key: 'p4', label: 'Photo 4', group: 'Photos', default: '' },
    { type: 'image', key: 'p5', label: 'Photo 5', group: 'Photos', default: '' },
    { type: 'image', key: 'p6', label: 'Photo 6', group: 'Photos', default: '' },
    { type: 'number', key: 'count', label: 'How many', group: 'Photos', default: 5, min: 1, max: 6, step: 1 },

    { type: 'number', key: 'radius', label: 'Corner',  group: 'Style', default: 10, min: 0, max: 50, step: 1, unit: 'px' },
    { type: 'number', key: 'gap',    label: 'Gap',     group: 'Style', default: 18, min: 0, max: 80, step: 2, unit: 'px' },
    { type: 'number', key: 'tilt',   label: 'Max tilt', group: 'Style', default: 0, min: 0, max: 12, step: 0.5, unit: '°' },
    { type: 'number', key: 'shadow', label: 'Shadow',  group: 'Style', default: 0.2, min: 0, max: 0.5, step: 0.01 },

    { type: 'number',  key: 'firstAt', label: 'First photo at', group: 'Motion', default: 100, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number',  key: 'stagger', label: 'Stagger',        group: 'Motion', default: 200, min: 40, max: 900, step: 10, unit: 'ms' },
    { type: 'boolean', key: 'drift',   label: 'Strip drifts left as it fills', group: 'Motion', default: true },
  ],

  // Physical prints sliding in — one light air pass per photo (first three); firstAt/stagger
  // retime the cues with the build.
  sfx: (p) => Array.from({ length: Math.min(3, Math.round(p.count)) }, (_, i) => ({
    atMs: p.firstAt + i * p.stagger + 60,
    id: 'swish' as const,
    gain: 0.4 + i * 0.05,
  })),

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const srcs = [p.p1, p.p2, p.p3, p.p4, p.p5, p.p6].slice(0, p.count);
    const n = srcs.length;
    const tile = Math.min(height, (width - p.gap * (n - 1)) / n);

    // How many have arrived, as a smooth value — drives the drift so it moves continuously
    // rather than stepping once per photo.
    const arrived = Math.max(0, Math.min(n, (timeMs - p.firstAt) / Math.max(1, p.stagger)));
    const stripW = n * tile + (n - 1) * p.gap;
    const drift = p.drift ? interpolate(arrived, [0, n], [stripW * 0.28, 0]) : 0;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...el('strip'),
        }}
      >
        {/* DEPTH: the strip is a row of physical prints — after the build it keeps living in
            space on a casual ±1.6° sway instead of flattening back into a web page. */}
        <div style={{ display: 'flex', gap: p.gap, transform: `${sway3d(timeMs, seed, 1.6, 3600)} translateX(${drift.toFixed(2)}px)`, transformOrigin: 'center center' }}>
          {srcs.map((src, i) => {
            const sAt = (ms: number) => spring({
              frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
              config: { damping: 22, mass: 0.7, stiffness: 170 },
              durationInFrames: Math.max(1, Math.round(fr(420))),
            });
            const s = sAt(timeMs);
            const tilt = p.tilt > 0 ? (random(`${seed}t${i}`) - 0.5) * 2 * p.tilt : 0;
            // Every print arrives from the right, so it hinges off the right edge — but with a
            // seeded from-angle per photo, the row builds as OBJECTS arriving in space, not divs.
            const fromRy = 13 + random(`${seed}ry${i}`) * 9;
            // TRUE velocity blur: the slide's own derivative drives the smear, so blur and
            // squash-stretch both die the instant the print lands.
            const xAt = (ms: number) => (1 - sAt(ms)) * tile * 1.1;
            const sm = smear(vel(xAt, timeMs), 0);
            const sc = interpolate(s, [0, 1], [0.86, 1]);
            return (
              <div
                key={i}
                style={{
                  width: tile, height: tile, flexShrink: 0,
                  borderRadius: p.radius, overflow: 'hidden',
                  background: src ? undefined : PLACEHOLDERS[i % PLACEHOLDERS.length],
                  boxShadow: p.shadow > 0
                    ? `0 ${(tile * 0.02).toFixed(1)}px ${(tile * 0.055).toFixed(1)}px ${rgba('#000000', p.shadow * 0.9)}, 0 ${(tile * 0.08).toFixed(1)}px ${(tile * 0.2).toFixed(1)}px ${rgba('#000000', p.shadow)}, inset 0 0 0 1px rgba(255,255,255,0.06)`
                    : undefined,
                  opacity: interpolate(s, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
                  filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                  transform:
                    `${swingIn(s, { ry: fromRy, rx: -5, z: -60 })} ` +
                    `translateX(${xAt(timeMs).toFixed(3)}px) ` +
                    `rotate(${(tilt * s).toFixed(3)}deg) ` +
                    `scale(${(sc * sm.sx).toFixed(4)}, ${(sc * sm.sy).toFixed(4)})`,
                  transformOrigin: 'right center',
                  ...el(`photo${i + 1}`),
                }}
              >
                {src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
