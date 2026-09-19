// Reference: general/branching.mp4  (window 0-7000ms, stem tops out ~2600ms, branches to the end)
// A stem drawing upward with branches sprouting off it, each tipped with a glowing node.
//
// A branch cannot appear before the stem has REACHED it. Sprouting on a flat stagger lets branches
// pop out of empty space above the drawing head, which is the one thing that breaks the illusion.

import { Easing, interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { idleFloat, sway3d, vel } from '../juice';

const MAX_BRANCHES = 12;

export const branchGrow = defineGraphicsTemplate({
  id: 'branch_grow',
  name: 'Branching',
  category: 'chart',
  tags: ['Growth', 'Tree', 'Nodes'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'field',    label: 'Field', hideable: false },
    { key: 'stem',     label: 'Stem' },
    { key: 'branches', label: 'Branches' },
  ],

  params: [
    { type: 'number', key: 'count', label: 'Branches', group: 'Content', default: 8, min: 1, max: MAX_BRANCHES, step: 1 },

    { type: 'color',  key: 'bg',     label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'stem',   label: 'Stem',     group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'branch', label: 'Branches', group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'thick',  label: 'Stem width', group: 'Style', default: 3, min: 1, max: 16, step: 1, unit: 'px' },
    { type: 'number', key: 'span',   label: 'Branch length', group: 'Style', default: 155, min: 20, max: 400, step: 5, unit: 'px' },
    { type: 'number', key: 'rise',   label: 'Branch angle', group: 'Style', default: 42, min: 0, max: 80, step: 2, unit: '°' },
    { type: 'number', key: 'node',   label: 'Node size', group: 'Style', default: 9, min: 0, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'glow',   label: 'Glow', group: 'Style', default: 0.6, min: 0, max: 1, step: 0.05 },
    { type: 'number', key: 'foot',   label: 'Bare stem at the base', group: 'Style', default: 22, min: 0, max: 60, step: 1, unit: '%' },
    { type: 'boolean', key: 'fill',  label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'startAt', label: 'Stem starts', group: 'Motion', default: 200, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stemMs',  label: 'Stem draws over', group: 'Motion', default: 2400, min: 200, max: 9000, step: 50, unit: 'ms' },
    { type: 'number', key: 'sproutMs', label: 'Branch sprouts over', group: 'Motion', default: 620, min: 100, max: 3000, step: 20, unit: 'ms' },
  ],

  // Organic DOCU palette: an airy sweep under the stem draw, a pop as the first branch
  // sprouts, and a chime once the crown completes — sprout times computed with the exact
  // inverse-cubic the motion uses, so retiming the stem retimes the sounds.
  sfx: (p) => {
    const count = Math.round(p.count);
    const u = (i: number) => (p.foot / 100) + (1 - p.foot / 100) * ((i + 1) / (count + 1));
    const sproutAt = (i: number) => p.startAt + p.stemMs * (1 - Math.cbrt(1 - u(i))) + 560 + i * 140;
    return [
      { atMs: p.startAt, id: 'sweep', gain: 0.4 },
      { atMs: sproutAt(0), id: 'pop', gain: 0.4 },
      { atMs: sproutAt(count - 1) + 300, id: 'chime', gain: 0.45 },
    ];
  },

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const count = Math.round(p.count);
    const baseY = height * 0.81;
    const topY = height * 0.2;
    // Ease-out: the reference stem covers over half its run in the first third of the draw.
    const stemT = interpolate(timeMs, [p.startAt, p.startAt + p.stemMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    });
    const exit = interpolate(timeMs, [durationMs - 750, durationMs - 250], [1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const headY = baseY - (baseY - topY) * stemT;
    const cx = width / 2;
    const rad = (p.rise * Math.PI) / 180;
    // Branches in the reference keep lengthening long after they sprout.
    const lateGrow = interpolate(timeMs, [800, 4700], [0.55, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    // The drawing head's climb speed (px/ms) smears the stroke while it races upward and
    // dies to zero the moment the stem tops out — the line lands crisp.
    const headYAt = (ms: number) => interpolate(ms, [p.startAt, p.startAt + p.stemMs], [baseY, topY], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    });
    const stemBlur = Math.min(2.5, Math.abs(vel(headYAt, timeMs)) * 1.6);

    // The field stays put (it is the camera), but the drawing itself keeps living in space:
    // a faint 3D sway + drift on the whole tree, so the held pose never flattens to a still.
    const fl = idleFloat(timeMs, seed, 3);
    const treePose = `${sway3d(timeMs, seed, 1.3)} translate(${fl.x.toFixed(2)}px, ${fl.y.toFixed(2)}px)`;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill
            ? `radial-gradient(ellipse 120% 90% at 50% 28%, rgba(255,255,255,0.045) 0%, transparent 60%), ${p.bg}`
            : 'transparent',
          ...el('field'),
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: exit,
            transform: treePose, transformOrigin: '50% 60%',
          }}
        >
          <g style={{ ...el('stem'), ...(stemBlur > 0.3 ? { filter: `blur(${stemBlur.toFixed(2)}px)` } : null) }}>
            <line x1={cx} y1={baseY} x2={cx} y2={headY} stroke={p.stem} strokeWidth={p.thick} strokeLinecap="round" />
          </g>

          <g style={{ ...el('branches') }}>
            {Array.from({ length: count }).map((_, i) => {
              const u = (p.foot / 100) + (1 - p.foot / 100) * ((i + 1) / (count + 1));
              const y = baseY - (baseY - topY) * u;
              const side = i % 2 === 0 ? 1 : -1;
              // The stem must have REACHED this height before the branch may exist.
              // Inverse of the ease-out cubic above: height u is reached at 1-(1-u)^(1/3).
              const reachedAt = p.startAt + p.stemMs * (1 - Math.cbrt(1 - u)) + 560 + i * 140;
              const s = spring({
                frame: fr(timeMs - reachedAt), fps: FPS,
                config: { damping: 22, mass: 0.6, stiffness: 170 },
                durationInFrames: Math.max(1, Math.round(fr(p.sproutMs))),
              });
              if (s <= 0.001) return null;
              const len = p.span * s * lateGrow;
              const ex = cx + side * Math.cos(rad) * len;
              const ey = y - Math.sin(rad) * len;
              // Z-stagger: each branch hinges up from its join on the stem (overshoot in the
              // sprout spring swings it past level and settles), smeared while it moves.
              const hinge = (1 - s) * -14 * side;
              const sproutBlur = s > 0.001 && s < 0.985 ? (1 - Math.min(1, s)) * 3 : 0;
              return (
                <g
                  key={i}
                  opacity={clamp01(s * 3)}
                  transform={`rotate(${hinge.toFixed(2)} ${cx} ${y})`}
                  style={sproutBlur > 0.3 ? { filter: `blur(${sproutBlur.toFixed(2)}px)` } : undefined}
                >
                  <line
                    x1={cx} y1={y} x2={ex} y2={ey}
                    stroke={p.branch} strokeWidth={p.thick * 0.8} strokeLinecap="round"
                    style={p.glow > 0 ? { filter: `drop-shadow(0 0 ${p.node * 0.9}px ${rgba(p.branch, 0.8 * p.glow)})` } : undefined}
                  />
                  {p.node > 0 && (
                    <circle
                      cx={ex} cy={ey} r={(p.node / 2) * s} fill={p.branch}
                      style={p.glow > 0 ? { filter: `drop-shadow(0 0 ${p.node * 1.4}px ${rgba(p.branch, 0.9 * p.glow)})` } : undefined}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
