// "7 out of 10 people" — a grid of person glyphs lights up amber one by one while the big
// fraction ticks beside them. Craft: the numeral is floor-driven by the SAME per-glyph cadence
// clock as the fills (not a separate ease), so digits and lit glyphs can never desync — and
// each tick thumps the numeral for a physical count feel.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp, clamp01, fr, rgba } from '../motion';
import { LUXE, easeOutQuint, luxeGlow, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax, swingIn } from '../juice';

const HEAD = { cx: 12, cy: 6.4, r: 4.3 };
const BODY = 'M12 12.9c-4.9 0-8.1 3.1-8.1 7.4V22h16.2v-1.7c0-4.3-3.2-7.4-8.1-7.4Z';

export const humanGrid = defineGraphicsTemplate({
  id: 'human_grid',
  name: 'Human Grid',
  category: 'chart',
  tags: ['People', 'Icons', 'Grid', 'Statistic', 'Fraction'],
  badge: 'New',
  design: { w: 900, h: 520 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 74 },
  fonts: ['montserrat'],

  elements: [
    { key: 'panel',    label: 'Panel', hideable: false },
    { key: 'fraction', label: 'Fraction', hideable: false },
    { key: 'label',    label: 'Label' },
    { key: 'grid',     label: 'People grid', hideable: false },
  ],

  params: [
    { type: 'number', key: 'count', label: 'Counted', group: 'Content', default: 7, min: 0, max: 40, step: 1 },
    { type: 'number', key: 'rows',  label: 'Rows',    group: 'Content', default: 2, min: 1, max: 4, step: 1 },
    { type: 'number', key: 'cols',  label: 'Columns', group: 'Content', default: 5, min: 2, max: 10, step: 1 },
    { type: 'text',   key: 'label', label: 'Label',   group: 'Content', default: 'GIVE UP IN YEAR ONE', maxLength: 40 },

    { type: 'select', key: 'mode', label: 'Show', group: 'Style', default: 'fraction',
      options: [{ value: 'fraction', label: 'Fraction' }, { value: 'percent', label: 'Percent' }] },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },

    { type: 'number', key: 'cadence', label: 'Fill cadence', group: 'Motion', default: 150, min: 60, max: 500, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Counter language: air pass in, ONE tick as the fill clock starts (the same 600ms
  // constant the render uses), and a coin when the last glyph lights.
  sfx: (p) => {
    const total = Math.round(p.rows) * Math.round(p.cols);
    const count = Math.max(0, Math.min(Math.round(p.count), total));
    return [
      { atMs: p.delay + 80, id: 'whoosh', gain: 0.4 },
      { atMs: p.delay + 600, id: 'tick', gain: 0.5 },
      { atMs: p.delay + 600 + count * p.cadence + 120, id: 'coin', gain: 0.55 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const rows = Math.round(clamp(p.rows, 1, 4));
    const cols = Math.round(clamp(p.cols, 2, 10));
    const total = rows * cols;
    const count = Math.round(clamp(p.count, 0, total));

    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 32, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });

    // The single fill clock: glyph i lights at fillStart + i*cadence; the numeral is the
    // floor of the same clock, so it ticks exactly when a glyph lights.
    const fillStart = 600;
    const filled = t < fillStart ? 0 : Math.min(count, Math.floor((t - fillStart) / p.cadence) + 1);
    const counting = t >= fillStart && t <= fillStart + count * p.cadence;
    const tickF = counting ? ((t - fillStart) % p.cadence) / p.cadence : 1;
    const thump = 1 + 0.05 * Math.max(0, 1 - tickF / 0.45);

    const cell = Math.min((width * 0.44) / cols, (height * 0.68) / rows);
    const g = cell * 0.86;
    const fsNum = Math.round(height * 0.24);
    const fsDen = Math.round(height * 0.105);

    // Depth: the glass swings in top-hinged on the entrance spring and holds a ±1.8° sway;
    // fraction and label ride different parallax depths so the sway shears them over the
    // people grid, which stays glued to the glass.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -80, swayDeg: 1.8 });
    const parFrac = parallax(t, seed, 0.55, height * 0.008);
    const parLabel = parallax(t, seed, 0.35, height * 0.008);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          ...luxePanel(Math.round(height * 0.065)),
          opacity: enter,
          transform: `${pose} translateY(${((1 - enter) * height * 0.06).toFixed(2)}px)`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          overflow: 'hidden',
          padding: `${Math.round(height * 0.085)}px ${Math.round(width * 0.055)}px`,
          boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: width * 0.035,
          ...el('panel'),
        }}
      >
        <div style={{ flex: '0 0 34%', display: 'flex', flexDirection: 'column', gap: height * 0.05, minWidth: 0 }}>
          <div
            style={{
              display: 'flex', alignItems: 'baseline', gap: width * 0.008,
              transform: `translate(${parFrac.x.toFixed(2)}px, ${parFrac.y.toFixed(2)}px) scale(${thump.toFixed(4)})`,
              transformOrigin: 'left bottom',
              ...el('fraction'),
            }}
          >
            <span
              style={{
                fontSize: fsNum, fontWeight: 800, lineHeight: 1, color: p.accent,
                fontVariantNumeric: 'tabular-nums',
                textShadow: luxeGlow(p.accent, 0.5),
              }}
            >
              {p.mode === 'percent' ? Math.round((filled / Math.max(1, total)) * 100) : filled}
            </span>
            <span style={{ fontSize: fsDen, fontWeight: 700, lineHeight: 1, color: LUXE.inkDim, fontVariantNumeric: 'tabular-nums' }}>
              {p.mode === 'percent' ? '%' : `/${total}`}
            </span>
          </div>
          {p.label && (
            <span
              style={{
                ...luxeLabel(Math.round(height * 0.042), rgba(p.ink, 0.75)), lineHeight: 1.5,
                display: 'inline-block',
                transform: `translate(${parLabel.x.toFixed(2)}px, ${parLabel.y.toFixed(2)}px)`,
                ...el('label'),
              }}
            >
              {p.label}
            </span>
          )}
        </div>

        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${cell.toFixed(1)}px)`,
            justifyContent: 'center', alignContent: 'center',
            ...el('grid'),
          }}
        >
          {Array.from({ length: total }, (_, i) => {
            const appear = easeOutQuint(clamp01((t - (220 + i * 34)) / 300));
            const isCounted = i < count;
            const fAt = fillStart + i * p.cadence;
            const pop = isCounted
              ? spring({
                  frame: fr(t - fAt), fps: FPS,
                  config: { damping: 15, mass: 0.5, stiffness: 260 },
                  durationInFrames: Math.max(1, Math.round(fr(420))),
                })
              : 0;
            const fillO = isCounted ? clamp01((t - fAt) / 90) : 0;
            const fresh = isCounted ? Math.max(0, 1 - (t - fAt) / 600) : 0;
            const inset = cell * 0.07;
            // Z-stagger: each glyph hinges in at a per-column angle with a landing smear
            // that dies as it settles — the crowd assembles in space, not in CSS.
            const glyphBlur = appear > 0.001 && appear < 0.999 ? (1 - appear) * 2 : 0;
            return (
              <div
                key={i}
                style={{
                  position: 'relative', width: cell, height: cell,
                  opacity: appear,
                  filter: glyphBlur > 0.3 ? `blur(${glyphBlur.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(appear, { rx: -12 - (i % cols) * 1.5, z: -30 })} translateY(${((1 - appear) * cell * 0.15).toFixed(2)}px)`,
                }}
              >
                <svg width={g} height={g} viewBox="0 0 24 24" style={{ position: 'absolute', left: inset, top: inset }}>
                  <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth={1.5} />
                  <path d={BODY} fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth={1.5} strokeLinejoin="round" />
                </svg>
                {isCounted && fillO > 0 && (
                  <svg
                    width={g} height={g} viewBox="0 0 24 24"
                    style={{
                      position: 'absolute', left: inset, top: inset,
                      opacity: fillO,
                      transform: `scale(${interpolate(pop, [0, 1], [1.35, 1]).toFixed(4)})`,
                      // The amber punch smears on approach and lands crisp with its spring.
                      filter: `${pop > 0.001 && pop < 0.985 ? `blur(${((1 - Math.min(1, pop)) * 2).toFixed(2)}px) ` : ''}drop-shadow(0 0 ${(4 + 6 * fresh).toFixed(1)}px ${rgba(p.accent, 0.45 + 0.35 * fresh)})`,
                    }}
                  >
                    <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={p.accent} />
                    <path d={BODY} fill={p.accent} />
                  </svg>
                )}
              </div>
            );
          })}
        </div>

        <div style={luxeGrain(0.045)} />
      </div>
    );
  },
});
