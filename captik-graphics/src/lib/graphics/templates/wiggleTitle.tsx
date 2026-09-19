// Reference: text/wiggle-text.mp4  (window 360-3920ms, settles ~1040ms)
// A two-line title where each letter keeps a gentle independent wobble after landing. The wobble
// is sin(timeMs) with a seeded phase per letter, so it never syncs into a wave and it renders
// identically on every export frame — a CSS keyframe wobble would freeze.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { smear, sway3d, swingIn, vel } from '../juice';

export const wiggleTitle = defineGraphicsTemplate({
  id: 'wiggle_title',
  name: 'Wiggle Title',
  category: 'title',
  tags: ['Kinetic', 'Wobble', 'Title'],
  design: { w: 900, h: 460 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 84 },
  fonts: ['playfair', 'anton'],

  elements: [
    { key: 'kicker', label: 'Kicker' },
    { key: 'title',  label: 'Title', hideable: false },
  ],

  params: [
    { type: 'text', key: 'kicker', label: 'Kicker', group: 'Content', default: 'Text', maxLength: 30 },
    { type: 'text', key: 'title',  label: 'Title',  group: 'Content', default: 'TITLE', maxLength: 30 },

    { type: 'color',  key: 'ink',       label: 'Colour',      group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'kickerFont', label: 'Kicker font', group: 'Style', default: 'playfair' },
    { type: 'font',   key: 'titleFont',  label: 'Title font',  group: 'Style', default: 'anton' },
    { type: 'number', key: 'kickerSize', label: 'Kicker size', group: 'Style', default: 88, min: 14, max: 140, step: 2, unit: 'px' },
    { type: 'number', key: 'titleSize',  label: 'Title size',  group: 'Style', default: 212, min: 24, max: 260, step: 2, unit: 'px' },
    { type: 'number', key: 'glow',       label: 'Glow',        group: 'Style', default: 0.35, min: 0, max: 1, step: 0.05 },
    { type: 'boolean', key: 'italic',    label: 'Italic',      group: 'Style', default: true },

    { type: 'number', key: 'inMs',    label: 'Entrance',      group: 'Motion', default: 640, min: 150, max: 1800, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Letter stagger', group: 'Motion', default: 42, min: 0, max: 200, step: 2, unit: 'ms' },
    { type: 'number', key: 'wobble',  label: 'Wobble amount',  group: 'Motion', default: 5, min: 0, max: 20, step: 0.5, unit: '°' },
    { type: 'number', key: 'wobbleMs', label: 'Wobble period', group: 'Motion', default: 1500, min: 400, max: 4000, step: 50, unit: 'ms' },
  ],

  // A light pass as the kicker cascade starts, a glossy pop when the LAST title letter parks —
  // retiming the stagger retimes the landing beat with it (clamped inside the default window).
  sfx: (p) => {
    const n = Math.max(1, [...p.title].length);
    return [
      { atMs: 60, id: 'swish', gain: 0.5 },
      { atMs: Math.min(3800, 180 + (n - 1) * p.stagger + 380), id: 'pop', gain: 0.65 },
    ];
  },

  render: ({ params: p, el, timeMs, seed, height }) => {
    const line = (text: string, font: string, size: number, delay: number, tag: string) => {
      const chars = [...text];
      return (
        <div style={{ display: 'flex', justifyContent: 'center', fontFamily: fontStack(font), fontSize: size, lineHeight: 1.08, whiteSpace: 'pre', ...el(tag) }}>
          {chars.map((ch, i) => {
            const sAt = (ms: number) => spring({
              frame: fr(ms - delay - i * p.stagger), fps: FPS,
              config: { damping: 20, mass: 0.6, stiffness: 175 },
              durationInFrames: Math.max(1, Math.round(fr(p.inMs))),
            });
            const s = sAt(timeMs);
            const t = Math.max(0, Math.min(1, s));
            // Settled letters keep wobbling, each on its own seeded phase.
            const ph = random(`${seed}${tag}${i}`);
            const wob = p.wobble * Math.sin(((timeMs / p.wobbleMs) + ph) * Math.PI * 2) * t;
            const bob = Math.cos(((timeMs / (p.wobbleMs * 1.3)) + ph) * Math.PI * 2) * size * 0.02 * t;
            // Each letter swings in from its own seeded 3D hinge on its existing spring — the
            // cascade reads as glyphs arriving in space — and its rise velocity smears it along
            // the travel axis, dying the frame it starts wobbling in place.
            const hinge = { rx: -14, ry: (random(`${seed}h${tag}${i}`) - 0.5) * 30, z: -80 };
            const vC = vel((ms) => (1 - Math.max(0, Math.min(1, sAt(ms)))) * height * 0.09, timeMs);
            const sm = smear(0, vC);
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  color: p.ink,
                  fontStyle: p.italic ? 'italic' : 'normal',
                  fontWeight: 800,
                  opacity: interpolate(t, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
                  filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                  transform:
                    `${swingIn(s, hinge)} ` +
                    `translateY(${(((1 - t) * height * 0.09) + bob).toFixed(3)}px) ` +
                    `rotate(${wob.toFixed(3)}deg) ` +
                    `scale(${(interpolate(t, [0, 1], [0.7, 1]) * sm.sx).toFixed(4)}, ${(interpolate(t, [0, 1], [0.7, 1]) * sm.sy).toFixed(4)})`,
                  // Layered bloom — a tight core halo plus a wide soft wash reads as light, not blur.
                  textShadow: p.glow > 0
                    ? `0 0 ${size * 0.18 * p.glow}px ${rgba(p.ink, 0.55 * p.glow)}, 0 0 ${size * 0.55 * p.glow}px ${rgba(p.ink, 0.25 * p.glow)}`
                    : undefined,
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
      );
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: height * 0.10,
          // The whole lockup keeps a ±1.5° resting sway UNDER the per-letter wobble — two layers
          // of life at different scales, and the system never flattens back into a web page.
          transform: sway3d(timeMs, seed, 1.5),
        }}
      >
        {line(p.kicker, p.kickerFont, p.kickerSize, 0, 'kicker')}
        {line(p.title, p.titleFont, p.titleSize, 180, 'title')}
      </div>
    );
  },
});
