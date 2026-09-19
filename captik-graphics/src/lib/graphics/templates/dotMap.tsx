// Dot-matrix world map with glowing pins — the documentary "clients in 40 countries" beat.
// Continents are a hand-authored 48x20 bitmask rendered as a dot grid (stylized reads better
// than accurate at video sizes); dots twinkle in with a seeded stagger, then pins drop in
// sequence, each with an expanding ping ring. Pin positions are PERCENTAGES of the map box
// ("Mumbai|72|58"), so users place them by eye without geo math.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax, swingIn } from '../juice';

// 48x20 world, ~equirectangular, 75N..55S. Stylized on purpose.
const WORLD = [
  '................###.....######..................',
  '...#####......#####....########..###########...',
  '..#########....###...###########################',
  '..##########.......####################них######'.replace('них', '###'),
  '...#########.......######..#############..##.#..',
  '....#######........#######..######..####...#....',
  '.....#####.........########.#####.######........',
  '......####.........#########..###..#####........',
  '.......###..........########...##...#.##.#......',
  '.......####..........#######........####.##.....',
  '.........####.........######.........###..##....',
  '..........#####........#####..........##........',
  '..........######........####.#.......####.#.....',
  '..........#####..........###.........######.....',
  '...........####...........#.........#######.....',
  '...........###......................######......',
  '............##.......................##....#....',
  '............##.............................#....',
  '.............#..................................',
  '................................................',
];
const COLS = 48;
const ROWS = WORLD.length;

