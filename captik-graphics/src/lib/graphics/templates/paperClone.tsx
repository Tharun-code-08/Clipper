// Reference: general/copy-and-paste.mp4  (window 80-3900ms, grid full ~2400ms, collapse ~3600ms)
// An isometric sheet that copies itself: one page, then a duplicate peeling off, then a whole grid,
// then the lot collapsing back to a single tile.
//
// The isometric look is a fixed rotate+skew on the STAGE, not per-sheet transforms — skewing each
// sheet individually makes them disagree about where the horizon is as soon as they move apart.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { smear, vel } from '../juice';

const MAX_COLS = 5;
const MAX_ROWS = 5;

export const paperClone = defineGraphicsTemplate({
  id: 'paper_clone',
  name: 'Paper Clone',
  category: 'device',
  tags: ['Copy', 'Isometric', 'Document'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'field', label: 'Field', hideable: false },
    { key: 'stage', label: 'Stage' },
  ],

  params: [
    { type: 'number', key: 'cols', label: 'Columns', group: 'Content', default: 4, min: 1, max: MAX_COLS, step: 1 },
    { type: 'number', key: 'rows', label: 'Rows',    group: 'Content', default: 4, min: 1, max: MAX_ROWS, step: 1 },
    { type: 'number', key: 'lines', label: 'Text lines per sheet', group: 'Content', default: 7, min: 0, max: 14, step: 1 },

    { type: 'color',  key: 'bg',    label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'sheet', label: 'Sheet',    group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'rule',  label: 'Text rules', group: 'Style', default: '#C9C2B2' },
    { type: 'color',  key: 'accent', label: 'Accent rule', group: 'Style', default: '#D97706' },
    { type: 'number', key: 'size',  label: 'Sheet width', group: 'Style', default: 260, min: 60, max: 600, step: 10, unit: 'px' },
    { type: 'number', key: 'tiltX', label: 'Stage tilt', group: 'Style', default: 62, min: 0, max: 80, step: 1, unit: '°' },
    { type: 'number', key: 'spin',  label: 'Stage spin', group: 'Style', default: -42, min: -90, max: 90, step: 1, unit: '°' },
    { type: 'boolean', key: 'fill', label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First sheet at', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Sheet stagger', group: 'Motion', default: 60, min: 0, max: 500, step: 10, unit: 'ms' },
    { type: 'number', key: 'shrinkAt', label: 'Collapse at', group: 'Motion', default: 3900, min: 0, max: 12000, step: 50, unit: 'ms' },
    { type: 'number', key: 'shrinkMs', label: 'Collapse over', group: 'Motion', default: 300, min: 100, max: 3000, step: 50, unit: 'ms' },
  ],

  // PAPER language: a page flick as the first sheets land, ONE typewriter tick while the grid
  // multiplies, a fast pass into the collapse and a pop as the pile snaps back to a single tile.
  sfx: (p) => [
    { atMs: p.firstAt + 100, id: 'paper', gain: 0.5 },
    { atMs: p.firstAt + p.stagger * 6, id: 'tick', gain: 0.4 },
    { atMs: p.shrinkAt, id: 'swish', gain: 0.45 },
    { atMs: p.shrinkAt + p.shrinkMs * 0.9, id: 'pop', gain: 0.55 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const cols = Math.round(p.cols);
    const rows = Math.round(p.rows);
    const sheetH = p.size * 1.3;
    const gap = p.size * 0.08;

    const collapseAt = (ms: number) => interpolate(ms, [p.shrinkAt, p.shrinkAt + p.shrinkMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const collapse = collapseAt(timeMs);

    const boardW = cols * p.size + (cols - 1) * gap;
    const boardH = rows * sheetH + (rows - 1) * gap;

    // The board is rotated, so its ON-SCREEN footprint is not boardW × boardH. Sizing against the
    // unrotated box is what let a 4×4 grid hang off both edges.
    const z = (Math.abs(p.spin) * Math.PI) / 180;
    const x = (p.tiltX * Math.PI) / 180;
    const projW = boardW * Math.cos(z) + boardH * Math.sin(z);
    const projH = (boardW * Math.sin(z) + boardH * Math.cos(z)) * Math.cos(x);
    const fit = Math.min(1, (width * 0.81) / projW, (height * 0.94) / Math.max(1, projH));

    // The desk keeps living: a slow ±0.5° drift on the stage spin (casual, paper-scan energy, not
    // gloss). The collapse carries a velocity smear — the pile BLURS as it snaps down to one tile
    // and lands crisp; edge speed is scale rate times the board's half-width.
    const wob = Math.sin(timeMs / 2600 * Math.PI * 2 + random(`${seed}-wob`) * Math.PI * 2) * 0.5;
    const colSmear = smear(vel((ms: number) => interpolate(collapseAt(ms), [0, 1], [1, 0.16]) * boardW * 0.5, timeMs), 0, 0.8);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? `radial-gradient(ellipse 120% 90% at 50% 24%, #17171C 0%, ${p.bg} 62%)` : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...el('field'),
        }}
      >
        {/* ONE isometric transform, on the stage. Per-sheet skews disagree about the horizon. */}
        <div
          style={{
            width: boardW, height: boardH,
            position: 'relative',
            filter: colSmear.blurPx > 0.3 ? `blur(${colSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `scale(${fit.toFixed(4)}) rotateX(${p.tiltX}deg) rotateZ(${(p.spin + wob).toFixed(2)}deg) scale(${interpolate(collapse, [0, 1], [1, 0.16]).toFixed(4)})`,
            transformStyle: 'preserve-3d',
            ...el('stage'),
          }}
        >
          {Array.from({ length: rows }).map((_, r) =>
            Array.from({ length: cols }).map((_, c) => {
              const i = r * cols + c;
              const sAt = (ms: number) => spring({
                frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
                config: { damping: 22, mass: 0.7, stiffness: 150 },
                durationInFrames: Math.max(1, Math.round(fr(520))),
              });
              const s = sAt(timeMs);
              if (s <= 0.001) return null;
              // Each copy DROPS onto the desk along the stage's own Z (the isometric space is
              // already there — no second perspective), twisting a few casual degrees as it falls,
              // with a drop-velocity smear that dies on contact.
              const dropSmear = smear(0, vel((ms: number) => (1 - sAt(ms)) * 90, timeMs));
              const twist = (random(`${seed}tw${i}`) - 0.5) * 12;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: c * (p.size + gap),
                    top: r * (sheetH + gap),
                    width: p.size, height: sheetH,
                    background: p.sheet,
                    boxShadow: `0 ${p.size * 0.03}px ${p.size * 0.09}px ${rgba('#000000', 0.3)}, 0 ${p.size * 0.12}px ${p.size * 0.3}px ${rgba('#000000', 0.25)}`,
                    padding: p.size * 0.1, boxSizing: 'border-box',
                    display: 'flex', flexDirection: 'column', gap: p.size * 0.055,
                    opacity: clamp01(s * 2),
                    filter: dropSmear.blurPx > 0.3 ? `blur(${dropSmear.blurPx.toFixed(2)}px)` : undefined,
                    transform: `translateZ(${(i * 0.6 + (1 - s) * 90).toFixed(1)}px) rotateZ(${((1 - s) * twist).toFixed(2)}deg) scale(${(interpolate(s, [0, 1], [0.8, 1]) * dropSmear.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.8, 1]) * dropSmear.sy).toFixed(4)})`,
                  }}
                >
                  {Array.from({ length: Math.round(p.lines) }).map((_, k) => (
                    <span
                      key={k}
                      style={{
                        height: p.size * 0.035,
                        width: k === 0 ? '55%' : k % 4 === 3 ? '70%' : '100%',
                        background: k === 0 ? p.accent : rgba(p.rule, 0.8),
                        borderRadius: 2,
                      }}
                    />
                  ))}
                </div>
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
