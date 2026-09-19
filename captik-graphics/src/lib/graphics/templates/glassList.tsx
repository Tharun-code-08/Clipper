// Numbered steps on a glass panel — the "here's the plan" beat: gold numerals (01, 02 …),
// rows that land one after another with a masked rise, hairline separators. Empty row
// params collapse, so the same template serves 2-, 3- and 4-step lists.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { LUXE, easeOutQuint, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

export const glassList = defineGraphicsTemplate({
  id: 'glass_list',
  name: 'Glass Steps',
  category: 'story',
  tags: ['List', 'Steps', 'Plan', 'Numbered', 'Luxury'],
  badge: 'New',
  design: { w: 900, h: 940 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5600,
  defaultBox: { xPercent: 50, yPercent: 46, widthPercent: 74 },
  fonts: ['montserrat'],

  elements: [
    { key: 'panel',  label: 'Panel', hideable: false },
    { key: 'header', label: 'Header' },
    { key: 'row1', label: 'Step 1' },
    { key: 'row2', label: 'Step 2' },
    { key: 'row3', label: 'Step 3' },
    { key: 'row4', label: 'Step 4' },
  ],

  params: [
    { type: 'text', key: 'header', label: 'Header', group: 'Content', default: 'THE PLAYBOOK', maxLength: 28 },
    { type: 'text', key: 'item1', label: 'Step 1', group: 'Content', default: 'Pick one skill', maxLength: 44 },
    { type: 'text', key: 'item2', label: 'Step 2', group: 'Content', default: 'Go all in for 12 months', maxLength: 44 },
    { type: 'text', key: 'item3', label: 'Step 3', group: 'Content', default: 'Sell the outcome', maxLength: 44 },
    { type: 'text', key: 'item4', label: 'Step 4', group: 'Content', default: '', maxLength: 44 },

    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'font',  key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },

    { type: 'number', key: 'stagger', label: 'Row stagger', group: 'Motion', default: 420, min: 100, max: 1000, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // DOCU glass: a quiet air pass as the panel racks in, then a short luxe ping as each step
  // lands — stagger retimes the pings with the rows, and gains stay low; the plan is the star.
  sfx: (p) => {
    const n = [p.item1, p.item2, p.item3, p.item4].filter((s) => s.trim().length > 0).length;
    return [
      { atMs: p.delay + 200, id: 'whoosh' as const, gain: 0.35 },
      ...Array.from({ length: Math.min(3, Math.max(1, n)) }, (_, i) => ({
        atMs: p.delay + 700 + i * p.stagger,
        id: 'glass' as const,
        gain: 0.35,
      })),
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);
    const items = [p.item1, p.item2, p.item3, p.item4].filter((s) => s.trim().length > 0);

    const enter = easeOutQuint(clamp01(t / 550));
    const headIn = easeOutQuint(clamp01((t - 200) / 500));

    // The panel swings in through the house perspective on its existing ease and keeps a slow
    // DOCU sway; the header parallaxes against it so the glass reads as layered, not printed.
    const pose = depthPose(t, seed, { enter, rx: -11, z: -80, swayDeg: 1.5, periodMs: 4200 });
    const parHead = parallax(t, seed, 0.5, height * 0.008, 4200);

    const fsHead = Math.round(height * 0.032);
    const fsNum = Math.round(height * 0.052);
    const fsItem = Math.round(height * 0.05);
    const rowH = height * 0.155;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          ...luxePanel(Math.round(height * 0.045)),
          opacity: enter,
          transform: `${pose} translateY(${((1 - enter) * height * 0.05).toFixed(2)}px)`,
          fontFamily: ff,
          overflow: 'hidden',
          padding: `${height * 0.075}px ${width * 0.085}px`,
          boxSizing: 'border-box',
          ...el('panel'),
        }}
      >
        <span style={{ ...luxeLabel(fsHead), opacity: headIn, display: 'block', marginBottom: height * 0.045, transform: `translate(${parHead.x.toFixed(2)}px, ${parHead.y.toFixed(2)}px)`, ...el('header') }}>
          {p.header}
        </span>

        {items.map((item, i) => {
          // Z-STAGGER: each row hinges in from a slightly different angle, so the plan builds as
          // objects arriving in space; the rise velocity smears the row and dies as it seats.
          const rowInAt = (ms: number) => spring({
            frame: fr(ms - 500 - i * p.stagger), fps: FPS,
            config: { damping: 28, mass: 0.6, stiffness: 160 },
            durationInFrames: Math.max(1, Math.round(fr(550))),
          });
          const rowIn = rowInAt(t);
          const vRow = vel((ms) => (1 - rowInAt(ms)) * rowH * 0.3, t);
          const smRow = smear(0, vRow, 1.2);
          return (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: width * 0.05,
                height: rowH,
                borderBottom: i < items.length - 1 ? `1px solid rgba(255,255,255,0.09)` : 'none',
                opacity: rowIn,
                filter: smRow.blurPx > 0.3 ? `blur(${smRow.blurPx.toFixed(2)}px)` : undefined,
                transform: `${swingIn(rowIn, { rx: -14, ry: i % 2 ? 7 : -7, z: -60 })} translateY(${((1 - rowIn) * rowH * 0.3).toFixed(2)}px) scale(${smRow.sx.toFixed(4)}, ${smRow.sy.toFixed(4)})`,
                ...el(`row${i + 1}`),
              }}
            >
              <span
                style={{
                  fontSize: fsNum, fontWeight: 800, color: p.accent,
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em',
                  textShadow: `0 0 16px ${p.accent}40`,
                  width: width * 0.11, flexShrink: 0,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontSize: fsItem, fontWeight: 600, color: LUXE.ink, lineHeight: 1.2 }}>
                {item}
              </span>
            </div>
          );
        })}

        <div style={luxeGrain(0.045)} />
      </div>
    );
  },
});
