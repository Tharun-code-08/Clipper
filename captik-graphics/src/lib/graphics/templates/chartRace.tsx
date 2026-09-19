// Bar-chart race on dark glass — bars sprint on fixed easing curves (the winner surges past
// the fast starter ~60% in), then the champion fills amber and a crown drops at its head.
// Craft: row order is a SOFT rank — each row's y-index is a sum of sigmoids of the value gaps,
// so rows glide past each other through every lead change as a pure function of timeMs.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint, luxeGlow, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX = 4;

const smootherstep = (u: number) => u * u * u * (10 - 15 * u + 6 * u * u); // late surge — the winner
const easeOutQuart = (u: number) => 1 - Math.pow(1 - u, 4);                // rockets early — the bait leader
const easeOutCubicF = (u: number) => 1 - Math.pow(1 - u, 3);               // the mid-pack

export const chartRace = defineGraphicsTemplate({
  id: 'chart_race',
  name: 'Chart Race',
  category: 'chart',
  tags: ['Bars', 'Race', 'Ranking', 'Chart', 'Leaderboard'],
  badge: 'New',
  design: { w: 900, h: 560 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 78 },
  fonts: ['montserrat'],

  elements: [
    { key: 'panel', label: 'Panel', hideable: false },
    { key: 'title', label: 'Title' },
    ...Array.from({ length: MAX }, (_, i) => ({ key: `bar${i + 1}`, label: `Bar ${i + 1}` })),
    { key: 'crown', label: 'Crown' },
  ],

  params: [
    { type: 'text', key: 'bars', label: 'Bars', group: 'Content', multiline: true, maxLength: 200,
      default: 'Podcast|62\nYouTube|84\nBlog|41',
      help: 'One per line: name | final value. 2-4 bars; the highest value wins the race.' },
    { type: 'text', key: 'title',  label: 'Title',  group: 'Content', default: 'REACH BY CHANNEL', maxLength: 32 },
    { type: 'text', key: 'suffix', label: 'Unit',   group: 'Content', default: '%', maxLength: 4 },

    { type: 'color', key: 'accent', label: 'Winner', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },

    { type: 'number', key: 'raceMs', label: 'Race time', group: 'Motion', default: 4200, min: 1500, max: 8000, step: 100, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: air sweep on the swing-in, a riser under the race build, and the
  // chime as the crown lands — the payoff beat computed exactly like the motion computes it.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX, p.bars.split('\n').map((l) => l.trim()).filter(Boolean).length));
    return [
      { atMs: p.delay + 80, id: 'whoosh', gain: 0.45 },
      { atMs: p.delay + 500, id: 'riser', gain: 0.35 },
      { atMs: p.delay + 500 + p.raceMs * 0.95 + (n - 1) * 90, id: 'chime', gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const rows = p.bars.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX)
      .map((l) => {
        const [name = '', raw = '0'] = l.split('|').map((s) => s.trim());
        const v = parseFloat(raw.replace(/[^0-9.]/g, ''));
        return { name, final: Number.isFinite(v) ? Math.max(0, v) : 0 };
      });
    if (!rows.length) return null;
    const n = rows.length;

    const winnerIdx = rows.reduce((b, r, i, a) => (r.final > a[b].final ? i : b), 0);
    let earlyIdx = -1;
    rows.forEach((r, i) => {
      if (i !== winnerIdx && (earlyIdx < 0 || r.final > rows[earlyIdx].final)) earlyIdx = i;
    });
    const vmaxF = Math.max(1e-6, rows[winnerIdx].final);

    const raceStart = 500;
    const vNow = rows.map((r, i) => {
      const u = clamp01((t - raceStart - i * 90) / Math.max(1, p.raceMs));
      const curve = i === winnerIdx ? smootherstep : i === earlyIdx ? easeOutQuart : easeOutCubicF;
      return r.final * curve(u);
    });

    // Soft rank: sigmoid of pairwise value gaps, blended from the input order while the
    // bars are still bunched at the start line.
    const s = vmaxF * 0.025;
    const mixF = easeOutQuint(clamp01((t - raceStart - 500) / 600));
    const yIdx = rows.map((_, i) => {
      let soft = 0;
      for (let j = 0; j < n; j++) {
        if (j !== i) soft += 1 / (1 + Math.exp(-(vNow[j] - vNow[i]) / s));
      }
      return i * (1 - mixF) + soft * mixF;
    });

    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 32, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    const headIn = easeOutQuint(clamp01((t - 120) / 450));
    // Depth: the glass swings in top-hinged on the entrance spring and keeps a ±1.8° sway;
    // title and finish line sit at different parallax depths so the sway shears them over
    // the track while the bars stay glued to the glass.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -80, swayDeg: 1.8 });
    const parTitle = parallax(t, seed, 0.45, height * 0.01);
    const parFinish = parallax(t, seed, 0.3, height * 0.01);

    const endF = easeOutQuint(clamp01((t - (raceStart + p.raceMs * 0.88 + (n - 1) * 90)) / 600));
    const crownAt = raceStart + p.raceMs * 0.95 + (n - 1) * 90;
    const crownSAt = (ms: number) => spring({
      frame: fr(ms - crownAt), fps: FPS,
      config: { damping: 12, mass: 0.6, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const crownS = crownSAt(t);

    // The amber fill rides the CURRENT leader, not just the eventual winner — a lead change
    // reads as the overtake it is, which is the whole drama of a race chart.
    const leadIdx = vNow.indexOf(Math.max(...vNow));

    const padV = height * 0.075;
    const titleH = height * 0.1;
    const areaH = height - padV * 2 - titleH;
    const rowSlot = areaH / n;
    const rowH = rowSlot * 0.74;
    const fsLab = Math.round(rowH * 0.3);
    const fsVal = Math.round(rowH * 0.32);

    // The crown is the one genuinely fast mover — its drop velocity drives a smear that
    // dies the instant the bounce settles, so the payoff lands crisp.
    const vCrown = vel(crownSAt, t) * rowH * 0.4;
    const crownSm = smear(0, vCrown);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          ...luxePanel(Math.round(height * 0.06)),
          opacity: enter,
          transform: `${pose} translateY(${((1 - enter) * height * 0.05).toFixed(2)}px)`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          overflow: 'hidden',
          padding: `${Math.round(padV)}px ${Math.round(width * 0.055)}px`,
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
          ...el('panel'),
        }}
      >
        <div
          style={{
            height: titleH, opacity: headIn,
            transform: `translate(${parTitle.x.toFixed(2)}px, ${parTitle.y.toFixed(2)}px)`,
            ...el('title'),
          }}
        >
          <span style={luxeLabel(Math.round(height * 0.042), rgba(p.ink, 0.8))}>{p.title}</span>
        </div>

        <div style={{ position: 'relative', flex: 1 }}>
          {/* Dashed finish line at the track's 100% mark. */}
          <div
            style={{
              position: 'absolute', left: '87.5%', top: 0, bottom: 0,
              borderLeft: '2px dashed rgba(255,255,255,0.16)',
              opacity: headIn,
              transform: `translate(${parFinish.x.toFixed(2)}px, ${parFinish.y.toFixed(2)}px)`,
            }}
          />

          {rows.map((r, i) => {
            const rowIn = easeOutQuint(clamp01((t - 180 - i * 110) / 420));
            const fillPct = (vNow[i] / vmaxF) * 84;
            const isWin = i === winnerIdx;
            const shown = Math.round(vNow[i]);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute', left: 0, right: 0,
                  top: (yIdx[i] * rowSlot + (rowSlot - rowH) / 2).toFixed(2) + 'px',
                  height: rowH,
                  display: 'flex', alignItems: 'center',
                  opacity: rowIn,
                  // Z-stagger: each lane swings in side-hinged from its own slightly different
                  // angle, so the field reads as objects arriving in space, not divs fading in.
                  transform: `${swingIn(rowIn, { ry: -16 - i * 3, z: -60 })} translateX(${((1 - rowIn) * -width * 0.02).toFixed(2)}px)`,
                  transformOrigin: 'left center',
                  ...el(`bar${i + 1}`),
                }}
              >
                <span
                  style={{
                    width: '22%', paddingRight: '3%', boxSizing: 'border-box',
                    textAlign: 'right',
                    fontSize: fsLab, fontWeight: 600, color: rgba(p.ink, 0.92),
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {r.name}
                </span>
                <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                  {vNow[i] > 0.001 && (
                    <div
                      style={{
                        position: 'absolute', left: 0, top: '13%', bottom: '13%',
                        width: `${fillPct.toFixed(2)}%`,
                        borderRadius: rowH * 0.14,
                        // Solid enough to read as a BAR over the panel; the 0.2 wash it
                        // replaced looked like an empty track for the entire race.
                        background: `linear-gradient(180deg, ${rgba(p.ink, 0.5)} 0%, ${rgba(p.ink, 0.34)} 100%)`,
                        border: '1px solid rgba(255,255,255,0.10)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                      }}
                    />
                  )}
                  {i === leadIdx && vNow[i] > 0.001 && (
                    <div
                      style={{
                        position: 'absolute', left: 0, top: '13%', bottom: '13%',
                        width: `${fillPct.toFixed(2)}%`,
                        borderRadius: rowH * 0.14,
                        background: `linear-gradient(180deg, ${rgba(p.accent, 0.95)} 0%, ${rgba(p.accent, 0.78)} 100%)`,
                      }}
                    />
                  )}
                  {isWin && endF > 0 && (
                    <div
                      style={{
                        position: 'absolute', left: 0, top: '13%', bottom: '13%',
                        width: `${fillPct.toFixed(2)}%`,
                        borderRadius: rowH * 0.14,
                        background: `linear-gradient(180deg, ${rgba(p.accent, 1)} 0%, ${rgba(p.accent, 0.82)} 100%)`,
                        opacity: endF,
                        boxShadow: luxeGlow(p.accent, 0.6 * endF),
                      }}
                    />
                  )}
                  <span
                    style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: `calc(${fillPct.toFixed(2)}% + ${Math.round(rowH * 0.16)}px)`,
                      display: 'flex', alignItems: 'center', gap: rowH * 0.14,
                      fontSize: fsVal, fontWeight: 800,
                      color: isWin && endF > 0.5 ? p.accent : rgba(p.ink, 0.95),
                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      textShadow: isWin && endF > 0.5 ? luxeGlow(p.accent, 0.4 * endF) : undefined,
                    }}
                  >
                    {shown}{p.suffix.trim()}
                    {isWin && t >= crownAt - 50 && (
                      <svg
                        viewBox="0 0 24 20" width={fsVal * 1.05} height={fsVal * 0.88}
                        style={{
                          opacity: clamp01((t - crownAt) / 80),
                          transform: `translateY(${((1 - crownS) * -rowH * 0.4).toFixed(2)}px) rotate(${((1 - crownS) * -14).toFixed(2)}deg) scale(${crownSm.sx.toFixed(4)}, ${crownSm.sy.toFixed(4)})`,
                          filter: `${crownSm.blurPx > 0.3 ? `blur(${crownSm.blurPx.toFixed(2)}px) ` : ''}drop-shadow(0 0 6px ${rgba(p.accent, 0.55)})`,
                          ...el('crown'),
                        }}
                      >
                        <path d="M2 15 L4 4.5 L9 9.5 L12 2.5 L15 9.5 L20 4.5 L22 15 Z" fill={p.accent} />
                        <rect x={3} y={16.5} width={18} height={2.4} rx={1.2} fill={p.accent} />
                      </svg>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={luxeGrain(0.04)} />
      </div>
    );
  },
});
