// Reference: social/on-off-toggle.mp4  (window 600-5280ms, full cycle ~3000ms)
// A large switch that flips ON and then back OFF, with a green bloom while it is on and a label
// underneath that changes with it. Distinct from alarm_toggle, which is a settings ROW (time +
// label + small switch) — this one is the switch as the subject.
//
// Four independent clocks: the switch fades up, the knob travels on a spring, the track colour
// cross-fades, and the bloom breathes.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

function mix(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const s = h.replace('#', '');
    const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}

export const onOffToggle = defineGraphicsTemplate({
  id: 'on_off_toggle',
  name: 'On / Off Switch',
  category: 'device',
  tags: ['Switch', 'Toggle', 'Reveal'],
  design: { w: 560, h: 400 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 46 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'switch', label: 'Switch', hideable: false },
    { key: 'label',  label: 'Label' },
    { key: 'bloom',  label: 'Glow' },
  ],

  params: [
    { type: 'text',    key: 'onText',  label: 'On label',  group: 'Content', default: 'ON', maxLength: 12 },
    { type: 'text',    key: 'offText', label: 'Off label', group: 'Content', default: 'OFF', maxLength: 12 },
    { type: 'boolean', key: 'showLabel', label: 'Show label', group: 'Content', default: true },

    { type: 'color',  key: 'onCol',  label: 'On',    group: 'Style', default: '#4ADE80' },
    { type: 'color',  key: 'offCol', label: 'Off',   group: 'Style', default: '#2E2E35' },
    { type: 'color',  key: 'ink',    label: 'Label', group: 'Style', default: '#8B8779' },
    { type: 'font',   key: 'font',   label: 'Font',  group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Label size', group: 'Style', default: 44, min: 10, max: 80, step: 1, unit: 'px' },
    { type: 'number', key: 'bloom',  label: 'Glow',  group: 'Style', default: 0.75, min: 0, max: 1, step: 0.05 },

    { type: 'number',  key: 'onAt',  label: 'Switch on at',  group: 'Motion', default: 900, min: 100, max: 5000, step: 50, unit: 'ms' },
    { type: 'number',  key: 'offAt', label: 'Switch off at', group: 'Motion', default: 2900, min: 200, max: 8000, step: 50, unit: 'ms' },
    { type: 'boolean', key: 'goBack', label: 'Switch back off', group: 'Motion', default: true },
  ],

  // The flips ARE the beats: a light air pass on arrival, a dry mechanical snap when the knob
  // hits ON, a softer one when it drops back OFF — all timed off the same onAt/offAt params.
  sfx: (p) => [
    { atMs: 40, id: 'swish' as const, gain: 0.35 },
    { atMs: p.onAt + 180, id: 'snap' as const, gain: 0.7 },
    ...(p.goBack ? [{ atMs: p.offAt + 180, id: 'snap' as const, gain: 0.5 }] : []),
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);

    const appear = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    // Net position: on ramps to 1, off pulls it back to 0 — as one closure so the knob's
    // velocity can be sampled for motion blur on BOTH flips.
    const posAt = (ms: number) => {
      const on = spring({
        frame: fr(ms - p.onAt), fps: FPS,
        config: { damping: 19, mass: 0.55, stiffness: 190 },
        durationInFrames: Math.max(1, Math.round(fr(360))),
      });
      const off = p.goBack
        ? spring({
            frame: fr(ms - p.offAt), fps: FPS,
            config: { damping: 19, mass: 0.55, stiffness: 190 },
            durationInFrames: Math.max(1, Math.round(fr(360))),
          })
        : 0;
      return clamp01(on - off);
    };
    const pos = posAt(timeMs);

    const trackW = width * 0.72;
    const trackH = trackW * 0.58;
    const knob = trackH * 0.84;
    const travel = trackW - knob - (trackH - knob);
    const squash = 1 + Math.sin(Math.PI * pos) * 0.1;

    // DEPTH: the switch is the SUBJECT — it swings in through space and keeps a near-still 1°
    // sway; the bloom and label sit at their own parallax depths so the sway shears them. The
    // knob smears with its travel velocity and lands crisp in the stop.
    const pose = depthPose(timeMs, seed, { enter: appear, rx: -14, z: -100, swayDeg: 1 });
    const knobSmear = smear(vel((ms: number) => travel * posAt(ms), timeMs), 0);
    const parBloom = parallax(timeMs, seed, 0.35, width * 0.014);
    const parLabel = parallax(timeMs, seed, 0.5, width * 0.014);

    const label = pos > 0.5 ? p.onText : p.offText;
    const bloom = p.bloom * pos;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: height * 0.07,
          fontFamily: ff,
          opacity: interpolate(appear, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
          transform: `${pose} scale(${interpolate(appear, [0, 1], [0.92, 1]).toFixed(4)})`,
          transformOrigin: 'center center',
        }}
      >
        {bloom > 0.01 && (
          <div
            style={{
              position: 'absolute',
              left: '50%', top: '44%',
              width: trackW * 2.9, height: trackW * 2.1,
              marginLeft: -trackW * 1.45, marginTop: -trackW * 1.05,
              borderRadius: '50%',
              background: `radial-gradient(closest-side, ${rgba(p.onCol, 0.6 * bloom)}, ${rgba(p.onCol, 0)})`,
              transform: `translate(${parBloom.x.toFixed(2)}px, ${parBloom.y.toFixed(2)}px)`,
              ...el('bloom'),
            }}
          />
        )}

        <div
          style={{
            position: 'relative',
            width: trackW, height: trackH, borderRadius: trackH / 2,
            background: mix(p.offCol, p.onCol, pos),
            boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.1), inset 0 2px 8px rgba(0,0,0,${(0.35 * (1 - pos)).toFixed(3)}), 0 ${trackH * 0.08}px ${trackH * 0.3}px rgba(0,0,0,0.3)`,
            ...el('switch'),
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: (trackH - knob) / 2,
              left: (trackH - knob) / 2 + travel * pos,
              width: knob, height: knob, borderRadius: '50%',
              background: '#F4F1E8',
              filter: knobSmear.blurPx > 0.3 ? `blur(${knobSmear.blurPx.toFixed(2)}px)` : undefined,
              transform: `scale(${(squash * knobSmear.sx).toFixed(3)}, ${knobSmear.sy.toFixed(3)})`,
              transformOrigin: pos < 0.5 ? 'left center' : 'right center',
              boxShadow: `0 ${knob * 0.05}px ${knob * 0.14}px ${rgba('#000000', 0.3)}, 0 ${knob * 0.16}px ${knob * 0.38}px ${rgba('#000000', 0.22)}, inset 0 1px 0 rgba(255,255,255,0.7)`,
            }}
          />
        </div>

        {p.showLabel && (
          <span
            style={{
              fontSize: p.size, fontWeight: 600, letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: pos > 0.5 ? p.onCol : p.ink,
              transform: `translate(${parLabel.x.toFixed(2)}px, ${parLabel.y.toFixed(2)}px)`,
              ...el('label'),
            }}
          >
            {label}
          </span>
        )}
      </div>
    );
  },
});
