// Reference: social/photobooth-animation-1.mp4  (window 160-5900ms, third frame clears ~4200ms)
// A photo strip printing out of a wall slot, one frame at a time, then retracting.
//
// The strip is ONE element that slides; the frames are not animated individually. Printing each
// frame on its own spring makes the paper stretch, because the gaps between frames would change —
// which is the tell that it is not a real strip.
//
// Distinct from photo_strip, which slides finished photos in horizontally.

import { Easing, interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeLightLeak, luxeVignette } from '../luxe';
import { smear, vel } from '../juice';

const MAX_FRAMES = 4;

export const photoBooth = defineGraphicsTemplate({
  id: 'photo_booth',
  name: 'Photo Booth',
  category: 'social',
  tags: ['Photos', 'Print', 'Strip'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 7000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'wall',  label: 'Wall', hideable: false },
    { key: 'slot',  label: 'Slot' },
    { key: 'strip', label: 'Strip' },
    ...Array.from({ length: MAX_FRAMES }, (_, i) => ({ key: `photo${i + 1}`, label: `Photo ${i + 1}` })),
  ],

  params: [
    { type: 'number', key: 'count', label: 'Photos', group: 'Content', default: 3, min: 1, max: MAX_FRAMES, step: 1 },
    { type: 'image', key: 'img1', label: 'Photo 1', group: 'Content', default: '' },
    { type: 'image', key: 'img2', label: 'Photo 2', group: 'Content', default: '' },
    { type: 'image', key: 'img3', label: 'Photo 3', group: 'Content', default: '' },
    { type: 'image', key: 'img4', label: 'Photo 4', group: 'Content', default: '' },

    { type: 'color',  key: 'wall',   label: 'Wall',   group: 'Style', default: '#17171C' },
    { type: 'color',  key: 'stripe', label: 'Wall stripes', group: 'Style', default: '#1F1F26' },
    { type: 'color',  key: 'paper',  label: 'Paper',  group: 'Style', default: '#F7F4EC' },
    { type: 'color',  key: 'photo',  label: 'Empty photo', group: 'Style', default: '#2f2f34' },
    { type: 'color',  key: 'slot',   label: 'Slot',   group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'frame',  label: 'Slot frame', group: 'Style', default: '#26262E' },
    { type: 'number', key: 'stripW', label: 'Strip width', group: 'Style', default: 260, min: 60, max: 500, step: 10, unit: 'px' },
    { type: 'number', key: 'ratio',  label: 'Photo ratio', group: 'Style', default: 1.15, min: 0.6, max: 2, step: 0.05 },
    { type: 'number', key: 'stripes', label: 'Wall stripe count', group: 'Style', default: 26, min: 0, max: 60, step: 2 },
    { type: 'boolean', key: 'fill',  label: 'Paint the wall', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'Printing starts', group: 'Motion', default: 150, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'perFrame', label: 'Per photo', group: 'Motion', default: 1350, min: 200, max: 4000, step: 50, unit: 'ms' },
    { type: 'boolean', key: 'retract', label: 'Retract at the end', group: 'Motion', default: true },
    { type: 'number', key: 'retractMs', label: 'Retracts over', group: 'Motion', default: 700, min: 100, max: 3000, step: 50, unit: 'ms' },
  ],

  // PAPER language: a page flick as each frame prints (first three), one more when the strip is
  // snatched back — firstAt/perFrame retime the cues with the printing.
  sfx: (p) => {
    const n = Math.round(p.count);
    return [
      ...Array.from({ length: Math.min(3, n) }, (_, i) => ({
        atMs: p.firstAt + i * p.perFrame + 180,
        id: 'paper' as const,
        gain: 0.5,
      })),
      ...(p.retract ? [{ atMs: p.firstAt + n * p.perFrame + 1830, id: 'paper' as const, gain: 0.6 }] : []),
    ];
  },

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const n = Math.round(p.count);
    const imgs = [p.img1, p.img2, p.img3, p.img4].slice(0, n);
    const photoH = p.stripW * p.ratio;
    const border = p.stripW * 0.055;
    const cell = photoH + border;
    // Real booth strips end in a blank caption tail below the last photo.
    const tail = photoH * 0.42;
    const stripH = n * cell + tail;

    const slotY = height * 0.24;
    const slotW = p.stripW * 1.42;

    // ONE fed length for the whole strip. Per-frame springs would change the gaps between photos,
    // which makes the paper look like it is stretching.
    // Stepped: one cell is pushed out per beat, then the motor rests. Because every step advances the
    // SAME fed length the gaps between photos never change.
    const pushMs = Math.min(520, p.perFrame * 0.42);
    const pullAt = p.firstAt + n * p.perFrame + 1750;
    const fedAt = (ms: number) => {
      let fedT = 0;
      for (let i = 0; i < n; i++) {
        fedT += clamp01(
          interpolate(ms, [p.firstAt + i * p.perFrame, p.firstAt + i * p.perFrame + pushMs], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            easing: Easing.inOut(Easing.quad),
          }),
        ) / n;
      }
      const pull = p.retract
        ? interpolate(ms, [pullAt, pullAt + p.retractMs], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          easing: Easing.in(Easing.quad),
        })
        : 0;
      return stripH * clamp01(fedT - pull);
    };
    const fed = fedAt(timeMs);

    // TRUE velocity blur on the paper: the feed's own derivative drives blur + a slight stretch
    // along the travel, so the strip smears during each motor push (and the snatch-back) and sits
    // dead crisp while the motor rests.
    const sm = smear(0, vel(fedAt, timeMs), 0.9);

    // Casual paper dangle: the strip pivots at the slot mouth on two detuned seeded sines, and the
    // sway only grows as more paper hangs out — a scrap of paper, not a glossy card.
    const hang = clamp01(fed / Math.max(1, stripH));
    const dph1 = random(`${seed}-dg1`) * Math.PI * 2;
    const dph2 = random(`${seed}-dg2`) * Math.PI * 2;
    const dangle = (Math.sin(timeMs * 0.0019 + dph1) + 0.45 * Math.sin(timeMs * 0.0033 + dph2)) * 0.85 * hang;

    const slotIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.wall : 'transparent',
          ...el('wall'),
        }}
      >
        {p.stripes > 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {Array.from({ length: Math.round(p.stripes) }).map((_, i) => (
              <span
                key={i}
                style={{
                  flex: 1, position: 'relative',
                  borderRight: `${(width / Math.max(1, p.stripes)) * 0.18}px solid ${p.stripe}`,
                  boxSizing: 'border-box',
                }}
              />
            ))}
          </div>
        )}

        {p.fill && <div style={luxeLightLeak('72%', '0%', 0.1)} />}

        {/* Clip at the slot's mouth so the strip genuinely emerges from it. */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: slotY, bottom: 0, overflow: 'hidden' }}>
          <div
            style={{
              position: 'absolute', left: (width - p.stripW) / 2, top: 0,
              width: p.stripW, height: stripH,
              background: p.paper,
              padding: `${border}px ${border}px ${tail}px`, boxSizing: 'border-box',
              display: 'flex', flexDirection: 'column', gap: border,
              boxShadow: `0 ${p.stripW * 0.02}px ${p.stripW * 0.05}px ${rgba('#000000', 0.35)}, 0 ${p.stripW * 0.09}px ${p.stripW * 0.22}px ${rgba('#000000', 0.3)}`,
              filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
              // Hinge rotation FIRST (the pivot is the slot mouth — the strip's layout top),
              // then the feed translate, then the velocity stretch along the paper.
              transform: `rotate(${dangle.toFixed(3)}deg) translateY(${(fed - stripH).toFixed(2)}px) scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
              transformOrigin: 'top center',
              ...el('strip'),
            }}
          >
            {imgs.map((src, i) => (
              <div
                key={i}
                style={{
                  width: '100%', height: photoH,
                  background: src
                    ? `${p.photo} center/cover url(${JSON.stringify(src)})`
                    : `linear-gradient(${(random(`${seed}g${i}`) * 90 + 130).toFixed(0)}deg, ${p.photo}, ${rgba(p.photo, 0.55)})`,
                  ...el(`photo${i + 1}`),
                }}
              />
            ))}
          </div>
        </div>

        <div
          style={{
            position: 'absolute', left: (width - slotW) / 2, top: slotY - p.stripW * 0.16,
            width: slotW, height: p.stripW * 0.17,
            background: p.frame, borderRadius: p.stripW * 0.03,
            border: '1px solid rgba(255,255,255,0.13)',
            padding: p.stripW * 0.032, boxSizing: 'border-box',
            boxShadow: `0 ${p.stripW * 0.025}px ${p.stripW * 0.06}px ${rgba('#000000', 0.45)}, inset 0 1px 0 rgba(255,255,255,0.07)`,
            opacity: clamp01(slotIn),
            ...el('slot'),
          }}
        >
          <div style={{ width: '100%', height: '100%', background: p.slot, borderRadius: p.stripW * 0.012 }} />
        </div>

        {p.fill && <div style={luxeVignette(0.42)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
