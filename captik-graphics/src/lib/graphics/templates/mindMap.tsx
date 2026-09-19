// Hand-drawn mind map — a wobbly centre bubble draws itself, then 3-4 branch strokes sweep
// outward to smaller bubbles that pop in with their labels; the branch marked '*' fills amber.
// The craft: branch positions come from a per-count layout table (2 branches sit level, 4 make
// a cross) with seeded jitter on top, so every count composes instead of crowding one side.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, inkOn, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, swingIn } from '../juice';

/** Straight-ish stroke with seeded hand jitter on every anchor. */
function wobblyLine(x0: number, y0: number, x1: number, y1: number, seed: string, amp: number): string {
  const N = 7;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const x = x0 + (x1 - x0) * f + (random(`${seed}-x${i}`) - 0.5) * amp;
    const y = y0 + (y1 - y0) * f + (random(`${seed}-y${i}`) - 0.5) * amp;
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return 'M ' + pts.join(' L ');
}

/** Hand-drawn ellipse in a w×h box: seeded radial noise, closed past its own start point. */
function wobblyEllipse(w: number, h: number, seed: string): string {
  const cx = w / 2, cy = h / 2, rx = w * 0.44, ry = h * 0.4;
  const N = 16;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI * 0.3;
    const n = 1 + (random(`${seed}-e${i}`) - 0.5) * 0.09;
    pts.push(`${(cx + Math.cos(a) * rx * n).toFixed(1)} ${(cy + Math.sin(a) * ry * n).toFixed(1)}`);
  }
  return 'M ' + pts.join(' L ') + ' Z';
}

/** Branch endpoint offsets from centre, as fractions of the canvas, per branch count. */
const LAYOUT: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0.32, -0.02]],
  2: [[-0.32, -0.05], [0.32, 0.05]],
  3: [[-0.32, -0.17], [0.33, -0.13], [0.04, 0.31]],
  4: [[-0.32, -0.19], [0.32, -0.15], [-0.3, 0.2], [0.33, 0.18]],
};

