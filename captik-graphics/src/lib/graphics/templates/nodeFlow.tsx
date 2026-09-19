// Reference: overlays/mcp-animation.mp4  (window 600-5240ms, graph complete ~3560ms)
// Labelled source nodes wired into one hub by curved connectors that draw themselves, each on its
// own delay. The connector is drawn BEFORE its node lands, so the line appears to reach out and
// pull the node into place.
//
// The curve and the node share one anchor calculation, so a node can never sit off the end of its
// own wire.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, swingIn } from '../juice';

const MAX_NODES = 6;

export const nodeFlow = defineGraphicsTemplate({
  id: 'node_flow',
  name: 'Node Flow',
  category: 'chart',
  tags: ['Diagram', 'Integration', 'Graph'],
  design: { w: 900, h: 1150 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'graph', label: 'Graph', hideable: false },
    { key: 'hub',   label: 'Hub' },
    ...Array.from({ length: MAX_NODES }, (_, i) => ({ key: `node${i + 1}`, label: `Node ${i + 1}` })),
    ...Array.from({ length: MAX_NODES }, (_, i) => ({ key: `link${i + 1}`, label: `Wire ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'nodes', label: 'Nodes', group: 'Content', multiline: true, maxLength: 200,
      default: 'M|#f2b01e\nG|#e5484d\nS|#5b5bd6',
      help: 'One per line: label | colour.' },
    { type: 'text', key: 'hub',   label: 'Hub glyph', group: 'Content', default: '⚡', maxLength: 4 },

    { type: 'color',  key: 'hubBg', label: 'Hub',   group: 'Style', default: '#2b6ef5' },
    { type: 'color',  key: 'wire',  label: 'Wire',  group: 'Style', default: '#2b6ef5' },
    { type: 'color',  key: 'ink',   label: 'Node text', group: 'Style', default: '#ffffff' },
    { type: 'font',   key: 'font',  label: 'Font',  group: 'Style', default: 'inter' },
    { type: 'number', key: 'hubSize', label: 'Hub size', group: 'Style', default: 112, min: 40, max: 320, step: 4, unit: 'px' },
    { type: 'number', key: 'dot',   label: 'Node size', group: 'Style', default: 80, min: 20, max: 200, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Spread', group: 'Style', default: 345, min: 80, max: 440, step: 10, unit: 'px',
      help: 'How far the top and bottom sources sit from the hub line.' },
    { type: 'number', key: 'thick', label: 'Wire width', group: 'Style', default: 5, min: 1, max: 16, step: 1, unit: 'px' },
    { type: 'boolean', key: 'dashed', label: 'Dashed wires', group: 'Style', default: true },

    { type: 'number', key: 'hubAt',   label: 'Hub at',   group: 'Motion', default: 120, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'firstAt', label: 'First wire at', group: 'Motion', default: 20, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Stagger',  group: 'Motion', default: 200, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drawMs',  label: 'Wire draws over', group: 'Motion', default: 480, min: 100, max: 3000, step: 20, unit: 'ms' },
  ],

  // Device/tech palette: a swish as the first wire reaches out, a pop as the first source
  // lands, a dry snap on the last — the same firstAt/stagger/drawMs grid the motion uses.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_NODES, p.nodes.split('\n').map((l) => l.trim()).filter(Boolean).length));
    const cues: { atMs: number; id: 'swish' | 'pop' | 'snap'; gain?: number }[] = [
      { atMs: p.firstAt, id: 'swish', gain: 0.45 },
      { atMs: p.firstAt + p.drawMs * 0.45 + 150, id: 'pop', gain: 0.4 },
    ];
    if (n > 1) cues.push({ atMs: p.firstAt + (n - 1) * p.stagger + p.drawMs * 0.45 + 150, id: 'snap', gain: 0.5 });
    return cues;
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const nodes = p.nodes.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_NODES)
      .map((l) => { const [label = '', colour = '#2b6ef5'] = l.split('|').map((s) => s.trim()); return { label, colour }; });
    if (!nodes.length) return null;

    // The hub sits off to the right and the sources stack down the left, which is the shape the
    // reference builds — a fan around a centred hub reads as a radial diagram, not a pipeline.
    const cx = width * 0.72;
    const cy = height / 2;
    // Reach for the far sources first and work inward; the middle one lands last.
    const mid = (nodes.length - 1) / 2;
    const order = nodes.map((_, i) => i).sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid));

    const hubIn = spring({
      frame: fr(timeMs - p.hubAt), fps: FPS,
      config: { damping: 15, mass: 0.7, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });

    // One anchor calculation, used by both the wire and the node.
    const anchor = (i: number) => ({
      x: width * 0.24,
      y: cy + ((i - mid) / Math.max(0.5, mid)) * p.radius,
    });

    // Depth: the whole pipeline swings in side-hinged (it reads left-to-right) and keeps a
    // faint 3D sway so the held diagram never flattens; wires and nodes stay glued together.
    const graphIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const pose = depthPose(timeMs, seed, { enter: graphIn, ry: 16, z: -80, swayDeg: 1.6 });

    return (
      <div
        style={{
          position: 'absolute', inset: 0, fontFamily: ff,
          opacity: clamp01(graphIn * 2),
          transform: pose, transformOrigin: '60% 50%',
          ...el('graph'),
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {nodes.map((_, i) => {
            const at = p.firstAt + order.indexOf(i) * p.stagger;
            const t = interpolate(timeMs, [at, at + p.drawMs], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
            const { x, y } = anchor(i);
            // Control points bow the wire away from the straight line between node and hub.
            const mx = (x + cx) / 2;
            const d = `M ${x.toFixed(1)} ${y.toFixed(1)} C ${mx.toFixed(1)} ${y.toFixed(1)}, ${mx.toFixed(1)} ${cy.toFixed(1)}, ${cx.toFixed(1)} ${cy.toFixed(1)}`;
            return (
              <g key={i} style={{ ...el(`link${i + 1}`) }}>
                <path
                  d={d}
                  fill="none"
                  stroke={rgba(p.wire, 0.85)}
                  strokeWidth={p.thick}
                  strokeLinecap="round"
                  strokeDasharray={p.dashed ? `${p.thick * 2.4} ${p.thick * 2.4}` : undefined}
                  pathLength={p.dashed ? undefined : 1}
                  style={{
                    // Grown from the HUB outward — the wire reaches for the source and pulls it in.
                    // Dashed wires cannot also use a dash-based reveal, so they clip in with a
                    // width mask instead of a dash offset.
                    clipPath: p.dashed ? `inset(0 0 0 ${((1 - t) * 100).toFixed(2)}%)` : undefined,
                    strokeDasharray: p.dashed ? `${p.thick * 2.4} ${p.thick * 2.4}` : '1',
                    strokeDashoffset: p.dashed ? 0 : -(1 - t),
                  }}
                />
              </g>
            );
          })}
        </svg>

        {nodes.map((nd, i) => {
          const at = p.firstAt + order.indexOf(i) * p.stagger + p.drawMs * 0.45;
          const s = spring({
            frame: fr(timeMs - at), fps: FPS,
            config: { damping: 15, mass: 0.6, stiffness: 200 },
            durationInFrames: Math.max(1, Math.round(fr(500))),
          });
          const { x, y } = anchor(i);
          // Z-stagger: each source swings in side-hinged from its own angle (the wire pulls
          // it out of depth) with a landing smear that dies as the spring settles.
          const nodeBlur = s > 0.001 && s < 0.985 ? (1 - Math.min(1, s)) * 3 : 0;
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: x, top: y,
                width: p.dot, height: p.dot, borderRadius: '50%',
                background: nd.colour, color: p.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: p.dot * 0.46, fontWeight: 800, lineHeight: 1,
                opacity: clamp01(s * 2),
                filter: nodeBlur > 0.3 ? `blur(${nodeBlur.toFixed(2)}px)` : undefined,
                transform: `${swingIn(s, { ry: -18 - i * 2, z: -50 })} translate(-50%,-50%) scale(${interpolate(s, [0, 1], [0.3, 1]).toFixed(4)})`,
                boxShadow: `0 ${p.dot * 0.08}px ${p.dot * 0.2}px ${rgba('#000000', 0.18)}`,
                ...el(`node${i + 1}`),
              }}
            >
              {nd.label}
            </div>
          );
        })}

        <div
          style={{
            position: 'absolute', left: cx, top: cy,
            width: p.hubSize, height: p.hubSize, borderRadius: p.hubSize * 0.26,
            background: p.hubBg, color: p.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: p.hubSize * 0.46, lineHeight: 1,
            border: `${Math.max(2, p.thick)}px dashed ${rgba(p.wire, 0.55)}`,
            boxSizing: 'border-box',
            opacity: clamp01(hubIn * 1.8),
            filter: hubIn > 0.001 && hubIn < 0.985 ? `blur(${((1 - Math.min(1, hubIn)) * 3).toFixed(2)}px)` : undefined,
            transform: `${swingIn(hubIn, { rx: -14, z: -60 })} translate(-50%,-50%) scale(${interpolate(hubIn, [0, 1], [0.5, 1]).toFixed(4)})`,
            ...el('hub'),
          }}
        >
          {p.hub}
        </div>
      </div>
    );
  },
});
