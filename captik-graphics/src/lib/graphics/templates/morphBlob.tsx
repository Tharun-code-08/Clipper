// Reference: logos/animated-blob.mp4  (window 440-8240ms, shape settles ~3000ms then keeps moving)
// An organic blob that never stops changing shape while its duotone gradient slowly breathes
// between its two colours (hue cycling is available but defaults off).
//
// The morph is eight border-radius percentages driven by out-of-phase sines. That is the whole
// trick: an SVG path morph needs matched vertex counts and a tween library, and a CSS keyframe
// blob would render as one frozen shape on export. Sines off timeMs are pure, cheap, and never
// repeat exactly because the periods are mutually irrational-ish.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { parallax, smear, sway3d, vel } from '../juice';

const MAX_SPECKS = 14;

export const morphBlob = defineGraphicsTemplate({
  id: 'morph_blob',
  name: 'Morph Blob',
  category: 'fx',
  tags: ['Blob', 'Organic', 'Gradient'],
  design: { w: 900, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 8000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'blob',   label: 'Blob', hideable: false },
    { key: 'sheen',  label: 'Highlight' },
    { key: 'specks', label: 'Specks' },
  ],

  params: [
    { type: 'color',  key: 'a',    label: 'Colour A', group: 'Style', default: '#D97706' },
    { type: 'color',  key: 'b',    label: 'Colour B', group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'size', label: 'Size',     group: 'Style', default: 530, min: 100, max: 880, step: 10, unit: 'px' },
    { type: 'number', key: 'blur', label: 'Softness', group: 'Style', default: 6, min: 0, max: 60, step: 2, unit: 'px' },
    { type: 'number', key: 'glow', label: 'Glow',     group: 'Style', default: 60, min: 0, max: 180, step: 4, unit: 'px' },
    { type: 'boolean', key: 'sheen', label: 'Highlight', group: 'Style', default: true },
    { type: 'boolean', key: 'specks', label: 'Floating specks', group: 'Style', default: true },

    { type: 'number', key: 'morphMs', label: 'Morph period', group: 'Motion', default: 3600, min: 400, max: 12000, step: 100, unit: 'ms' },
    { type: 'number', key: 'hueMs',   label: 'Colour period', group: 'Motion', default: 5200, min: 400, max: 20000, step: 100, unit: 'ms' },
    { type: 'number', key: 'wander',  label: 'Wander',        group: 'Motion', default: 30, min: 0, max: 200, step: 2, unit: 'px' },
    { type: 'number', key: 'amount',  label: 'Morph amount',  group: 'Motion', default: 40, min: 0, max: 40, step: 1, unit: '%' },
    { type: 'number', key: 'hueSpin', label: 'Hue cycling',   group: 'Motion', default: 0, min: 0, max: 720, step: 10, unit: '°',
      help: 'Degrees the whole blob walks around the colour wheel each colour period. 0 keeps your two picks.' },
    { type: 'number', key: 'squash',  label: 'Squash',        group: 'Motion', default: 0.32, min: 0, max: 0.6, step: 0.02,
      help: 'How much the blob stretches and flattens as it morphs.' },
  ],

  // Pure ambience — the only beat it has is the inflate-in, which earns one soft air pass.
  sfx: () => [
    { atMs: 80, id: 'whoosh', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const w = (timeMs / Math.max(1, p.morphMs)) * Math.PI * 2;
    // Eight radii, each on its own phase — the corners never agree, so the outline keeps moving.
    const r = (k: number) => (50 + Math.sin(w * (0.7 + k * 0.13) + k * 1.9) * p.amount).toFixed(2);
    const radius =
      `${r(0)}% ${r(1)}% ${r(2)}% ${r(3)}% / ${r(4)}% ${r(5)}% ${r(6)}% ${r(7)}%`;

    // Colour walks A -> B -> A rather than through a hue wheel, so a user's two picks are honoured.
    const mix = 0.5 + 0.5 * Math.sin((timeMs / Math.max(1, p.hueMs)) * Math.PI * 2);
    const angle = (timeMs / Math.max(1, p.hueMs)) * 140;
    // ...and, when hue cycling is dialled up, the whole thing walks the wheel on top as well —
    // off by default so the duotone stays in its lane.
    const hue = ((timeMs / Math.max(1, p.hueMs)) * p.hueSpin) % 360;
    // The outline is not the only thing moving: the blob stretches and flattens out of phase with
    // its corners, so it never settles into a rounded square.
    const stretchX = 1 + Math.sin(w * 0.53 + 0.7) * p.squash;
    const stretchY = 1 - Math.sin(w * 0.47) * p.squash;

    const dx = Math.cos(w * 0.42) * p.wander;
    const dy = Math.sin(w * 0.31) * p.wander;

    // A closure of absolute ms so vel() can sample the same inflate for the motion smear.
    const growAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 20, mass: 0.9, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(760))),
    });
    const grow = growAt(timeMs);
    // MOTION BLUR: inflate velocity at the blob's rim — the entrance smears, then the only blur
    // left is the user's own Softness. Dies as the spring parks.
    const vGrow = vel((ms) => interpolate(growAt(ms), [0, 1], [0.4, 1]), timeMs) * p.size * 0.5;
    const smGrow = smear(0, vGrow, 1);
    // DEPTH: subtle system sway (~2°, rotations only) + the sheen parallaxing over the swaying
    // body — the highlight shears against the gradient like light on a turning surface.
    const swayPose = sway3d(timeMs, seed, 2);
    const parSheen = parallax(timeMs, seed, 0.5, p.size * 0.04);

    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {p.specks && (
          <div style={{ position: 'absolute', inset: 0, ...el('specks') }}>
            {Array.from({ length: MAX_SPECKS }).map((_, i) => {
              const sx = random(`${seed}sx${i}`);
              const sy = random(`${seed}sy${i}`);
              const ph = random(`${seed}sp${i}`) * Math.PI * 2;
              const d = 3 + random(`${seed}sd${i}`) * 5;
              const tint = i % 2 === 0 ? p.a : p.b;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${6 + sx * 88}%`, top: `${6 + sy * 88}%`,
                    width: d, height: d, borderRadius: '50%',
                    background: tint,
                    opacity: clamp01(grow) * (0.35 + 0.4 * Math.sin(timeMs / 900 + ph)),
                    transform: `translateY(${(Math.sin(timeMs / 1600 + ph) * height * 0.02).toFixed(2)}px)`,
                  }}
                />
              );
            })}
          </div>
        )}

        <div
          style={{
            position: 'relative',
            // Standing slightly taller than it is wide: the reference blob is an upright amoeba.
            width: p.size, height: p.size * 1.22,
            borderRadius: radius,
            background: `linear-gradient(${angle.toFixed(1)}deg, ${p.a}, ${p.b})`,
            filter: `${p.blur > 0 ? `blur(${p.blur}px) ` : ''}${smGrow.blurPx > 0.3 ? `blur(${smGrow.blurPx.toFixed(2)}px) ` : ''}hue-rotate(${hue.toFixed(1)}deg)`,
            boxShadow: p.glow > 0
              ? `0 0 ${p.glow}px ${rgba(mix > 0.5 ? p.a : p.b, 0.45)}, 0 0 ${p.glow * 2.2}px ${rgba(p.b, 0.22)}`
              : undefined,
            opacity: clamp01(grow * 1.4),
            transform:
              `${swayPose} translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) `
              + `scale(${(stretchX * interpolate(grow, [0, 1], [0.4, 1]) * smGrow.sx).toFixed(4)}, `
              + `${(stretchY * interpolate(grow, [0, 1], [0.4, 1]) * smGrow.sy).toFixed(4)})`,
            ...el('blob'),
          }}
        >
          {p.sheen && (
            <div
              style={{
                position: 'absolute',
                left: '26%', top: '22%',
                width: p.size * 0.24, height: p.size * 0.16,
                borderRadius: '50%',
                background: rgba('#F4F1E8', 0.28),
                filter: `blur(${Math.max(4, width * 0.012)}px)`,
                transform: `translate(${parSheen.x.toFixed(2)}px, ${parSheen.y.toFixed(2)}px)`,
                ...el('sheen'),
              }}
            />
          )}
        </div>
      </div>
    );
  },
});
