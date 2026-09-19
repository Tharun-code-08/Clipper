// Reference: ui-elements/progress-style loaders.
// Every part arrives on its own spring — label, percent readout and track are staggered, and the
// track WIPES open rather than fading, so it reads as a container being drawn before anything
// fills it. The fill only starts once the track has landed, so progress never runs ahead of the
// thing containing it.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGlow } from '../luxe';
import { smear, swingIn, sway3d, vel } from '../juice';

export const progressBar = defineGraphicsTemplate({
  id: 'progress_bar',
  name: 'Progress Bar',
  category: 'chart',
  tags: ['Progress', 'Loader', 'UI'],
  design: { w: 900, h: 150 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 84, widthPercent: 80 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'label',   label: 'Label' },
    { key: 'percent', label: 'Percent readout', hideable: false },
    { key: 'track',   label: 'Track', hideable: false },
    { key: 'fill',    label: 'Fill', hideable: false },
  ],

  params: [
    { type: 'text',    key: 'label',   label: 'Label',        group: 'Content', default: 'Rendering your video', maxLength: 48 },
    { type: 'boolean', key: 'percent', label: 'Show percent', group: 'Content', default: true },

    { type: 'number', key: 'from', label: 'Start at', group: 'Progress', default: 0,   min: 0, max: 100, step: 1, unit: '%' },
    { type: 'number', key: 'to',   label: 'End at',   group: 'Progress', default: 100, min: 0, max: 100, step: 1, unit: '%' },
    { type: 'select', key: 'curve', label: 'Pacing',  group: 'Progress', default: 'ease',
      options: [
        { value: 'linear', label: 'Steady' },
        { value: 'ease',   label: 'Ease out' },
        { value: 'stall',  label: 'Fast then stall' },
      ] },

    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'montserrat' },
    { type: 'color',  key: 'fill',   label: 'Bar',        group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'track',  label: 'Track',      group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',    label: 'Text',       group: 'Style', default: '#F4F1E8' },
    { type: 'number', key: 'thick',  label: 'Thickness',  group: 'Style', default: 26, min: 6,  max: 70, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',     group: 'Style', default: 40, min: 0,  max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'glow',   label: 'Bar glow',   group: 'Style', default: 0.5, min: 0, max: 1, step: 0.05 },

    { type: 'number', key: 'inMs',    label: 'Entrance',        group: 'Motion', default: 420, min: 100, max: 1500, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Element stagger', group: 'Motion', default: 90, min: 0, max: 400, step: 10, unit: 'ms' },
  ],

  // Quiet UI palette: one swish as the strip arrives, one tick as the fill starts — both off
  // the same stagger/inMs clock the beats use. No completion payoff: the fill lands exactly at
  // clip end (a function of durationMs, which cues cannot know), so a final chime would clip.
  sfx: (p) => [
    { atMs: 40, id: 'swish', gain: 0.4 },
    { atMs: 2 * p.stagger + p.inMs * 0.5, id: 'tick', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const beat = (i: number) => {
      const s = spring({
        frame: fr(timeMs - i * p.stagger), fps: FPS,
        config: { damping: 26, mass: 0.6, stiffness: 180 },
        durationInFrames: Math.max(1, Math.round(fr(p.inMs))),
      });
      return {
        s,
        opacity: interpolate(s, [0, 0.55], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateY(${((1 - s) * height * 0.12).toFixed(3)}px)`,
      };
    };
    const labelIn = beat(0);
    const pctIn = beat(1);
    const trackIn = beat(2);

    const t0 = 2 * p.stagger + p.inMs * 0.5;
    // Percent as a pure function of any millisecond, so vel() can sample the fill's speed.
    const pctOf = (ms: number) => {
      const raw = clamp01((ms - t0) / Math.max(1, durationMs - t0));
      const eased =
        p.curve === 'linear' ? raw
        : p.curve === 'ease' ? interpolate(raw, [0, 1], [0, 1], { easing: Easing.out(Easing.cubic) })
        : interpolate(raw, [0, 0.35, 1], [0, 0.85, 1], { easing: Easing.out(Easing.quad) });
      return p.from + (p.to - p.from) * eased;
    };
    const pct = pctOf(timeMs);
    // Velocity smear on the big mover: the fill's leading edge blurs and stretches with its
    // own speed (strongest on the "fast then stall" burst) and lands crisp when it settles.
    const vFill = vel(pctOf, timeMs) * 0.01 * width;
    const sm = smear(vFill, 0);
    const fs = Math.round(p.thick * 1.15);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: p.thick * 0.7,
          fontFamily: fontStack(p.font),
          // Resting 3D sway — the held strip keeps living in space instead of flattening out.
          transform: sway3d(timeMs, seed, 1.5),
          transformOrigin: '50% 50%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span
            style={{
              fontSize: Math.round(fs * 0.82), fontWeight: 600, color: rgba(p.ink, 0.62),
              letterSpacing: '0.16em', textTransform: 'uppercase',
              opacity: labelIn.opacity,
              // Z-stagger: label, readout and track each swing in from a slightly different angle.
              transform: `${swingIn(Math.min(1, labelIn.s), { rx: -14, z: -60 })} ${labelIn.transform}`,
              ...el('label'),
            }}
          >
            {p.label}
          </span>
          {p.percent && (
            <span
              style={{
                marginLeft: 'auto', fontSize: fs, fontWeight: 700, color: p.fill,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em',
                textShadow: luxeGlow(p.fill, 0.55),
                opacity: pctIn.opacity,
                transform: `${swingIn(Math.min(1, pctIn.s), { rx: -18, z: -70 })} ${pctIn.transform}`,
                ...el('percent'),
              }}
            >
              {Math.round(pct)}%
            </span>
          )}
        </div>

        <div
          style={{
            width: '100%', height: p.thick, borderRadius: p.radius,
            background: `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(255,255,255,0.03) 100%), ${p.track}`,
            border: '1px solid rgba(255,255,255,0.13)',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            clipPath: `inset(0 ${((1 - trackIn.s) * 100).toFixed(2)}% 0 0 round ${p.radius}px)`,
            opacity: trackIn.opacity,
            // Side-hinged: the container swings open from the left, the direction its wipe travels.
            transform: swingIn(Math.min(1, trackIn.s), { ry: -16, z: -60 }),
            transformOrigin: 'left center',
            ...el('track'),
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, pct))}%`,
              height: '100%',
              borderRadius: p.radius,
              background: `linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.18) 100%), ${p.fill}`,
              boxShadow: p.glow > 0
                ? `0 0 ${p.thick * p.glow * 2}px ${rgba(p.fill, 0.55 * p.glow)}, inset 0 1px 0 rgba(255,255,255,0.25)`
                : 'inset 0 1px 0 rgba(255,255,255,0.25)',
              filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
              transform: sm.blurPx > 0.3 ? `scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})` : undefined,
              transformOrigin: 'left center',
              ...el('fill'),
            }}
          />
        </div>
      </div>
    );
  },
});
