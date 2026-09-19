// Reference: general/friendship-beads-1.mp4  (window 1040-5400ms, word forms ~2000ms, scatters ~4200ms)
// Letter beads scattered on a surface that fly into a line spelling a word, hold, then scatter back.
//
// The scatter positions on the way out are the SAME seeded positions as on the way in, so the beads
// return home rather than landing somewhere new — the reference loops, and a fresh scatter breaks it.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeLightLeak, luxeVignette } from '../luxe';
import { ghosts, parallax, smear, sway3d, vel } from '../juice';

const MAX_LETTERS = 14;

export const beadWord = defineGraphicsTemplate({
  id: 'bead_word',
  name: 'Bead Word',
  category: 'title',
  tags: ['Beads', 'Assemble', 'Word'],
  design: { w: 900, h: 1200 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter', 'playfair'],

  elements: [
    { key: 'surface', label: 'Surface', hideable: false },
    { key: 'beads',   label: 'Beads' },
  ],

  params: [
    { type: 'text', key: 'word', label: 'Word', group: 'Content', default: 'SUBSCRIBE', maxLength: MAX_LETTERS },

    { type: 'color',  key: 'bg',    label: 'Surface', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'bead',  label: 'Beads',   group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'ink',   label: 'Letters', group: 'Style', default: '#2a2620' },
    { type: 'font',   key: 'font',  label: 'Font',    group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size',  label: 'Bead size', group: 'Style', default: 82, min: 16, max: 160, step: 2, unit: 'px' },
    { type: 'number', key: 'gap',   label: 'Bead gap', group: 'Style', default: 6, min: 0, max: 80, step: 2, unit: 'px' },
    { type: 'number', key: 'scatter', label: 'Scatter spread', group: 'Style', default: 62, min: 10, max: 100, step: 2, unit: '%' },
    { type: 'boolean', key: 'fill', label: 'Paint the surface', group: 'Style', default: true },

    { type: 'number', key: 'gatherAt', label: 'Gathers at',  group: 'Motion', default: 1000, min: 0, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'stagger',  label: 'Bead stagger', group: 'Motion', default: 90, min: 0, max: 400, step: 5, unit: 'ms' },
    { type: 'number', key: 'holdMs',   label: 'Holds for',   group: 'Motion', default: 2900, min: 0, max: 8000, step: 50, unit: 'ms' },
    { type: 'boolean', key: 'scatterBack', label: 'Scatter back at the end', group: 'Motion', default: true },
  ],

  // Tactile beads: air as the flight starts, glossy pops as the first and last beads click into
  // the word, a lighter pass when they scatter home — all off the same params as the springs.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_LETTERS, p.word.length));
    const land = (i: number) => p.gatherAt + i * p.stagger + 430;
    const cues: { atMs: number; id: 'swish' | 'pop'; gain: number }[] = [
      { atMs: p.gatherAt, id: 'swish', gain: 0.45 },
      { atMs: land(0), id: 'pop', gain: 0.55 },
    ];
    if (n > 1) cues.push({ atMs: land(n - 1), id: 'pop', gain: 0.7 });
    if (p.scatterBack) cues.push({ atMs: p.gatherAt + n * p.stagger + p.holdMs, id: 'swish', gain: 0.4 });
    return cues;
  },

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const letters = p.word.slice(0, MAX_LETTERS).split('');
    const n = Math.max(1, letters.length);

    const pitch = p.size + p.gap;
    const lineW = n * pitch - p.gap;
    const x0 = (width - lineW) / 2;
    const y0 = height / 2 - p.size / 2;

    // The warm leak drifts on a shallower parallax depth than the swaying bead plane, so the
    // surface reads as lit space rather than a flat backdrop.
    const leak = parallax(timeMs, seed, 0.3, height * 0.008);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          fontFamily: ff,
          ...el('surface'),
        }}
      >
        {p.fill && <div style={{ ...luxeLightLeak(), transform: `translate(${leak.x.toFixed(2)}px, ${leak.y.toFixed(2)}px)` }} />}
        {/* The bead plane keeps living in 3D — a ±1.6° sway through gather, hold and scatter, so
            the assembled word never flattens back into a web page. */}
        <div style={{ position: 'absolute', inset: 0, transform: sway3d(timeMs, seed, 1.6), ...el('beads') }}>
          {letters.map((ch, i) => {
            const gatherAt = (ms: number) => spring({
              frame: fr(ms - p.gatherAt - i * p.stagger), fps: FPS,
              config: { damping: 20, mass: 0.7, stiffness: 145 },
              durationInFrames: Math.max(1, Math.round(fr(680))),
            });
            const scatterAt = p.gatherAt + n * p.stagger + p.holdMs;
            const backAt = (ms: number) => p.scatterBack
              ? spring({
                frame: fr(ms - scatterAt - i * p.stagger), fps: FPS,
                config: { damping: 22, mass: 0.8, stiffness: 120 },
                durationInFrames: Math.max(1, Math.round(fr(760))),
              })
              : 0;
            // 1 = home (scattered), 0 = in the word. Out uses the SAME seeded home as in, so the
            // beads return rather than landing somewhere new; the reference loops.
            const awayAt = (ms: number) => clamp01(1 - gatherAt(ms) + backAt(ms));
            const gather = gatherAt(timeMs);
            const away = awayAt(timeMs);

            const hx = width * (0.5 + (random(`${seed}hx${i}`) - 0.5) * (p.scatter / 100));
            const hy = height * (0.5 + (random(`${seed}hy${i}`) - 0.5) * (p.scatter / 100) * 0.65);
            const spin = (random(`${seed}hr${i}`) - 0.5) * 120;

            const restX = x0 + i * pitch;
            // MOTION BLUR: the bead's flight velocity (one vel() of the away ramp, projected onto
            // its own home→slot vector) drives a speed smear + up to two trailing ghost frames.
            // Everything dies the instant the bead parks — gathered and scattered poses stay crisp.
            const dAway = vel(awayAt, timeMs);
            const vx = (hx - p.size / 2 - restX) * dAway;
            const vy = (hy - p.size / 2 - y0) * dAway;
            const sm = smear(vx, vy, 0.9);
            const trail = ghosts(vx, vy, 2);
            const bx = restX + (hx - p.size / 2 - restX) * away;
            const by = y0 + (hy - p.size / 2 - y0) * away;
            const beadScale = interpolate(clamp01(gather * 3), [0, 1], [0.7, 1]);
            return [
              ...trail.map((g, gi) => (
                <span
                  key={`${i}-g${gi}`}
                  style={{
                    position: 'absolute',
                    left: bx + g.dx, top: by + g.dy,
                    width: p.size, height: p.size, borderRadius: '50%',
                    background: p.bead, color: p.ink,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: p.size * 0.44, fontWeight: 600,
                    opacity: g.opacity,
                    filter: `blur(${(sm.blurPx * 0.7 + 1).toFixed(2)}px)`,
                    transform: `rotate(${(spin * away).toFixed(2)}deg) scale(${beadScale.toFixed(4)})`,
                  }}
                >
                  {ch}
                </span>
              )),
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: bx,
                  top: by,
                  width: p.size, height: p.size, borderRadius: '50%',
                  background: p.bead, color: p.ink,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: p.size * 0.44, fontWeight: 600,
                  boxShadow: `0 ${p.size * 0.03}px ${p.size * 0.08}px ${rgba('#000000', 0.32)}, 0 ${p.size * 0.1}px ${p.size * 0.24}px ${rgba('#000000', 0.4)}, inset 0 ${p.size * 0.03}px ${p.size * 0.07}px ${rgba('#ffffff', 0.6)}`,
                  filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                  transform: `rotate(${(spin * away).toFixed(2)}deg) scale(${(beadScale * sm.sx).toFixed(4)}, ${(beadScale * sm.sy).toFixed(4)})`,
                }}
              >
                {ch}
              </span>,
            ];
          })}
        </div>
        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
