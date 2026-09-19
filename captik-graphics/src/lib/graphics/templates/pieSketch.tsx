// Hand-drawn pie chart on a cream card — a wobbly ink ring draws first, then 2-4 slices sweep
// in sequentially with a seeded radius wobble, each label + percent landing on a short leader
// line at its slice's mid-angle. The craft: the wobble rides a FIXED angular grid per slice, so
// the rough edge stays put while only the leading edge sweeps — no per-frame shimmer.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, swingIn } from '../juice';

/** Hand-drawn ring of radius r: seeded radial noise, closed past its own start point. */
function wobblyRing(cx: number, cy: number, r: number, seed: string): string {
  const N = 20;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI * 0.5;
    const rr = r * (1 + (random(`${seed}-r${i}`) - 0.5) * 0.05);
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return 'M ' + pts.join(' L ');
}

/** Pie slice from a0, spanning `extent*prog` rad. Wobble is seeded on the FULL slice's angular
 *  grid so already-drawn edge points never move between frames; only the sweep edge advances. */
function slicePath(cx: number, cy: number, r: number, a0: number, extent: number, prog: number, seed: string): string {
  const M = 26;
  const aEnd = a0 + extent * prog;
  const pts: string[] = [`${cx.toFixed(1)} ${cy.toFixed(1)}`];
  for (let i = 0; i <= M; i++) {
    const a = Math.min(a0 + extent * (i / M), aEnd);
    const rr = r * (0.985 + (random(`${seed}-w${i}`) - 0.5) * 0.045);
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
    if (a >= aEnd) break;
  }
  return 'M ' + pts.join(' L ') + ' Z';
}

