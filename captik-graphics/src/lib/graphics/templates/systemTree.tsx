// Reference: general/system.mp4  (window 320-5800ms, tree complete ~1600ms, green wave ~3400ms)
// A node hierarchy that draws itself top-down, then a pulse of activation sweeps through it.
//
// The activation wave is a function of DEPTH, not of node index — a wave keyed to index crosses the
// tree diagonally, which reads as random rather than as something propagating down the hierarchy.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, swingIn } from '../juice';

const MAX_LEVELS = 5;

export const systemTree = defineGraphicsTemplate({
  id: 'system_tree',
  name: 'System Tree',
  category: 'chart',
  tags: ['Hierarchy', 'Nodes', 'System'],
  design: { w: 900, h: 1200 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['inter'],

  elements: [
    { key: 'field', label: 'Field', hideable: false },
    { key: 'links', label: 'Connectors' },
    { key: 'nodes', label: 'Nodes' },
  ],

  params: [
    { type: 'text', key: 'shape', label: 'Nodes per level', group: 'Content', default: '1,2,4,6,6', maxLength: 40,
      help: 'Comma-separated, top level first.' },

    { type: 'color',  key: 'bg',    label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'node',  label: 'Nodes',    group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'link',  label: 'Connectors', group: 'Style', default: '#8C887D' },
    { type: 'color',  key: 'live',  label: 'Activated', group: 'Style', default: '#4ADE80' },
    { type: 'number', key: 'nodeW', label: 'Node width', group: 'Style', default: 66, min: 16, max: 200, step: 2, unit: 'px' },
    { type: 'number', key: 'nodeH', label: 'Node height', group: 'Style', default: 26, min: 8, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Node corner', group: 'Style', default: 6, min: 0, max: 30, step: 1, unit: 'px' },
    { type: 'number', key: 'glow',  label: 'Activation glow', group: 'Style', default: 0.7, min: 0, max: 1, step: 0.05 },
    { type: 'boolean', key: 'fill', label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'Root at', group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'levelMs', label: 'Level stagger', group: 'Motion', default: 110, min: 20, max: 1500, step: 20, unit: 'ms' },
    { type: 'number', key: 'pulseAt', label: 'Activation at', group: 'Motion', default: 2400, min: 0, max: 12000, step: 50, unit: 'ms' },
    { type: 'number', key: 'pulseMs', label: 'Activation sweep', group: 'Motion', default: 260, min: 20, max: 1500, step: 20, unit: 'ms',
      help: 'Per level, so the pulse travels down the hierarchy.' },
    { type: 'number', key: 'holdMs',  label: 'Activation holds', group: 'Motion', default: 900, min: 0, max: 5000, step: 50, unit: 'ms' },
  ],

  // Tech-DOCU palette: air as the tree swings in, a pop when the last level lands, and a
  // glass ping as the activation wave starts down the hierarchy — all on the same
  // firstAt/levelMs/pulseAt clock that drives the build and the pulse.
  sfx: (p) => {
    const rows = Math.max(1, Math.min(MAX_LEVELS, p.shape.split(',').filter((s) => s.trim()).length));
    return [
      { atMs: p.firstAt + 40, id: 'whoosh', gain: 0.35 },
      { atMs: p.firstAt + (rows - 1) * p.levelMs + 300, id: 'pop', gain: 0.35 },
      { atMs: p.pulseAt, id: 'glass', gain: 0.55 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const levels = p.shape.split(',').map((s) => Math.max(1, Math.round(Number(s.trim()) || 1)))
      .slice(0, MAX_LEVELS);
    const rows = levels.length;

    const top = height * 0.24;
    const rowGap = (height * 0.40) / Math.max(1, rows - 1);
    const nodeAt = (lv: number, i: number) => {
      const n = levels[lv];
      const span = width * 0.82;
      const x = (width - span) / 2 + (span * (i + 0.5)) / n;
      return { x, y: top + lv * rowGap };
    };

    // Depth wraps the diagram: the whole field swings in top-hinged and holds a faint 3D sway.
    // No parallax split here on purpose — connectors must stay glued to their nodes, and
    // shearing either layer would detach the hierarchy from its own lines.
    const enter = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const pose = depthPose(timeMs, seed, { enter, rx: -12, z: -70, swayDeg: 1.4 });

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? `linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.25) 100%), ${p.bg}` : 'transparent',
          opacity: clamp01(enter * 2),
          transform: pose,
          transformOrigin: '50% 35%',
          ...el('field'),
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...el('links') }}>
          {levels.slice(1).map((n, k) => {
            const lv = k + 1;
            const parents = levels[lv - 1];
            // A connector may not lead its own nodes — starting it early leaves a line hanging in
            // empty space below the level above.
            const appear = interpolate(timeMs, [p.firstAt + lv * p.levelMs, p.firstAt + lv * p.levelMs + 260], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
            const midY = top + (lv - 0.5) * rowGap;
            return Array.from({ length: n }).map((_, i) => {
              const child = nodeAt(lv, i);
              const parent = nodeAt(lv - 1, Math.floor((i * parents) / n));
              return (
                <path
                  key={`${lv}_${i}`}
                  d={`M ${parent.x} ${parent.y + p.nodeH / 2} L ${parent.x} ${midY} L ${child.x} ${midY} L ${child.x} ${child.y - p.nodeH / 2}`}
                  fill="none" stroke={rgba(p.link, 0.55)} strokeWidth={1.5}
                  opacity={appear}
                />
              );
            });
          })}
        </svg>

        <div style={{ position: 'absolute', inset: 0, ...el('nodes') }}>
          {levels.map((n, lv) =>
            Array.from({ length: n }).map((_, i) => {
              const { x, y } = nodeAt(lv, i);
              const s = spring({
                frame: fr(timeMs - p.firstAt - lv * p.levelMs - i * 30), fps: FPS,
                config: { damping: 22, mass: 0.6, stiffness: 190 },
                durationInFrames: Math.max(1, Math.round(fr(360))),
              });
              // Keyed to DEPTH — an index-keyed wave crosses the tree diagonally and reads as noise.
              const onAt = p.pulseAt + lv * p.pulseMs;
              const live = clamp01(interpolate(timeMs, [onAt, onAt + 200], [0, 1], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              }) - interpolate(timeMs, [onAt + p.holdMs, onAt + p.holdMs + 400], [0, 1], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              }));
              // Z-stagger: each node tips in through space, deeper levels from steeper angles,
              // with a landing smear that dies the instant its spring settles.
              const nodeBlur = s > 0.001 && s < 0.985 ? (1 - Math.min(1, s)) * 2.2 : 0;
              return (
                <span
                  key={`${lv}_${i}`}
                  style={{
                    position: 'absolute',
                    left: x - p.nodeW / 2, top: y - p.nodeH / 2,
                    width: p.nodeW, height: p.nodeH, borderRadius: p.radius,
                    background: `linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.14) 100%), ${live > 0 ? p.live : p.node}`,
                    boxShadow: live > 0 && p.glow > 0
                      ? `0 0 ${p.nodeH * 1.2 * live}px ${rgba(p.live, 0.75 * p.glow * live)}, 0 0 ${p.nodeH * 3 * live}px ${rgba(p.live, 0.3 * p.glow * live)}`
                      : '0 2px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
                    opacity: clamp01(s * 2),
                    filter: nodeBlur > 0.3 ? `blur(${nodeBlur.toFixed(2)}px)` : undefined,
                    // The activation wave also bumps each node ~7% as it passes — the pulse
                    // reads as energy hitting the box, not just a recolour.
                    transform: `${swingIn(Math.min(1, s), { rx: -14 - lv * 2, z: -40 })} scale(${(interpolate(s, [0, 1], [0.6, 1]) * (1 + live * 0.07)).toFixed(4)})`,
                  }}
                />
              );
            }),
          )}
        </div>

        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