export const dotMap = defineGraphicsTemplate({
  id: 'dot_map',
  name: 'Dot Map',
  category: 'chart',
  tags: ['Map', 'World', 'Dots', 'Pins', 'Global'],
  badge: 'New',
  design: { w: 900, h: 560 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 84 },
  fonts: ['montserrat'],

  elements: [
    { key: 'panel', label: 'Panel' },
    { key: 'map',   label: 'Map', hideable: false },
    { key: 'title', label: 'Title' },
    ...Array.from({ length: 5 }, (_, i) => ({ key: `pin${i + 1}`, label: `Pin ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'title', label: 'Title', group: 'Content', default: 'CLIENTS IN 43 COUNTRIES', maxLength: 36 },
    { type: 'text', key: 'pins', label: 'Pins', group: 'Content', multiline: true, maxLength: 240,
      default: 'LONDON|46|22\nDUBAI|60|44\nMUMBAI|66|52\nNEW YORK|26|30\nSYDNEY|86|76',
      help: 'One per line: label | x% | y% of the map area. Up to 5.' },

    { type: 'color', key: 'dot',    label: 'Dots',   group: 'Style', default: '#F4F1E8' },
    { type: 'color', key: 'accent', label: 'Pins',   group: 'Style', default: '#F59E0B' },
    { type: 'boolean', key: 'plate', label: 'Glass panel', group: 'Style', default: true },

    { type: 'number', key: 'mapMs',  label: 'Map builds over', group: 'Motion', default: 900, min: 200, max: 2500, step: 50, unit: 'ms' },
    { type: 'number', key: 'pinGap', label: 'Pin stagger', group: 'Motion', default: 480, min: 100, max: 1500, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: air pass on the glass swing-in, a pop as the first pin drops, and a
  // luxe ping once the last pin has landed — pin beats computed exactly like the motion's.
  sfx: (p) => {
    const n = Math.max(1, Math.min(5, p.pins.split('\n').map((l) => l.trim()).filter(Boolean).length));
    return [
      { atMs: p.delay + 60, id: 'whoosh', gain: 0.4 },
      { atMs: p.delay + p.mapMs * 0.7, id: 'pop', gain: 0.45 },
      { atMs: p.delay + p.mapMs * 0.7 + (n - 1) * p.pinGap + 250, id: 'glass', gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const padX = width * 0.07;
    const mapTop = height * 0.22;
    const mapW = width - padX * 2;
    const mapH = height * 0.68;
    const cell = Math.min(mapW / COLS, mapH / ROWS);

    const pins = p.pins.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5)
      .map((l) => {
        const [label = '', xs = '50', ys = '50'] = l.split('|').map((s) => s.trim());
        const x = Math.min(100, Math.max(0, Number(xs) || 50));
        const y = Math.min(100, Math.max(0, Number(ys) || 50));
        return { label, x, y };
      });

    const titleIn = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 30, mass: 0.7, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    // Depth: the glass swings in top-hinged on the title spring and holds a ±1.8° sway; the
    // title and the pin layer ride different parallax depths so the sway shears them over
    // the dot-matrix map, which stays glued to the glass.
    const pose = depthPose(t, seed, { enter: titleIn, rx: -12, z: -80, swayDeg: 1.8 });
    const parTitle = parallax(t, seed, 0.45, height * 0.01);
    const parPins = parallax(t, seed, 0.6, height * 0.008);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, fontFamily: ff, overflow: 'hidden',
          ...(p.plate ? luxePanel(Math.round(height * 0.05)) : {}),
          opacity: clamp01(titleIn * 2),
          transform: pose,
          transformOrigin: '50% 30%',
          ...el('panel'),
        }}
      >
        <span
          style={{
            position: 'absolute', left: padX, top: height * 0.09,
            ...luxeLabel(Math.round(height * 0.038)),
            opacity: titleIn,
            transform: `translate(${parTitle.x.toFixed(2)}px, ${(parTitle.y + (1 - titleIn) * height * 0.015).toFixed(2)}px)`,
            ...el('title'),
          }}
        >
          {p.title}
        </span>

        <svg
          viewBox={`0 0 ${mapW} ${mapH}`}
          style={{ position: 'absolute', left: padX, top: mapTop, width: mapW, height: mapH, overflow: 'visible', ...el('map') }}
        >
          {WORLD.flatMap((row, r) =>
            row.split('').map((ch, c) => {
              if (ch !== '#') return null;
              // Seeded twinkle-in: each dot has its own arrival inside the build window.
              const at = random(`${seed}-d${r}-${c}`) * p.mapMs;
              const a = clamp01((t - at) / 260);
              if (a <= 0) return null;
              return (
                <circle
                  key={`${r}-${c}`}
                  cx={(c + 0.5) * cell}
                  cy={(r + 0.5) * cell}
                  r={cell * 0.26}
                  fill={p.dot}
                  opacity={(0.06 + 0.18 * a).toFixed(3)}
                />
              );
            }),
          )}
        </svg>

        {pins.map((pin, i) => {
          const at = p.mapMs * 0.7 + i * p.pinGap;
          const drop = spring({
            frame: fr(t - at), fps: FPS,
            config: { damping: 22, mass: 0.6, stiffness: 190 },
            durationInFrames: Math.max(1, Math.round(fr(420))),
          });
          if (t <= at - 200) return null;
          const px = padX + (pin.x / 100) * mapW;
          const py = mapTop + (pin.y / 100) * mapH;
          // Ping ring: expands + fades on a loop, offset per pin so rings never sync.
          const ring = ((t - at) / 1400 + i * 0.23) % 1;
          const dotR = Math.max(4, height * 0.012);
          // Z-stagger: each pin arrives through space at its own angle, with a landing
          // smear that dies the instant its drop spring settles.
          const pinBlur = drop > 0.001 && drop < 0.985 ? (1 - Math.min(1, drop)) * 3 : 0;
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: px, top: py,
                transform: `translate(${parPins.x.toFixed(2)}px, ${parPins.y.toFixed(2)}px)`,
                ...el(`pin${i + 1}`),
              }}
            >
              <div
                style={{
                  position: 'absolute', left: -dotR, top: -dotR,
                  width: dotR * 2, height: dotR * 2, borderRadius: '50%',
                  background: p.accent,
                  boxShadow: `0 0 ${dotR * 3}px ${rgba(p.accent, 0.6)}`,
                  opacity: drop,
                  filter: pinBlur > 0.3 ? `blur(${pinBlur.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(drop, { rx: -16 - i * 2, z: -50 })} translateY(${((1 - drop) * -height * 0.04).toFixed(2)}px) scale(${interpolate(drop, [0, 1], [0.4, 1]).toFixed(3)})`,
                }}
              />
              {t > at && (
                <div
                  style={{
                    position: 'absolute',
                    left: -dotR * (1 + ring * 3), top: -dotR * (1 + ring * 3),
                    width: dotR * 2 * (1 + ring * 3), height: dotR * 2 * (1 + ring * 3),
                    borderRadius: '50%',
                    border: `1.5px solid ${rgba(p.accent, 0.55 * (1 - ring))}`,
                  }}
                />
              )}
              <span
                style={{
                  position: 'absolute', left: dotR * 1.8, top: -dotR * 1.1,
                  fontSize: Math.round(height * 0.03), fontWeight: 700,
                  letterSpacing: '0.12em', color: LUXE.ink, whiteSpace: 'nowrap',
                  opacity: drop,
                  textShadow: '0 1px 6px rgba(0,0,0,0.6)',
                }}
              >
                {pin.label}
              </span>
            </div>
          );
        })}

        {p.plate && <div style={luxeGrain(0.045)} />}
      </div>
    );
  },
});