export const pieSketch = defineGraphicsTemplate({
  id: 'pie_sketch',
  name: 'Sketch Pie',
  category: 'chart',
  tags: ['Pie', 'Chart', 'Doodle', 'Slices', 'Percent'],
  badge: 'New',
  design: { w: 900, h: 600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 60 },
  fonts: ['montserrat'],

  elements: [
    { key: 'circle', label: 'Circle', hideable: false },
    { key: 'slices', label: 'Slices', hideable: false },
    { key: 'labels', label: 'Labels' },
  ],

  params: [
    { type: 'text', key: 'slices', label: 'Slices', group: 'Content', multiline: true, maxLength: 120,
      default: 'Create|45\nConsume|35\nRest|20',
      help: 'One slice per line: label | percent (up to 4). Percents are normalised.' },

    { type: 'color',  key: 'paper',  label: 'Paper',  group: 'Style', default: '#F5F1E6' },
    { type: 'color',  key: 'ink',    label: 'Ink',    group: 'Style', default: '#22201B' },
    { type: 'color',  key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'weight', label: 'Stroke', group: 'Style', default: 7, min: 3, max: 14, step: 1, unit: 'px' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER language: card flick as the sheet lands, a pop when the first label arrives and
  // one for the last — the same 1050 + j*640 + 560 grid the slices sweep on.
  sfx: (p) => {
    const ns = Math.max(1, Math.min(4, p.slices.split('\n').map((l) => l.trim()).filter(Boolean).length));
    const cues: { atMs: number; id: 'paper' | 'pop'; gain?: number }[] = [
      { atMs: p.delay + 80, id: 'paper', gain: 0.5 },
      { atMs: p.delay + 1050 + 560 + 80, id: 'pop', gain: 0.4 },
    ];
    if (ns > 1) cues.push({ atMs: p.delay + 1050 + (ns - 1) * 640 + 560 + 80, id: 'pop', gain: 0.5 });
    return cues;
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');

    const rows = p.slices.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4)
      .map((l) => {
        const [label = '', pct = ''] = l.split('|').map((s) => s.trim());
        const v = Number(pct);
        return { label, v: Number.isFinite(v) && v > 0 ? v : 0 };
      });
    const total = rows.reduce((a, r) => a + r.v, 0);
    const shares = rows.map((r) => (total > 0 ? r.v / total : 1 / Math.max(1, rows.length)));

    const COLORS = [p.accent, '#8A8371', '#B45309', '#D6CFBF'];

    const tilt = (random(`${seed}-tilt`) - 0.5) * 2;
    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });

    const cx = width * 0.36, cy = height * 0.52, r = height * 0.28;
    const fsLabel = Math.round(height * 0.05);
    const ringDraw = easeOutQuint(clamp01((t - 250) / 630));
    const ringLen = r * Math.PI * 2.3;

    // Cumulative start angles from 12 o'clock.
    let acc = -Math.PI / 2;
    const geo = shares.map((share, j) => {
      const a0 = acc;
      const extent = share * Math.PI * 2;
      acc += extent;
      const sweep = easeOutQuint(clamp01((t - (1050 + j * 640)) / 560));
      const doneAt = 1050 + j * 640 + 560;
      return { a0, extent, sweep, mid: a0 + extent / 2, doneAt };
    });

    // Depth: the sheet tosses in top-hinged like paper on a desk (casual, not glossy) and
    // keeps a faint 3D sway over its seeded tilt, so the held chart never sits dead.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -70, swayDeg: 1.4 });

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.paper,
          borderRadius: 24,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          transform: `${pose} translateY(${((1 - enter) * height * 0.07).toFixed(2)}px) rotate(${(tilt + (1 - enter) * 1.8).toFixed(3)}deg)`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          overflow: 'hidden',
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, ...el('slices') }}>
          {geo.map((g, j) => (g.sweep > 0 && g.extent > 0
            ? (
              <path
                key={j}
                d={slicePath(cx, cy, r, g.a0, g.extent, g.sweep, `${seed}-s${j}`)}
                fill={COLORS[j % COLORS.length]}
                fillOpacity={0.92}
              />
            )
            : null))}
        </svg>

        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, ...el('circle') }}>
          <path
            d={wobblyRing(cx, cy, r * 1.06, `${seed}-ring`)}
            fill="none" stroke={p.ink} strokeWidth={p.weight}
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={ringLen} strokeDashoffset={((1 - ringDraw) * ringLen).toFixed(1)}
          />
        </svg>

        <div style={{ position: 'absolute', inset: 0, ...el('labels') }}>
          {geo.map((g, j) => {
            if (t < g.doneAt || g.extent <= 0) return null;
            const row = rows[j];
            const rightSide = Math.cos(g.mid) >= 0;
            const leadDraw = easeOutQuint(clamp01((t - g.doneAt) / 240));
            const pop = spring({
              frame: fr(t - g.doneAt - 80), fps: FPS,
              config: { damping: 19, mass: 0.6, stiffness: 210 },
              durationInFrames: Math.max(1, Math.round(fr(450))),
            });
            const lx0 = cx + Math.cos(g.mid) * r * 1.08, ly0 = cy + Math.sin(g.mid) * r * 1.08;
            const lx1 = cx + Math.cos(g.mid) * r * 1.24, ly1 = cy + Math.sin(g.mid) * r * 1.24;
            const leadLen = r * 0.3;
            return (
              <div key={j}>
                <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                  <path
                    d={`M ${lx0.toFixed(1)} ${ly0.toFixed(1)} L ${lx1.toFixed(1)} ${ly1.toFixed(1)}`}
                    fill="none" stroke={rgba(p.ink, 0.45)} strokeWidth={3} strokeLinecap="round"
                    strokeDasharray={leadLen} strokeDashoffset={((1 - leadDraw) * leadLen).toFixed(1)}
                  />
                </svg>
                <div
                  style={{
                    position: 'absolute',
                    left: cx + Math.cos(g.mid) * r * 1.3,
                    top: cy + Math.sin(g.mid) * r * 1.3,
                    display: 'flex', alignItems: 'center', gap: fsLabel * 0.35,
                    whiteSpace: 'nowrap',
                    opacity: clamp01(pop * 1.5),
                    // Z-stagger: each label swings in hinged toward its slice with a landing
                    // smear that dies as its pop spring settles.
                    filter: pop > 0.001 && pop < 0.985 ? `blur(${((1 - Math.min(1, pop)) * 2.5).toFixed(2)}px)` : undefined,
                    transformOrigin: rightSide ? 'left center' : 'right center',
                    transform: `${swingIn(pop, { ry: rightSide ? 18 : -18, z: -40 })} translate(${rightSide ? '0%' : '-100%'}, -50%) scale(${(0.75 + 0.25 * pop).toFixed(4)})`,
                  }}
                >
                  <span
                    style={{
                      width: fsLabel * 0.44, height: fsLabel * 0.44, borderRadius: 999, flexShrink: 0,
                      background: COLORS[j % COLORS.length],
                      boxShadow: `inset 0 0 0 2px ${rgba(p.ink, 0.15)}`,
                    }}
                  />
                  <span style={{ fontSize: fsLabel, fontWeight: 700, color: p.ink }}>{row.label}</span>
                  <span style={{ fontSize: fsLabel * 0.86, fontWeight: 600, color: rgba(p.ink, 0.55) }}>
                    {Math.round(shares[j] * 100)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
