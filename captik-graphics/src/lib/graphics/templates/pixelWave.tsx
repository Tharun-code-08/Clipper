// Reference: general/interactive-pixel-art-waves.mp4  (window 160-3400ms, continuous, no settle)
// Chunky pixel blocks tracing a travelling wave, each row a beat behind the one above it.
//
// Every block is a QUANTISED sample of one sine — the whole thing is a pure function of timeMs with
// no state at all, which is why it survives being scrubbed, exported at any fps, and looped.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose } from '../juice';

const MAX_COLS = 40;
const MAX_ROWS = 20;

export const pixelWave = defineGraphicsTemplate({
  id: 'pixel_wave',
  name: 'Pixel Wave',
  category: 'fx',
  tags: ['Pixels', 'Wave', 'Loop'],
  design: { w: 900, h: 1200 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'field', label: 'Field', hideable: false },
    { key: 'wave',  label: 'Wave' },
  ],

  params: [
    { type: 'number', key: 'cols', label: 'Columns', group: 'Content', default: 26, min: 6, max: MAX_COLS, step: 1 },
    { type: 'number', key: 'rows', label: 'Bands',   group: 'Content', default: 11, min: 2, max: MAX_ROWS, step: 1 },

    { type: 'color',  key: 'bg',    label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'near',  label: 'Front band', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'far',   label: 'Back band',  group: 'Style', default: '#57492E' },
    { type: 'number', key: 'thick', label: 'Band thickness', group: 'Style', default: 1.4, min: 0.4, max: 4, step: 0.1, unit: '×' },
    { type: 'boolean', key: 'fill', label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'amp',   label: 'Wave height', group: 'Motion', default: 26, min: 2, max: 60, step: 1, unit: '%' },
    { type: 'number', key: 'cycles', label: 'Waves across', group: 'Motion', default: 1.6, min: 0.3, max: 6, step: 0.1 },
    { type: 'number', key: 'speed', label: 'Travel speed', group: 'Motion', default: 0.34, min: 0, max: 2, step: 0.02 },
    { type: 'number', key: 'lag',   label: 'Band lag', group: 'Motion', default: 0.055, min: 0, max: 0.3, step: 0.005 },
    { type: 'number', key: 'waveAt', label: 'Wave forms at', group: 'Motion', default: 60, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'bandIn', label: 'Band entrance stagger', group: 'Motion', default: 45, min: 0, max: 300, step: 5, unit: 'ms' },
  ],

  // Retro-digital cues: a rounded blip as the wave forms, a soft pop when the last band lands —
  // both timed off the same params that stagger the band entrances.
  sfx: (p) => [
    { atMs: p.waveAt, id: 'blip', gain: 0.4 },
    { atMs: p.waveAt + Math.round(p.rows) * p.bandIn, id: 'pop', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const cols = Math.round(p.cols);
    const rows = Math.round(p.rows);
    const cw = width / cols;
    const rowPitch = height / (rows + 6);
    const blockH = rowPitch * p.thick;
    const amp = height * (p.amp / 100);
    const mid = height * 0.5;

    // Modulo phase — no accumulator, so any frame can be rendered in isolation.
    const ph = ((timeMs / 1000) * p.speed) % 1;

    // The FIELD is a scene card in 3D: it swings in as the first band forms and then carries a
    // small resting sway. The blocks themselves stay razor-sharp — motion blur on quantised
    // pixels would betray the pixel-art language, so the depth lives on the card, not the wave.
    // scale(1.015) covers the sway's perspective excursion at the card edge.
    const enter = spring({
      frame: fr(timeMs - p.waveAt), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    const pose = depthPose(timeMs, seed, { enter, rx: -12, z: -80, swayDeg: 1.5 });

    const mix = (t: number) => {
      const a = p.near.replace('#', ''); const b = p.far.replace('#', '');
      const ch = (h: string, i: number) => parseInt(h.slice(i * 2, i * 2 + 2), 16);
      if (a.length !== 6 || b.length !== 6) return p.near;
      // Hex out, not rgb() — rgba() below passes non-hex straight through and the alpha would
      // silently do nothing.
      const hex = (i: number) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)
        .toString(16).padStart(2, '0');
      return `#${hex(0)}${hex(1)}${hex(2)}`;
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          transform: `${pose} scale(1.015)`,
          transformOrigin: '50% 45%',
          ...el('field'),
        }}
      >
        <div style={{ position: 'absolute', inset: 0, ...el('wave') }}>
          {Array.from({ length: rows }).map((_, r) => {
            const depth = r / Math.max(1, rows - 1);
            const tint = mix(depth);
            // Bands swell out of a flat line, one after another — the reference is blank at 160ms
            // and fully formed by ~800ms, so the wave does have an entrance to honour.
            const form = spring({
              frame: fr(timeMs - p.waveAt - r * p.bandIn), fps: FPS,
              config: { damping: 22, mass: 0.7, stiffness: 150 },
              durationInFrames: Math.max(1, Math.round(fr(560))),
            });
            if (form <= 0.001) return null;
            return Array.from({ length: cols }).map((_, c) => {
              const u = c / cols;
              const y = mid
                + Math.sin((u * p.cycles - ph - r * p.lag) * Math.PI * 2) * amp * form
                + (r - (rows - 1) / 2) * rowPitch * form;
              // Quantise to the block grid — the stepped edge IS the pixel-art look.
              const snapped = Math.round(y / blockH) * blockH;
              return (
                <span
                  key={`${r}_${c}`}
                  style={{
                    position: 'absolute',
                    left: c * cw, top: snapped,
                    width: Math.ceil(cw), height: Math.ceil(blockH),
                    background: rgba(tint, clamp01(0.35 + (1 - depth) * 0.65) * clamp01(form * 2)),
                  }}
                />
              );
            });
          })}
        </div>
      </div>
    );
  },
});
