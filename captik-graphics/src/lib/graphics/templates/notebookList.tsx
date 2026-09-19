// Spiral notebook page — a heading wipes on like it's being written, then up to 4 list lines
// land one per beat behind hand-drawn amber bullet dashes; a line prefixed '*' gets a wobbly
// circle drawn around it at the end. The craft: the faint ruled lines are drawn at the EXACT
// row pitch the items land on, so the page reads as real stationery, not a texture.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, smear, swingIn, vel } from '../juice';

/** Straight-ish stroke with seeded hand jitter on every anchor. */
function wobblyLine(x0: number, y0: number, x1: number, y1: number, seed: string, amp: number): string {
  const N = 6;
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
  const cx = w / 2, cy = h / 2, rx = w * 0.46, ry = h * 0.4;
  const N = 15;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI * 0.4;
    const n = 1 + (random(`${seed}-e${i}`) - 0.5) * 0.1;
    pts.push(`${(cx + Math.cos(a) * rx * n).toFixed(1)} ${(cy + Math.sin(a) * ry * n).toFixed(1)}`);
  }
  return 'M ' + pts.join(' L ');
}

export const notebookList = defineGraphicsTemplate({
  id: 'notebook_list',
  name: 'Notebook List',
  category: 'story',
  tags: ['Notebook', 'List', 'Ruled', 'Spiral', 'Handwritten'],
  badge: 'New',
  design: { w: 900, h: 800 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5500,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 54 },
  fonts: ['montserrat'],

  elements: [
    { key: 'page',    label: 'Page', hideable: false },
    { key: 'heading', label: 'Heading' },
    { key: 'lines',   label: 'List lines', hideable: false },
    { key: 'circle',  label: 'Circle' },
  ],

  params: [
    { type: 'text', key: 'heading', label: 'Heading', group: 'Content', default: 'Today', maxLength: 32 },
    { type: 'text', key: 'items', label: 'Items', group: 'Content', multiline: true, maxLength: 160,
      default: 'Deep work, 9-11\nWrite the script\n* Ship the video\nGym at 6',
      help: 'One item per line (up to 4). Prefix a line with * to circle it at the end.' },

    { type: 'color', key: 'paper',  label: 'Paper',  group: 'Style', default: '#F5F1E6' },
    { type: 'color', key: 'ink',    label: 'Ink',    group: 'Style', default: '#22201B' },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'margin', label: 'Margin line', group: 'Style', default: '#DC8A7E' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER: the page lands with a flick, the first lines pop on their beats, and when a starred
  // line exists the closing circle gets a swish as it draws around it.
  sfx: (p) => {
    const rows = p.items.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4);
    const starred = rows.some((l) => l.startsWith('*'));
    return [
      { atMs: p.delay + 250, id: 'paper' as const, gain: 0.5 },
      ...Array.from({ length: Math.min(2, rows.length) }, (_, i) => ({
        atMs: p.delay + 1400 + i * 680,
        id: 'pop' as const,
        gain: 0.35,
      })),
      ...(starred ? [{ atMs: p.delay + 4300, id: 'swish' as const, gain: 0.45 }] : []),
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');

    const rows = p.items.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4)
      .map((l) => ({ starred: l.startsWith('*'), text: l.replace(/^\*\s*/, '') }));
    const starIdx = rows.findIndex((r) => r.starred);

    const tilt = (random(`${seed}-tilt`) - 0.5) * 2.4;
    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });
    // The page is tossed onto the desk — casual paper hinge on the existing spring, then a faint
    // resting sway so the stationery never flattens back into a web page.
    const pose = depthPose(t, seed, { enter, rx: -12, ry: -5, z: -70, swayDeg: 0.9 });

    // ── Page geometry ───────────────────────────────────────────────────────────
    const x0 = width * 0.2;                    // content left, past margin line
    const marginX = width * 0.155;
    const y0 = height * 0.1;
    const headH = height * 0.145;
    const rowH = height * 0.125;
    // Cap type at the height the design aspect gives this width — in a taller instance aspect
    // the page grows but lines must still fit the ruled width, not clip at the right edge.
    const typeH = Math.min(height, width * (800 / 900));
    const fsHead = Math.round(typeH * 0.075);
    const fsRow = Math.round(typeH * 0.056);
    const dashW = fsRow * 1.05;

    const headWipe = easeOutQuint(clamp01((t - 380) / 520));

    // ── Wobbly circle around the starred row ────────────────────────────────────
    const star = starIdx >= 0 ? rows[starIdx] : null;
    const circW = star
      ? clamp(star.text.length * fsRow * 0.56 + fsRow * 3.4, fsRow * 5, width - x0 - width * 0.05)
      : 0;
    const circH = rowH * 1.34;
    const circDraw = easeOutQuint(clamp01((t - 4150) / 620));
    const circLen = (circW + circH) * 3.2;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.paper,
          borderRadius: 18,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          transform: `${pose} translateY(${((1 - enter) * height * 0.06).toFixed(2)}px) rotate(${(tilt + (1 - enter) * 1.8).toFixed(3)}deg)`,
          fontFamily: ff,
          overflow: 'hidden',
          ...el('page'),
        }}
      >
        {/* Stationery: ruled lines at row pitch, red margin, spiral binding holes. */}
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 5 }, (_, i) => {
            const y = y0 + headH + i * rowH + rowH * 0.88;
            return <line key={i} x1={0} y1={y} x2={width} y2={y} stroke={rgba(p.ink, 0.08)} strokeWidth={2} />;
          })}
          <line x1={marginX} y1={0} x2={marginX} y2={height} stroke={rgba(p.margin, 0.55)} strokeWidth={3} />
          {Array.from({ length: 11 }, (_, i) => (
            <circle
              key={i}
              cx={width * 0.055} cy={height * (0.06 + i * 0.088)} r={width * 0.008}
              fill={rgba(p.ink, 0.12)}
            />
          ))}
        </svg>

        <span
          style={{
            position: 'absolute', left: x0, top: y0,
            fontSize: fsHead, fontWeight: 700, color: p.ink,
            letterSpacing: '-0.01em', whiteSpace: 'nowrap',
            clipPath: `inset(0 ${((1 - headWipe) * 100).toFixed(2)}% 0 0)`,
            opacity: headWipe > 0 ? 1 : 0,
            ...el('heading'),
          }}
        >
          {p.heading}
        </span>

        <div style={{ position: 'absolute', inset: 0, ...el('lines') }}>
          {rows.map((row, i) => {
            const at = 1200 + i * 680;
            if (t < at) return null;
            // Z-STAGGER: each line hinges onto the page from a slightly different angle, and its
            // drop velocity smears it — the list builds as objects landing, not divs appearing.
            const landAt = (ms: number) => spring({
              frame: fr(ms - at), fps: FPS,
              config: { damping: 22, mass: 0.7, stiffness: 175 },
              durationInFrames: Math.max(1, Math.round(fr(520))),
            });
            const land = landAt(t);
            const vRow = vel((ms) => (1 - landAt(ms)) * -rowH * 0.35, t);
            const smRow = smear(0, vRow, 1.2);
            const dashDraw = easeOutQuint(clamp01((t - at) / 260));
            const rowTop = y0 + headH + i * rowH;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute', left: x0, top: rowTop, height: rowH,
                  display: 'flex', alignItems: 'center', gap: fsRow * 0.55,
                  opacity: interpolate(land, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
                  filter: smRow.blurPx > 0.3 ? `blur(${smRow.blurPx.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(land, { rx: 12, ry: i % 2 ? -8 : 8, z: -50 })} translateY(${((1 - land) * -rowH * 0.35).toFixed(2)}px) scale(${smRow.sx.toFixed(4)}, ${smRow.sy.toFixed(4)})`,
                }}
              >
                <svg width={dashW} height={fsRow * 0.5} viewBox={`0 0 ${dashW} ${fsRow * 0.5}`} style={{ overflow: 'visible', flexShrink: 0 }}>
                  <path
                    d={wobblyLine(2, fsRow * 0.25, dashW - 2, fsRow * 0.22, `${seed}-b${i}`, 3)}
                    fill="none" stroke={p.accent} strokeWidth={Math.max(4, height * 0.008)}
                    strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray={dashW * 1.2} strokeDashoffset={((1 - dashDraw) * dashW * 1.2).toFixed(1)}
                  />
                </svg>
                <span
                  style={{
                    fontSize: fsRow, fontWeight: row.starred ? 700 : 600,
                    color: row.starred ? p.ink : rgba(p.ink, 0.82),
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.text}
                </span>
              </div>
            );
          })}
        </div>

        {star && (
          <svg
            width={circW} height={circH} viewBox={`0 0 ${circW} ${circH}`}
            style={{
              position: 'absolute',
              left: x0 - fsRow * 1.5,
              top: y0 + headH + starIdx * rowH + rowH * 0.5 - circH / 2,
              overflow: 'visible',
              ...el('circle'),
            }}
          >
            <path
              d={wobblyEllipse(circW, circH, `${seed}-c`)}
              fill="none" stroke={p.accent} strokeWidth={Math.max(5, height * 0.009)}
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={circLen} strokeDashoffset={((1 - circDraw) * circLen).toFixed(1)}
            />
          </svg>
        )}
      </div>
    );
  },
});
