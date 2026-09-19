// Reference: graphics/a-storm-of-info.mp4  (window 120-6840ms, settles ~2360ms)
// Objects hurled through frame that slow, tumble and come to rest in a loose arrangement.
//
// Each object has a seeded launch vector, spin and resting slot, and a spring carries it from one
// to the other — so the storm is chaotic and the landing is composed, without a physics engine and
// without breaking purity.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { smear, sway3d } from '../juice';

const MAX_ITEMS = 16;

export const objectStorm = defineGraphicsTemplate({
  id: 'object_storm',
  name: 'Object Storm',
  category: 'fx',
  tags: ['Storm', 'Tumble', 'Objects'],
  design: { w: 900, h: 1200 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 6900,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'storm', label: 'Storm', hideable: false },
    ...Array.from({ length: MAX_ITEMS }, (_, i) => ({ key: `item${i + 1}`, label: `Object ${i + 1}` })),
  ],

  params: [
    { type: 'text',   key: 'glyphs', label: 'Objects', group: 'Content', default: '📈,💰,⏰,💻,📊,🪙', maxLength: 90,
      help: 'Comma-separated emoji or characters, cycled across the objects.' },
    { type: 'number', key: 'count',  label: 'How many', group: 'Content', default: 12, min: 2, max: 16, step: 1 },

    { type: 'number', key: 'size',   label: 'Object size', group: 'Style', default: 72, min: 16, max: 220, step: 2, unit: 'px' },
    { type: 'number', key: 'vary',   label: 'Size variation', group: 'Style', default: 0.4, min: 0, max: 1, step: 0.05 },
    { type: 'color',  key: 'shadow', label: 'Shadow tint', group: 'Style', default: '#000000' },
    { type: 'number', key: 'shade',  label: 'Shadow',   group: 'Style', default: 0.18, min: 0, max: 0.6, step: 0.02 },

    { type: 'number', key: 'firstAt', label: 'First object at', group: 'Motion', default: 60, min: 0, max: 2500, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Stagger',  group: 'Motion', default: 130, min: 0, max: 500, step: 10, unit: 'ms' },
    { type: 'number', key: 'flyMs',   label: 'Settles over', group: 'Motion', default: 3000, min: 200, max: 5000, step: 50, unit: 'ms' },
    { type: 'number', key: 'spin',    label: 'Tumble',   group: 'Motion', default: 320, min: 0, max: 1080, step: 20, unit: '°' },
    { type: 'number', key: 'spread',  label: 'Rest spread', group: 'Motion', default: 0.92, min: 0.2, max: 1, step: 0.02,
      help: 'How far across the frame the objects come to rest.' },
    { type: 'number', key: 'drift',   label: 'Idle drift', group: 'Motion', default: 8, min: 0, max: 60, step: 1, unit: 'px' },
  ],

  // The storm arrives on one air pass, with light swishes as later objects keep tumbling in —
  // all timed off the same stagger params that time the motion.
  sfx: (p) => [
    { atMs: p.firstAt, id: 'whoosh', gain: 0.45 },
    { atMs: p.firstAt + 2 * p.stagger, id: 'swish', gain: 0.42 },
    { atMs: p.firstAt + 5 * p.stagger, id: 'swish', gain: 0.32 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack('inter');
    const glyphs = p.glyphs.split(',').map((s) => s.trim()).filter(Boolean);
    const list = glyphs.length ? glyphs : ['📈'];
    const n = Math.min(MAX_ITEMS, Math.round(p.count));

    // The whole scatter rests in 3D, not on a flat pane — a small sway keeps the settled
    // arrangement alive (per-object idle drift rides on top of it).
    const pose = sway3d(timeMs, seed, 1.3);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: ff,
          transform: pose,
          ...el('storm'),
        }}
      >
        {Array.from({ length: n }).map((_, i) => {
          const springAt = (ms: number) => spring({
            frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
            config: { damping: 20, mass: 0.9, stiffness: 130 },
            durationInFrames: Math.max(1, Math.round(fr(p.flyMs))),
          });
          const s = springAt(timeMs);
          // Launch: off-frame in a seeded direction. Rest: a seeded slot inside the spread box.
          const ang = random(`${seed}a${i}`) * Math.PI * 2;
          const launchX = Math.cos(ang) * width * 0.35;
          const launchY = Math.sin(ang) * height * 0.3;
          // The landing is a WIDE, SHALLOW band — the reference comes to rest across the frame, not
          // scattered evenly down it.
          const spreadY = p.spread * 0.56;
          const restX = (0.5 - p.spread / 2 + random(`${seed}rx${i}`) * p.spread) * width;
          const restY = (0.5 - spreadY / 2 + random(`${seed}ry${i}`) * spreadY) * height;
          const x = restX + (1 - s) * launchX;
          const y = restY + (1 - s) * launchY;
          const rot = (1 - s) * p.spin * (random(`${seed}d${i}`) > 0.5 ? 1 : -1)
            + (random(`${seed}rr${i}`) - 0.5) * 40 * s;
          // Once settled, everything breathes very slightly so the frame is never dead still.
          const idle = Math.sin(timeMs / 1500 + i) * p.drift * s;
          const sz = p.size * (1 - p.vary / 2 + random(`${seed}z${i}`) * p.vary);

          // MOTION BLUR: each object's flight velocity (spring derivative along its launch
          // vector) drives a smear that peaks mid-hurl and dies to zero as the spring settles —
          // the landing is CRISP. Stretch is applied in SCREEN axes (before the tumble rotate)
          // so the squash follows the flight path, not the spinning glyph.
          const ds = (springAt(timeMs + 13) - springAt(timeMs - 13)) / 26; // 1/ms
          const sm = smear(-ds * launchX, -ds * launchY, 1.1);
          const blur = sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px) ` : '';

          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: x, top: y + idle,
                fontSize: sz, lineHeight: 1,
                opacity: clamp01(s * 20),
                filter: p.shade > 0
                  ? `${blur}drop-shadow(0 ${sz * 0.04}px ${sz * 0.09}px ${rgba(p.shadow, p.shade)}) drop-shadow(0 ${sz * 0.14}px ${sz * 0.26}px ${rgba(p.shadow, p.shade * 0.6)})`
                  : (blur || undefined),
                transform:
                  `translate(-50%,-50%) scale(${sm.sx.toFixed(3)}, ${sm.sy.toFixed(3)}) `
                  + `rotate(${rot.toFixed(2)}deg) `
                  + `scale(${interpolate(s, [0, 1], [0.6, 1]).toFixed(4)})`,
                ...el(`item${i + 1}`),
              }}
            >
              {list[i % list.length]}
            </div>
          );
        })}
      </div>
    );
  },
});
