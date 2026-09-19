// Reference: graphics/map.mp4  (window 0-5480ms, route complete ~3840ms)
// Two pins on a map with a route arcing between them. The plane rides the SAME quadratic curve the
// route is drawn from — position and heading both evaluated from it — so it can never drift off the
// line or point the wrong way.
//
// Heading comes from the curve's derivative, not from the difference between successive frames: a
// finite difference needs a previous frame, and there is no previous frame in a pure renderer.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, ghosts, parallax, swingIn } from '../juice';

const MAX_ROADS = 10;

export const routeMap = defineGraphicsTemplate({
  id: 'route_map',
  name: 'Route Map',
  category: 'chart',
  tags: ['Map', 'Travel', 'Route'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'map',   label: 'Map', hideable: false },
    { key: 'route', label: 'Route' },
    { key: 'mover', label: 'Travelling mark' },
    { key: 'from',  label: 'Start pin' },
    { key: 'to',    label: 'End pin' },
  ],

  params: [
    { type: 'text', key: 'from',  label: 'Start', group: 'Content', default: 'London', maxLength: 24 },
    { type: 'text', key: 'to',    label: 'End',   group: 'Content', default: 'Dubai', maxLength: 24 },
    { type: 'text', key: 'mover', label: 'Travelling mark', group: 'Content', default: '✈', maxLength: 4 },

    { type: 'color',  key: 'bg',    label: 'Map',    group: 'Style', default: '#101014' },
    { type: 'color',  key: 'road',  label: 'Roads',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'line',  label: 'Route',  group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',   label: 'Labels', group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Label size', group: 'Style', default: 40, min: 8, max: 70, step: 1, unit: 'px' },
    { type: 'number', key: 'thick', label: 'Route width', group: 'Style', default: 6, min: 1, max: 24, step: 1, unit: 'px' },
    { type: 'number', key: 'arc',   label: 'Arc height', group: 'Style', default: 600, min: 0, max: 1000, step: 10, unit: 'px',
      help: 'Offsets the curve CONTROL point; the drawn peak rises about half this far.' },
    { type: 'boolean', key: 'dashed', label: 'Dashed route', group: 'Style', default: false },
    { type: 'boolean', key: 'roads', label: 'Background roads', group: 'Style', default: true },
    { type: 'boolean', key: 'fill',  label: 'Paint the map', group: 'Style', default: true },

    { type: 'number', key: 'startAt', label: 'Route starts', group: 'Motion', default: 620, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drawMs',  label: 'Draws over',   group: 'Motion', default: 2400, min: 200, max: 8000, step: 50, unit: 'ms' },
    { type: 'number', key: 'pinAt',   label: 'Pins at',      group: 'Motion', default: 150, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  // Travel palette: a pop as the first pin drops, an air pass as the plane lifts off, and a
  // chime on arrival — all riding the same pinAt/startAt/drawMs clock as the motion.
  sfx: (p) => [
    { atMs: p.pinAt + 60, id: 'pop', gain: 0.4 },
    { atMs: p.startAt, id: 'whoosh', gain: 0.5 },
    { atMs: p.startAt + p.drawMs, id: 'chime', gain: 0.55 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);

    const ax = width * 0.22, ay = height * 0.47;
    const bx = width * 0.68, by = height * 0.48;
    // Quadratic control point lifted above the chord.
    const qx = (ax + bx) / 2;
    const qy = (ay + by) / 2 - p.arc;

    const t = interpolate(timeMs, [p.startAt, p.startAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    // Point and tangent on the same quadratic. The tangent is the analytic derivative.
    const at = (u: number) => ({
      x: (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * qx + u * u * bx,
      y: (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * qy + u * u * by,
    });
    const dAt = (u: number) => ({
      x: 2 * (1 - u) * (qx - ax) + 2 * u * (bx - qx),
      y: 2 * (1 - u) * (qy - ay) + 2 * u * (by - qy),
    });
    const head = at(t);
    const dir = dAt(t);
    const heading = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;

    // Velocity of the mover along the curve, px/ms — the draw clock is linear, so du/dms is
    // simply 1/drawMs while drawing. Drives the plane's motion blur, stretch and ghosts.
    const drawing = t > 0.001 && t < 0.999;
    const vx = drawing ? dir.x / p.drawMs : 0;
    const vy = drawing ? dir.y / p.drawMs : 0;
    const speed = Math.hypot(vx, vy) * 1.4;
    const moverBlur = Math.min(6, speed * 2.4);
    // Stretch ALONG the heading: the rotate already aligns local x with the motion direction.
    const stretch = Math.min(0.18, speed * 0.055);
    const moverGhosts = ghosts(vx, vy, 2);

    // Depth: the whole map swings in top-hinged and keeps a faint sway; the background roads
    // sit on a deeper parallax layer while pin LABELS shear on a foreground one — the pins and
    // route stay glued to each other so the journey never detaches from its endpoints.
    const enter = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const pose = depthPose(timeMs, seed, { enter, rx: -10, z: -60, swayDeg: 1.2 });
    const parRoads = parallax(timeMs, seed, 0.3, height * 0.006);
    const parLabels = parallax(timeMs, seed, 0.55, height * 0.006);

    const pin = (x: number, y: number, label: string, delay: number, key: 'from' | 'to', hinge: number) => {
      const s = spring({
        frame: fr(timeMs - p.pinAt - delay), fps: FPS,
        config: { damping: 14, mass: 0.6, stiffness: 210 },
        durationInFrames: Math.max(1, Math.round(fr(520))),
      });
      // Z-stagger: each pin arrives through space at its own angle, with a landing smear that
      // dies the instant its drop spring settles.
      const pinBlur = s > 0.001 && s < 0.985 ? (1 - Math.min(1, s)) * 2.5 : 0;
      return (
        <div
          style={{
            position: 'absolute', left: x, top: y,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: p.size * 0.25,
            opacity: clamp01(s * 2),
            filter: pinBlur > 0.3 ? `blur(${pinBlur.toFixed(2)}px)` : undefined,
            transform: `${swingIn(Math.min(1, s), { rx: hinge, z: -50 })} translate(-50%,-50%) scale(${interpolate(s, [0, 1], [0.3, 1]).toFixed(4)})`,
            ...el(key),
          }}
        >
          <div style={{ width: p.size * 0.6, height: p.size * 0.6, borderRadius: '50%', background: p.line, border: `${p.size * 0.14}px solid #F4F1E8`, boxSizing: 'border-box', boxShadow: `0 0 ${p.size * 0.45}px ${rgba(p.line, 0.5)}, 0 ${p.size * 0.12}px ${p.size * 0.4}px ${rgba('#000000', 0.45)}` }} />
          <span style={{ fontSize: p.size * 0.6, color: p.ink, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', textShadow: '0 2px 14px rgba(0,0,0,0.6)', transform: `translate(${parLabels.x.toFixed(2)}px, ${parLabels.y.toFixed(2)}px)` }}>{label}</span>
        </div>
      );
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? `linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.3) 100%), ${p.bg}` : 'transparent',
          fontFamily: ff,
          opacity: clamp01(enter * 2),
          transform: pose,
          transformOrigin: '50% 40%',
          ...el('map'),
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {/* The map detail DIMS OUT as the route lands, so the finished frame is the journey and
              nothing else — which is where the reference ends up. */}
          <g opacity={1 - clamp01((t - 0.85) / 0.15)} transform={`translate(${parRoads.x.toFixed(2)} ${parRoads.y.toFixed(2)})`}>
          {p.roads && Array.from({ length: MAX_ROADS }).map((_, i) => {
            const horiz = i % 2 === 0;
            const v = random(`${seed}r${i}`);
            const w = width * (0.006 + random(`${seed}rw${i}`) * 0.01);
            return horiz
              ? <line key={i} x1={0} y1={v * height} x2={width} y2={v * height + (random(`${seed}rs${i}`) - 0.5) * height * 0.1} stroke={rgba(p.road, 0.10)} strokeWidth={w} />
              : <line key={i} x1={v * width} y1={0} x2={v * width + (random(`${seed}rs${i}`) - 0.5) * width * 0.1} y2={height} stroke={rgba(p.road, 0.10)} strokeWidth={w} />;
          })}
          </g>

          <g style={{ ...el('route') }}>
            <path
              d={`M ${ax} ${ay} Q ${qx} ${qy} ${bx} ${by}`}
              fill="none"
              stroke={p.line}
              strokeWidth={p.thick}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={p.dashed ? `${p.thick * 2} ${p.thick * 2}` : 1}
              strokeDashoffset={p.dashed ? 0 : 1 - t}
              style={{
                clipPath: p.dashed ? `inset(0 ${((1 - t) * 100).toFixed(2)}% 0 0)` : undefined,
                filter: `drop-shadow(0 0 8px ${rgba(p.line, 0.5)})`,
              }}
            />
          </g>
        </svg>

        {pin(ax, ay, p.from, 0, 'from', -18)}
        {pin(bx, by, p.to, 220, 'to', -13)}

        {/* Smear-frame ghosts trail the plane against its motion — gone the moment it parks. */}
        {moverGhosts.map((g, i) => (
          <div
            key={`gh${i}`}
            style={{
              position: 'absolute', left: head.x + g.dx, top: head.y + g.dy,
              fontSize: p.size * 1.5, lineHeight: 1, color: p.line,
              opacity: drawing ? g.opacity : 0,
              filter: `blur(${(moverBlur * 0.6 + i).toFixed(2)}px)`,
              transform: `translate(-50%,-50%) rotate(${heading.toFixed(2)}deg)`,
            }}
          >
            {p.mover}
          </div>
        ))}
        <div
          style={{
            position: 'absolute', left: head.x, top: head.y,
            fontSize: p.size * 1.5, lineHeight: 1, color: p.line,
            textShadow: `0 0 ${p.size * 0.5}px ${rgba(p.line, 0.55)}`,
            opacity: drawing ? 1 : 0,
            filter: moverBlur > 0.3 ? `blur(${moverBlur.toFixed(2)}px)` : undefined,
            transform: `translate(-50%,-50%) rotate(${heading.toFixed(2)}deg) scale(${(1 + stretch).toFixed(4)}, ${(1 - stretch * 0.55).toFixed(4)})`,
            ...el('mover'),
          }}
        >
          {p.mover}
        </div>

        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
