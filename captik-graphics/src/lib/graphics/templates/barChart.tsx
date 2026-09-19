// Reference: graphics/bar-chart-1.mp4
// Each bar is its OWN element (bar1..bar8) so any single column can be nudged, scaled or hidden
// independently — and each grows on its own spring with its value counting up in step, rather
// than the row of bars easing in together. Title and axis labels arrive on their own beats too.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { luxeGlow } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_BARS = 8;

/** "Label 40, Other 75" → [{label,value}]. Tolerates trailing commas and missing numbers so a
 *  half-typed value in the settings panel never blanks the graphic mid-edit. */
function parseSeries(raw: string): { label: string; value: number }[] {
  return raw
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const m = chunk.match(/^(.*?)[\s:]+(-?[\d.]+)$/);
      if (!m) return { label: chunk, value: 0 };
      const v = Number(m[2]);
      return { label: m[1].trim(), value: Number.isFinite(v) ? v : 0 };
    })
    .slice(0, MAX_BARS);
}

export const barChart = defineGraphicsTemplate({
  id: 'bar_chart',
  name: 'Bar Chart',
  category: 'chart',
  tags: ['Chart', 'Data', 'Stats'],
  design: { w: 900, h: 1650 },
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 44, widthPercent: 60 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'title',  label: 'Title' },
    { key: 'labels', label: 'Axis labels' },
    { key: 'values', label: 'Value readouts' },
    ...Array.from({ length: MAX_BARS }, (_, i) => ({ key: `bar${i + 1}`, label: `Bar ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'title',  label: 'Title',  group: 'Content', default: 'Watch time', maxLength: 48 },
    { type: 'text', key: 'series', label: 'Series', group: 'Content', default: 'Mon 32, Tue 48, Wed 41, Thu 76, Fri 95', maxLength: 240, multiline: true,
      help: 'Comma separated "Label value" pairs. Up to 8.' },
    { type: 'boolean', key: 'values', label: 'Show values', group: 'Content', default: false },

    { type: 'font',   key: 'font',   label: 'Font',        group: 'Style', default: 'montserrat' },
    { type: 'color',  key: 'fill',   label: 'Bars',        group: 'Style', default: '#D97706' },
    { type: 'color',  key: 'peak',   label: 'Tallest bar', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Text',        group: 'Style', default: '#F4F1E8' },
    { type: 'number', key: 'radius', label: 'Bar corner',  group: 'Style', default: 8, min: 0, max: 40, step: 2, unit: 'px' },
    { type: 'boolean', key: 'highlightPeak', label: 'Colour the tallest differently', group: 'Style', default: true },

    { type: 'number', key: 'growMs',  label: 'Grow time',   group: 'Motion', default: 900, min: 200, max: 2500, step: 50, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Bar stagger', group: 'Motion', default: 90, min: 0, max: 300, step: 10, unit: 'ms' },
    { type: 'number', key: 'chromeAt', label: 'Title/labels at', group: 'Motion', default: 0, min: 0, max: 1500, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: air pass as the chart swings in, and one chime as the final bar
  // lands — computed from the same stagger/grow params that time the bars themselves.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_BARS, p.series.split(',').map((c) => c.trim()).filter(Boolean).length));
    return [
      { atMs: p.chromeAt + 40, id: 'whoosh', gain: 0.45 },
      { atMs: (n - 1) * p.stagger + p.growMs * 0.75, id: 'chime', gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const series = parseSeries(p.series);
    if (series.length === 0) return null;

    const max = Math.max(...series.map((s) => s.value), 1);
    const peakIdx = series.reduce((best, s, i) => (s.value > series[best].value ? i : best), 0);

    const ff = fontStack(p.font);
    const titleFs = Math.round(height * 0.048);
    const labelFs = Math.round(height * 0.026);
    const plotH = height - titleFs * 2.4 - labelFs * 2.6;
    const gap = width * 0.06;
    const barW = (width - gap * (series.length - 1)) / series.length;

    const beat = (delay: number) => {
      const s = spring({
        frame: fr(timeMs - delay), fps: FPS,
        config: { damping: 26, mass: 0.6, stiffness: 180 },
        durationInFrames: Math.max(1, Math.round(fr(380))),
      });
      return {
        opacity: interpolate(s, [0, 0.55], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateY(${((1 - s) * height * 0.04).toFixed(3)}px)`,
      };
    };
    const titleIn = beat(p.chromeAt);
    const labelsIn = beat(p.chromeAt + 120);

    // Depth: the whole chart swings in top-hinged and keeps a gentle 3D sway; title, labels
    // and value readouts ride different parallax depths so the sway shears the layers while
    // the bars stay glued to the plot.
    const rootIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const pose = depthPose(timeMs, seed, { enter: rootIn, rx: -14, z: -90, swayDeg: 1.6 });
    const parTitle = parallax(timeMs, seed, 0.5, height * 0.006);
    const parLabels = parallax(timeMs, seed, 0.3, height * 0.006);
    const parValues = parallax(timeMs, seed, 0.75, height * 0.006);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, fontFamily: ff, display: 'flex', flexDirection: 'column',
          transform: pose, transformOrigin: '50% 30%',
        }}
      >
        <span
          style={{
            fontSize: titleFs, fontWeight: 700, color: p.ink, marginBottom: titleFs * 0.6,
            opacity: titleIn.opacity,
            transform: `translate(${parTitle.x.toFixed(2)}px, ${parTitle.y.toFixed(2)}px) ${titleIn.transform}`,
            ...el('title'),
          }}
        >
          {p.title}
        </span>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap, height: plotH }}>
          {series.map((s, i) => {
            // Each bar has its own spring, so they arrive with real physics rather than a shared
            // eased ramp — and the readout counts in step with its own bar.
            const growAt = (ms: number) => spring({
              frame: fr(ms - i * p.stagger), fps: FPS,
              config: { damping: 24, mass: 0.75, stiffness: 150 },
              durationInFrames: Math.max(1, Math.round(fr(p.growMs))),
            });
            const g = growAt(timeMs);
            const grow = Math.max(0, Math.min(1, g));
            const h = Math.max(2, (s.value / max) * plotH * grow);
            const colour = p.highlightPeak && i === peakIdx ? p.peak : p.fill;
            // Landing smear: the top edge's growth velocity (px/ms) drives a blur + stretch
            // that dies the instant the spring settles — the column lands crisp.
            const vTop = vel(growAt, timeMs) * (s.value / max) * plotH;
            const sm = smear(0, vTop, 0.6);
            return (
              <div key={`${s.label}-${i}`} style={{ width: barW, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: labelFs * 0.3 }}>
                {p.values && (
                  <span
                    style={{
                      fontSize: labelFs * 0.9, fontWeight: 700, color: colour,
                      opacity: interpolate(grow, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
                      fontVariantNumeric: 'tabular-nums',
                      textShadow: p.highlightPeak && i === peakIdx ? luxeGlow(colour, 0.6) : undefined,
                      transform: `translate(${parValues.x.toFixed(2)}px, ${parValues.y.toFixed(2)}px)`,
                      ...el('values'),
                    }}
                  >
                    {Math.round(s.value * grow)}
                  </span>
                )}
                <div
                  style={{
                    width: '100%', height: h,
                    background: `linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 34%, rgba(0,0,0,0.22) 100%), ${colour}`,
                    borderRadius: `${p.radius}px ${p.radius}px ${Math.min(p.radius, 4)}px ${Math.min(p.radius, 4)}px`,
                    boxShadow: `0 0 ${labelFs}px ${rgba(colour, 0.3)}, 0 0 ${labelFs * 2.6}px ${rgba(colour, 0.14)}, inset 0 1px 0 rgba(255,255,255,0.22)`,
                    // Z-stagger: each column tips up from its base at a slightly different
                    // angle, so the row reads as objects arriving in space.
                    filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                    transform: `${swingIn(grow, { rx: 12 + i * 2, z: -50 })} scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
                    transformOrigin: 'center bottom',
                    ...el(`bar${i + 1}`),
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* dashed hairline baseline, documentary-chart style */}
        <div
          style={{
            height: 1.5, marginTop: 1,
            background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 3px, transparent 3px 11px)',
            opacity: labelsIn.opacity,
          }}
        />

        <div style={{ display: 'flex', gap, marginTop: labelFs * 0.7, opacity: labelsIn.opacity, transform: `translate(${parLabels.x.toFixed(2)}px, ${parLabels.y.toFixed(2)}px) ${labelsIn.transform}`, ...el('labels') }}>
          {series.map((s, i) => (
            <span key={`${s.label}-l-${i}`} style={{ width: barW, textAlign: 'center', fontSize: labelFs * 0.88, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: rgba(p.ink, 0.55), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {s.label}
            </span>
          ))}
        </div>
      </div>
    );
  },
});
