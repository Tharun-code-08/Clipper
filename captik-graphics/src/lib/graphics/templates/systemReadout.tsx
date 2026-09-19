// Reference: text/simulation-terminated.mp4  (window 640-4280ms, typing runs the whole 3480ms)
// A HUD readout: a faint grid, a small status line, then a bracketed message typing out in mono
// with a blinking caret, and a subtitle once it lands. The brackets are drawn OUTSIDE the typed
// text and sit still, which is what the reference does and what stops the line jittering as it
// grows.
//
// Distinct from terminal_typing, which is a shell window with a prompt. This is the sci-fi overlay
// version: no chrome, no window, just the readout floating over the footage.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax } from '../juice';

export const systemReadout = defineGraphicsTemplate({
  id: 'system_readout',
  name: 'System Readout',
  category: 'device',
  tags: ['HUD', 'Terminal', 'Sci-fi'],
  design: { w: 900, h: 920 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 92 },
  fonts: ['inter', 'pixel'],

  elements: [
    { key: 'line',   label: 'Message', hideable: false },
    { key: 'status', label: 'Status line' },
    { key: 'sub',    label: 'Subtitle' },
    { key: 'grid',   label: 'Grid' },
    { key: 'caret',  label: 'Caret' },
  ],

  params: [
    { type: 'text', key: 'status', label: 'Status',  group: 'Content', default: 'SYSTEM STATUS: OFFLINE', maxLength: 48 },
    { type: 'text', key: 'text',   label: 'Message', group: 'Content', default: 'SIMULATION TERMINATED', maxLength: 60 },
    { type: 'text', key: 'sub',    label: 'Subtitle', group: 'Content', default: 'CONNECTION LOST // RETRY IN 00:03', maxLength: 60 },
    { type: 'boolean', key: 'brackets', label: 'Wrap in brackets', group: 'Content', default: true },

    { type: 'color',  key: 'ink',   label: 'Message', group: 'Style', default: '#3fe0d0' },
    { type: 'color',  key: 'dim',   label: 'Secondary', group: 'Style', default: '#2f8f9a' },
    { type: 'font',   key: 'font',  label: 'Font',    group: 'Style', default: 'pixel' },
    { type: 'number', key: 'size',  label: 'Message size', group: 'Style', default: 62, min: 10, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'small', label: 'Small size',   group: 'Style', default: 21, min: 6, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'track', label: 'Tracking',     group: 'Style', default: 3, min: 0, max: 20, step: 0.5, unit: 'px' },
    { type: 'number', key: 'gridPx', label: 'Grid spacing', group: 'Style', default: 46, min: 12, max: 160, step: 2, unit: 'px' },
    { type: 'number', key: 'gridOn', label: 'Grid strength', group: 'Style', default: 0.24, min: 0, max: 0.6, step: 0.02 },
    { type: 'number', key: 'glow',  label: 'Glow',         group: 'Style', default: 14, min: 0, max: 60, step: 2, unit: 'px' },

    { type: 'number', key: 'startAt', label: 'Typing starts', group: 'Motion', default: 260, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'cps',     label: 'Characters / sec', group: 'Motion', default: 14, min: 1, max: 60, step: 0.5 },
    { type: 'number', key: 'blinkMs', label: 'Caret blink',   group: 'Motion', default: 560, min: 120, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'subAt',   label: 'Subtitle at',   group: 'Motion', default: 2500, min: 0, max: 9000, step: 50, unit: 'ms' },
  ],

  // HUD powers on with a rounded alert, ONE key burst covers the whole typing run (never per
  // char), and a dry snap marks the message completing — all off the same typing params.
  sfx: (p) => [
    { atMs: 0, id: 'blip', gain: 0.35 },
    { atMs: p.startAt, id: 'type', gain: 0.5 },
    { atMs: p.startAt + (p.text.length / Math.max(1, p.cps)) * 1000, id: 'snap', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);

    const shown = Math.max(0, Math.floor(((timeMs - p.startAt) / 1000) * p.cps));
    const typed = p.text.slice(0, shown);
    // The grid powers up with the readout rather than being there from frame one.
    const gridLit = interpolate(timeMs, [p.startAt + 300, p.startAt + 900], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const gridUp = interpolate(timeMs, [p.startAt, p.startAt + 2100], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const done = shown >= p.text.length;

    // A square-wave blink off the clock. `animation:` would tick on the browser wall clock and
    // freeze on export.
    const blink = Math.floor(timeMs / Math.max(1, p.blinkMs)) % 2 === 0;

    const statusIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(360))),
    });
    const subIn = spring({
      frame: fr(timeMs - p.subAt), fps: FPS,
      config: { damping: 24, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    // Layered bloom — a tight core halo, a mid wash and a wide falloff — instead of one hard ring.
    const glow = p.glow > 0
      ? `0 0 ${Math.round(p.glow * 0.5)}px ${rgba(p.ink, 0.6)}, 0 0 ${p.glow}px ${rgba(p.ink, 0.4)}, 0 0 ${p.glow * 3}px ${rgba(p.ink, 0.16)}`
      : undefined;
    const smallGlow = p.glow > 0 ? `0 0 ${Math.round(p.glow * 0.6)}px ${rgba(p.dim, 0.45)}` : undefined;

    // DEPTH: the HUD is projected glass — it swings in as a plane and then rests nearly still
    // (sway 1.1, it is a screen mimic), while the grid backplate, status and subtitle shear at
    // different depths against the anchored message line. The power-up doubles as a rack focus:
    // the whole readout arrives soft and snaps sharp with statusIn, crisp forever after.
    const pose = depthPose(timeMs, seed, { enter: clamp01(statusIn), rx: -11, ry: 15, z: -130, swayDeg: 1.1 });
    const focus = (1 - clamp01(statusIn)) * 5;
    const parGrid = parallax(timeMs, seed, 0.2, width * 0.008);
    const parStatus = parallax(timeMs, seed, 0.3, width * 0.008);
    const parSub = parallax(timeMs, seed, 0.4, width * 0.008);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          fontFamily: ff,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: p.small * 1.6,
          transform: pose,
          filter: focus > 0.3 ? `blur(${focus.toFixed(2)}px)` : undefined,
        }}
      >
        <div
          style={{
            position: 'absolute', inset: `${((1 - gridUp) * 48).toFixed(1)}%`,
            backgroundImage:
              `linear-gradient(${rgba(p.dim, p.gridOn * gridLit)} 2px, transparent 2px), `
              + `linear-gradient(90deg, ${rgba(p.dim, p.gridOn * gridLit)} 2px, transparent 2px)`,
            backgroundSize: `${p.gridPx}px ${p.gridPx}px`,
            opacity: clamp01(statusIn),
            transform: `translate(${parGrid.x.toFixed(2)}px, ${parGrid.y.toFixed(2)}px)`,
            ...el('grid'),
          }}
        />

        <div
          style={{
            position: 'relative',
            fontSize: p.small, letterSpacing: p.track, color: p.dim,
            textShadow: smallGlow,
            opacity: clamp01(statusIn),
            transform: `translate(${parStatus.x.toFixed(2)}px, ${parStatus.y.toFixed(2)}px)`,
            ...el('status'),
          }}
        >
          {`■ ${p.status}`}
        </div>

        <div
          style={{
            position: 'relative',
            fontSize: p.size, letterSpacing: p.track, color: p.ink,
            textShadow: glow, whiteSpace: 'pre', lineHeight: 1.2,
            maxWidth: width * 0.94,
            ...el('line'),
          }}
        >
          {p.brackets ? '[ ' : ''}
          {typed}
          <span style={{ opacity: !done && blink ? 1 : done && blink ? 0.55 : 0, ...el('caret') }}>_</span>
          {p.brackets ? ' ]' : ''}
        </div>

        <div
          style={{
            position: 'relative',
            fontSize: p.small, letterSpacing: p.track, color: p.dim,
            textShadow: smallGlow,
            opacity: clamp01(subIn),
            transform: `translate(${parSub.x.toFixed(2)}px, ${(parSub.y + (1 - subIn) * 10).toFixed(2)}px)`,
            ...el('sub'),
          }}
        >
          {p.sub}
        </div>
      </div>
    );
  },
});
