// A 2x2 grid of glass stat tiles — the documentary "the numbers" beat. Tiles land on a
// diagonal stagger (TL, TR+BL, BR) so the grid assembles as a wave, values count up on
// easeOutQuint, and ONE tile is the amber hero. Values parse as "label|figure" lines;
// digits inside the figure count, any prefix/suffix ("$", "%", "x") stays literal.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, easeOutQuint, luxeGlow, luxeLabel, luxePanel } from '../luxe';
import { parallax, sway3d, swingIn } from '../juice';

const MAX = 4;

export const statGrid = defineGraphicsTemplate({
  id: 'stat_grid',
  name: 'Stat Grid',
  category: 'money',
  tags: ['Stats', 'Grid', 'Tiles', 'Numbers', 'Dashboard'],
  badge: 'New',
  design: { w: 900, h: 700 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 80 },
  fonts: ['montserrat'],

  elements: [
    ...Array.from({ length: MAX }, (_, i) => ({ key: `tile${i + 1}`, label: `Tile ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'stats', label: 'Stats', group: 'Content', multiline: true, maxLength: 240,
      default: 'REVENUE|$4.2M\nCLIENTS|127\n*GROWTH|312%\nTEAM|14',
      help: 'One per line: label | figure. Up to 4. Prefix one with * to make it the amber hero tile.' },

    { type: 'color', key: 'ink',    label: 'Figures', group: 'Style', default: '#F4F1E8' },
    { type: 'color', key: 'accent', label: 'Hero',    group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'countMs', label: 'Count-up', group: 'Motion', default: 1100, min: 300, max: 3000, step: 50, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Tile stagger', group: 'Motion', default: 180, min: 0, max: 800, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: air sweep as the first tile arrives, ONE tick as the counts start
  // rolling, and the chime when the hero tile's figure lands — timed off stagger + countMs.
  sfx: (p) => {
    const rows = p.stats.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX);
    const heroI = Math.max(0, rows.findIndex((l) => l.startsWith('*')));
    const cols = rows.length === 1 ? 1 : 2;
    const beat = (heroI % cols) + Math.floor(heroI / cols);
    return [
      { atMs: p.delay + 40, id: 'whoosh', gain: 0.45 },
      { atMs: p.delay + 150, id: 'tick', gain: 0.4 },
      { atMs: p.delay + beat * p.stagger + 150 + p.countMs, id: 'chime', gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const rows = p.stats.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX);
    if (!rows.length) return null;
    const stats = rows.map((l) => {
      const hero = l.startsWith('*');
      const [label = '', figure = ''] = l.replace(/^\*/, '').split('|').map((s) => s.trim());
      return { label, figure, hero };
    });

    const cols = stats.length === 1 ? 1 : 2;
    const rowsN = Math.ceil(stats.length / cols);
    const gap = width * 0.03;
    const tileW = (width - gap * (cols - 1)) / cols;
    const tileH = (height - gap * (rowsN - 1)) / rowsN;

    // Depth: the assembled grid holds a ±1.8° sway so it never flattens back into a web page;
    // labels and figures sit at different parallax depths, so the sway shears the type over
    // the glass. One seed for all layers keeps the shear reading as a single object.
    const sway = sway3d(t, seed, 1.8);
    const parLab = parallax(t, seed, 0.3, tileH * 0.05);
    const parFig = parallax(t, seed, 0.55, tileH * 0.05);

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, transform: sway }}>
        {stats.map((s, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          // Diagonal wave: TL first, TR+BL together, BR last.
          const beat = c + r;
          const at = beat * p.stagger;
          const land = spring({
            frame: fr(t - at), fps: FPS,
            config: { damping: 26, mass: 0.7, stiffness: 170 },
            durationInFrames: Math.max(1, Math.round(fr(480))),
          });
          if (t <= at - 150) return null;

          // Count-up: digits roll, everything else in the figure is literal.
          const digits = s.figure.replace(/[^0-9]/g, '');
          const target = digits ? parseInt(digits, 10) : 0;
          const cu = easeOutQuint(clamp01((t - at - 150) / p.countMs));
          const shown = Math.round(target * cu);
          // Re-inject the rolled digits into the original figure's shape ("$4.2M" style):
          // walk the figure, replacing digit runs from the rolled value left-to-right.
          let rolled = '';
          let di = 0;
          const shownStr = String(shown).padStart(digits.length, '0');
          for (const ch of s.figure) {
            rolled += /[0-9]/.test(ch) ? (shownStr[di++] ?? ch) : ch;
          }

          const fsFig = Math.round(tileH * 0.30);
          const fsLab = Math.round(tileH * 0.085);

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: c * (tileW + gap), top: r * (tileH + gap),
                width: tileW, height: tileH,
                ...luxePanel(Math.round(tileH * 0.09), { borderAlpha: s.hero ? 0.22 : undefined }),
                ...(s.hero ? { background: `linear-gradient(180deg, ${rgba(p.accent, 0.16)} 0%, ${LUXE.bg0} 90%)` } : {}),
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                paddingLeft: tileW * 0.1, boxSizing: 'border-box',
                gap: tileH * 0.06,
                opacity: land,
                // Z-stagger: tiles swing in top-hinged, each column from an opposite side
                // angle, so the diagonal wave reads as objects arriving in space.
                transform: `${swingIn(land, { rx: -12, ry: c === 0 ? -9 : 9, z: -70 })} translateY(${((1 - land) * tileH * 0.12).toFixed(2)}px) scale(${interpolate(land, [0, 1], [0.96, 1]).toFixed(4)})`,
                ...el(`tile${i + 1}`),
              }}
            >
              <span style={{ ...luxeLabel(fsLab), transform: `translate(${parLab.x.toFixed(2)}px, ${parLab.y.toFixed(2)}px)` }}>{s.label}</span>
              <span
                style={{
                  fontSize: fsFig, fontWeight: 800, lineHeight: 1,
                  color: s.hero ? p.accent : p.ink,
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: s.hero ? luxeGlow(p.accent, 0.6) : undefined,
                  filter: cu < 1 && digits ? `blur(${((1 - cu) * 4).toFixed(2)}px)` : undefined,
                  transform: `translate(${parFig.x.toFixed(2)}px, ${parFig.y.toFixed(2)}px)`,
                }}
              >
                {rolled}
              </span>
            </div>
          );
        })}
      </div>
    );
  },
});
