// Reference: social/app-video-showcase.mp4  (window 400-5480ms, fan opens ~840ms)
// A stack of phone screens that fans out. Each phone is its own element on its own spring, so they
// splay one after another and can be individually nudged, rescaled or hidden — which is what makes
// this usable as an app showcase rather than a fixed picture.
//
// After the fan settles the whole group breathes very slightly, which keeps the shot alive without
// pulling focus.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, fr, rgba } from '../motion';
import { smear, sway3d, swingIn, vel } from '../juice';

const MAX = 5;
const FALLBACK = [
  'linear-gradient(160deg,#1A1A20,#0B0B0D)',
  'linear-gradient(160deg,#23211B,#100F0C)',
  'linear-gradient(160deg,#D97706,#F59E0B)',
  'linear-gradient(160deg,#23211B,#100F0C)',
  'linear-gradient(160deg,#1A1A20,#0B0B0D)',
];

export const phoneFan = defineGraphicsTemplate({
  id: 'phone_fan',
  name: 'Phone Fan',
  category: 'device',
  tags: ['App', 'Showcase', 'Mockup', 'Fan', 'Phones', 'Spread', 'Luxury'],
  design: { w: 900, h: 700 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 90 },
  fonts: ['inter'],

  elements: [
    { key: 'fan', label: 'Fan', hideable: false },
    ...Array.from({ length: MAX }, (_, i) => ({ key: `phone${i + 1}`, label: `Phone ${i + 1}` })),
  ],

  params: [
    { type: 'image',  key: 's1', label: 'Screen 1', group: 'Screens', default: '' },
    { type: 'image',  key: 's2', label: 'Screen 2', group: 'Screens', default: '' },
    { type: 'image',  key: 's3', label: 'Screen 3', group: 'Screens', default: '' },
    { type: 'image',  key: 's4', label: 'Screen 4', group: 'Screens', default: '' },
    { type: 'image',  key: 's5', label: 'Screen 5', group: 'Screens', default: '' },
    { type: 'number', key: 'count', label: 'How many', group: 'Screens', default: 5, min: 2, max: 5, step: 1 },

    { type: 'color',  key: 'frame',  label: 'Frame',  group: 'Style', default: '#0e0e11' },
    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 34, min: 4, max: 70, step: 2, unit: 'px' },
    { type: 'number', key: 'spread', label: 'Spread', group: 'Style', default: 100, min: 20, max: 200, step: 5, unit: '%' },
    { type: 'number', key: 'arc',    label: 'Fan angle', group: 'Style', default: 13, min: 0, max: 35, step: 1, unit: '°' },
    { type: 'number', key: 'shadow', label: 'Shadow', group: 'Style', default: 0.3, min: 0, max: 0.6, step: 0.02 },

    { type: 'number',  key: 'openAt',  label: 'Fan opens at', group: 'Motion', default: 220, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number',  key: 'stagger', label: 'Stagger',      group: 'Motion', default: 110, min: 0, max: 500, step: 10, unit: 'ms' },
    { type: 'boolean', key: 'breathe', label: 'Breathe after settling', group: 'Motion', default: true },
  ],

  // Device language: a light pass as the fan starts to splay, a UI pop mid-spread, a dry snap as
  // the last phone seats — all timed off the same openAt/stagger/count that drive the springs.
  sfx: (p) => [
    { atMs: p.openAt + 20, id: 'swish', gain: 0.5 },
    { atMs: p.openAt + p.stagger * (p.count - 1) * 0.5 + 200, id: 'pop', gain: 0.4 },
    { atMs: p.openAt + p.stagger * (p.count - 1) + 420, id: 'snap', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const srcs = [p.s1, p.s2, p.s3, p.s4, p.s5].slice(0, p.count);
    const n = srcs.length;
    const mid = (n - 1) / 2;

    const phoneW = width * 0.24;
    const phoneH = phoneW * 2.02;
    const step = (width * 0.16) * (p.spread / 100);

    // Whole group breathes gently once open — a slow sine, so it never syncs with the fan itself.
    const settled = interpolate(timeMs, [p.openAt + n * p.stagger + 500, p.openAt + n * p.stagger + 1100], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const breathe = p.breathe ? 1 + Math.sin(timeMs / 2400 * Math.PI * 2) * 0.012 * settled : 1;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          // The settled fan keeps a ≤0.8° 3D sway under the breathe — handsets are device mimics,
          // so the group rests nearly still but never flattens back into a print.
          transform: `${sway3d(timeMs, seed, 0.8, 5200)} scale(${breathe.toFixed(4)})`,
          transformOrigin: 'center center',
          ...el('fan'),
        }}
      >
        {srcs.map((src, i) => {
          const sAt = (ms: number) => spring({
            frame: fr(ms - p.openAt - i * p.stagger), fps: FPS,
            config: { damping: 21, mass: 0.8, stiffness: 155 },
            durationInFrames: Math.max(1, Math.round(fr(560))),
          });
          const s = sAt(timeMs);
          const off = (i - mid);
          // Fan out from a stack: offset and rotation both ramp with the spring.
          const x = off * step * s;
          const rot = off * p.arc * s;
          const y = Math.abs(off) * height * 0.018 * s;
          // Each phone rides its OWN 3D hinge as it splays — outer phones swing from deeper
          // ry angles, so the spread reads as objects fanning through space — and its travel
          // velocity smears it mid-flight, landing crisp on settle.
          const fanSmear = smear(off * step * vel(sAt, timeMs), 0);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: phoneW, height: phoneH,
                borderRadius: p.radius,
                background: src ? p.frame : FALLBACK[i % FALLBACK.length],
                border: `${Math.max(2, phoneW * 0.018)}px solid ${p.frame}`,
                boxSizing: 'border-box',
                overflow: 'hidden',
                zIndex: n - Math.abs(off),
                boxShadow: p.shadow > 0
                  ? `0 ${phoneW * 0.06}px ${phoneW * 0.16}px ${rgba('#000000', p.shadow)}, 0 ${phoneW * 0.2}px ${phoneW * 0.45}px ${rgba('#000000', p.shadow * 0.75)}, inset 0 0 0 1px rgba(255,255,255,0.07)`
                  : 'inset 0 0 0 1px rgba(255,255,255,0.07)',
                opacity: interpolate(s, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
                filter: fanSmear.blurPx > 0.3 ? `blur(${fanSmear.blurPx.toFixed(2)}px)` : undefined,
                transform:
                  `${swingIn(s, { ry: -off * 14, rx: -6, z: -80 })} ` +
                  `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) ` +
                  `rotate(${rot.toFixed(3)}deg) ` +
                  `scale(${(interpolate(s, [0, 1], [0.9, 1]) * fanSmear.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.9, 1]) * fanSmear.sy).toFixed(4)})`,
                transformOrigin: 'center bottom',
                ...el(`phone${i + 1}`),
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
    );
  },
});
