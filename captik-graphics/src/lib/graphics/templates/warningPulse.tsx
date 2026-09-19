// Reference: overlays/error-error.mp4  (window 480-15160ms, sign set ~1600ms then pulses forever)
// A neon warning sign that snaps in and then throbs. The glow and the stroke pulse on the SAME
// wave but the glow swings much further, so the sign stays legible while the halo does the work —
// pulsing both equally makes the whole thing wash in and out.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose } from '../juice';

export const warningPulse = defineGraphicsTemplate({
  id: 'warning_pulse',
  name: 'Warning Pulse',
  category: 'notify',
  tags: ['Alert', 'Neon', 'Error'],
  design: { w: 900, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 14700,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 52 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'sign',  label: 'Sign', hideable: false },
    { key: 'mark',  label: 'Mark' },
    { key: 'label', label: 'Caption' },
  ],

  params: [
    { type: 'text',   key: 'mark',  label: 'Mark',    group: 'Content', default: '!', maxLength: 3 },
    { type: 'text',   key: 'label', label: 'Caption', group: 'Content', default: '', maxLength: 32,
      help: 'Optional line under the sign.' },
    { type: 'select', key: 'shape', label: 'Shape',   group: 'Content', default: 'triangle', options: [
      { value: 'triangle', label: 'Triangle' },
      { value: 'circle',   label: 'Circle' },
      { value: 'diamond',  label: 'Diamond' },
    ] },

    { type: 'color',  key: 'neon',  label: 'Neon',   group: 'Style', default: '#FF453A' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Size',   group: 'Style', default: 420, min: 80, max: 800, step: 10, unit: 'px' },
    { type: 'number', key: 'thick', label: 'Stroke', group: 'Style', default: 22, min: 2, max: 70, step: 2, unit: 'px' },
    { type: 'number', key: 'glow',  label: 'Glow',   group: 'Style', default: 40, min: 0, max: 140, step: 4, unit: 'px' },

    { type: 'number', key: 'inAt',   label: 'Sign at', group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'period', label: 'Pulse period', group: 'Motion', default: 1100, min: 200, max: 4000, step: 50, unit: 'ms' },
    { type: 'number', key: 'depth',  label: 'Pulse depth',  group: 'Motion', default: 0.62, min: 0, max: 1, step: 0.02 },
  ],

  // One rounded alert blip as the sign snaps in (keyed to the same inAt as its spring). The
  // pulse itself stays visual-only — a cue every period would nag for the whole hold.
  sfx: (p) => [
    { atMs: p.inAt + 160, id: 'blip', gain: 0.7 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);

    const pop = spring({
      frame: fr(timeMs - p.inAt), fps: FPS,
      config: { damping: 14, mass: 0.6, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });
    // DEPTH only — the pulse clock stays the heartbeat of this template. The sign snaps in
    // through a shallow top hinge on its existing spring and then holds a ±1° sway so the
    // pose never dies while the halo does the work.
    const pose = depthPose(timeMs, seed, { enter: pop, rx: -14, z: -80, swayDeg: 1 });
    // One wave; the halo swings far, the stroke barely at all.
    const wave = 0.5 + 0.5 * Math.sin((timeMs / Math.max(1, p.period)) * Math.PI * 2);
    const halo = 1 - p.depth * (1 - wave);
    const ink = 1 - p.depth * 0.25 * (1 - wave);

    const S = p.size;
    const half = p.thick / 2;
    const shape = p.shape === 'circle'
      ? <circle cx={S / 2} cy={S / 2} r={S / 2 - half - 2} fill="none" stroke={p.neon} strokeWidth={p.thick} />
      : p.shape === 'diamond'
        ? <path d={`M ${S / 2} ${half + 2} L ${S - half - 2} ${S / 2} L ${S / 2} ${S - half - 2} L ${half + 2} ${S / 2} Z`} fill="none" stroke={p.neon} strokeWidth={p.thick} strokeLinejoin="round" />
        : <path d={`M ${S / 2} ${S * 0.1} L ${S * 0.94} ${S * 0.84} L ${S * 0.06} ${S * 0.84} Z`} fill="none" stroke={p.neon} strokeWidth={p.thick} strokeLinejoin="round" />;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: width * 0.03, fontFamily: ff,
          opacity: clamp01(pop * 1.8),
          transform: `${pose} scale(${interpolate(pop, [0, 1], [0.6, 1]).toFixed(4)})`,
          transformOrigin: '50% 40%',
          ...el('sign'),
        }}
      >
        <div style={{ position: 'relative', width: S, height: S }}>
          <svg
            viewBox={`0 0 ${S} ${S}`}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              opacity: ink,
              // Three layers, tube-light style: a white-hot core tight to the stroke, a saturated
              // mid bloom, and a wide soft halo — one fat blur reads like a cheap glow filter.
              filter: p.glow > 0
                ? `drop-shadow(0 0 ${p.glow * 0.2}px ${rgba('#ffffff', 0.5 * halo)}) `
                  + `drop-shadow(0 0 ${p.glow * 0.55}px ${rgba(p.neon, 0.95 * halo)}) `
                  + `drop-shadow(0 0 ${p.glow * 1.8}px ${rgba(p.neon, 0.5 * halo)})`
                : undefined,
            }}
          >
            {shape}
          </svg>
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              paddingTop: p.shape === 'triangle' ? S * 0.14 : 0,
              color: p.neon, fontSize: S * 0.34, fontWeight: 800, lineHeight: 1,
              opacity: ink,
              textShadow: p.glow > 0
                ? `0 0 ${p.glow * 0.25}px ${rgba('#ffffff', 0.45 * halo)}, `
                  + `0 0 ${p.glow * 0.8}px ${rgba(p.neon, halo)}, `
                  + `0 0 ${p.glow * 2.2}px ${rgba(p.neon, 0.45 * halo)}`
                : undefined,
              ...el('mark'),
            }}
          >
            {p.mark}
          </div>
        </div>

        {p.label.trim() && (
          <div
            style={{
              color: p.neon, fontSize: width * 0.05, fontWeight: 600,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              opacity: ink,
              textShadow: p.glow > 0
                ? `0 0 ${p.glow * 0.7}px ${rgba(p.neon, halo)}, `
                  + `0 0 ${p.glow * 1.8}px ${rgba(p.neon, 0.4 * halo)}`
                : undefined,
              ...el('label'),
            }}
          >
            {p.label}
          </div>
        )}
      </div>
    );
  },
});
