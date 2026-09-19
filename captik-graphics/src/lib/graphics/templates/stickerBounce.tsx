// Reference: logos/bouncing-image.mp4  (window 440-3280ms, settles at the very end)
// A sticker wordmark that lands with a squash and throws a ring of sparks. The squash is on a
// heavily under-damped spring and the sparks fire on impact, not on entry, so the burst reads as a
// consequence of the landing rather than decoration that happens to arrive at the same time.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

const MAX_SPARKS = 22;

export const stickerBounce = defineGraphicsTemplate({
  id: 'sticker_bounce',
  name: 'Sticker Bounce',
  category: 'title',
  tags: ['Logo', 'Sticker', 'Bounce'],
  design: { w: 900, h: 620 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 88 },
  fonts: ['inter', 'luckiest', 'komika'],

  elements: [
    { key: 'sticker', label: 'Sticker', hideable: false },
    { key: 'sparks',  label: 'Sparks' },
    { key: 'ring',    label: 'Ring' },
  ],

  params: [
    { type: 'text', key: 'text', label: 'Text', group: 'Content', help: 'Each word becomes its own stacked line.', default: 'SMASHING GOOOD', maxLength: 22 },

    { type: 'color',  key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'outline', label: 'Outline', group: 'Style', default: '#101014' },
    { type: 'color',  key: 'spark',  label: 'Sparks', group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'luckiest' },
    { type: 'number', key: 'size',   label: 'Size',   group: 'Style', default: 158, min: 24, max: 260, step: 2, unit: 'px' },
    { type: 'number', key: 'depth',  label: 'Shadow depth', group: 'Style', default: 18, min: 0, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'lean',   label: 'Lean',   group: 'Style', default: -6, min: -25, max: 25, step: 1, unit: '°' },

    { type: 'number', key: 'landAt',  label: 'Lands at', group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'squash',  label: 'Squash',   group: 'Motion', default: 0.3, min: 0, max: 0.8, step: 0.02 },
    { type: 'number', key: 'drop',    label: 'Drop height', group: 'Motion', default: 240, min: 0, max: 700, step: 10, unit: 'px' },
    { type: 'number', key: 'sparks',  label: 'Sparks',   group: 'Motion', default: 18, min: 0, max: 22, step: 1 },
    { type: 'number', key: 'burstMs', label: 'Burst over', group: 'Motion', default: 1000, min: 100, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'reach',   label: 'Burst reach', group: 'Motion', default: 380, min: 30, max: 600, step: 10, unit: 'px' },
  ],

  // Air on the way down, one produced hit when the sticker smacks the surface — the sparks are
  // a consequence of that same impact, so they share its cue rather than getting their own.
  sfx: (p) => [
    { atMs: Math.max(0, p.landAt - 130), id: 'whoosh', gain: 0.55 },
    { atMs: p.landAt + 140, id: 'slam', gain: 1 },
  ],

  render: ({ params: p, el, timeMs, seed, width }) => {
    const ff = fontStack(p.font);
    // Each word is its own stacked line — the reference wordmark is a two-line sticker.
    const lines = p.text.trim().split(/\s+/).filter(Boolean);

    const landAt = (ms: number) => spring({
      frame: fr(ms - p.landAt), fps: FPS,
      config: { damping: 9, mass: 0.8, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(900))),
    });
    const land = landAt(timeMs);
    // Overshoot past 1 is the squash; below 1 on the way in is the stretch.
    const over = land - 1;
    const sy = 1 - over * p.squash;
    const sx = 1 + over * p.squash * 0.7;

    // MOTION BLUR: the drop's own velocity (sampled from the same spring that drives it) smears
    // the sticker in flight and dies the frame it lands — the bounce overshoots re-light it for
    // a beat, which reads as the sticker still fighting the surface.
    const vDrop = vel((ms) => (1 - clamp01(landAt(ms))) * -p.drop, timeMs);
    const sm = smear(0, vDrop);
    // The sticker swings in through 3D on the same landing spring (its underdamped overshoot
    // carries it past vertical) and then never flattens: a ±2° sway keeps it living in space.
    const pose = depthPose(timeMs, seed, { enter: land, rx: -16, z: -110, swayDeg: 2 });

    const burst = interpolate(timeMs, [p.landAt, p.landAt + p.burstMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    // Shockwave distance eases OUT hard — the ring is already wide a frame after impact, then creeps.
    const wave = 1 - Math.pow(1 - burst, 3);
    const n = Math.min(MAX_SPARKS, Math.round(p.sparks));

    const shadow = p.depth > 0
      ? Array.from({ length: Math.round(p.depth) }, (_, k) => `${k + 1}px ${k + 1}px 0 ${p.outline}`).join(', ')
      : undefined;

    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff }}>
        <div style={{ position: 'absolute', width: 0, height: 0, ...el('sparks') }}>
          {burst > 0 && burst < 1 && Array.from({ length: n }).map((_, i) => {
            const a = (i / n) * Math.PI * 2 + random(`${seed}a${i}`) * 0.4;
            const dist = p.reach * (0.75 + random(`${seed}d${i}`) * 0.9) * wave;
            const d = width * 0.013 * (0.6 + random(`${seed}s${i}`));
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: d, height: d, borderRadius: '50%',
                  background: p.spark,
                  opacity: Math.sin((1 - burst) * Math.PI * 0.5),
                  transform: `translate(${(Math.cos(a) * dist).toFixed(2)}px, ${(Math.sin(a) * dist).toFixed(2)}px)`,
                }}
              />
            );
          })}
          <div
            style={{
              position: 'absolute',
              width: p.reach * 2 * wave, height: p.reach * 2 * wave,
              marginLeft: -p.reach * wave, marginTop: -p.reach * wave,
              borderRadius: '50%',
              border: `${Math.max(2, width * 0.005)}px solid ${rgba(p.spark, 0.55 * (1 - burst))}`,
              opacity: burst > 0 && burst < 1 ? 1 : 0,
              ...el('ring'),
            }}
          />
        </div>

        <span
          style={{
            position: 'relative',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            fontSize: p.size, fontWeight: 900, color: p.ink,
            lineHeight: 1.2, whiteSpace: 'nowrap',
            WebkitTextStroke: `${p.size * 0.05}px ${p.outline}`,
            paintOrder: 'stroke fill',
            textShadow: shadow,
            filter: `drop-shadow(0 6px 14px rgba(0,0,0,0.22)) drop-shadow(0 22px 44px rgba(0,0,0,0.28))${sm.blurPx > 0.3 ? ` blur(${sm.blurPx.toFixed(2)}px)` : ''}`,
            opacity: clamp01(land * 3),
            transform:
              `${pose} `
              + `translateY(${((1 - clamp01(land)) * -p.drop).toFixed(2)}px) `
              + `rotate(${p.lean}deg) `
              + `scale(${(sx * sm.sx).toFixed(4)}, ${(sy * sm.sy).toFixed(4)})`,
            ...el('sticker'),
          }}
        >
          {lines.map((line, i) => (
            <span key={i} style={{ display: 'block' }}>{line}</span>
          ))}
        </span>
      </div>
    );
  },
});