export const mindMap = defineGraphicsTemplate({
  id: 'mind_map',
  name: 'Mind Map',
  category: 'chart',
  tags: ['Mindmap', 'Bubbles', 'Doodle', 'Branches', 'Diagram'],
  badge: 'New',
  design: { w: 900, h: 700 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5500,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 60 },
  fonts: ['montserrat'],

  elements: [
    { key: 'center',  label: 'Centre bubble', hideable: false },
    { key: 'branch1', label: 'Branch 1' },
    { key: 'branch2', label: 'Branch 2' },
    { key: 'branch3', label: 'Branch 3' },
    { key: 'branch4', label: 'Branch 4' },
  ],

  params: [
    { type: 'text', key: 'center', label: 'Centre', group: 'Content', default: 'CONTENT', maxLength: 16 },
    { type: 'text', key: 'b1', label: 'Branch 1', group: 'Content', default: 'Ideas', maxLength: 16,
      help: 'Prefix a branch with * to fill it amber. Blank branches are skipped.' },
    { type: 'text', key: 'b2', label: 'Branch 2', group: 'Content', default: '* Scripts', maxLength: 16 },
    { type: 'text', key: 'b3', label: 'Branch 3', group: 'Content', default: 'Filming', maxLength: 16 },
    { type: 'text', key: 'b4', label: 'Branch 4', group: 'Content', default: 'Editing', maxLength: 16 },

    { type: 'boolean', key: 'plate',  label: 'Paper card', group: 'Style', default: true },
    { type: 'color',   key: 'paper',  label: 'Paper',  group: 'Style', default: '#F5F1E6' },
    { type: 'color',   key: 'ink',    label: 'Ink',    group: 'Style', default: '#22201B' },
    { type: 'color',   key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER language: card flick as the sketch lands, a pop when the first branch bubble
  // arrives and one for the last — the same 1200 + i*700 grid the motion sprouts on.
  sfx: (p) => {
    const nb = Math.max(1, [p.b1, p.b2, p.b3, p.b4].map((l) => l.trim()).filter(Boolean).length);
    const cues: { atMs: number; id: 'paper' | 'pop'; gain?: number }[] = [
      { atMs: p.delay + 80, id: 'paper', gain: 0.5 },
      { atMs: p.delay + 1200 + 320, id: 'pop', gain: 0.45 },
    ];
    if (nb > 1) cues.push({ atMs: p.delay + 1200 + (nb - 1) * 700 + 320, id: 'pop', gain: 0.5 });
    return cues;
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');

    const branches = [p.b1, p.b2, p.b3, p.b4]
      .map((l) => l.trim()).filter(Boolean)
      .map((l) => ({ starred: l.startsWith('*'), text: l.replace(/^\*\s*/, '') }));
    const layout = LAYOUT[branches.length] ?? [];

    const tilt = (random(`${seed}-tilt`) - 0.5) * 2;
    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });

    const cx = width / 2, cy = height / 2;
    const cw = width * 0.3, ch = height * 0.2;
    const bw = width * 0.21, bh = height * 0.13;
    const fsCenter = Math.round(height * 0.052);
    const fsBranch = Math.round(height * 0.04);
    const strokeShadow = p.plate ? undefined : 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))';

    const centerDraw = easeOutQuint(clamp01((t - 200) / 700));
    const centerLen = (cw + ch) * 3.2;
    const centerLabel = easeOutQuint(clamp01((t - 700) / 420));

    // Depth: the sketch tosses in top-hinged like paper on a desk (casual, not glossy) and
    // keeps a faint 3D sway on top of its seeded tilt — the doodle never sits dead.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -70, swayDeg: 1.4 });

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          ...(p.plate ? {
            background: p.paper,
            borderRadius: 26,
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          } : null),
          opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          transform: `${pose} translateY(${((1 - enter) * height * 0.06).toFixed(2)}px) rotate(${(p.plate ? tilt + (1 - enter) * 1.8 : 0).toFixed(3)}deg)`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          overflow: p.plate ? 'hidden' : 'visible',
        }}
      >
        {branches.map((b, i) => {
          const at = 1200 + i * 700;
          if (t < at) return null;
          const [fx, fy] = layout[i] ?? [0.32, 0];
          const bx = cx + fx * width + (random(`${seed}-jx${i}`) - 0.5) * width * 0.03;
          const by = cy + fy * height + (random(`${seed}-jy${i}`) - 0.5) * height * 0.03;

          const lineDraw = easeOutQuint(clamp01((t - at) / 430));
          const pop = spring({
            frame: fr(t - at - 320), fps: FPS,
            config: { damping: 16, mass: 0.6, stiffness: 220 },
            durationInFrames: Math.max(1, Math.round(fr(500))),
          });

          // Stroke runs from the centre bubble's rim to just short of the branch bubble.
          const sx = cx + (bx - cx) * 0.24, sy = cy + (by - cy) * 0.3;
          const ex = cx + (bx - cx) * 0.85, ey = cy + (by - cy) * 0.85;
          const lineLen = (Math.abs(ex - sx) + Math.abs(ey - sy)) * 1.5;

          return (
            <div key={i} style={{ position: 'absolute', inset: 0, ...el(`branch${i + 1}`) }}>
              <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: strokeShadow }}>
                <path
                  d={wobblyLine(sx, sy, ex, ey, `${seed}-l${i}`, 5)}
                  fill="none" stroke={rgba(p.ink, 0.75)} strokeWidth={Math.max(4, height * 0.008)}
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray={lineLen} strokeDashoffset={((1 - lineDraw) * lineLen).toFixed(1)}
                />
              </svg>
              <div
                style={{
                  position: 'absolute', left: bx - bw / 2, top: by - bh / 2,
                  width: bw, height: bh,
                  // Z-stagger: each bubble swings in at its own angle with a landing smear
                  // that dies as its pop spring settles — casual, paper-toss physics.
                  filter: pop > 0.001 && pop < 0.985 ? `blur(${((1 - Math.min(1, pop)) * 2.5).toFixed(2)}px)` : undefined,
                  transform: `${swingIn(pop, { rx: -14 - i * 3, z: -40 })} scale(${pop.toFixed(4)})`,
                  opacity: clamp01(pop * 1.5),
                }}
              >
                <svg viewBox={`0 0 ${bw} ${bh}`} width={bw} height={bh} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: strokeShadow }}>
                  <path
                    d={wobblyEllipse(bw, bh, `${seed}-bb${i}`)}
                    fill={b.starred ? p.accent : p.paper}
                    stroke={b.starred ? rgba(p.ink, 0.55) : rgba(p.ink, 0.8)}
                    strokeWidth={Math.max(3, height * 0.006)}
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                </svg>
                <div
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: fsBranch, fontWeight: 700,
                    color: b.starred ? inkOn(p.accent) : p.ink,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {b.text}
                </div>
              </div>
            </div>
          );
        })}

        <div
          style={{
            position: 'absolute', left: cx - cw / 2, top: cy - ch / 2,
            width: cw, height: ch,
            ...el('center'),
          }}
        >
          <svg viewBox={`0 0 ${cw} ${ch}`} width={cw} height={ch} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: strokeShadow }}>
            <path
              d={wobblyEllipse(cw, ch, `${seed}-cc`)}
              fill={p.paper} fillOpacity={clamp01(centerDraw * 1.4).toFixed(3)}
              stroke={p.ink} strokeWidth={Math.max(4, height * 0.009)}
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={centerLen} strokeDashoffset={((1 - centerDraw) * centerLen).toFixed(1)}
            />
          </svg>
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: fsCenter, fontWeight: 800, letterSpacing: '0.04em',
              color: p.ink, whiteSpace: 'nowrap', textTransform: 'uppercase',
              opacity: centerLabel,
              transform: `translateY(${((1 - centerLabel) * height * 0.012).toFixed(2)}px)`,
            }}
          >
            {p.center}
          </div>
        </div>
      </div>
    );
  },
});
