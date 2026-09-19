// Reference: text/sticky-notes.mp4  (window 1120-4400ms, notes settle ~2400ms, label ~3400ms)
// Coloured sticky squares flying in and scattering across a board, then a labelled note landing
// on top of the pile.
//
// Distinct from sticky_notes, where notes DROP onto a board one at a time from above. Here they
// arrive from all four edges at once and the label is the payoff.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, sway3d, swingIn, vel } from '../juice';

const MAX_NOTES = 20;

export const stickyScatter = defineGraphicsTemplate({
  id: 'sticky_scatter',
  name: 'Sticky Scatter',
  category: 'title',
  tags: ['Notes', 'Scatter', 'Label'],
  design: { w: 900, h: 1200 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat'],

  elements: [
    { key: 'board', label: 'Board', hideable: false },
    { key: 'notes', label: 'Notes' },
    { key: 'label', label: 'Label' },
  ],

  params: [
    { type: 'text',   key: 'label',  label: 'Label', group: 'Content', default: 'Sticky', maxLength: 24 },
    { type: 'number', key: 'count',  label: 'Notes', group: 'Content', default: 13, min: 1, max: MAX_NOTES, step: 1 },
    { type: 'text',   key: 'colors', label: 'Note colours', group: 'Content', maxLength: 140,
      default: '#EFD46B,#9DC4BC,#E29B84,#C2C57F,#C7ADDA',
      help: 'Comma-separated. Notes cycle through these.' },

    { type: 'color',  key: 'bg',     label: 'Board',  group: 'Style', default: '#EDEAE2' },
    { type: 'color',  key: 'ink',    label: 'Label text', group: 'Style', default: '#141416' },
    { type: 'color',  key: 'chip',   label: 'Label note', group: 'Style', default: '#EFD46B' },
    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Note size', group: 'Style', default: 104, min: 24, max: 300, step: 4, unit: 'px' },
    { type: 'number', key: 'labelSize', label: 'Label size', group: 'Style', default: 62, min: 12, max: 160, step: 2, unit: 'px' },
    { type: 'number', key: 'spread', label: 'Scatter spread', group: 'Style', default: 62, min: 20, max: 100, step: 2, unit: '%' },
    { type: 'number', key: 'tilt',   label: 'Max tilt', group: 'Style', default: 18, min: 0, max: 45, step: 1, unit: '°' },
    { type: 'boolean', key: 'fill',  label: 'Paint the board', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First note at', group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Note stagger', group: 'Motion', default: 90, min: 0, max: 500, step: 5, unit: 'ms' },
    { type: 'number', key: 'labelAt', label: 'Label at', group: 'Motion', default: 2200, min: 0, max: 10000, step: 50, unit: 'ms' },
  ],

  // PAPER language: a flick as the swarm starts, a second flick mid-pile, a glossy pop when the
  // label slaps on top — all timed off the same firstAt/stagger/labelAt that drive the motion.
  sfx: (p) => [
    { atMs: p.firstAt + 100, id: 'paper', gain: 0.5 },
    { atMs: p.firstAt + p.stagger * 5 + 120, id: 'paper', gain: 0.35 },
    { atMs: p.labelAt + 160, id: 'pop', gain: 0.75 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const n = Math.round(p.count);
    const pal = p.colors.split(',').map((s) => s.trim()).filter(Boolean);
    const colours = pal.length ? pal : ['#EFD46B'];

    const labelAt = (ms: number) => spring({
      frame: fr(ms - p.labelAt), fps: FPS,
      config: { damping: 15, mass: 0.6, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const label = labelAt(timeMs);
    // The label is the payoff: it swings in top-hinged through 3D on its existing spring, its
    // scale-in velocity smears it for the few frames it is moving, and after it lands a ±1.6°
    // sway keeps it living on top of the pile instead of dying into a flat chip.
    const labelPose = depthPose(timeMs, `${seed}-lbl`, { enter: label, rx: -22, z: -140, swayDeg: 1.6 });
    const vLbl = vel(labelAt, timeMs) * p.labelSize * 2.2;
    const smLbl = smear(0, vLbl);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          fontFamily: ff,
          ...el('board'),
        }}
      >
        {/* The whole board of notes keeps a ±1.5° resting sway — the pile never flattens back
            into a web page once it has settled. */}
        <div style={{ position: 'absolute', inset: 0, transform: sway3d(timeMs, seed, 1.5), ...el('notes') }}>
          {Array.from({ length: n }).map((_, i) => {
            const sAt = (ms: number) => spring({
              frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
              config: { damping: 21, mass: 0.8, stiffness: 135 },
              durationInFrames: Math.max(1, Math.round(fr(760))),
            });
            const s = sAt(timeMs);
            if (s <= 0.001) return null;
            const restX = width * (0.5 + (random(`${seed}x${i}`) - 0.5) * (p.spread / 100));
            const restY = height * (0.5 + (random(`${seed}y${i}`) - 0.5) * (p.spread / 100) * 0.85);
            // Notes come in from whichever edge they are nearest — arriving from one direction
            // reads as a swipe, not a scatter.
            const edge = Math.floor(random(`${seed}e${i}`) * 4);
            const fromX = edge === 0 ? -p.size * 1.5 : edge === 1 ? width + p.size * 1.5 : restX;
            const fromY = edge === 2 ? -p.size * 1.5 : edge === 3 ? height + p.size * 1.5 : restY;
            const spin = (random(`${seed}r${i}`) - 0.5) * 2 * p.tilt;
            // Each note hammers in through 3D, hinged TOWARD the edge it flew from, so the swarm
            // reads as paper squares arriving in space; its flight velocity smears it along the
            // travel axis and dies the frame it sticks.
            const hinge = {
              rx: edge === 2 ? -20 : edge === 3 ? 16 : -8 - random(`${seed}hx${i}`) * 8,
              ry: edge === 0 ? -(14 + random(`${seed}hy${i}`) * 8)
                : edge === 1 ? 14 + random(`${seed}hy${i}`) * 8
                : (random(`${seed}hy${i}`) - 0.5) * 14,
              z: -120,
            };
            const vx = vel((ms) => fromX + (restX - fromX) * sAt(ms), timeMs);
            const vy = vel((ms) => fromY + (restY - fromY) * sAt(ms), timeMs);
            const sm = smear(vx, vy, 0.8);
            return (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: fromX + (restX - fromX) * s - p.size / 2,
                  top: fromY + (restY - fromY) * s - p.size / 2,
                  width: p.size, height: p.size,
                  background: colours[i % colours.length],
                  boxShadow: `0 ${p.size * 0.02}px ${p.size * 0.05}px ${rgba('#000000', 0.1)}, `
                    + `0 ${p.size * 0.08}px ${p.size * 0.18}px ${rgba('#000000', 0.16)}`,
                  filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(s, hinge)} rotate(${(spin * s).toFixed(2)}deg) scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: '50%',
            display: 'flex', justifyContent: 'center',
            opacity: clamp01(label * 2),
            filter: smLbl.blurPx > 0.3 ? `blur(${smLbl.blurPx.toFixed(2)}px)` : undefined,
            transform: `${labelPose} translateY(-50%) rotate(${((1 - label) * -8).toFixed(2)}deg) `
              + `scale(${(interpolate(label, [0, 1], [0.6, 1]) * smLbl.sx).toFixed(4)}, ${(interpolate(label, [0, 1], [0.6, 1]) * smLbl.sy).toFixed(4)})`,
            ...el('label'),
          }}
        >
          <span
            style={{
              background: p.chip, color: p.ink,
              fontSize: p.labelSize, fontWeight: 800,
              padding: `${p.labelSize * 0.22}px ${p.labelSize * 0.55}px`,
              boxShadow: `0 ${p.labelSize * 0.04}px ${p.labelSize * 0.1}px ${rgba('#000000', 0.14)}, `
                + `0 ${p.labelSize * 0.16}px ${p.labelSize * 0.36}px ${rgba('#000000', 0.2)}`,
              whiteSpace: 'nowrap',
            }}
          >
            {p.label}
          </span>
        </div>
      </div>
    );
  },
});
