// PUNCH do/don't verdict list — two tracked-caps columns split by a thick divider; rows slam in
// one at a time, each landing a hand-weight check (single draw-on sweep) or a red X whose two
// strokes draw IN SEQUENCE past the corners with a stamp-pop overshoot — the way a hand actually
// strikes one. Empty row params collapse, so 2-, 3- and 4-row lists share the template.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, swingIn, vel } from '../juice';

const INK = '#F4F1E8';
const BG = '#0B0B0D';
const CHECK_LEN = 130;
const CROSS_LEN = 120;

/** Hand-weight check in a 0-100 viewBox, seeded jitter so no two rows share a stroke. */
function checkPath(seed: string, row: number): string {
  const base: [number, number][] = [[14, 56], [40, 80], [88, 20]];
  const pts = base.map(([x, y], k) => [
    x + (random(`${seed}-ck${row}-${k}x`) - 0.5) * 8,
    y + (random(`${seed}-ck${row}-${k}y`) - 0.5) * 8,
  ]);
  return 'M ' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ');
}

/** Two X strokes that overshoot the corners slightly — hand-struck, not vector-clean. */
function crossStrokes(seed: string, row: number): [string, string] {
  const j = (k: string) => (random(`${seed}-xx${row}-${k}`) - 0.5) * 6;
  return [
    `M ${(14 + j('a')).toFixed(1)} ${(12 + j('b')).toFixed(1)} L ${(88 + j('c')).toFixed(1)} ${(86 + j('d')).toFixed(1)}`,
    `M ${(86 + j('e')).toFixed(1)} ${(14 + j('f')).toFixed(1)} L ${(12 + j('g')).toFixed(1)} ${(88 + j('h')).toFixed(1)}`,
  ];
}

