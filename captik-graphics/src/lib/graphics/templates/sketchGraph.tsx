// A hand-drawn chart in the paper language: wobbly axes sweep on from the origin, the curve
// draws itself along ('up' exponential / 'dip' valley / 'hockey' flat-then-spike), then a
// wobbly amber ellipse circles the payoff with a short note. The craft decision: the
// annotation targets the curve's STORY point, not blindly the endpoint — 'dip' circles the
// valley floor, because "right here" is the beat the creator is narrating when it lands.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose } from '../juice';

function smooth(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Normalised curve height 0..1 at x-progress u 0..1. */
function shapeAt(kind: string, u: number): number {
  if (kind === 'dip') {
    if (u < 0.45) return 0.42 - 0.34 * smooth(u / 0.45);
    return 0.08 + 0.84 * smooth((u - 0.45) / 0.55);
  }
  if (kind === 'hockey') {
    if (u < 0.62) return 0.05 + 0.06 * u;
    return 0.087 + Math.pow((u - 0.62) / 0.38, 1.75) * 0.82;
  }
  return ((Math.exp(2.6 * u) - 1) / (Math.exp(2.6) - 1)) * 0.9 + 0.02;
}

/** Straight-ish line with seeded hand jitter on every anchor. */
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
  const cx = w / 2, cy = h / 2, rx = w * 0.42, ry = h * 0.36;
  const N = 15;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI * 0.35;
    const n = 1 + (random(`${seed}-e${i}`) - 0.5) * 0.09;
    pts.push(`${(cx + Math.cos(a) * rx * n).toFixed(1)} ${(cy + Math.sin(a) * ry * n).toFixed(1)}`);
  }
  return 'M ' + pts.join(' L ');
}

