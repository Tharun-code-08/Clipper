// Reference: social/image-shuffle-1.mp4  (window 480-6360ms, one card every ~1070ms, handoff ~300ms)
// A deck of photo cards. Each card flies up from below on its own spring, sits square and centred
// for a beat, then tumbles away off the top as the next one arrives. The entrance of card N+1 and
// the exit of card N OVERLAP, so the stage is never empty — that overlap is the whole difference
// between reading as a shuffle and reading as a slideshow.
//
// Measured card: 292x302 in a 422x752 capture, so very slightly taller than square; cycle 1069ms
// with a ~300ms crossover. Up to 6 images; an empty slot draws a tinted placeholder so the
// template is usable before the user has supplied art.

import { Easing, interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

const MAX_CARDS = 6;

const PLACEHOLDERS = [
  'linear-gradient(155deg,#F59E0B,#D97706)',
  'linear-gradient(155deg,#F4F1E8,#D8D2C2)',
  'linear-gradient(155deg,#2A2A31,#141418)',
  'linear-gradient(155deg,#3A3E46,#1E2126)',
  'linear-gradient(155deg,#6B5D48,#463D2F)',
  'linear-gradient(155deg,#20242E,#0F1116)',
];

export const imageShuffle = defineGraphicsTemplate({
  id: 'image_shuffle',
  name: 'Photo Shuffle',
  category: 'social',
  tags: ['Photos', 'Deck', 'Shuffle'],
  design: { w: 820, h: 900 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 70 },
  fonts: ['inter'],

  elements: [
    { key: 'deck', label: 'Deck', hideable: false },
    // Every card is its own element, so one photo can be nudged, rescaled or dropped from the
    // rotation without disturbing the others.
    ...Array.from({ length: MAX_CARDS }, (_, i) => ({ key: `card${i + 1}`, label: `Card ${i + 1}` })),
  ],

  params: [
    { type: 'image', key: 'p1', label: 'Photo 1', group: 'Photos', default: '' },
    { type: 'image', key: 'p2', label: 'Photo 2', group: 'Photos', default: '' },
    { type: 'image', key: 'p3', label: 'Photo 3', group: 'Photos', default: '' },
    { type: 'image', key: 'p4', label: 'Photo 4', group: 'Photos', default: '' },
    { type: 'image', key: 'p5', label: 'Photo 5', group: 'Photos', default: '' },
    { type: 'image', key: 'p6', label: 'Photo 6', group: 'Photos', default: '' },
    { type: 'number', key: 'count', label: 'How many', group: 'Photos', default: 5, min: 1, max: 6, step: 1 },

    { type: 'color',  key: 'card',   label: 'Card',   group: 'Style', default: '#FBFAF6' },
    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 26, min: 0, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'inset',  label: 'Photo inset', group: 'Style', default: 0, min: 0, max: 60, step: 2, unit: 'px',
      help: 'Leave a card border around the photo, polaroid-style.' },
    { type: 'number', key: 'shadow', label: 'Shadow', group: 'Style', default: 0.18, min: 0, max: 0.5, step: 0.01 },

    { type: 'number', key: 'firstAt', label: 'First card at', group: 'Motion', default: 240, min: 0, max: 2500, step: 20, unit: 'ms' },
    { type: 'number', key: 'cycle',   label: 'Time per card', group: 'Motion', default: 1070, min: 300, max: 3000, step: 10, unit: 'ms' },
    { type: 'number', key: 'travel',  label: 'Fly-in',        group: 'Motion', default: 420, min: 120, max: 1200, step: 20, unit: 'ms' },
    { type: 'number', key: 'tilt',    label: 'Tumble',        group: 'Motion', default: 13, min: 0, max: 45, step: 1, unit: '°' },
    { type: 'boolean', key: 'hold',   label: 'Last card stays', group: 'Motion', default: true,
      help: 'Keeps the final photo on screen instead of flying it off too.' },
  ],

  // Physical deck: one air pass for the first fly-in, then a card flick per handoff —
  // firstAt/cycle retime the cues with the shuffle.
  sfx: (p) => [
    { atMs: p.firstAt + 100, id: 'swish' as const, gain: 0.5 },
    ...Array.from({ length: Math.max(0, Math.min(3, Math.round(p.count) - 1)) }, (_, i) => ({
      atMs: p.firstAt + (i + 1) * p.cycle + 100,
      id: 'paper' as const,
      gain: 0.45,
    })),
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const srcs = [p.p1, p.p2, p.p3, p.p4, p.p5, p.p6].slice(0, p.count);
    const n = srcs.length;
    if (!n) return null;

    const pad = Math.round(width * 0.024);
    const cardW = width - pad * 2;
    const cardH = height - pad * 2;
    const rise = height * 0.95;

    return (
      <div style={{ position: 'absolute', inset: 0, ...el('deck') }}>
        {srcs.map((src, i) => {
          const local = timeMs - p.firstAt - i * p.cycle;
          // Skip cards that are not near their moment — keeps the tree small and means a 6-card
          // deck costs the same per frame as a 2-card one.
          if (local < -p.travel || local > p.cycle + p.travel * 2.2) return null;

          const last = i === n - 1;
          const sInAt = (ms: number) => spring({
            frame: fr(ms - p.firstAt - i * p.cycle), fps: FPS,
            config: { damping: 20, mass: 0.8, stiffness: 145 },
            durationInFrames: Math.max(1, Math.round(fr(p.travel))),
          });
          const sIn = sInAt(timeMs);
          // The exit ACCELERATES away — a spring here would decelerate into the edge of frame and
          // read as a card being placed rather than thrown.
          const outAt = (ms: number) => p.hold && last ? 0 : interpolate(
            ms - p.firstAt - i * p.cycle, [p.cycle, p.cycle + p.travel], [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) },
          );
          const out = outAt(timeMs);

          const angIn = (random(`${seed}i${i}`) - 0.5) * 2 * p.tilt;
          const angOut = (random(`${seed}o${i}`) - 0.5) * 2 * p.tilt * 1.6;
          const driftX = (random(`${seed}x${i}`) - 0.5) * 2 * width * 0.16;

          // The exit clears the FRAME, not just the card slot: a card left hanging half off the top
          // reads as two cards on stage at once.
          const yAt = (ms: number) => (1 - sInAt(ms)) * rise - outAt(ms) * rise * 2.4;
          const xAt = (ms: number) => outAt(ms) * driftX;
          const y = yAt(timeMs);
          const x = xAt(timeMs);
          const rot = (1 - sIn) * angIn + out * angOut;
          const sc = interpolate(sIn, [0, 1], [0.9, 1]) * (1 - out * 0.05);

          // TRUE flight smear: the card's own velocity (fly-in AND throw-out) drives blur and
          // squash-stretch, so it smears while airborne and holds dead crisp on stage.
          const sm = smear(vel(xAt, timeMs), vel(yAt, timeMs));
          // Cards toss in as physical objects: a seeded 3D hinge per card (so the shuffle reads
          // as objects arriving in space, not divs), then a casual resting sway while it holds.
          const pose = depthPose(local, `${seed}-c${i}`, {
            enter: sIn,
            rx: 11 + random(`${seed}rx${i}`) * 7,
            ry: (random(`${seed}ry${i}`) - 0.5) * 16,
            z: -90,
            swayDeg: 1.3,
          });

          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: pad, top: pad, width: cardW, height: cardH,
                zIndex: i + 1,
                background: p.card,
                borderRadius: p.radius,
                padding: p.inset,
                boxSizing: 'border-box',
                boxShadow: p.shadow > 0
                  ? `0 ${(cardH * 0.025).toFixed(1)}px ${(cardH * 0.06).toFixed(1)}px ${rgba('#000000', p.shadow * 0.9)}, 0 ${(cardH * 0.09).toFixed(1)}px ${(cardH * 0.22).toFixed(1)}px ${rgba('#000000', p.shadow)}, inset 0 0 0 1px ${rgba('#000000', 0.05)}`
                  : undefined,
                opacity: clamp01(sIn * 4),
                filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                transform:
                  `${pose} translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) ` +
                  `rotate(${rot.toFixed(3)}deg) scale(${(sc * sm.sx).toFixed(4)}, ${(sc * sm.sy).toFixed(4)})`,
                transformOrigin: 'center center',
                ...el(`card${i + 1}`),
              }}
            >
              <div
                style={{
                  width: '100%', height: '100%', overflow: 'hidden',
                  borderRadius: Math.max(0, p.radius - p.inset * 0.6),
                  background: src ? undefined : PLACEHOLDERS[i % PLACEHOLDERS.length],
                }}
              >
                {src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  },
});
