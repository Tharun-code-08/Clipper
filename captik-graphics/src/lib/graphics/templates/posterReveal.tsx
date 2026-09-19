// Reference: social/science-club.mp4  (window 760-4800ms, poster set ~3080ms)
// An illustrated poster: layered waves rising from the bottom, decorative shapes drifting in, and a
// headline whose words arrive one at a time in alternating colours. The words carry the timing; the
// scenery is slow and continuous behind them, which is what keeps it from feeling like a slideshow.
//
// Colour is per WORD, cycled by absolute index, so editing the copy never re-colours what came
// before it.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_WORDS = 14;
const MAX_DECO = 8;

export const posterReveal = defineGraphicsTemplate({
  id: 'poster_reveal',
  name: 'Poster Reveal',
  category: 'title',
  tags: ['Poster', 'Illustrated', 'Words'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['playfair'],

  elements: [
    { key: 'poster', label: 'Poster', hideable: false },
    { key: 'waves',  label: 'Waves' },
    { key: 'deco',   label: 'Decorations' },
    { key: 'dots',   label: 'Dot row' },
    ...Array.from({ length: MAX_WORDS }, (_, i) => ({ key: `word${i + 1}`, label: `Word ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'text', label: 'Headline', group: 'Content', multiline: true, maxLength: 120,
      default: 'International Day for\nWomen and Girls in\nScience' },
    { type: 'text', key: 'palette', label: 'Word colours', group: 'Content', maxLength: 120,
      default: '#F4F1E8,#F4F1E8,#F4F1E8,#F59E0B,#F4F1E8,#C98A9E,#F4F1E8,#F59E0B',
      help: 'Comma-separated, cycled across the words.' },

    { type: 'color',  key: 'bg',    label: 'Background', group: 'Style', default: '#10233A' },
    { type: 'color',  key: 'wave1', label: 'Wave 1',     group: 'Style', default: '#233E63' },
    { type: 'color',  key: 'wave2', label: 'Wave 2',     group: 'Style', default: '#1C5A5C' },
    { type: 'color',  key: 'wave3', label: 'Wave 3',     group: 'Style', default: '#3E8577' },
    { type: 'font',   key: 'font',  label: 'Font',       group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size',  label: 'Size',       group: 'Style', default: 58, min: 16, max: 160, step: 2, unit: 'px' },
    { type: 'number', key: 'top',   label: 'Headline y', group: 'Style', default: 40, min: 5, max: 90, step: 1, unit: '%' },
    { type: 'boolean', key: 'deco', label: 'Decorations', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First word at', group: 'Motion', default: 220, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'perWord', label: 'Per word',      group: 'Motion', default: 210, min: 20, max: 900, step: 10, unit: 'ms' },
    { type: 'number', key: 'waveMs',  label: 'Waves rise over', group: 'Motion', default: 700, min: 200, max: 6000, step: 50, unit: 'ms' },
  ],

  // Air under the rising waves, a soft pop as the first word lands, a chime when the last one
  // completes the headline — the word cues ride the same firstAt/perWord grid as the springs.
  sfx: (p) => {
    const n = Math.min(MAX_WORDS, p.text.split('\n').map((r) => r.trim()).filter(Boolean)
      .flatMap((r) => r.split(/\s+/).filter(Boolean)).length);
    const cues: { atMs: number; id: 'whoosh' | 'pop' | 'chime'; gain: number }[] = [
      { atMs: 120, id: 'whoosh', gain: 0.4 },
      { atMs: p.firstAt + 140, id: 'pop', gain: 0.45 },
    ];
    if (n > 1) cues.push({ atMs: p.firstAt + (n - 1) * p.perWord + 160, id: 'chime', gain: 0.35 });
    return cues;
  },

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const rows = p.text.split('\n').map((r) => r.trim()).filter(Boolean);
    const pal = p.palette.split(',').map((s) => s.trim()).filter(Boolean);
    const colours = pal.length ? pal : ['#F4F1E8'];

    const waves = interpolate(timeMs, [0, p.waveMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const dots = spring({
      frame: fr(timeMs - p.firstAt - 1400), fps: FPS,
      config: { damping: 22, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });

    // The poster's scene layers live at different depths: the headline block sways as the hero
    // plane, the three waves shear under it at their own shallow depths, and the deco / dot-row
    // layers ride nearer the camera — the sway phase is shared, so it reads as one lit set.
    const blockIn = spring({
      frame: fr(timeMs - Math.max(0, p.firstAt - 120)), fps: FPS,
      config: { damping: 24, mass: 0.7, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    const posePoster = depthPose(timeMs, seed, { enter: blockIn, rx: -10, z: -70, swayDeg: 1.6, periodMs: 4200 });
    const parDots = parallax(timeMs, seed, 0.85, width * 0.008, 4200);

    let wordNo = 0;

    const waveBand = (colour: string, base: number, delay: number, k: number) => {
      const s = interpolate(timeMs, [delay, delay + p.waveMs], [0, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      });
      const par = parallax(timeMs, seed, 0.12 + k * 0.13, width * 0.008, 4200);
      return (
        <div
          key={k}
          style={{
            position: 'absolute', left: -width * 0.1, right: -width * 0.1,
            top: `${base}%`, bottom: `-${height * 0.05}px`,
            background: colour,
            borderRadius: `${width * 0.9}px ${width * 0.7}px 0 0 / ${height * 0.09}px ${height * 0.07}px 0 0`,
            transform: `translate(${par.x.toFixed(2)}px, ${(par.y + (1 - s) * height * 0.22).toFixed(2)}px)`,
          }}
        />
      );
    };

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: p.bg, fontFamily: ff, ...el('poster') }}>
        <div style={{ position: 'absolute', inset: 0, opacity: clamp01(waves * 2), ...el('waves') }}>
          {waveBand(p.wave1, 62, 100, 1)}
          {waveBand(p.wave2, 70, 320, 2)}
          {waveBand(p.wave3, 78, 540, 3)}
        </div>

        {p.deco && (
          <div style={{ position: 'absolute', inset: 0, ...el('deco') }}>
            {Array.from({ length: MAX_DECO }).map((_, i) => {
              const s = spring({
                frame: fr(timeMs - 80 - i * 110), fps: FPS,
                config: { damping: 24, mass: 0.7, stiffness: 150 },
                durationInFrames: Math.max(1, Math.round(fr(700))),
              });
              const x = random(`${seed}dx${i}`);
              const y = random(`${seed}dy${i}`) * 0.55;
              const d = width * (0.03 + random(`${seed}ds${i}`) * 0.045);
              const kind = i % 3;
              const tint = colours[(i + 3) % colours.length];
              const drift = Math.sin(timeMs / 1400 + i) * width * 0.008;
              const parD = parallax(timeMs, seed, 0.65, width * 0.008, 4200);
              const common = {
                position: 'absolute' as const,
                left: `${8 + x * 84}%`, top: i < 2 ? `${2 + y * 10}%` : `${6 + y * 100}%`,
                opacity: clamp01(s) * 0.85,
                transform: `translate(${parD.x.toFixed(2)}px, ${(drift + parD.y).toFixed(2)}px) rotate(${(random(`${seed}dr${i}`) * 60 - 30).toFixed(1)}deg) scale(${s.toFixed(3)})`,
              };
              if (kind === 0) {
                return <div key={i} style={{ ...common, width: 0, height: 0, borderLeft: `${d * 0.6}px solid transparent`, borderRight: `${d * 0.6}px solid transparent`, borderBottom: `${d}px solid ${rgba(tint, 0.55)}` }} />;
              }
              if (kind === 1) {
                return <div key={i} style={{ ...common, width: d * 0.5, height: d * 0.5, borderRadius: '50%', background: rgba(tint, 0.7) }} />;
              }
              return (
                <div key={i} style={{ ...common, width: d, height: d, display: 'flex', alignItems: 'center', justifyContent: 'center', color: rgba(tint, 0.9), fontSize: d }}>
                  ✿
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            position: 'absolute', left: '8%', right: '8%', top: `${p.top}%`,
            transform: `${posePoster} translateY(-50%)`,
            transformOrigin: 'center center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: p.size * 0.22,
          }}
        >
          {rows.map((row, r) => (
            <div key={r} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: p.size * 0.26 }}>
              {row.split(/\s+/).filter(Boolean).map((w, c) => {
                const i = wordNo++;
                if (i >= MAX_WORDS) return null;
                const sAt = (ms: number) => spring({
                  frame: fr(ms - p.firstAt - i * p.perWord), fps: FPS,
                  config: { damping: 24, mass: 0.6, stiffness: 175 },
                  durationInFrames: Math.max(1, Math.round(fr(480))),
                });
                const s = sAt(timeMs);
                // Words arrive as OBJECTS: each on its own seeded hinge, its rise velocity
                // smearing it mid-flight and dying the frame the spring settles.
                const hinge = {
                  rx: -12 - random(`${seed}wx${i}`) * 6,
                  ry: (random(`${seed}wy${i}`) - 0.5) * 16,
                  z: -60,
                };
                const vW = vel(sAt, timeMs) * p.size * 0.36;
                const sm = smear(0, vW, 0.9);
                return (
                  <span
                    key={c}
                    style={{
                      fontSize: p.size, fontWeight: 600, lineHeight: 1.18,
                      color: colours[i % colours.length],
                      opacity: clamp01(s * 1.7),
                      filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                      transform: `${swingIn(s, hinge)} translateY(${((1 - s) * p.size * 0.36).toFixed(2)}px) scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
                      transformOrigin: 'center center',
                      ...el(`word${i + 1}`),
                    }}
                  >
                    {w}
                  </span>
                );
              })}
            </div>
          ))}

          <div style={{ display: 'flex', gap: p.size * 0.16, marginTop: p.size * 0.3, opacity: clamp01(dots), transform: `translate(${parDots.x.toFixed(2)}px, ${parDots.y.toFixed(2)}px)`, ...el('dots') }}>
            {colours.slice(0, 6).map((c, i) => (
              <span key={i} style={{ width: p.size * 0.16, height: p.size * 0.16, borderRadius: '50%', background: c }} />
            ))}
          </div>
        </div>
      </div>
    );
  },
});
