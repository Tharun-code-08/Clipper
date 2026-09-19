// Reference: general/calendar-grid-drop.mp4  (window 80-4900ms, tiles settle ~2600ms, tick ~4400ms)
// Tilted calendar tiles falling into a loose cluster, then a tick landing on the front one.
//
// Every tile lands on its OWN spring from its own start height, so the cluster assembles rather
// than arriving as a block — the reference never has two tiles moving in lockstep.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { smear, sway3d, swingIn, vel } from '../juice';

const MAX_TILES = 6;

export const calendarDrop = defineGraphicsTemplate({
  id: 'calendar_drop',
  name: 'Calendar Drop',
  category: 'device',
  tags: ['Calendar', 'Drop', 'Confirm'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'field', label: 'Field', hideable: false },
    { key: 'tiles', label: 'Tiles' },
    { key: 'tick',  label: 'Tick' },
  ],

  params: [
    { type: 'number', key: 'count', label: 'Tiles', group: 'Content', default: 6, min: 1, max: MAX_TILES, step: 1 },
    { type: 'number', key: 'cols',  label: 'Grid columns', group: 'Content', default: 7, min: 3, max: 10, step: 1 },
    { type: 'number', key: 'rows',  label: 'Grid rows', group: 'Content', default: 4, min: 2, max: 8, step: 1 },

    { type: 'color',  key: 'bg',    label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'tile',  label: 'Tiles',    group: 'Style', default: '#191920' },
    { type: 'color',  key: 'cell',  label: 'Grid dots', group: 'Style', default: '#CBBE9B' },
    { type: 'color',  key: 'tick',  label: 'Tick',     group: 'Style', default: '#4ADE80' },
    { type: 'number', key: 'size',  label: 'Tile width', group: 'Style', default: 240, min: 60, max: 600, step: 10, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',  group: 'Style', default: 10, min: 0, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'spread', label: 'Cluster spread', group: 'Style', default: 360, min: 0, max: 400, step: 5, unit: 'px' },
    { type: 'number', key: 'tilt',  label: 'Max tilt', group: 'Style', default: 14, min: 0, max: 45, step: 1, unit: '°' },
    { type: 'boolean', key: 'fill', label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First tile at', group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Tile stagger', group: 'Motion', default: 260, min: 0, max: 1200, step: 20, unit: 'ms' },
    { type: 'number', key: 'tickAt',  label: 'Tick at', group: 'Motion', default: 3600, min: 0, max: 10000, step: 50, unit: 'ms' },
  ],

  // Physical objects falling: air on approach, a pop as the first tile hits, a quieter one as the
  // pile builds, and the FM chime on the confirm tick — the template's one success milestone.
  sfx: (p) => [
    { atMs: Math.max(0, p.firstAt - 60), id: 'whoosh', gain: 0.35 },
    { atMs: p.firstAt + 560, id: 'pop', gain: 0.5 },
    { atMs: p.firstAt + p.stagger * 2 + 560, id: 'pop', gain: 0.35 },
    { atMs: p.tickAt + 200, id: 'chime', gain: 0.6 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const count = Math.round(p.count);
    const tileH = p.size * 0.62;

    const tick = spring({
      frame: fr(timeMs - p.tickAt), fps: FPS,
      config: { damping: 13, mass: 0.5, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    // The settled pile keeps living in space: a slow ±1.2° 3D sway shared by the tiles and the
    // tick (same seed → same phase), so the cluster reads as one object on a desk, never a flat
    // print. The falling tiles carry their own velocity smears and land crisp.
    const pileSway = sway3d(timeMs, seed, 1.2, 4200);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          ...el('field'),
        }}
      >
        <div style={{ position: 'absolute', inset: 0, transform: pileSway, ...el('tiles') }}>
          {Array.from({ length: count }).map((_, i) => {
            // Each tile has its own spring AND its own drop height — a shared one reads as a block.
            const sAt = (ms: number) => spring({
              frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
              config: { damping: 19, mass: 0.9, stiffness: 120 },
              durationInFrames: Math.max(1, Math.round(fr(950))),
            });
            const s = sAt(timeMs);
            // Cluster is wider than tall in the reference, so x gets the full spread and y ~half.
            // Early tiles land near the centre and later ones further out, so the pile grows
            // outward the way the reference does instead of appearing at full width.
            const g = count > 1 ? 0.55 + 0.45 * (i / (count - 1)) : 1;
            const restX = width / 2 + (random(`${seed}x${i}`) - 0.5) * p.spread * 1.6 * g;
            const restY = height / 2 + (random(`${seed}y${i}`) - 0.5) * p.spread * 0.55 * g;
            const fall = (0.6 + random(`${seed}f${i}`) * 0.7) * height * 0.65;
            const spin = (random(`${seed}r${i}`) - 0.5) * 2 * p.tilt;
            // MOTION BLUR: the drop velocity smears the tile mid-fall (with squash-and-stretch
            // along the fall axis) and dies exactly on contact; each tile also tumbles in off its
            // own top hinge so the cluster assembles as objects arriving in space.
            const fallSmear = smear(0, vel((ms: number) => (1 - sAt(ms)) * fall, timeMs), 0.85);
            // The reference thins the pile back to three tiles as the tick lands.
            const keep = i < 3 ? 1 : 1 - clamp01((timeMs - (p.tickAt - 250)) / 450);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: restX - p.size / 2,
                  top: restY - tileH / 2 - (1 - s) * fall,
                  width: p.size, height: tileH,
                  background: `linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.22) 100%), ${p.tile}`,
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: p.radius,
                  boxShadow: `0 ${p.size * 0.05}px ${p.size * 0.12}px ${rgba('#000000', 0.45)}, 0 ${p.size * 0.16}px ${p.size * 0.38}px ${rgba('#000000', 0.4)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
                  filter: fallSmear.blurPx > 0.3 ? `blur(${fallSmear.blurPx.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(s, { rx: -18 - random(`${seed}sw${i}`) * 10, z: -120 })} rotate(${(spin * (0.4 + s * 0.6)).toFixed(2)}deg) scale(${fallSmear.sx.toFixed(4)}, ${fallSmear.sy.toFixed(4)})`,
                  opacity: clamp01(s * 2.2 - 0.25) * keep,
                  padding: p.size * 0.06, boxSizing: 'border-box',
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.round(p.cols)}, 1fr)`,
                  gridTemplateRows: `repeat(${Math.round(p.rows)}, 1fr)`,
                  gap: p.size * 0.022,
                }}
              >
                {Array.from({ length: Math.round(p.cols) * Math.round(p.rows) }).map((_, k) => (
                  <span
                    key={k}
                    style={{
                      background: rgba(p.cell, 0.15 + random(`${seed}c${i}_${k}`) * 0.5),
                      borderRadius: 2,
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: '50%',
            display: 'flex', justifyContent: 'center',
            opacity: clamp01(tick * 2),
            transform: `${pileSway} translateY(-50%) scale(${interpolate(tick, [0, 1], [0.4, 1]).toFixed(4)})`,
            ...el('tick'),
          }}
        >
          <svg
            width={p.size * 0.34} height={p.size * 0.34} viewBox="0 0 40 40"
            style={{ filter: `drop-shadow(0 0 10px ${rgba(p.tick, 0.45)}) drop-shadow(0 0 28px ${rgba(p.tick, 0.2)})` }}
          >
            <path
              d="M8 21 L17 30 L33 12"
              fill="none" stroke={p.tick} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"
              pathLength={1} strokeDasharray={1} strokeDashoffset={1 - clamp01(tick)}
            />
          </svg>
        </div>

        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
