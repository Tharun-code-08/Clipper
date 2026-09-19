// Live-stream reactions: hearts and thumbs rising on seeded sine paths, fading out near the
// top, plateless. Vertical position is (t·speed + phase) % span — a modulo, never an
// accumulator — so the loop is seamless and any scrubbed millisecond lands on the identical
// frame. Each shape's lane, speed, size, sway and colour come from random(seed), fixed per index.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, outRamp } from '../motion';
import { smear } from '../juice';

const HEART =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 '
  + '2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const THUMB =
  'M1 21h4V9H1v12zM23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 '
  + '1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.72v-2.01z';

const MAX = 14;

export const reactionRise = defineGraphicsTemplate({
  id: 'reaction_rise',
  name: 'Reactions',
  category: 'social',
  tags: ['Hearts', 'Thumbs', 'Floating', 'Livestream', 'Rise'],
  badge: 'New',
  design: { w: 600, h: 800 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 78, yPercent: 52, widthPercent: 30 },
  fonts: ['inter'],

  elements: [
    { key: 'hearts', label: 'Hearts' },
    { key: 'thumbs', label: 'Thumbs' },
  ],

  params: [
    { type: 'number', key: 'density', label: 'How many', group: 'Content', default: 10, min: 4, max: 14, step: 1 },

    { type: 'number', key: 'size',     label: 'Size',   group: 'Style', default: 64, min: 24, max: 140, step: 2, unit: 'px' },
    { type: 'color',  key: 'colRed',   label: 'Heart red',  group: 'Style', default: '#E5484D' },
    { type: 'color',  key: 'colAmber', label: 'Amber',      group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'colWhite', label: 'Third mix',  group: 'Style', default: '#FFFFFF' },

    { type: 'number', key: 'speed', label: 'Rise speed', group: 'Motion', default: 190, min: 60, max: 520, step: 10, unit: 'px/s' },
    { type: 'number', key: 'sway',  label: 'Sway',       group: 'Motion', default: 34, min: 0, max: 120, step: 2, unit: 'px' },
    { type: 'number', key: 'delay', label: 'Delay',      group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Reactions are UI bubbles — two soft glossy pops as the stream fades in; delay retimes them.
  sfx: (p) => [
    { atMs: p.delay + 220, id: 'pop' as const, gain: 0.35 },
    { atMs: p.delay + 1150, id: 'pop' as const, gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const sec = t / 1000;
    const n = Math.min(MAX, Math.round(p.density));
    const span = height + p.size * 3.2;

    // Global fade-in (spring, no overshoot) + a short fade at the window end so the loop
    // never hard-cuts when the clip is trimmed.
    const fadeIn = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const op = clamp01(fadeIn) * outRamp(timeMs, durationMs, 320);

    const shape = (i: number, kind: 'heart' | 'thumb') => {
      const lane = 0.1 + random(`${seed}x${i}`) * 0.8;
      const spd = p.speed * (0.72 + random(`${seed}v${i}`) * 0.56);
      const phase = random(`${seed}p${i}`) * span;
      const y = height + p.size * 1.6 - ((sec * spd + phase) % span);
      const sz = p.size * (0.68 + random(`${seed}z${i}`) * 0.64);
      const w = 0.9 + random(`${seed}w${i}`) * 1.1;
      const ph = random(`${seed}q${i}`) * Math.PI * 2;
      const x = lane * width + Math.sin(sec * w + ph) * p.sway;
      const rot = Math.sin(sec * (w * 0.7) + ph * 1.7) * 12;
      const colPick = random(`${seed}c${i}`);
      const col = colPick < 0.42 ? p.colRed : colPick < 0.78 ? p.colAmber : p.colWhite;
      // Fade over the top 30% of the rise; full strength through the body.
      const fade = clamp01((y - height * 0.06) / (height * 0.3));
      // M2 velocity smear, analytically: the rise contributes a constant -spd/1000 px/ms and the
      // sway its cosine derivative, so fast reactions streak along their path while slow ones
      // stay crisp — the blur is speed-scaled, never a constant soften.
      const sm = smear(Math.cos(sec * w + ph) * (w * p.sway) / 1000, -spd / 1000, 1.4);
      return (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={sz} height={sz}
          style={{
            position: 'absolute',
            left: 0, top: 0,
            transform: `translate(${(x - sz / 2).toFixed(2)}px, ${(y - sz / 2).toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
            opacity: fade,
            filter: `drop-shadow(0 2px 6px rgba(0,0,0,0.35))${sm.blurPx > 0.25 ? ` blur(${sm.blurPx.toFixed(2)}px)` : ''}`,
          }}
        >
          <path d={kind === 'heart' ? HEART : THUMB} fill={col} />
        </svg>
      );
    };

    const idx = Array.from({ length: n }, (_, i) => i);
    const isHeart = (i: number) => random(`${seed}k${i}`) < 0.62;

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: op }}>
        <div style={{ position: 'absolute', inset: 0, ...el('hearts') }}>
          {idx.filter((i) => isHeart(i)).map((i) => shape(i, 'heart'))}
        </div>
        <div style={{ position: 'absolute', inset: 0, ...el('thumbs') }}>
          {idx.filter((i) => !isHeart(i)).map((i) => shape(i, 'thumb'))}
        </div>
      </div>
    );
  },
});
