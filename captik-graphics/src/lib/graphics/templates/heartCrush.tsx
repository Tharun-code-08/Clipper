// Reference: social/heart-crush-button.mp4  (window 720-4280ms, whole sequence ~3280ms)
// Three staged beats on one heart: the disc and outline pop in, the outline FILLS, then the heart
// CRACKS and the two halves separate. Each beat is an independent spring reading off timeMs, and
// the halves are two clipped copies of the same path so the break line stays exact.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, fr, rgba } from '../motion';
import { depthPose, shakeDecay, smear, vel } from '../juice';

// A single heart, drawn once and reused for the outline, the fill and both halves.
const HEART = 'M50 88C50 88 8 62 8 34.5 8 19.9 19.4 9 33 9c8 0 14 4 17 9.5C53 13 59 9 67 9c13.6 0 25 10.9 25 25.5C92 62 50 88 50 88Z';

export const heartCrush = defineGraphicsTemplate({
  id: 'heart_crush',
  name: 'Heart Crush',
  category: 'social',
  tags: ['Like', 'Heart', 'Break'],
  design: { w: 460, h: 460 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 51 },
  fonts: ['inter'],

  elements: [
    { key: 'disc',      label: 'Disc' },
    { key: 'heart',     label: 'Heart', hideable: false },
    { key: 'heartLeft', label: 'Left half' },
    { key: 'heartRight', label: 'Right half' },
  ],

  params: [
    { type: 'color',  key: 'disc',   label: 'Disc',        group: 'Style', default: '#17171C' },
    { type: 'color',  key: 'heart',  label: 'Heart',       group: 'Style', default: '#E5484D' },
    { type: 'number', key: 'stroke', label: 'Outline width', group: 'Style', default: 7, min: 2, max: 16, step: 0.5, unit: 'px' },
    { type: 'number', key: 'discPct', label: 'Disc size',  group: 'Style', default: 100, min: 0, max: 100, step: 2, unit: '%' },

    { type: 'number',  key: 'fillAt',  label: 'Fill at',   group: 'Motion', default: 900, min: 100, max: 4000, step: 50, unit: 'ms' },
    { type: 'number',  key: 'crackAt', label: 'Crack at',  group: 'Motion', default: 2200, min: 200, max: 6000, step: 50, unit: 'ms' },
    { type: 'number',  key: 'split',   label: 'Split distance', group: 'Motion', default: 12, min: 0, max: 60, step: 1, unit: 'px' },
    { type: 'boolean', key: 'doCrack', label: 'Break the heart', group: 'Motion', default: true },
  ],

  // A glossy pop as the badge lands, a softer one on the fill beat, and a dry SNAP when the
  // heart cracks — all timed off the same fillAt/crackAt clocks that drive the motion.
  sfx: (p) => [
    { atMs: 80, id: 'pop', gain: 0.45 },
    { atMs: p.fillAt + 80, id: 'pop', gain: 0.6 },
    ...(p.doCrack ? [{ atMs: p.crackAt + 60, id: 'snap', gain: 0.7 }] as const : []),
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const popAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 15, mass: 0.6, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const pop = popAt(timeMs);

    // Fill sweeps in as an opacity + a small heartbeat scale kick.
    const fill = interpolate(timeMs - p.fillAt, [0, 380], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    });
    const beat = 1 + Math.max(0, Math.sin(interpolate(timeMs - p.fillAt, [0, 420], [0, Math.PI], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    }))) * 0.12;

    // Crack: halves ease apart and tip away from each other.
    const crackAt = (ms: number) => (p.doCrack
      ? spring({
          frame: fr(ms - p.crackAt), fps: FPS,
          config: { damping: 22, mass: 0.9, stiffness: 120 },
          durationInFrames: Math.max(1, Math.round(fr(620))),
        })
      : 0);
    const crack = crackAt(timeMs);

    const S = Math.min(width, height);
    const discR = (S / 2) * (p.discPct / 100);
    const heartS = S * 0.52;
    const dx = crack * p.split;
    const rot = crack * 7;

    // DEPTH + BLUR: the badge arrives through 3D space on its own entrance spring and never
    // flattens back — a soft ±1.8° sway keeps the disc living. The entrance zoom velocity smears
    // the whole badge for the frames it is actually moving; the crack impact kicks a tiny
    // decaying settle-shake, and each half carries a directional smear while it travels.
    const pose = depthPose(timeMs, seed, { enter: pop, rx: -16, z: -90, swayDeg: 1.8 });
    const popSmear = smear(0, vel((ms: number) => 0.6 + 0.4 * popAt(ms), timeMs) * S * 0.5);
    const vHalf = vel(crackAt, timeMs) * (p.split + heartS * 0.14);
    const halfSmear = smear(vHalf, 0);
    const crackShk = shakeDecay(timeMs, p.crackAt + 120, S * 0.012, { seed });

    // Soft bloom as the fill lands, layered under the crack's drop shadow.
    const heartFilter = [
      fill > 0.02 ? `drop-shadow(0 0 ${(S * 0.05 * fill).toFixed(2)}px ${rgba(p.heart, 0.32)})` : '',
      crack > 0.02 ? `drop-shadow(0 ${(crack * S * 0.02).toFixed(2)}px ${(crack * S * 0.05).toFixed(2)}px ${rgba('#000000', 0.3)})` : '',
    ].filter(Boolean).join(' ');

    const half = (side: 'l' | 'r') => (
      <svg
        width={heartS} height={heartS} viewBox="0 0 100 96" aria-hidden="true"
        style={{
          position: 'absolute', left: '50%', top: '50%',
          marginLeft: -heartS / 2, marginTop: -heartS / 2,
          filter: halfSmear.blurPx > 0.3 ? `blur(${halfSmear.blurPx.toFixed(2)}px)` : undefined,
          transform:
            `translateX(${(side === 'l' ? -dx : dx).toFixed(3)}px) ` +
            `rotate(${(side === 'l' ? -rot : rot).toFixed(3)}deg) ` +
            `scale(${(beat * halfSmear.sx).toFixed(4)}, ${(beat * halfSmear.sy).toFixed(4)})`,
          transformOrigin: side === 'l' ? '100% 50%' : '0% 50%',
          ...(side === 'l' ? el('heartLeft') : el('heartRight')),
          // A slightly jagged break line rather than a straight cut.
          clipPath: side === 'l'
            ? 'polygon(0% 0%, 52% 0%, 45% 22%, 55% 44%, 46% 68%, 52% 100%, 0% 100%)'
            : 'polygon(52% 0%, 100% 0%, 100% 100%, 52% 100%, 46% 68%, 55% 44%, 45% 22%)',
        }}
      >
        <path d={HEART} fill={p.heart} opacity={fill} />
        <path d={HEART} fill="none" stroke={p.heart} strokeWidth={p.stroke} strokeLinejoin="round" />
      </svg>
    );

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          opacity: interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
          filter: popSmear.blurPx > 0.3 ? `blur(${popSmear.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} scale(${(interpolate(pop, [0, 1], [0.6, 1]) * popSmear.sx).toFixed(4)}, ${(interpolate(pop, [0, 1], [0.6, 1]) * popSmear.sy).toFixed(4)})`,
          transformOrigin: 'center center',
        }}
      >
        {p.discPct > 0 && (
          <div
            style={{
              position: 'absolute', left: '50%', top: '50%',
              width: discR * 2, height: discR * 2,
              marginLeft: -discR, marginTop: -discR,
              borderRadius: '50%', background: p.disc,
              border: '1px solid rgba(255,255,255,0.13)',
              boxSizing: 'border-box',
              boxShadow: `0 ${(S * 0.055).toFixed(1)}px ${(S * 0.16).toFixed(1)}px ${rgba('#000000', 0.45)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
              ...el('disc'),
            }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, filter: heartFilter || undefined, transform: `translate(${crackShk.x.toFixed(2)}px, ${crackShk.y.toFixed(2)}px)`, ...el('heart') }}>
          {half('l')}
          {half('r')}
        </div>
      </div>
    );
  },
});
