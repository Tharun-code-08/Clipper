// Reference: social/instagram-story-3-images.mp4  (window 520-4280ms, third card lands ~2100ms)
// Wide photo cards drop into a vertical stack, each sliding in from the opposite side to the one
// before it. Measured off the capture: cards are 359x165 in a 422x752 frame (2.18:1) with a 17px
// gutter, the final stack sits dead centre, and the group creeps ~29px upward as it fills rather
// than re-centring in jumps.
//
// The cards travel far enough to be genuinely off-frame, so they need no fade — but they DO carry
// a speed-proportional blur, which is the detail that makes the reference read as filmed motion
// instead of a slide transform.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp, clamp01, fr, rgba } from '../motion';
import { smear, sway3d, swingIn, vel } from '../juice';

const MAX_CARDS = 5;

const PLACEHOLDERS = [
  'linear-gradient(170deg,#4A4E58,#23252C)',
  'linear-gradient(170deg,#F59E0B,#8F7440)',
  'linear-gradient(170deg,#2E3038,#15161B)',
  'linear-gradient(170deg,#D8D2C2,#9A937F)',
  'linear-gradient(170deg,#6B5D48,#3A332A)',
];

export const storyStack = defineGraphicsTemplate({
  id: 'story_stack',
  name: 'Story Stack',
  category: 'social',
  tags: ['Photos', 'Stack', 'Story'],
  design: { w: 900, h: 1325 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 86 },
  fonts: ['inter'],

  elements: [
    { key: 'stack', label: 'Stack', hideable: false },
    ...Array.from({ length: MAX_CARDS }, (_, i) => ({ key: `card${i + 1}`, label: `Card ${i + 1}` })),
  ],

  params: [
    { type: 'image', key: 'p1', label: 'Photo 1', group: 'Photos', default: '' },
    { type: 'image', key: 'p2', label: 'Photo 2', group: 'Photos', default: '' },
    { type: 'image', key: 'p3', label: 'Photo 3', group: 'Photos', default: '' },
    { type: 'image', key: 'p4', label: 'Photo 4', group: 'Photos', default: '' },
    { type: 'image', key: 'p5', label: 'Photo 5', group: 'Photos', default: '' },
    { type: 'number', key: 'count', label: 'How many', group: 'Photos', default: 3, min: 1, max: 5, step: 1 },

    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 18, min: 0, max: 70, step: 2, unit: 'px' },
    { type: 'number', key: 'gap',    label: 'Gutter', group: 'Style', default: 42, min: 0, max: 140, step: 2, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow', group: 'Style', default: 0.16, min: 0, max: 0.5, step: 0.01 },

    // Measured against the capture, whose blank lead-in window.py strips: card 1 is settled 430ms
    // in, card 2 at 980ms, card 3 at 1580ms. There is essentially NO hold before the first card —
    // giving one lands the whole build a beat behind the reference.
    { type: 'number',  key: 'firstAt',   label: 'First card at', group: 'Motion', default: 40, min: 0, max: 2500, step: 20, unit: 'ms' },
    { type: 'number',  key: 'stagger',   label: 'Stagger',       group: 'Motion', default: 550, min: 60, max: 1500, step: 20, unit: 'ms' },
    { type: 'number',  key: 'travel',    label: 'Slide',         group: 'Motion', default: 440, min: 140, max: 1400, step: 20, unit: 'ms' },
    { type: 'boolean', key: 'alternate', label: 'Alternate sides', group: 'Motion', default: true,
      help: 'Off: every card arrives from the right.' },
    { type: 'number',  key: 'blur',      label: 'Motion blur',   group: 'Motion', default: 9, min: 0, max: 30, step: 1, unit: 'px' },
    { type: 'number',  key: 'drift',     label: 'Settle drift',  group: 'Motion', default: 32, min: 0, max: 160, step: 2, unit: 'px',
      help: 'How far the whole stack creeps upward as it fills.' },
  ],

  // One light air pass per card (first three) — firstAt/stagger retime the cues with the build.
  sfx: (p) => Array.from({ length: Math.min(3, Math.round(p.count)) }, (_, i) => ({
    atMs: p.firstAt + i * p.stagger + 60,
    id: 'swish' as const,
    gain: 0.45 + i * 0.05,
  })),

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const srcs = [p.p1, p.p2, p.p3, p.p4, p.p5].slice(0, p.count);
    const n = srcs.length;
    if (!n) return null;

    const cardH = (height - p.gap * (n - 1)) / n;

    // Smooth count of cards that have arrived — drives the group creep so it glides continuously
    // instead of stepping once per card.
    const arrived = clamp((timeMs - p.firstAt) / Math.max(1, p.stagger), 0, n);
    const groupY = interpolate(arrived, [0, n], [p.drift, 0]);

    // DEPTH: the stack is a pile of physical photo cards — it never flattens back to a web
    // page. A casual ±1.6° sway rides on top of the settle creep for the whole life of the pose.
    const stackPose = sway3d(timeMs, seed, 1.6, 3600);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', gap: p.gap,
          transform: `${stackPose} translateY(${groupY.toFixed(2)}px)`,
          transformOrigin: 'center center',
          ...el('stack'),
        }}
      >
        {srcs.map((src, i) => {
          const sAt = (ms: number) => spring({
            frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
            config: { damping: 24, mass: 0.8, stiffness: 150 },
            durationInFrames: Math.max(1, Math.round(fr(p.travel))),
          });
          const s = sAt(timeMs);
          const dir = p.alternate && i % 2 === 1 ? 1 : -1;
          const xAt = (ms: number) => (1 - sAt(ms)) * dir * width * 1.25;
          const x = xAt(timeMs);
          // TRUE velocity blur: the slide's derivative drives the smear, so the blur and the
          // squash-stretch both die the instant the card lands. The blur param stays the cap.
          const sm = smear(vel(xAt, timeMs), 0);
          const blur = Math.min(p.blur, sm.blurPx);

          return (
            <div
              key={i}
              style={{
                height: cardH, flexShrink: 0,
                borderRadius: p.radius, overflow: 'hidden',
                background: src ? undefined : PLACEHOLDERS[i % PLACEHOLDERS.length],
                boxShadow: p.shadow > 0
                  ? `0 ${(cardH * 0.03).toFixed(1)}px ${(cardH * 0.08).toFixed(1)}px ${rgba('#000000', p.shadow * 0.9)}, 0 ${(cardH * 0.11).toFixed(1)}px ${(cardH * 0.26).toFixed(1)}px ${rgba('#000000', p.shadow)}, inset 0 0 0 1px rgba(255,255,255,0.06)`
                  : undefined,
                opacity: clamp01(s * 6),
                filter: blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : undefined,
                // The card flies in as an OBJECT: side-hinged swing off the edge it arrives from,
                // smear-stretch along the motion axis, dead flat once it has landed.
                transform: `${swingIn(s, { ry: dir * 18, rx: -6, z: -70 })} translateX(${x.toFixed(2)}px) scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
                transformOrigin: dir < 0 ? 'left center' : 'right center',
                ...el(`card${i + 1}`),
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
