// Reference: text/extend.mp4  (window 480-7280ms, stack set by ~2280ms then bursts periodically)
// A stack of the same word that periodically tears: the block cants over, one line blows up past
// the frame edge and the rest shear away from it, then everything snaps back to dead straight.
//
// The burst is a modulo on timeMs with a per-line decay, never a CSS keyframe — the export snapshots
// one DOM state per frame, so a keyframed glitch would render as a single frozen pose.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { depthPose, smear, swingIn, vel } from '../juice';

const MAX_LINES = 6;

export const extendStack = defineGraphicsTemplate({
  id: 'extend_stack',
  name: 'Extend Stack',
  category: 'title',
  tags: ['Text', 'Glitch', 'Impact'],
  design: { w: 900, h: 700 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 6800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 90 },
  fonts: ['montserrat'],

  elements: [
    { key: 'stack', label: 'Stack', hideable: false },
    ...Array.from({ length: MAX_LINES }, (_, i) => ({ key: `line${i + 1}`, label: `Line ${i + 1}` })),
  ],

  params: [
    { type: 'text',   key: 'text',  label: 'Word',  group: 'Content', default: 'EXTEND', maxLength: 20 },
    { type: 'number', key: 'lines', label: 'Lines', group: 'Content', default: 3, min: 1, max: 6, step: 1 },

    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'color',  key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'number', key: 'size',   label: 'Size',   group: 'Style', default: 180, min: 20, max: 220, step: 4, unit: 'px' },
    { type: 'number', key: 'weight', label: 'Weight', group: 'Style', default: 800, min: 300, max: 900, step: 100 },
    { type: 'number', key: 'lead',   label: 'Line height', group: 'Style', default: 1.08, min: 0.7, max: 2, step: 0.02 },

    { type: 'number', key: 'firstAt', label: 'First burst at', group: 'Motion', default: 2400, min: 0, max: 5000, step: 50, unit: 'ms' },
    { type: 'number', key: 'every',   label: 'Burst every',    group: 'Motion', default: 2050, min: 300, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'burstMs', label: 'Burst length',   group: 'Motion', default: 900, min: 100, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'blow',    label: 'Blow-up',        group: 'Motion', default: 2, min: 1, max: 6, step: 0.1,
      help: 'How far the picked line scales past the others.' },
    { type: 'number', key: 'cant',    label: 'Cant',           group: 'Motion', default: 2, min: 0, max: 45, step: 1, unit: '°' },
    { type: 'number', key: 'shear',   label: 'Shear',          group: 'Motion', default: 60, min: 0, max: 400, step: 10, unit: 'px' },
    { type: 'number', key: 'grit',    label: 'Glitch split',   group: 'Motion', default: 14, min: 0, max: 60, step: 1, unit: 'px',
      help: 'Channel-split offset that gives the tear its distressed edge.' },
  ],

  // Glitch PUNCH: air as the stack swings in, a produced hit on the first tear, a lighter one on
  // the second — the same firstAt/every clock the bursts run on.
  sfx: (p) => [
    { atMs: 120, id: 'whoosh', gain: 0.45 },
    { atMs: p.firstAt + 80, id: 'slam', gain: 0.7 },
    { atMs: p.firstAt + p.every + 80, id: 'slam', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const n = Math.min(MAX_LINES, Math.round(p.lines));

    const enter = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 22, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });

    // Which burst are we in, and how far through it.
    const since = timeMs - p.firstAt;
    const idx = since < 0 ? -1 : Math.floor(since / p.every);
    const within = since < 0 ? 1 : (since % p.every) / Math.max(1, p.burstMs);
    // One hump: 0 -> 1 -> 0 across the burst, flat outside it.
    const burst = within >= 1 ? 0 : Math.sin(clamp01(within) * Math.PI);
    // Analytic hump velocity in 1/ms — drives the tear's motion smear; exactly zero between
    // bursts, so the straight stack always holds pixel-crisp.
    const dBurst = within >= 1 ? 0 : Math.cos(clamp01(within) * Math.PI) * (Math.PI / Math.max(1, p.burstMs));
    // Whole-block cant, so the tear reads as one event rather than N independent lines.
    const cant = idx < 0 ? 0 : (random(`${seed}c${idx}`) - 0.5) * 2 * p.cant * burst;
    const hero = idx < 0 ? -1 : Math.floor(random(`${seed}h${idx}`) * n);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          opacity: clamp01(enter * 1.6),
          // The stack swings in through 3D on its entrance spring and then never flattens — a
          // ±1.6° sway lives under the cant/crush. The tear spreads sideways, so the block
          // CRUSHES vertically while it does — otherwise a blown-up line just makes the stack
          // taller, which the reference never does.
          transform:
            `${depthPose(timeMs, seed, { enter, rx: -12, z: -80, swayDeg: 1.6 })} `
            + `rotate(${cant.toFixed(2)}deg) scaleY(${(1 - 0.1 * burst).toFixed(3)})`,
          ...el('stack'),
        }}
      >
        {Array.from({ length: n }).map((_, i) => {
          const isHero = i === hero;
          const dir = i < hero ? -1 : i > hero ? 1 : 0;
          const push = dir * p.shear * burst;
          const grow = isHero ? 1 + (p.blow - 1) * burst : 1 - 0.06 * burst;
          // Per-line skew + channel split: the tear has to look DISTRESSED, not merely displaced.
          const skew = idx < 0 ? 0 : (random(`${seed}k${idx}_${i}`) - 0.5) * 2 * 18 * burst;
          const split = p.grit * burst * (0.4 + random(`${seed}g${idx < 0 ? 0 : idx}_${i}`));
          const lineInAt = (ms: number) => spring({
            frame: fr(ms - i * 110), fps: FPS,
            config: { damping: 23, mass: 0.65, stiffness: 175 },
            durationInFrames: Math.max(1, Math.round(fr(520))),
          });
          const lineIn = lineInAt(timeMs);
          // Each line arrives through 3D on its own alternating side hinge, and MOTION BLUR
          // rides the line's total sideways velocity — entrance slide + tear shear + (for the
          // hero) the blow-up's edge speed. Zero between bursts: the tear smears, the hold is
          // crisp.
          const hinge = {
            rx: -8 - random(`${seed}ex${i}`) * 6,
            ry: (i % 2 ? 1 : -1) * (14 + random(`${seed}ey${i}`) * 8),
            z: -90,
          };
          const vIn = vel((ms) => (1 - lineInAt(ms)) * 40, timeMs);
          const vTear = dir * p.shear * dBurst + (isHero ? (p.blow - 1) * dBurst * p.size * 0.5 : 0);
          const sm = smear(vIn + vTear, 0, 2.4);
          return (
            <div
              key={i}
              style={{
                fontSize: p.size, fontWeight: p.weight, color: p.ink,
                lineHeight: p.lead, letterSpacing: -p.size * 0.02,
                whiteSpace: 'nowrap',
                opacity: clamp01(lineIn * 1.7),
                // Misregistration split in the house palette — champagne gold one way, marker
                // red the other — so the tear stays distressed without going neon.
                textShadow: split > 0.4
                  ? `${split.toFixed(1)}px 0 0 rgba(227,195,119,0.8), ${(-split).toFixed(1)}px 0 0 rgba(229,72,77,0.65)`
                  : undefined,
                filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                transform:
                  `${swingIn(lineIn, hinge)} `
                  + `translateX(${(push + (1 - lineIn) * 40).toFixed(2)}px) `
                  + `skewX(${skew.toFixed(2)}deg) `
                  + `scale(${(grow * sm.sx).toFixed(3)}, ${((1 + (grow - 1) * 0.12) * sm.sy).toFixed(3)})`,
                ...el(`line${i + 1}`),
              }}
            >
              {p.text}
            </div>
          );
        })}
      </div>
    );
  },
});
