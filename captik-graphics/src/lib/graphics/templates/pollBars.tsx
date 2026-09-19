// Social-style poll on dark glass — option tracks fill to their percent on a stagger, numbers
// count up at the right, and the winning row alone fills amber with a bloom. The winner's
// label flips to dark ink but only fades in AFTER its fill has swept past — dark-on-amber is
// readable, dark-on-glass for the first 200ms would not be.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp, clamp01, fr, rgba } from '../motion';
import { LUXE, easeOutQuint, luxeGlow, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax, swingIn } from '../juice';

const MAX = 4;

export const pollBars = defineGraphicsTemplate({
  id: 'poll_bars',
  name: 'Poll Bars',
  category: 'chart',
  tags: ['Poll', 'Bars', 'Percent', 'Voting', 'Options'],
  badge: 'New',
  design: { w: 900, h: 600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 78 },
  fonts: ['montserrat'],

  elements: [
    { key: 'question', label: 'Question' },
    ...Array.from({ length: MAX }, (_, i) => ({ key: `row${i + 1}`, label: `Option ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'question', label: 'Question', group: 'Content', default: 'WOULD YOU QUIT YOUR JOB?', maxLength: 60 },
    { type: 'text', key: 'options', label: 'Options', group: 'Content', multiline: true, maxLength: 200,
      default: 'Yes, tomorrow|68\nNeed a plan first|24\nNever|8',
      help: 'One per line: option | percent. 2-4 rows. The highest percent fills amber.' },
    { type: 'text', key: 'votes', label: 'Votes note', group: 'Content', default: '12,847 votes', maxLength: 20 },

    { type: 'color', key: 'accent', label: 'Winner', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'font',  key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },

    { type: 'number', key: 'fillMs',  label: 'Fill time', group: 'Motion', default: 900, min: 300, max: 2500, step: 50, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Row stagger', group: 'Motion', default: 220, min: 0, max: 800, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Gamified-DOCU palette: air pass on the glass swing-in, a pop as the first option track
  // lands, and a chime the instant the WINNING row's amber fill completes — the winner and
  // every beat are parsed from the same options/stagger/fillMs params that time the motion.
  sfx: (p) => {
    const pcts = p.options.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX)
      .map((l) => Number((l.split('|')[1] ?? '0').replace('%', '')) || 0);
    const win = pcts.reduce((best, v, i, arr) => (v > arr[best] ? i : best), 0);
    return [
      { atMs: p.delay + 60, id: 'whoosh', gain: 0.4 },
      { atMs: p.delay + 380 + 80, id: 'pop', gain: 0.4 },
      { atMs: p.delay + 380 + win * p.stagger + 120 + p.fillMs * 0.9, id: 'chime', gain: 0.55 },
    ];
  },

  render: ({ params: p, el, timeMs, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    const rows = p.options.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX)
      .map((l) => {
        const [label = '', pctRaw = '0'] = l.split('|').map((s) => s.trim());
        const num = Number(pctRaw.replace('%', ''));
        return { label, pct: Number.isFinite(num) ? clamp(num, 0, 100) : 0 };
      });
    if (!rows.length) return null;
    const winner = rows.reduce((best, r, i, arr) => (r.pct > arr[best].pct ? i : best), 0);

    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 32, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    const headIn = easeOutQuint(clamp01((t - 120) / 450));

    const trackH = rows.length <= 2 ? 96 : rows.length === 3 ? 88 : 76;
    const fsOpt = Math.round(trackH * 0.31);
    const fsPct = Math.round(trackH * 0.36);

    // Depth: the glass swings in top-hinged on its own entrance spring and holds a ±1.6° sway;
    // the question header and the percent readouts ride different parallax depths so the sway
    // shears the layers over the option tracks (which stay glued to the glass).
    const pose = depthPose(t, seed, { enter, rx: -12, z: -80, swayDeg: 1.6 });
    const parHead = parallax(t, seed, 0.45, height * 0.008);
    const parPct = parallax(t, seed, 0.7, height * 0.008);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          ...luxePanel(28),
          opacity: enter,
          transform: `${pose} translateY(${((1 - enter) * height * 0.05).toFixed(2)}px)`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          overflow: 'hidden',
          padding: '44px 56px 40px',
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', opacity: headIn, transform: `translate(${parHead.x.toFixed(2)}px, ${parHead.y.toFixed(2)}px)`, ...el('question') }}>
          <span style={{ ...luxeLabel(25, rgba(p.ink, 0.85)), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.question}
          </span>
          {p.votes && (
            <span style={{ fontSize: 20, fontWeight: 600, color: LUXE.inkDim, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', paddingLeft: 24 }}>
              {p.votes}
            </span>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
          {rows.map((r, i) => {
            const at = 380 + i * p.stagger;
            const land = spring({
              frame: fr(t - at), fps: FPS,
              config: { damping: 26, mass: 0.6, stiffness: 170 },
              durationInFrames: Math.max(1, Math.round(fr(450))),
            });
            const fill = easeOutQuint(clamp01((t - at - 120) / p.fillMs));
            const shown = Math.round(r.pct * fill);
            const isWin = i === winner;
            // A winner filling past ~78% sweeps under its own percent — flip it to dark ink there.
            const pctColor = isWin ? (r.pct >= 78 ? '#221503' : p.accent) : rgba(p.ink, 0.8);
            const labelIn = clamp01((t - at - 160) / 260);
            // Z-stagger: each track swings in side-hinged at its own angle, with a landing
            // smear that dies the instant its spring settles — the row lands crisp.
            const landBlur = land > 0.001 && land < 0.985 ? (1 - Math.min(1, land)) * 2.5 : 0;
            // No early-null: rows sit in a centred flex column, so every row must occupy its
            // slot from frame one (opacity 0) or the stagger would reflow the whole stack.
            return (
              <div
                key={i}
                style={{
                  position: 'relative', height: trackH,
                  borderRadius: 18,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  overflow: 'hidden',
                  opacity: land,
                  filter: landBlur > 0.3 ? `blur(${landBlur.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(Math.min(1, land), { ry: -16 - i * 3, z: -50 })} translateY(${((1 - land) * trackH * 0.18).toFixed(2)}px)`,
                  transformOrigin: 'left center',
                  ...el(`row${i + 1}`),
                }}
              >
                <div
                  style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${(r.pct * fill).toFixed(2)}%`,
                    borderRadius: 17,
                    background: isWin
                      ? `linear-gradient(180deg, ${rgba(p.accent, 1)} 0%, ${rgba(p.accent, 0.85)} 100%)`
                      : 'rgba(255,255,255,0.14)',
                    boxShadow: isWin ? luxeGlow(p.accent, 0.55) : undefined,
                  }}
                />
                <span
                  style={{
                    position: 'absolute', left: 26, top: 0, bottom: 0,
                    display: 'flex', alignItems: 'center',
                    fontSize: fsOpt, fontWeight: isWin ? 700 : 600,
                    color: isWin ? '#221503' : p.ink,
                    opacity: labelIn,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: '70%',
                  }}
                >
                  {r.label}
                </span>
                <span
                  style={{
                    position: 'absolute', right: 24, top: 0, bottom: 0,
                    display: 'flex', alignItems: 'center',
                    fontSize: fsPct, fontWeight: isWin ? 800 : 700,
                    color: pctColor,
                    fontVariantNumeric: 'tabular-nums',
                    textShadow: isWin && r.pct < 78 ? luxeGlow(p.accent, 0.35) : undefined,
                    filter: fill < 1 ? `blur(${((1 - fill) * 3).toFixed(2)}px)` : undefined,
                    transform: `translate(${parPct.x.toFixed(2)}px, ${parPct.y.toFixed(2)}px)`,
                  }}
                >
                  {shown}%
                </span>
              </div>
            );
          })}
        </div>

        <div style={luxeGrain(0.04)} />
      </div>
    );
  },
});
