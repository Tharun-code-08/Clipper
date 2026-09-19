// Reference: overlays/thinking.mp4 (window 0-3440ms, settled ~1480ms) and the same treatment in
// social/instagram-logo-animation.mp4, social/photoshop-animation-1.mp4,
// social/premiere-pro-animation.mp4 — one shape, one coloured bloom, four recordings.
//
// A mark punches in and lights a coloured bloom behind itself, then breathes. The bloom peaks a
// beat AFTER the mark lands rather than with it, which is what reads as "it switched on" instead of
// "it faded up".

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

export const iconGlow = defineGraphicsTemplate({
  id: 'icon_glow',
  name: 'Icon Glow',
  category: 'fx',
  tags: ['Logo', 'Glow', 'Bloom'],
  design: { w: 900, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 33 },
  fonts: ['inter'],

  elements: [
    { key: 'mark',  label: 'Mark', hideable: false },
    { key: 'bloom', label: 'Bloom' },
    { key: 'tile',  label: 'Tile' },
  ],

  params: [
    { type: 'text',  key: 'glyph', label: 'Glyph', group: 'Content', default: '🧠', maxLength: 4,
      help: 'An emoji or a letter. Ignored when an image is supplied.' },
    { type: 'image', key: 'image', label: 'Image', group: 'Content', default: '' },

    { type: 'color',  key: 'glow',  label: 'Bloom',  group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'tile',  label: 'Tile',   group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Mark size', group: 'Style', default: 300, min: 60, max: 700, step: 10, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Tile corner', group: 'Style', default: 90, min: 0, max: 360, step: 4, unit: 'px' },
    { type: 'number', key: 'spread', label: 'Bloom spread', group: 'Style', default: 1.9, min: 0.5, max: 4, step: 0.1 },
    { type: 'number', key: 'strength', label: 'Bloom strength', group: 'Style', default: 0.75, min: 0, max: 1, step: 0.05 },
    { type: 'select', key: 'shape', label: 'Backing', group: 'Style', default: 'none', options: [
      { value: 'none',   label: 'None' },
      { value: 'tile',   label: 'Rounded tile' },
      { value: 'circle', label: 'Circle' },
    ] },

    { type: 'number', key: 'inAt',    label: 'Mark at',    group: 'Motion', default: 80, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'bloomAt', label: 'Bloom at',   group: 'Motion', default: 320, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'breathe', label: 'Breathe',    group: 'Motion', default: 0.06, min: 0, max: 0.4, step: 0.01 },
    { type: 'number', key: 'period',  label: 'Breath period', group: 'Motion', default: 1900, min: 300, max: 6000, step: 50, unit: 'ms' },
  ],

  // A glossy pop as the mark punches in, a soft chime as the bloom catches up and "switches on" —
  // keyed off the same inAt/bloomAt the two springs use.
  sfx: (p) => [
    { atMs: p.inAt + 180, id: 'pop', gain: 0.55 },
    { atMs: p.bloomAt + 260, id: 'chime', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);

    // A closure of absolute ms so vel() can sample the same punch for the motion smear.
    const popAt = (ms: number) => spring({
      frame: fr(ms - p.inAt), fps: FPS,
      config: { damping: 15, mass: 0.7, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    const pop = popAt(timeMs);
    // Deliberately behind the mark: the bloom catching up is the "switched on" read.
    const lit = spring({
      frame: fr(timeMs - p.bloomAt), fps: FPS,
      config: { damping: 30, mass: 0.9, stiffness: 110 },
      durationInFrames: Math.max(1, Math.round(fr(900))),
    });
    const breathe = 1 + p.breathe * Math.sin((timeMs / Math.max(1, p.period)) * Math.PI * 2);

    const box = p.size * 1.16;

    // DEPTH: the mark punches in through 3D (top hinge, overshoot from the same spring) and then
    // never flattens back — a ±1.6° sway keeps it living while bloom and copy bars parallax at
    // different depths against it.
    const pose = depthPose(timeMs, seed, { enter: pop, rx: -14, z: -80, swayDeg: 1.6 });
    const parBloom = parallax(timeMs, seed, 0.3, p.size * 0.05);
    const parBars = parallax(timeMs, seed, 0.55, p.size * 0.05);
    // MOTION BLUR: punch-zoom velocity at the mark's edge — smears the arrival, lands crisp.
    const vPop = vel((ms) => interpolate(popAt(ms), [0, 1], [0.5, 1]), timeMs) * box;
    const smPop = smear(0, vPop, 1.1);

    // Faint copy blocks that fade up around the mark a beat after the bloom, as in the reference.
    const linesIn = interpolate(timeMs, [p.bloomAt + 500, p.bloomAt + 1400], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const bar = (w: number, k: number) => (
      <div
        key={k}
        style={{
          width: `${w}%`, height: p.size * 0.11, borderRadius: p.size * 0.06,
          background: rgba(p.tile, 0.30),
        }}
      />
    );

    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff }}>
        <div
          style={{
            position: 'absolute', left: '18%', right: '18%', top: '4%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: p.size * 0.13,
            opacity: linesIn * 0.9,
            transform: `translate(${parBars.x.toFixed(2)}px, ${parBars.y.toFixed(2)}px)`,
          }}
        >
          {[86, 62].map((w, k) => bar(w, k))}
        </div>
        <div
          style={{
            position: 'absolute', left: '14%', right: '14%', bottom: '4%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: p.size * 0.13,
            opacity: linesIn * 0.9,
            transform: `translate(${parBars.x.toFixed(2)}px, ${parBars.y.toFixed(2)}px)`,
          }}
        >
          {[96, 74, 48].map((w, k) => bar(w, k))}
        </div>

        <div
          style={{
            position: 'absolute',
            width: p.size * p.spread, height: p.size * p.spread, borderRadius: '50%',
            background: `radial-gradient(circle, ${rgba(p.glow, 0.85 * p.strength)} 0%, ${rgba(p.glow, 0.35 * p.strength)} 38%, ${rgba(p.glow, 0)} 70%)`,
            opacity: clamp01(lit) * breathe,
            transform: `translate(${parBloom.x.toFixed(2)}px, ${parBloom.y.toFixed(2)}px) scale(${(0.7 + 0.3 * lit).toFixed(3)})`,
            ...el('bloom'),
          }}
        />

        <div
          style={{
            position: 'relative',
            width: p.shape === 'none' ? undefined : box,
            height: p.shape === 'none' ? undefined : box,
            borderRadius: p.shape === 'circle' ? '50%' : p.radius,
            background: p.shape === 'none' ? undefined : p.tile,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: p.shape === 'none' ? undefined : 'hidden',
            boxShadow: p.shape === 'none' ? undefined : `0 0 ${width * 0.06}px ${rgba(p.glow, 0.55 * p.strength * clamp01(lit))}`,
            opacity: clamp01(pop * 1.8),
            filter: smPop.blurPx > 0.3 ? `blur(${smPop.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} scale(${(interpolate(pop, [0, 1], [0.5, 1]) * breathe * smPop.sx).toFixed(4)}, ${(interpolate(pop, [0, 1], [0.5, 1]) * breathe * smPop.sy).toFixed(4)})`,
            ...el('tile'),
          }}
        >
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', ...el('mark') }} />
          ) : (
            <span
              style={{
                fontSize: p.size, lineHeight: 1,
                filter: `drop-shadow(0 0 ${width * 0.035}px ${rgba(p.glow, 0.8 * p.strength * clamp01(lit))})`,
                ...el('mark'),
              }}
            >
              {p.glyph}
            </span>
          )}
        </div>
      </div>
    );
  },
});
