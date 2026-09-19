// Reference: graphics/timeline.mp4  (window 680-5240ms, curve complete ~3680ms)
// A winding line drawn through waypoints, each popping its marker and label as the line reaches it.
//
// A marker fires when the DRAW PROGRESS passes its position along the path, not on a fixed delay —
// so retiming the draw keeps every marker landing exactly where the line arrives. Delays would
// desync the moment anyone touched the duration.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, swingIn } from '../juice';

const MAX_STOPS = 6;
const STEPS = 72;

export const journeyCurve = defineGraphicsTemplate({
  id: 'journey_curve',
  name: 'Journey Curve',
  category: 'chart',
  tags: ['Timeline', 'Roadmap', 'Milestones'],
  design: { w: 900, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'curve', label: 'Curve', hideable: false },
    ...Array.from({ length: MAX_STOPS }, (_, i) => ({ key: `stop${i + 1}`, label: `Stop ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'stops', label: 'Stops', group: 'Content', multiline: true, maxLength: 240,
      default: 'Kickoff|#D97706\nBuild|#D97706\nLaunch|#F59E0B',
      help: 'One per line: label | colour. They are spaced evenly along the curve.' },

    { type: 'color',  key: 'line',  label: 'Curve',  group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',   label: 'Labels', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'chip',  label: 'Chip',   group: 'Style', default: '#1A190F' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Label size', group: 'Style', default: 24, min: 8, max: 70, step: 1, unit: 'px' },
    { type: 'number', key: 'thick', label: 'Curve width', group: 'Style', default: 4, min: 1, max: 20, step: 1, unit: 'px' },
    { type: 'number', key: 'waves', label: 'Waves',  group: 'Style', default: 1.5, min: 0.5, max: 4, step: 0.25,
      help: 'How many crests the curve makes across the frame.' },
    { type: 'number', key: 'amp',   label: 'Wave height', group: 'Style', default: 155, min: 20, max: 420, step: 10, unit: 'px' },
    { type: 'number', key: 'marker', label: 'Marker size', group: 'Style', default: 30, min: 4, max: 60, step: 2, unit: 'px' },

    { type: 'number', key: 'startAt', label: 'Draw starts', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drawMs',  label: 'Draws over',  group: 'Motion', default: 2600, min: 200, max: 9000, step: 50, unit: 'ms' },
  ],

  // Quiet DOCU palette: an airy sweep under the line draw, a pop as the first marker lands
  // and a chime on the final stop — reach times use the SAME pow(u, 1/0.8) clock as the
  // markers, so retiming the draw retimes the sounds with it.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_STOPS, p.stops.split('\n').map((l) => l.trim()).filter(Boolean).length));
    const reach = (i: number) => p.startAt + p.drawMs * Math.pow((i + 0.5) / n, 1.25);
    return [
      { atMs: p.startAt, id: 'sweep', gain: 0.4 },
      { atMs: reach(0) + 80, id: 'pop', gain: 0.4 },
      { atMs: reach(n - 1) + 300, id: 'chime', gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const stops = p.stops.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_STOPS)
      .map((l) => { const [label = '', colour = '#F59E0B'] = l.split('|').map((s) => s.trim()); return { label, colour }; });

    // Slightly eased out — the reference is a quarter of the way across within half a second and
    // then settles into a steady sweep.
    const t = Math.pow(interpolate(timeMs, [p.startAt, p.startAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    }), 0.8);

    const x0 = width * 0.1, x1 = width * 0.9;
    const midY = height * 0.5;
    // One sine across the frame; the same function positions the markers.
    const at = (u: number) => ({
      x: x0 + (x1 - x0) * u,
      y: midY - Math.sin(u * Math.PI * 2 * p.waves) * p.amp,
    });

    const pts = Array.from({ length: STEPS + 1 }, (_, i) => {
      const { x, y } = at(i / STEPS);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const d = `M ${pts.join(' L ')}`;

    // Depth: the whole roadmap swings in top-hinged and keeps a faint 3D sway, so the
    // held diagram never flattens; label chips shear on a foreground parallax depth while
    // the diamonds stay glued to the line.
    const enter = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const pose = depthPose(timeMs, seed, { enter, rx: -10, z: -60, swayDeg: 1.5 });
    const parChips = parallax(timeMs, seed, 0.4, height * 0.008);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, fontFamily: ff,
          opacity: clamp01(enter * 2),
          transform: pose, transformOrigin: '50% 40%',
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g style={{ ...el('curve') }}>
            <path
              d={d}
              fill="none"
              stroke={p.line}
              strokeWidth={p.thick}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - t}
              style={{ filter: `drop-shadow(0 0 8px ${rgba(p.line, 0.5)})` }}
            />
          </g>
        </svg>

        {stops.map((st, i) => {
          // Where this stop sits along the path, and therefore WHEN the line reaches it.
          const u = stops.length > 1 ? (i + 0.5) / stops.length : 0.5;
          const { x, y } = at(u);
          const reached = clamp01((t - u) / 0.08);
          const s = spring({
            frame: fr(reached * 500), fps: FPS,
            config: { damping: 14, mass: 0.5, stiffness: 220 },
            durationInFrames: Math.max(1, Math.round(fr(500))),
          });
          const above = Math.sin(u * Math.PI * 2 * p.waves) >= 0;
          // Z-stagger: each stop swings in hinged toward the curve (direction flips with
          // its side) and carries a landing smear that dies as its spring settles.
          const stopBlur = s > 0.001 && s < 0.985 ? (1 - Math.min(1, s)) * 2.5 : 0;
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: x, top: y,
                display: 'flex', flexDirection: above ? 'column-reverse' : 'column',
                alignItems: 'center', gap: p.size * 0.5,
                opacity: clamp01(s * 2),
                filter: stopBlur > 0.3 ? `blur(${stopBlur.toFixed(2)}px)` : undefined,
                transform: `${swingIn(s, { rx: above ? -16 : 16, z: -50 })} translate(-50%, ${above ? '-100%' : '0'}) scale(${interpolate(s, [0, 1], [0.4, 1]).toFixed(4)})`,
                ...el(`stop${i + 1}`),
              }}
            >
              <span
                style={{
                  transform: `translate(${parChips.x.toFixed(2)}px, ${parChips.y.toFixed(2)}px)`,
                  background: `linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 60%), ${p.chip}`,
                  color: p.ink,
                  border: `1.5px solid ${rgba(st.colour, 0.75)}`,
                  borderRadius: 999,
                  padding: `${p.size * 0.26}px ${p.size * 0.6}px`,
                  fontSize: p.size * 0.92, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                  lineHeight: 1, whiteSpace: 'nowrap',
                  boxShadow: `0 ${p.size * 0.3}px ${p.size * 0.9}px ${rgba('#000000', 0.4)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
                }}
              >
                {st.label}
              </span>
              <span
                style={{
                  width: p.marker, height: p.marker,
                  background: st.colour,
                  transform: 'rotate(45deg)',
                  boxShadow: `0 0 ${p.marker * 0.7}px ${rgba(st.colour, 0.55)}`,
                }}
              />
            </div>
          );
        })}
      </div>
    );
  },
});