export const checkCrossList = defineGraphicsTemplate({
  id: 'check_cross_list',
  name: 'Do / Don\'t List',
  category: 'story',
  tags: ['Checklist', 'Verdict', 'Columns', 'Check', 'Cross'],
  badge: 'New',
  design: { w: 900, h: 900 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 66 },
  fonts: ['montserrat'],

  elements: [
    { key: 'header',  label: 'Header row', hideable: false },
    { key: 'divider', label: 'Divider' },
    { key: 'row1', label: 'Row 1' },
    { key: 'row2', label: 'Row 2' },
    { key: 'row3', label: 'Row 3' },
    { key: 'row4', label: 'Row 4' },
  ],

  params: [
    { type: 'text', key: 'doLabel',   label: 'Left header',  group: 'Content', default: 'DO', maxLength: 12 },
    { type: 'text', key: 'dontLabel', label: 'Right header', group: 'Content', default: 'DON\'T', maxLength: 12 },
    { type: 'text', key: 'do1', label: 'Do 1', group: 'Content', default: 'Sell the outcome', maxLength: 24 },
    { type: 'text', key: 'do2', label: 'Do 2', group: 'Content', default: 'Follow up in 24h', maxLength: 24 },
    { type: 'text', key: 'do3', label: 'Do 3', group: 'Content', default: 'Raise your price', maxLength: 24 },
    { type: 'text', key: 'do4', label: 'Do 4', group: 'Content', default: '', maxLength: 24 },
    { type: 'text', key: 'dont1', label: 'Don\'t 1', group: 'Content', default: 'List features', maxLength: 24 },
    { type: 'text', key: 'dont2', label: 'Don\'t 2', group: 'Content', default: 'Wait for referrals', maxLength: 24 },
    { type: 'text', key: 'dont3', label: 'Don\'t 3', group: 'Content', default: 'Discount to close', maxLength: 24 },
    { type: 'text', key: 'dont4', label: 'Don\'t 4', group: 'Content', default: '', maxLength: 24 },

    { type: 'color', key: 'good', label: 'Do colour',    group: 'Style', default: '#4ADE80' },
    { type: 'color', key: 'bad',  label: 'Don\'t colour', group: 'Style', default: '#E5484D' },

    { type: 'number', key: 'stagger', label: 'Row stagger', group: 'Motion', default: 520, min: 100, max: 1000, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay',       group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PUNCH: whoosh for the card's swing, pop when the first verdicts strike (icons land at
  // rowAt + 200), a produced slam as the LAST row's verdicts hit — same maths as the render.
  sfx: (p) => {
    const n = Math.min(4, Math.max(
      [p.do1, p.do2, p.do3, p.do4].filter((s) => s.trim()).length,
      [p.dont1, p.dont2, p.dont3, p.dont4].filter((s) => s.trim()).length,
    ));
    return [
      { atMs: p.delay + 80, id: 'whoosh', gain: 0.5 },
      { atMs: p.delay + 620 + 200, id: 'pop', gain: 0.5 },
      { atMs: p.delay + 620 + Math.max(0, n - 1) * p.stagger + 200, id: 'slam', gain: 0.65 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');
    const dos = [p.do1, p.do2, p.do3, p.do4].map((s) => s.trim()).filter(Boolean);
    const donts = [p.dont1, p.dont2, p.dont3, p.dont4].map((s) => s.trim()).filter(Boolean);
    const n = Math.min(4, Math.max(dos.length, donts.length));

    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 22, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    // The PLATE arrives through 3D (top-hinged swing) and never flattens back — a ±1.5° sway
    // keeps the verdict card living in space while the rows build on it.
    const pose = depthPose(t, seed, { enter, rx: -14, z: -100, swayDeg: 1.5 });
    const headIn = spring({
      frame: fr(t - 140), fps: FPS,
      config: { damping: 24, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });
    // Monotonic — a divider never un-draws.
    const divGrow = spring({
      frame: fr(t - 300), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });

    const fsHead = Math.round(height * 0.046);
    const fsRow = Math.round(height * 0.038);
    const ic = Math.round(height * 0.055);
    const rowH = Math.min(height * 0.185, (height * 0.66) / Math.max(1, n));

    const cell = (text: string | undefined, isDo: boolean, i: number) => {
      if (!text) return <div style={{ flex: 1 }} />;
      const iconAt = 620 + i * p.stagger + 200;
      const colour = isDo ? p.good : p.bad;
      let icon;
      if (isDo) {
        const sweep = spring({
          frame: fr(t - iconAt), fps: FPS,
          config: { damping: 200, mass: 0.6, stiffness: 160 },
          durationInFrames: Math.max(1, Math.round(fr(300))),
        });
        icon = (
          <svg viewBox="0 0 100 100" width={ic} height={ic} style={{ flexShrink: 0, overflow: 'visible' }}>
            <path
              d={checkPath(seed, i)}
              fill="none" stroke={colour} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={CHECK_LEN}
              strokeDashoffset={((1 - sweep) * CHECK_LEN).toFixed(1)}
            />
          </svg>
        );
      } else {
        const sw1 = spring({
          frame: fr(t - iconAt), fps: FPS,
          config: { damping: 200, mass: 0.6, stiffness: 200 },
          durationInFrames: Math.max(1, Math.round(fr(160))),
        });
        const sw2 = spring({
          frame: fr(t - iconAt - 140), fps: FPS,
          config: { damping: 200, mass: 0.6, stiffness: 200 },
          durationInFrames: Math.max(1, Math.round(fr(160))),
        });
        // Stamp-pop: damping 14 dips the X a hair under full size before it settles.
        const pop = spring({
          frame: fr(t - iconAt), fps: FPS,
          config: { damping: 14, mass: 0.6, stiffness: 240 },
          durationInFrames: Math.max(1, Math.round(fr(360))),
        });
        const [s1, s2] = crossStrokes(seed, i);
        icon = (
          <svg
            viewBox="0 0 100 100" width={ic} height={ic}
            style={{
              flexShrink: 0, overflow: 'visible',
              opacity: clamp01(sw1 * 4),
              transform: `scale(${(1.3 - 0.3 * pop).toFixed(4)})`,
            }}
          >
            <path d={s1} fill="none" stroke={colour} strokeWidth={16} strokeLinecap="round"
              strokeDasharray={CROSS_LEN} strokeDashoffset={((1 - sw1) * CROSS_LEN).toFixed(1)} />
            <path d={s2} fill="none" stroke={colour} strokeWidth={16} strokeLinecap="round"
              strokeDasharray={CROSS_LEN} strokeDashoffset={((1 - sw2) * CROSS_LEN).toFixed(1)} />
          </svg>
        );
      }
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: width * 0.028, minWidth: 0 }}>
          {icon}
          <span style={{ fontSize: fsRow, fontWeight: 600, color: rgba(INK, 0.92), lineHeight: 1.15 }}>
            {text}
          </span>
        </div>
      );
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          opacity: clamp01(enter * 2.2),
          transform: `${pose} translateY(${((1 - enter) * height * 0.035).toFixed(2)}px)`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          borderRadius: 28,
          overflow: 'hidden',
          background: `linear-gradient(180deg, #17171A 0%, ${BG} 55%)`,
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          padding: `${height * 0.055}px ${width * 0.05}px`,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex', marginBottom: height * 0.035,
            opacity: clamp01(headIn * 2),
            transform: `translateY(${((1 - headIn) * height * 0.02).toFixed(2)}px)`,
            ...el('header'),
          }}
        >
          <span style={{ flex: 1, textAlign: 'center', fontSize: fsHead, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: p.good, textShadow: `0 0 16px ${rgba(p.good, 0.35)}` }}>
            {p.doLabel}
          </span>
          <span style={{ flex: 1, textAlign: 'center', fontSize: fsHead, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: p.bad, textShadow: `0 0 16px ${rgba(p.bad, 0.35)}` }}>
            {p.dontLabel}
          </span>
        </div>

        <div
          style={{
            position: 'absolute', left: '50%', top: height * 0.175, bottom: height * 0.055,
            width: 3, marginLeft: -1.5,
            background: 'rgba(255,255,255,0.22)',
            transform: `scaleY(${divGrow.toFixed(4)})`,
            transformOrigin: 'top center',
            ...el('divider'),
          }}
        />

        {Array.from({ length: n }, (_, i) => {
          // damping 16 leaves a slight upward overshoot on the landing — the slam.
          const rowInAt = (ms: number) => spring({
            frame: fr(ms - 620 - i * p.stagger), fps: FPS,
            config: { damping: 16, mass: 0.7, stiffness: 200 },
            durationInFrames: Math.max(1, Math.round(fr(420))),
          });
          const rowIn = rowInAt(t);
          // Z-STAGGER: every row swings in as an object from a slightly different angle, and
          // its own drop velocity smears it — blur + stretch die the instant the row lands.
          const yRowAt = (ms: number) => (1 - rowInAt(ms)) * rowH * 0.4;
          const smRow = smear(0, vel(yRowAt, t), 1);
          return (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', height: rowH,
                gap: width * 0.06,
                opacity: clamp01(rowIn * 2.5),
                filter: smRow.blurPx > 0.3 ? `blur(${smRow.blurPx.toFixed(2)}px)` : undefined,
                transform:
                  `${swingIn(rowIn, { rx: -12 - (i % 2) * 5, z: -50 })} ` +
                  `translateY(${yRowAt(t).toFixed(2)}px) ` +
                  `scale(${smRow.sx.toFixed(4)}, ${smRow.sy.toFixed(4)})`,
                ...el(`row${i + 1}`),
              }}
            >
              {cell(dos[i], true, i)}
              {cell(donts[i], false, i)}
            </div>
          );
        })}
      </div>
    );
  },
});
