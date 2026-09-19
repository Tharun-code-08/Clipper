// Reference: overlays/life-line-animation.mp4  (window 320-9720ms, trace fills ~7720ms)
// An ECG trace drawing itself across the frame, spike by spike, with a glowing head.
//
// The path is GENERATED from a beat count rather than hand-drawn, so changing the rate re-shapes
// the waveform instead of squashing a fixed picture. The head dot reads its position from the same
// beat function the path is built from, so it can never sit off the line.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { ghosts, pulse, smear, sway3d } from '../juice';

/** One PQRST-ish beat in unit space, as offsets from the baseline. */
const BEAT: [number, number][] = [
  [0, 0], [0.14, 0], [0.2, 0.1], [0.26, 0], [0.34, 0],
  [0.38, -0.12], [0.44, 1], [0.5, -0.36], [0.56, 0],
  [0.68, 0], [0.76, 0.22], [0.84, 0], [1, 0],
];

export const heartbeatLine = defineGraphicsTemplate({
  id: 'heartbeat_line',
  name: 'Heartbeat Line',
  category: 'fx',
  tags: ['ECG', 'Pulse', 'Medical'],
  design: { w: 900, h: 460 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 9400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['inter'],

  elements: [
    { key: 'trace', label: 'Trace', hideable: false },
    { key: 'head',  label: 'Leading dot' },
    { key: 'base',  label: 'Baseline' },
  ],

  params: [
    { type: 'number', key: 'beats', label: 'Beats',  group: 'Content', default: 7, min: 1, max: 16, step: 1 },

    { type: 'color',  key: 'line',  label: 'Trace',  group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'base',  label: 'Baseline', group: 'Style', default: '#F4F1E8' },
    { type: 'number', key: 'thick', label: 'Width',  group: 'Style', default: 4, min: 1, max: 24, step: 1, unit: 'px' },
    { type: 'number', key: 'amp',   label: 'Spike height', group: 'Style', default: 176, min: 20, max: 400, step: 5, unit: 'px' },
    { type: 'number', key: 'glow',  label: 'Glow',   group: 'Style', default: 18, min: 0, max: 70, step: 2, unit: 'px' },
    { type: 'number', key: 'baseline', label: 'Baseline strength', group: 'Style', default: 0.18, min: 0, max: 1, step: 0.02 },
    { type: 'boolean', key: 'dot',  label: 'Leading dot', group: 'Style', default: true },

    { type: 'number', key: 'startAt', label: 'Starts at', group: 'Motion', default: 120, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'runMs',   label: 'Draws over', group: 'Motion', default: 8000, min: 200, max: 14000, step: 100, unit: 'ms' },
  ],

  // Monitor blips on the first two QRS spikes (u≈0.44 of a beat) — the same beat arithmetic the
  // trace is generated from, so retiming the draw retimes the beeps. Two, not one per beat:
  // sixteen blips reads as noise.
  sfx: (p) => {
    const n = Math.max(1, Math.round(p.beats));
    const cues: { atMs: number; id: 'blip'; gain: number }[] = [
      { atMs: p.startAt + (p.runMs * 0.44) / n, id: 'blip', gain: 0.45 },
    ];
    if (n >= 2) cues.push({ atMs: p.startAt + (p.runMs * 1.44) / n, id: 'blip', gain: 0.4 });
    return cues;
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const n = Math.max(1, Math.round(p.beats));
    const midY = height / 2;
    const beatW = width / n;

    const pts: string[] = [];
    for (let b = 0; b < n; b += 1) {
      for (const [u, v] of BEAT) {
        const x = (b + u) * beatW;
        const y = midY - v * p.amp;
        pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
      }
    }
    const d = `M ${pts.join(' L ')}`;

    const progAt = (ms: number) => interpolate(ms, [p.startAt, p.startAt + p.runMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const t = progAt(timeMs);

    // Head position from the SAME beat function, so the dot always sits on the trace — a pure
    // closure of ms, so velocity (central difference) and trail ghosts sample the same path.
    const headAt = (ms: number): { x: number; y: number } => {
      const q = progAt(ms);
      const at = q * n;
      const bi = Math.min(n - 1, Math.floor(at));
      const u = at - bi;
      let v = 0;
      for (let i = 1; i < BEAT.length; i += 1) {
        if (u <= BEAT[i][0]) {
          const [u0, v0] = BEAT[i - 1];
          const [u1, v1] = BEAT[i];
          v = v0 + ((v1 - v0) * (u - u0)) / Math.max(1e-6, u1 - u0);
          break;
        }
      }
      return { x: q * width, y: midY - v * p.amp };
    };
    const { x: hx, y: hy } = headAt(timeMs);

    // MOTION BLUR on the tracing head: its true velocity spikes through every QRS, so the dot
    // smears hard on the spike and runs crisp along the baseline. Trail ghosts sample the SAME
    // path at earlier ms — they ride the curve, not a straight offset.
    const hA = headAt(timeMs - 13);
    const hB = headAt(timeMs + 13);
    const vx = (hB.x - hA.x) / 26;
    const vyHead = (hB.y - hA.y) / 26;
    const headAng = Math.atan2(vyHead, vx) * (180 / Math.PI);
    const sm = smear(Math.hypot(vx, vyHead), 0, 1.1);
    const trail = ghosts(vx, vyHead, 2, 40);
    // The finished trace never sits dead: the glow keeps breathing after the draw completes.
    const glowK = pulse(timeMs, 2200, 0.8, 1.15);

    const appear = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(320))),
    });

    return (
      // Resting 3D sway — the monitor keeps living in space (~0.8°, rotations only; any more and
      // the trace would clip its own edges against the overflow mask).
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: clamp01(appear), transform: sway3d(timeMs, seed, 0.8) }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {p.baseline > 0 && (
            <g style={{ ...el('base') }}>
              <line
                x1={0} y1={midY} x2={width} y2={midY}
                stroke={rgba(p.base, p.baseline)} strokeWidth={p.thick * 0.5}
                strokeDasharray="8 14" strokeLinecap="round"
              />
            </g>
          )}
          <g style={{ ...el('trace') }}>
            <path
              d={d}
              fill="none"
              stroke={p.line}
              strokeWidth={p.thick}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - t}
              style={{
                filter: p.glow > 0
                  ? `drop-shadow(0 0 ${(p.glow * 0.45 * glowK).toFixed(1)}px ${rgba(p.line, 0.8)}) drop-shadow(0 0 ${(p.glow * 1.5 * glowK).toFixed(1)}px ${rgba(p.line, 0.35)})`
                  : undefined,
              }}
            />
          </g>
          {p.dot && (
            <g style={{ ...el('head') }}>
              {trail.map((g, i) => {
                const ghost = headAt(timeMs - 40 * (i + 1));
                return (
                  <circle
                    key={i}
                    cx={ghost.x.toFixed(1)} cy={ghost.y.toFixed(1)} r={(p.thick * 1.3 * (1 - 0.2 * (i + 1))).toFixed(2)}
                    fill={p.line}
                    opacity={g.opacity.toFixed(3)}
                  />
                );
              })}
              <circle
                cx={hx} cy={hy} r={p.thick * 1.3}
                fill={p.line}
                transform={`translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${headAng.toFixed(1)}) scale(${sm.sx.toFixed(4)} ${sm.sy.toFixed(4)}) translate(${(-hx).toFixed(1)} ${(-hy).toFixed(1)})`}
                style={{
                  filter: [
                    p.glow > 0
                      ? `drop-shadow(0 0 ${(p.glow * 0.6 * glowK).toFixed(1)}px ${rgba(p.line, 0.95)}) drop-shadow(0 0 ${(p.glow * 1.8 * glowK).toFixed(1)}px ${rgba(p.line, 0.4)})`
                      : '',
                    sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : '',
                  ].filter(Boolean).join(' ') || undefined,
                }}
              />
            </g>
          )}
        </svg>
      </div>
    );
  },
});
