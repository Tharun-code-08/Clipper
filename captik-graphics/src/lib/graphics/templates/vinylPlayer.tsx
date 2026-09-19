// Reference: social/spinning-vinyl-player-1.mp4  (3.4s, already playing at frame 0)
// A turntable: the platter spins continuously, the tonearm swings down onto the record and then
// creeps inward as it "plays". Three independent clocks — the deck arrives on a spring, the record
// spins on a modulo, and the arm has its own drop-then-track motion.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax } from '../juice';

export const vinylPlayer = defineGraphicsTemplate({
  id: 'vinyl_player',
  name: 'Vinyl Player',
  category: 'social',
  tags: ['Music', 'Record', 'Turntable'],
  design: { w: 620, h: 620 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 51, widthPercent: 82 },
  fonts: ['inter'],

  elements: [
    { key: 'deck',   label: 'Deck', hideable: false },
    { key: 'record', label: 'Record', hideable: false },
    { key: 'arm',    label: 'Tonearm' },
    { key: 'spindle', label: 'Spindle' },
  ],

  params: [
    { type: 'image', key: 'art', label: 'Record art', group: 'Content', default: '' },

    { type: 'color',  key: 'deck',   label: 'Deck',    group: 'Style', default: '#17171C' },
    { type: 'color',  key: 'record', label: 'Record',  group: 'Style', default: '#1b1b1e' },
    { type: 'color',  key: 'arm',    label: 'Tonearm', group: 'Style', default: '#D97706' },
    { type: 'number', key: 'radius', label: 'Deck corner', group: 'Style', default: 40, min: 0, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'discPct', label: 'Record size', group: 'Style', default: 84, min: 40, max: 100, step: 2, unit: '%' },
    { type: 'number', key: 'shadow', label: 'Shadow',  group: 'Style', default: 0.22, min: 0, max: 0.5, step: 0.01 },

    { type: 'number',  key: 'spinMs', label: 'Rotation period', group: 'Motion', default: 3600, min: 800, max: 12000, step: 100, unit: 'ms' },
    { type: 'number',  key: 'armAt',  label: 'Arm drops at',    group: 'Motion', default: 500, min: 0, max: 4000, step: 50, unit: 'ms' },
    { type: 'boolean', key: 'reverse', label: 'Spin backwards', group: 'Motion', default: false },
  ],

  // This template DEPICTS music we cannot provide, so no musical cues — physical sounds only:
  // a soft pop as the deck lands, a dry snap when the needle meets the groove (armAt retimes it).
  sfx: (p) => [
    { atMs: 260, id: 'pop' as const, gain: 0.35 },
    { atMs: p.armAt + 620, id: 'snap' as const, gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const inRamp = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 24, mass: 0.75, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });

    const dir = p.reverse ? -1 : 1;
    const spin = ((timeMs / p.spinMs) % 1) * 360 * dir;

    // Arm: drops onto the outer groove, then creeps inward across the rest of the clip.
    const drop = spring({
      frame: fr(timeMs - p.armAt), fps: FPS,
      config: { damping: 26, mass: 0.9, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const track = clamp01((timeMs - p.armAt - 700) / Math.max(1, durationMs - p.armAt - 700));
    const armDeg = interpolate(drop, [0, 1], [-26, -2]) + interpolate(track, [0, 1], [0, 11], { easing: Easing.inOut(Easing.quad) });

    const S = Math.min(width, height);
    const discR = (S / 2) * (p.discPct / 100) * 0.86;
    const cx = width * 0.44;
    const cy = height / 2;

    // DEPTH: the deck swings in through 3D and then keeps living on a gentle ±1.2° sway. The
    // platter assembly (record + spindle share ONE depth — they are one physical unit) and the
    // tonearm sit at different depths, so the sway shears them: the arm genuinely floats above
    // the record.
    const pose = depthPose(timeMs, seed, { enter: inRamp, rx: -12, z: -80, swayDeg: 1.2 });
    const parPlatter = parallax(timeMs, seed, 0.25, S * 0.008);
    const parArm = parallax(timeMs, seed, 0.55, S * 0.008);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, ${rgba('#ffffff', 0.05)} 0%, ${rgba('#ffffff', 0)} 44%), ${p.deck}`,
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: p.radius,
          boxShadow: p.shadow > 0
            ? `0 ${S * 0.03}px ${S * 0.09}px ${rgba('#000000', p.shadow)}, 0 ${S * 0.1}px ${S * 0.24}px ${rgba('#000000', p.shadow * 0.9)}, inset 0 1px 0 rgba(255,255,255,0.05)`
            : 'inset 0 1px 0 rgba(255,255,255,0.05)',
          opacity: interpolate(inRamp, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          transform: `${pose} scale(${interpolate(inRamp, [0, 1], [0.9, 1]).toFixed(4)})`,
          transformOrigin: 'center center',
          overflow: 'hidden',
          ...el('deck'),
        }}
      >
        {/* Record */}
        <div
          style={{
            position: 'absolute', left: cx - discR, top: cy - discR,
            width: discR * 2, height: discR * 2, borderRadius: '50%',
            background: p.record, overflow: 'hidden',
            // Depth kept symmetric (no offset) so it stays true under the rotation.
            boxShadow: `0 0 ${Math.round(discR * 0.28)}px ${rgba('#000000', 0.4)}, inset 0 0 0 1px rgba(255,255,255,0.05)`,
            transform: `translate(${parPlatter.x.toFixed(2)}px, ${parPlatter.y.toFixed(2)}px) rotate(${spin.toFixed(3)}deg)`,
            ...el('record'),
          }}
        >
          {p.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: 'conic-gradient(from 0deg, #D97706, #57503F, #E9DFC8, #33302A, #D97706)' }} />
          )}
          {/* groove rings */}
          <div style={{ position: 'absolute', inset: '12%', borderRadius: '50%', border: `${Math.max(1, discR * 0.012)}px solid ${rgba('#000000', 0.2)}` }} />
          <div style={{ position: 'absolute', inset: '26%', borderRadius: '50%', border: `${Math.max(1, discR * 0.01)}px solid ${rgba('#000000', 0.16)}` }} />
        </div>

        {/* Spindle */}
        <div
          style={{
            position: 'absolute', left: cx - discR * 0.11, top: cy - discR * 0.11,
            width: discR * 0.22, height: discR * 0.22, borderRadius: '50%',
            background: '#2b2b31',
            boxShadow: `0 0 0 ${discR * 0.03}px ${rgba('#F4F1E8', 0.32)}`,
            transform: `translate(${parPlatter.x.toFixed(2)}px, ${parPlatter.y.toFixed(2)}px)`,
            ...el('spindle'),
          }}
        />

        {/* Tonearm — pivots from the top-right corner. */}
        <div
          style={{
            position: 'absolute',
            right: width * 0.08, top: height * 0.14,
            width: S * 0.045, height: S * 0.045, borderRadius: '50%',
            background: p.arm,
            boxShadow: `0 ${(S * 0.01).toFixed(1)}px ${(S * 0.03).toFixed(1)}px ${rgba('#000000', 0.4)}`,
            transform: `translate(${parArm.x.toFixed(2)}px, ${parArm.y.toFixed(2)}px)`,
            transformOrigin: 'center center',
            opacity: interpolate(inRamp, [0.3, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            ...el('arm'),
          }}
        >
          <div
            style={{
              position: 'absolute', left: '50%', top: '50%',
              width: Math.max(2, S * 0.016), height: S * 0.44,
              marginLeft: -Math.max(1, S * 0.008),
              background: p.arm, borderRadius: S * 0.01,
              transformOrigin: 'top center',
              transform: `rotate(${armDeg.toFixed(3)}deg)`,
            }}
          >
            <div style={{ position: 'absolute', bottom: -S * 0.018, left: '50%', marginLeft: -S * 0.018, width: S * 0.036, height: S * 0.036, borderRadius: S * 0.008, background: p.arm }} />
          </div>
        </div>
      </div>
    );
  },
});
