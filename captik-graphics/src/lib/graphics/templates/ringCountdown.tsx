// Reference: graphics/countdown-1.mp4  (usable window 2880-3800ms — the capture loops through 5..1)
// A ring that empties once per second while the number under it swaps, with the glow pulsing on
// each tick.
//
// The ring resets every whole second — `1 - (elapsed % 1)` — rather than draining once across the
// whole countdown. Draining once is the mistake that makes a countdown read as a progress bar.
// Distinct from countdown_bar (a rule) and the older countdown (a plain digit).

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax } from '../juice';

export const ringCountdown = defineGraphicsTemplate({
  id: 'ring_countdown',
  name: 'Ring Countdown',
  category: 'chart',
  tags: ['Countdown', 'Timer', 'Ring'],
  design: { w: 900, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 92 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'dial',   label: 'Dial', hideable: false },
    { key: 'track',  label: 'Track ring' },
    { key: 'ring',   label: 'Progress ring' },
    { key: 'number', label: 'Number' },
    { key: 'caption', label: 'Caption' },
  ],

  params: [
    { type: 'number', key: 'from',    label: 'Count from', group: 'Content', default: 5, min: 1, max: 60, step: 1 },
    { type: 'text',   key: 'caption', label: 'Caption',    group: 'Content', default: 'STARTING IN', maxLength: 28 },
    { type: 'text',   key: 'endText', label: 'End text',   group: 'Content', default: 'GO', maxLength: 16 },

    { type: 'color',  key: 'ring',  label: 'Ring',    group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'track', label: 'Track',   group: 'Style', default: '#26262C' },
    { type: 'color',  key: 'ink',   label: 'Number',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Caption', group: 'Style', default: '#8C887D' },
    { type: 'font',   key: 'font',  label: 'Font',    group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Diameter', group: 'Style', default: 500, min: 100, max: 800, step: 10, unit: 'px' },
    { type: 'number', key: 'thick', label: 'Ring width', group: 'Style', default: 16, min: 2, max: 50, step: 1, unit: 'px' },
    { type: 'number', key: 'digit', label: 'Number size', group: 'Style', default: 180, min: 30, max: 400, step: 5, unit: 'px' },
    { type: 'number', key: 'glow',  label: 'Glow',    group: 'Style', default: 44, min: 0, max: 140, step: 4, unit: 'px' },

    { type: 'number', key: 'startAt', label: 'Starts at', group: 'Motion', default: 200, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'tickMs',  label: 'Per count', group: 'Motion', default: 1000, min: 200, max: 3000, step: 50, unit: 'ms' },
  ],

  // Counter rules: ONE tick as the count starts, and the chime payoff on the endText swap —
  // both on the same startAt/tickMs/from clock as the ring. The per-second swaps in between
  // stay silent: a cue every second reads as a metronome, not sound design.
  sfx: (p) => [
    { atMs: p.startAt, id: 'tick', gain: 0.5 },
    { atMs: p.startAt + p.from * p.tickMs, id: 'chime', gain: 0.6 },
  ],

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);

    const elapsed = Math.max(0, timeMs - p.startAt) / Math.max(1, p.tickMs);
    const stepsDone = Math.floor(elapsed);
    const value = p.from - stepsDone;
    const done = value <= 0;
    // Resets every tick — a single drain across the whole countdown reads as a progress bar.
    const remaining = 1 - (elapsed - stepsDone);

    // Each swap punches the number.
    const punch = spring({
      frame: fr((elapsed - stepsDone) * p.tickMs), fps: FPS,
      config: { damping: 13, mass: 0.5, stiffness: 240 },
      durationInFrames: Math.max(1, Math.round(fr(360))),
    });
    const enter = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(360))),
    });

    const S = p.size;
    const r = S / 2 - p.thick / 2 - 2;
    const shown = done ? 1 : clamp01(remaining);

    // Depth wraps the system: the dial swings in top-hinged and holds a gentle ±1.6° sway for
    // its whole life; the number and caption ride different parallax depths so the sway shears
    // them over the ring — the per-second drain cycle itself is untouched.
    const pose = depthPose(timeMs, seed, { enter, rx: -14, z: -80, swayDeg: 1.6 });
    const parNum = parallax(timeMs, seed, 0.5, S * 0.014);
    const parCap = parallax(timeMs, seed, 0.3, S * 0.014);
    // Each swap smears the number for its first few frames and lands it crisp — the blur is a
    // function of the same per-tick punch spring, so it dies before the next second begins.
    const punchBlur = punch > 0.001 && punch < 0.985 ? (1 - Math.min(1, punch)) * 3 : 0;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: S * 0.51, fontFamily: ff,
          opacity: clamp01(enter),
          transform: pose,
          transformOrigin: '50% 40%',
          ...el('dial'),
        }}
      >
        <div style={{ position: 'relative', width: S, height: S }}>
          <svg viewBox={`0 0 ${S} ${S}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <g style={{ ...el('track') }}>
              <circle cx={S / 2} cy={S / 2} r={r} fill="none" stroke={p.track} strokeWidth={p.thick} />
            </g>
            <g style={{ ...el('ring') }}>
              <circle
                cx={S / 2} cy={S / 2} r={r}
                fill="none" stroke={p.ring} strokeWidth={p.thick} strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${shown.toFixed(4)} 1`}
                style={{ filter: p.glow > 0 ? `drop-shadow(0 0 ${p.glow * 0.3}px ${rgba(p.ring, 0.6)}) drop-shadow(0 0 ${p.glow * 0.85}px ${rgba(p.ring, 0.25)})` : undefined }}
              />
            </g>
          </svg>

          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: done ? p.digit * 0.6 : p.digit,
              fontWeight: 700, color: p.ink, lineHeight: 1,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
              textShadow: p.glow > 0 ? `0 0 ${p.glow}px ${rgba(p.ring, 0.4)}, 0 0 ${p.glow * 2.4}px ${rgba(p.ring, 0.16)}` : undefined,
              filter: punchBlur > 0.3 ? `blur(${punchBlur.toFixed(2)}px)` : undefined,
              transform: `translate(${parNum.x.toFixed(2)}px, ${parNum.y.toFixed(2)}px) scale(${interpolate(punch, [0, 1], [1.22, 1]).toFixed(4)})`,
              ...el('number'),
            }}
          >
            {done ? p.endText : value}
          </div>
        </div>

        <div
          style={{
            fontSize: S * 0.05, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: p.dim, fontWeight: 600,
            transform: `translate(${parCap.x.toFixed(2)}px, ${parCap.y.toFixed(2)}px)`,
            ...el('caption'),
          }}
        >
          {p.caption}
        </div>
      </div>
    );
  },
});
