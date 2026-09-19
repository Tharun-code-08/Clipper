// Reference: ui-elements/alarm-toggle-1.mp4
// A time readout with an iOS-style switch that flips itself on. The reference fills the frame with
// its own dark background, so `bg` here is a real parameter rather than assumed transparency —
// set it to none and the template works as an overlay on footage instead.
//
// Three independent motions: the type fades up, the track cross-fades to the on-colour, and the
// knob travels on its own spring with a small squash — a real switch never moves as one piece.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { idleFloat, parallax, smear, swingIn, vel } from '../juice';

/** Mix two hex colours. Used for the track cross-fade, which the reference does as a colour
 *  transition rather than a swap. */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => {
    const s = h.replace('#', '');
    const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}

export const alarmToggle = defineGraphicsTemplate({
  id: 'alarm_toggle',
  name: 'Alarm Toggle',
  category: 'device',
  tags: ['Switch', 'Alarm', 'iOS'],
  design: { w: 900, h: 300 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 76 },
  fonts: ['inter'],

  elements: [
    { key: 'time',   label: 'Time' },
    { key: 'label',  label: 'Label' },
    { key: 'switch', label: 'Switch', hideable: false },
  ],

  params: [
    { type: 'text', key: 'time',   label: 'Time',   group: 'Content', default: '9:40', maxLength: 10 },
    { type: 'text', key: 'suffix', label: 'Suffix', group: 'Content', default: 'AM', maxLength: 6 },
    { type: 'text', key: 'label',  label: 'Label',  group: 'Content', default: 'Alarm', maxLength: 30 },

    { type: 'color',  key: 'ink',    label: 'Text',       group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'onCol',  label: 'Switch on',  group: 'Style', default: '#34c759' },
    { type: 'color',  key: 'offCol', label: 'Switch off', group: 'Style', default: '#3a3a3c' },
    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',   label: 'Time size',  group: 'Style', default: 140, min: 30, max: 190, step: 2, unit: 'px' },
    { type: 'select', key: 'bg',     label: 'Background', group: 'Style', default: 'none',
      options: [
        { value: 'none',  label: 'Transparent (over video)' },
        { value: 'dark',  label: 'Dark panel' },
        { value: 'light', label: 'Light panel' },
      ] },

    { type: 'number',  key: 'flipAt',  label: 'Flip at',    group: 'Motion', default: 1100, min: 100, max: 5000, step: 50, unit: 'ms' },
    { type: 'number',  key: 'fadeMs',  label: 'Text fade',  group: 'Motion', default: 520, min: 100, max: 1500, step: 20, unit: 'ms' },
    { type: 'boolean', key: 'startOn', label: 'Start already on', group: 'Motion', default: false },
  ],

  // A light air pass as the type fades up; the dry mechanical snap lands with the knob — the
  // click IS the template, so it gets the loud cue. No flip, no click.
  sfx: (p) => [
    { atMs: 60, id: 'swish' as const, gain: 0.3 },
    ...(p.startOn ? [] : [{ atMs: p.flipAt + 200, id: 'snap' as const, gain: 0.7 }]),
  ],

  render: ({ params: p, el, timeMs, height, seed }) => {
    const ff = fontStack(p.font);

    // Type fades up first, time slightly ahead of its label. Each block also sits at its own
    // parallax depth, so the resting row shears subtly instead of freezing — a settings ROW is
    // device UI, so it gets NO 3D sway, only this drift plus a whisper of idleFloat.
    const fade = (delay: number, depth = 0) => {
      const s = spring({
        frame: fr(timeMs - delay), fps: FPS,
        config: { damping: 30, mass: 0.6, stiffness: 150 },
        durationInFrames: Math.max(1, Math.round(fr(p.fadeMs))),
      });
      const par = depth > 0 ? parallax(timeMs, seed, depth, height * 0.03) : { x: 0, y: 0 };
      return {
        opacity: interpolate(s, [0, 0.7], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translate(${par.x.toFixed(2)}px, ${(par.y + (1 - s) * height * 0.06).toFixed(3)}px)`,
      };
    };

    // The whole row swings in on the same spring family the fades ride, then rests nearly still.
    const ent = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 30, mass: 0.6, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(p.fadeMs))),
    });
    const drift = idleFloat(timeMs, seed, height * 0.005, 3800);

    // The knob rides its own spring so it overshoots slightly into the stop.
    const flipAt = (ms: number) => p.startOn ? 1 : spring({
      frame: fr(ms - p.flipAt), fps: FPS,
      config: { damping: 18, mass: 0.5, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(340))),
    });
    const flip = flipAt(timeMs);

    // Track scales with the type size, not the box — the reference keeps switch height a touch
    // taller than the time digits at any size.
    const trackW = Math.round(p.size * 1.95);
    const trackH = Math.round(trackW * 0.6);
    const knob = Math.round(trackH * 0.86);
    const travel = trackW - knob - (trackH - knob);
    // Squash on the way across, back to round on arrival — reads as weight.
    const squash = 1 + Math.sin(Math.PI * Math.min(1, Math.max(0, flip))) * 0.12;
    // MOTION BLUR: the knob is the big mover — its travel velocity smears it horizontally
    // mid-flight and dies crisp into the stop.
    const knobSmear = smear(vel((ms: number) => travel * Math.min(1.02, Math.max(0, flipAt(ms))), timeMs), 0);

    const panel =
      p.bg === 'dark'
        ? {
            background: 'linear-gradient(180deg, #1A190F 0%, #0B0B0D 100%)',
            border: '1px solid rgba(255,255,255,0.13)',
            boxShadow: '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }
        : p.bg === 'light'
          ? {
              background: '#f6f4ef',
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 12px 30px rgba(0,0,0,0.10), 0 40px 90px rgba(0,0,0,0.12)',
            }
          : {};
    const ink = p.bg === 'light' && (p.ink === '#ffffff' || p.ink === '#F4F1E8') ? '#0b0b0d' : p.ink;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `0 ${Math.round(height * 0.17)}px`, boxSizing: 'border-box',
          ...panel,
          borderRadius: p.bg === 'none' ? 0 : Math.round(height * 0.12),
          fontFamily: ff,
          transform: `${swingIn(ent, { rx: -10, ry: 7, z: -70 })} translate(${drift.x.toFixed(2)}px, ${drift.y.toFixed(2)}px)`,
          transformOrigin: 'center center',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: p.size * 0.16, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: height * 0.045, ...fade(0, 0.12), ...el('time') }}>
            <span style={{ fontSize: p.size, fontWeight: 300, color: ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {p.time}
            </span>
            <span style={{ fontSize: p.size * 0.42, fontWeight: 500, color: ink, lineHeight: 1 }}>{p.suffix}</span>
          </div>
          <span style={{ fontSize: p.size * 0.3, fontWeight: 400, color: rgba(ink, 0.55), ...fade(120, 0.2), ...el('label') }}>
            {p.label}
          </span>
        </div>

        <div
          style={{
            width: trackW, height: trackH, borderRadius: trackH / 2, flexShrink: 0,
            background: mix(p.offCol, p.onCol, Math.min(1, Math.max(0, flip))),
            position: 'relative',
            ...fade(60, 0.32),
            ...el('switch'),
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: (trackH - knob) / 2,
              left: (trackH - knob) / 2 + travel * Math.min(1.02, Math.max(0, flip)),
              width: knob, height: knob, borderRadius: knob / 2,
              background: '#ffffff',
              filter: knobSmear.blurPx > 0.3 ? `blur(${knobSmear.blurPx.toFixed(2)}px)` : undefined,
              transform: `scale(${(squash * knobSmear.sx).toFixed(3)}, ${knobSmear.sy.toFixed(3)})`,
              transformOrigin: flip < 0.5 ? 'left center' : 'right center',
              boxShadow: `0 ${Math.round(knob * 0.05)}px ${Math.round(knob * 0.12)}px ${rgba('#000000', 0.22)}, 0 ${Math.round(knob * 0.16)}px ${Math.round(knob * 0.34)}px ${rgba('#000000', 0.18)}`,
            }}
          />
        </div>
      </div>
    );
  },
});
