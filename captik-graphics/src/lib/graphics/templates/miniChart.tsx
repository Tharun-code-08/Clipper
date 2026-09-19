// Reference: general/simple-chart.mp4  (window 720-4000ms, curve drawn ~2000ms, bars keep moving)
// A small analytics card: title, headline percentage, a drawn spline, and a row of bars underneath
// that keep shuffling.
//
// The spline is a Catmull-Rom through the same control points every frame — resampling the curve
// from moving data is what makes these wobble instead of holding their shape.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGrain, luxeLabel, luxeVignette } from '../luxe';
import { depthPose, parallax } from '../juice';

const MAX_BARS = 10;
const SAMPLES = 60;

/** Catmull-Rom through `pts`, sampled to a polyline. Holds its shape frame to frame. */
function spline(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out: string[] = [];
  for (let s = 0; s <= SAMPLES; s += 1) {
    const u = (s / SAMPLES) * (pts.length - 1);
    const i = Math.floor(u);
    const t = u - i;
    const p0 = at(i - 1); const p1 = at(i); const p2 = at(i + 1); const p3 = at(i + 2);
    const t2 = t * t; const t3 = t2 * t;
    const c = (a: number, b: number, cc: number, d: number) =>
      0.5 * ((2 * b) + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
    out.push(`${c(p0.x, p1.x, p2.x, p3.x).toFixed(1)},${c(p0.y, p1.y, p2.y, p3.y).toFixed(1)}`);
  }
  return `M ${out.join(' L ')}`;
}

export const miniChart = defineGraphicsTemplate({
  id: 'mini_chart',
  name: 'Mini Chart',
  category: 'money',
  tags: ['Chart', 'Percent', 'Card', 'Luxury'],
  design: { w: 900, h: 1680 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'card',  label: 'Card', hideable: false },
    { key: 'title', label: 'Title' },
    { key: 'value', label: 'Figure' },
    { key: 'curve', label: 'Curve' },
    { key: 'bars',  label: 'Bars' },
  ],

  params: [
    { type: 'text', key: 'title',   label: 'Title',   group: 'Content', default: 'Chart', maxLength: 24 },
    { type: 'text', key: 'value',   label: 'Figure',  group: 'Content', default: '74%', maxLength: 12 },
    { type: 'text', key: 'caption', label: 'Caption', group: 'Content', default: 'Weekly trend', maxLength: 28 },
    { type: 'text', key: 'curve',   label: 'Curve points', group: 'Content', default: '30,44,38,62,50,88,64', maxLength: 90,
      help: 'Comma-separated, 0-100.' },
    { type: 'text', key: 'bars',    label: 'Bar heights', group: 'Content', default: '48,52,72,58,40', maxLength: 90 },

    { type: 'color',  key: 'bg',    label: 'Card',   group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',   label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Caption', group: 'Style', default: '#8B8780' },
    { type: 'color',  key: 'line',  label: 'Curve',  group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'bar',   label: 'Bars',   group: 'Style', default: '#D97706' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Figure size', group: 'Style', default: 140, min: 16, max: 180, step: 2, unit: 'px' },
    { type: 'number', key: 'thick', label: 'Curve width', group: 'Style', default: 3, min: 1, max: 14, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Bar corner', group: 'Style', default: 4, min: 0, max: 24, step: 1, unit: 'px' },
    { type: 'boolean', key: 'fill', label: 'Paint the card', group: 'Style', default: true },

    { type: 'number', key: 'headAt', label: 'Heading at', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drawAt', label: 'Curve draws at', group: 'Motion', default: 60, min: 0, max: 5000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drawMs', label: 'Curve draws over', group: 'Motion', default: 900, min: 100, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'shuffle', label: 'Bar shuffle depth', group: 'Motion', default: 22, min: 0, max: 50, step: 1, unit: '%' },
    { type: 'number', key: 'rate',    label: 'Bar shuffle speed', group: 'Motion', default: 0.4, min: 0, max: 2, step: 0.02 },
  ],

  // Quiet DOCU dashboard: a glass ping as the card lands, a low sweep under the curve draw,
  // and a coin exactly where the line completes — all riding the same headAt/drawAt/drawMs.
  sfx: (p) => [
    { atMs: p.headAt + 60, id: 'glass', gain: 0.4 },
    { atMs: p.drawAt, id: 'sweep', gain: 0.3 },
    { atMs: p.drawAt + p.drawMs, id: 'coin', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const curve = p.curve.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
    const bars = p.bars.split(',').map((s) => Number(s.trim())).filter(Number.isFinite).slice(0, MAX_BARS);

    const head = spring({
      frame: fr(timeMs - p.headAt), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const draw = interpolate(timeMs, [p.drawAt, p.drawAt + p.drawMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    // Depth: the card swings in top-hinged on its existing heading spring and holds a ±1.6°
    // sway; title, figure and the shuffling bar row sit at three parallax depths so the sway
    // shears the layers — a dashboard living in space, not a flat screenshot.
    const pose = depthPose(timeMs, seed, { enter: head, rx: -10, z: -70, swayDeg: 1.6 });
    const parTitle = parallax(timeMs, seed, 0.45, height * 0.006);
    const parVal = parallax(timeMs, seed, 0.25, height * 0.006);
    const parBars = parallax(timeMs, seed, 0.7, height * 0.006);

    const padX = width * 0.07;
    const curveTop = height * 0.42;
    const curveH = height * 0.24;
    const barTop = height * 0.74;
    const barH = height * 0.18;

    const pts = curve.map((v, i) => ({
      x: padX + ((width - padX * 2) * i) / Math.max(1, curve.length - 1),
      y: curveTop + curveH * (1 - Math.max(0, Math.min(100, v)) / 100),
    }));

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? `linear-gradient(180deg, ${p.bg} 0%, ${LUXE.bg0} 100%)` : 'transparent',
          boxShadow: p.fill ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : undefined,
          fontFamily: ff,
          transform: pose,
          transformOrigin: '50% 30%',
          ...el('card'),
        }}
      >
        <div
          style={{
            position: 'absolute', left: padX, top: height * 0.1,
            ...luxeLabel(p.size * 0.28, rgba(p.ink, 0.55)),
            opacity: clamp01(head * 2),
            transform: `translate(${parTitle.x.toFixed(2)}px, ${parTitle.y.toFixed(2)}px)`,
            ...el('title'),
          }}
        >
          {p.title}
        </div>
        <div
          style={{
            position: 'absolute', left: padX, top: height * 0.17,
            opacity: clamp01(head * 2),
            transform: `translate(${parVal.x.toFixed(2)}px, ${(parVal.y + (1 - head) * height * 0.012).toFixed(2)}px)`,
            ...el('value'),
          }}
        >
          <div style={{ fontSize: p.size, fontWeight: 700, color: p.ink, lineHeight: 1.05, letterSpacing: '0.01em', fontVariantNumeric: 'tabular-nums' }}>{p.value}</div>
          <div style={{ fontSize: p.size * 0.2, color: p.dim, marginTop: p.size * 0.06, letterSpacing: '0.02em' }}>{p.caption}</div>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...el('curve') }}>
          {/* dashed hairline baseline under the curve, documentary-chart style */}
          <line
            x1={padX} y1={curveTop + curveH} x2={width - padX} y2={curveTop + curveH}
            stroke="rgba(255,255,255,0.16)" strokeWidth={1.5} strokeDasharray="2 7"
          />
          <path
            d={spline(pts)} fill="none" stroke={p.line} strokeWidth={p.thick} strokeLinecap="round"
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw}
            style={{ filter: `drop-shadow(0 0 6px ${rgba(p.line, 0.55)}) drop-shadow(0 0 18px ${rgba(p.line, 0.28)})` }}
          />
        </svg>

        <div
          style={{
            // The bar row is deliberately NARROWER than the card — the reference's bars sit in the
            // middle 60%, not edge to edge.
            position: 'absolute', left: width * 0.2, right: width * 0.2, top: barTop, height: barH,
            display: 'flex', alignItems: 'flex-end', gap: width * 0.025,
            transform: `translate(${parBars.x.toFixed(2)}px, ${parBars.y.toFixed(2)}px)`,
            ...el('bars'),
          }}
        >
          {bars.map((v, i) => {
            const grow = spring({
              frame: fr(timeMs - p.drawAt - i * 70), fps: FPS,
              config: { damping: 200, mass: 0.6, stiffness: 170 },
              durationInFrames: Math.max(1, Math.round(fr(420))),
            });
            // Modulo shuffle, seeded per bar — deterministic on any scrub.
            const ph = ((timeMs / 1000) * p.rate + random(`${seed}s${i}`)) % 1;
            const h = Math.max(4, Math.min(100, v + Math.sin(ph * Math.PI * 2) * p.shuffle));
            return (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: `${(barH * (h / 100) * grow).toFixed(2)}px`,
                  background: `linear-gradient(180deg, ${p.bar} 0%, ${rgba(p.bar, 0.5)} 100%)`,
                  boxShadow: `0 0 12px ${rgba(p.bar, 0.22)}`,
                  borderRadius: p.radius,
                }}
              />
            );
          })}
        </div>

        {p.fill && <div style={luxeVignette(0.4)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