export const sketchGraph = defineGraphicsTemplate({
  id: 'sketch_graph',
  name: 'Sketch Graph',
  category: 'chart',
  tags: ['Graph', 'Chart', 'Doodle', 'Curve', 'Sketch', 'Axes'],
  badge: 'New',
  design: { w: 900, h: 700 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 62 },
  fonts: ['montserrat'],

  elements: [
    { key: 'axes',       label: 'Axes' },
    { key: 'curve',      label: 'Curve', hideable: false },
    { key: 'annotation', label: 'Annotation' },
  ],

  params: [
    { type: 'select', key: 'curve', label: 'Curve', group: 'Content', default: 'up',
      options: [
        { value: 'up', label: 'Exponential rise' },
        { value: 'dip', label: 'The dip' },
        { value: 'hockey', label: 'Hockey stick' },
      ] },
    { type: 'text', key: 'note',   label: 'Annotation', group: 'Content', default: 'right here', maxLength: 26 },
    { type: 'text', key: 'xLabel', label: 'X axis', group: 'Content', default: 'TIME', maxLength: 18 },
    { type: 'text', key: 'yLabel', label: 'Y axis', group: 'Content', default: 'GROWTH', maxLength: 18 },

    { type: 'boolean', key: 'plate',  label: 'Paper card', group: 'Style', default: true },
    { type: 'color',   key: 'paper',  label: 'Paper', group: 'Style', default: '#F5F1E6', showIf: { key: 'plate', equals: true } },
    { type: 'color',   key: 'ink',    label: 'Ink',    group: 'Style', default: '#22201B' },
    { type: 'color',   key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'number',  key: 'weight', label: 'Stroke', group: 'Style', default: 7, min: 3, max: 14, step: 1, unit: 'px' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER palette: the card flicks onto the desk, a light air pass as the curve sweeps itself
  // on, and a pop when the amber circle + note land on the payoff — the same delay-based clock
  // as the render's beats (curve at +950, annotation at +2450).
  sfx: (p) => [
    { atMs: p.delay + 60, id: 'paper', gain: 0.5 },
    { atMs: p.delay + 950, id: 'swish', gain: 0.35 },
    { atMs: p.delay + 2750, id: 'pop', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');

    const tilt = (random(`${seed}-tilt`) - 0.5) * 2.4;
    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });

    // ── Chart geometry (design px) ──────────────────────────────────────────────
    const ox = width * 0.11, oy = height * 0.84;
    const ty = height * 0.10, rxEnd = width * 0.93;
    const ah = width * 0.016;

    // Axes sweep outward from the origin, y first — the order a hand draws them.
    const axY = easeOutQuint(clamp01((t - 120) / 520));
    const axX = easeOutQuint(clamp01((t - 300) / 520));
    const labIn = easeOutQuint(clamp01((t - 640) / 420));

    const yPath = wobblyLine(ox, oy, ox, ty + ah, `${seed}-ay`, 4)
      + ` M ${(ox - ah).toFixed(1)} ${(ty + ah * 1.6).toFixed(1)} L ${ox.toFixed(1)} ${ty.toFixed(1)} L ${(ox + ah).toFixed(1)} ${(ty + ah * 1.6).toFixed(1)}`;
    const xPath = wobblyLine(ox, oy, rxEnd - ah, oy, `${seed}-ax`, 4)
      + ` M ${(rxEnd - ah * 1.6).toFixed(1)} ${(oy - ah).toFixed(1)} L ${rxEnd.toFixed(1)} ${oy.toFixed(1)} L ${(rxEnd - ah * 1.6).toFixed(1)} ${(oy + ah).toFixed(1)}`;
    const lenY = (oy - ty) * 1.5;
    const lenX = (rxEnd - ox) * 1.4;

    // ── Curve: sampled shape + per-anchor jitter, dash-swept on after the axes ──
    const N = 30;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const v = shapeAt(p.curve, u);
      pts.push({
        x: ox + width * 0.012 + u * (rxEnd - ox - width * 0.045) + (random(`${seed}-cx${i}`) - 0.5) * width * 0.006,
        y: oy - height * 0.012 - v * (oy - ty - height * 0.06) + (random(`${seed}-cy${i}`) - 0.5) * height * 0.01,
      });
    }
    const curvePath = 'M ' + pts.map((pt) => `${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' L ');
    const curveDraw = easeOutQuint(clamp01((t - 950) / 1350));
    // Over-estimated dash length — exact length needs DOM measurement; finishing the sweep a
    // touch early is invisible on a hand-drawn stroke.
    const lenC = (width + height) * 1.4;

    // ── Annotation at the payoff point ──────────────────────────────────────────
    const dip = p.curve === 'dip';
    const pay = pts[dip ? Math.round(N * 0.45) : N];
    const annT = t - 2450;
    const circDraw = easeOutQuint(clamp01(annT / 560));
    const notePop = spring({
      frame: fr(annT - 260), fps: FPS,
      config: { damping: 18, mass: 0.6, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });
    const noteTilt = (random(`${seed}-nt`) - 0.5) * 6;
    const ew = width * 0.21, eh = height * 0.155;
    const ellipsePath = wobblyEllipse(ew, eh, `${seed}-ann`);
    const lenE = (ew + eh) * 3.2;

    const fsAxis = Math.round(height * 0.034);
    const fsNote = Math.round(height * 0.054);
    const strokeShadow = p.plate ? undefined : 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))';

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
          // Paper tossed on a desk: a casual top-hinged swing + faint resting sway (kept small
          // and un-glossy), composed with the sheet's existing seeded tilt.
          transform: `${depthPose(t, seed, { enter, rx: -12, z: -70, swayDeg: 1.2 })} translateY(${((1 - enter) * height * 0.06).toFixed(2)}px) rotate(${(p.plate ? tilt + (1 - enter) * 1.8 : 0).toFixed(3)}deg)`,
          transformOrigin: '50% 35%',
          fontFamily: ff,
          overflow: p.plate ? 'hidden' : 'visible',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, ...el('axes') }}>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: strokeShadow }}>
            <path
              d={yPath} fill="none" stroke={p.ink} strokeWidth={Math.max(3, p.weight * 0.55)}
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={lenY} strokeDashoffset={((1 - axY) * lenY).toFixed(1)}
            />
            <path
              d={xPath} fill="none" stroke={p.ink} strokeWidth={Math.max(3, p.weight * 0.55)}
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={lenX} strokeDashoffset={((1 - axX) * lenX).toFixed(1)}
            />
          </svg>
          <span
            style={{
              position: 'absolute', left: ox + width * 0.012, top: ty - height * 0.055,
              fontSize: fsAxis, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: rgba(p.ink, 0.55), whiteSpace: 'nowrap', opacity: labIn,
            }}
          >
            {p.yLabel}
          </span>
          <span
            style={{
              position: 'absolute', right: width * 0.055, top: oy + height * 0.025,
              fontSize: fsAxis, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: rgba(p.ink, 0.55), whiteSpace: 'nowrap', opacity: labIn,
            }}
          >
            {p.xLabel}
          </span>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: strokeShadow, ...el('curve') }}>
          <path
            d={curvePath} fill="none" stroke={p.ink} strokeWidth={p.weight}
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={lenC} strokeDashoffset={((1 - curveDraw) * lenC).toFixed(1)}
          />
        </svg>

        <div style={{ position: 'absolute', left: pay.x, top: pay.y, width: 0, height: 0, ...el('annotation') }}>
          <svg
            viewBox={`0 0 ${ew} ${eh}`} width={ew} height={eh}
            style={{ position: 'absolute', left: -ew / 2, top: -eh / 2, overflow: 'visible', filter: strokeShadow }}
          >
            <path
              d={ellipsePath} fill="none" stroke={p.accent} strokeWidth={Math.max(4, p.weight * 0.8)}
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={lenE} strokeDashoffset={((1 - circDraw) * lenE).toFixed(1)}
            />
          </svg>
          <span
            style={{
              position: 'absolute', whiteSpace: 'nowrap',
              fontSize: fsNote, fontWeight: 700, color: p.accent,
              textShadow: p.plate ? undefined : '0 1px 3px rgba(0,0,0,0.35)',
              opacity: clamp01(notePop * 1.6),
              // The note smears for its first few frames and lands crisp; the hand-drawn INK
              // strokes stay blur-free on purpose — smeared ink reads as a printing error.
              filter: notePop > 0.001 && notePop < 0.985 ? `blur(${((1 - Math.min(1, notePop)) * 2).toFixed(2)}px)` : undefined,
              ...(dip
                ? {
                    left: 0, top: -(eh / 2) - fsNote * 1.4,
                    transform: `translateX(-50%) rotate(${noteTilt.toFixed(2)}deg) scale(${(0.7 + 0.3 * notePop).toFixed(4)})`,
                  }
                : {
                    right: ew * 0.62, top: -fsNote * 0.55, textAlign: 'right', transformOrigin: 'right center',
                    transform: `rotate(${noteTilt.toFixed(2)}deg) scale(${(0.7 + 0.3 * notePop).toFixed(4)})`,
                  }),
            }}
          >
            {p.note}
          </span>
        </div>
      </div>
    );
  },
});
