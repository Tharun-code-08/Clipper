// Horizontal journey timeline — the documentary "2019 ... 2026" beat. A hairline draws
// across, year nodes pop on in sequence, each raising a short label; the LAST milestone is
// the amber payoff (bigger node, glow, label at full weight). One node can instead be marked
// with '*' to take the payoff role — the reference edits always light exactly one moment.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGlow, luxeLabel } from '../luxe';
import { depthPose, parallax, swingIn } from '../juice';

const MAX = 6;

export const timelineYears = defineGraphicsTemplate({
  id: 'timeline_years',
  name: 'Year Timeline',
  category: 'chart',
  tags: ['Timeline', 'Years', 'Journey', 'Milestones', 'Line'],
  badge: 'New',
  design: { w: 900, h: 400 },
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 88 },
  fonts: ['montserrat'],

  elements: [
    { key: 'line', label: 'Line', hideable: false },
    ...Array.from({ length: MAX }, (_, i) => ({ key: `node${i + 1}`, label: `Milestone ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'steps', label: 'Milestones', group: 'Content', multiline: true, maxLength: 300,
      default: '2019|Started\n2021|First client\n2023|Scaled up\n*2026|$1M year',
      help: 'One per line: year | label. Up to 6. Prefix one line with * to make it the highlighted payoff (defaults to the last).' },

    { type: 'color', key: 'ink',    label: 'Text', group: 'Style', default: '#F4F1E8' },
    { type: 'color', key: 'accent', label: 'Payoff', group: 'Style', default: '#F59E0B' },
    { type: 'boolean', key: 'below', label: 'Labels below the line', group: 'Style', default: false },

    { type: 'number', key: 'lineMs',  label: 'Line draws over', group: 'Motion', default: 1400, min: 300, max: 4000, step: 50, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Node stagger', group: 'Motion', default: 520, min: 100, max: 1500, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: a sweep under the hairline draw, a pop as the first milestone lands,
  // and a chime on the amber payoff — node beats use the SAME max(line-reach, stagger)
  // formula as the render, and the hero the same *-prefix rule, so retiming retimes the cues.
  sfx: (p) => {
    const rows = p.steps.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX);
    const n = Math.max(1, rows.length);
    let hero = rows.findIndex((l) => l.startsWith('*'));
    if (hero < 0) hero = n - 1;
    const at = (i: number) => Math.max(p.lineMs * (n === 1 ? 0.5 : i / (n - 1)) + 120, i * p.stagger);
    return [
      { atMs: p.delay, id: 'sweep', gain: 0.4 },
      { atMs: p.delay + at(0) + 80, id: 'pop', gain: 0.4 },
      { atMs: p.delay + at(hero) + 200, id: 'chime', gain: 0.55 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const rows = p.steps.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX);
    if (!rows.length) return null;
    let hero = rows.findIndex((l) => l.startsWith('*'));
    if (hero < 0) hero = rows.length - 1;
    const steps = rows.map((l, i) => {
      const [year = '', label = ''] = l.replace(/^\*/, '').split('|').map((s) => s.trim());
      return { year, label, hero: i === hero };
    });

    const lineY = height * 0.55;
    const x0 = width * 0.05;
    const x1 = width * 0.95;
    const drawn = interpolate(t, [0, p.lineMs], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    // Depth: the whole timeline swings in top-hinged and keeps a faint 3D sway; the year/label
    // stacks ride a foreground parallax depth so the sway shears them over the hairline.
    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });
    const pose = depthPose(t, seed, { enter, rx: -10, z: -60, swayDeg: 1.4 });
    const parLabels = parallax(t, seed, 0.45, height * 0.02);

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, opacity: clamp01(enter * 2), transform: pose, transformOrigin: '50% 55%' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', ...el('line') }}>
          <line
            x1={x0} y1={lineY} x2={x0 + (x1 - x0) * drawn} y2={lineY}
            stroke="rgba(255,255,255,0.28)" strokeWidth={2}
          />
          {/* A brighter head chases the draw so the line reads as travelling, not appearing. */}
          {drawn < 1 && (
            <circle cx={x0 + (x1 - x0) * drawn} cy={lineY} r={3.5} fill={p.accent} opacity={0.9} />
          )}
        </svg>

        {steps.map((s2, i) => {
          const fx = steps.length === 1 ? 0.5 : i / (steps.length - 1);
          const nx = x0 + (x1 - x0) * fx;
          // Node arrives once the line head has passed it, OR on the stagger beat —
          // whichever is later, so a slow stagger keeps meaning after the line finishes.
          const at = Math.max(p.lineMs * fx + 120, i * p.stagger);
          const pop = spring({
            frame: fr(t - at), fps: FPS,
            config: { damping: 20, mass: 0.55, stiffness: 210 },
            durationInFrames: Math.max(1, Math.round(fr(380))),
          });
          if (t <= at - 100) return null;
          const r = (s2.hero ? height * 0.030 : height * 0.018);
          const above = p.below ? 1 : -1;
          const labelIn = clamp01((t - at - 140) / 320);
          // Z-stagger: each node swings in through space at its own angle (hinged toward the
          // side its label hangs on), with a landing smear that dies as its pop settles.
          const popBlur = pop > 0.001 && pop < 0.985 ? (1 - Math.min(1, pop)) * 2.4 : 0;
          return (
            <div key={i} style={{ position: 'absolute', left: nx, top: lineY, ...el(`node${i + 1}`) }}>
              <div
                style={{
                  position: 'absolute', left: -r, top: -r, width: r * 2, height: r * 2,
                  borderRadius: '50%',
                  background: s2.hero ? p.accent : LUXE.bg1,
                  border: s2.hero ? 'none' : `2px solid ${rgba(p.ink, 0.55)}`,
                  boxShadow: s2.hero ? luxeGlow(p.accent, 0.9) : undefined,
                  filter: popBlur > 0.3 ? `blur(${popBlur.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(Math.min(1, pop), { rx: above < 0 ? -16 - i * 2 : 16 + i * 2, z: -50 })} scale(${interpolate(pop, [0, 1], [0.2, 1]).toFixed(3)})`,
                  opacity: clamp01(pop * 1.6),
                }}
              />
              <div
                style={{
                  position: 'absolute', left: 0, top: above * (r + height * 0.045),
                  transform: `translate(${parLabels.x.toFixed(2)}px, ${parLabels.y.toFixed(2)}px) translateX(-50%) translateY(${above < 0 ? '-100%' : '0'})`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: height * 0.012,
                  opacity: labelIn,
                }}
              >
                <span
                  style={{
                    fontSize: Math.round(height * (s2.hero ? 0.085 : 0.062)),
                    fontWeight: 800, color: s2.hero ? p.accent : p.ink,
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                    textShadow: s2.hero ? luxeGlow(p.accent, 0.5) : '0 1px 6px rgba(0,0,0,0.5)',
                  }}
                >
                  {s2.year}
                </span>
                {s2.label && (
                  <span style={{ ...luxeLabel(Math.round(height * 0.035), s2.hero ? rgba(p.ink, 0.9) : LUXE.inkDim), whiteSpace: 'nowrap' }}>
                    {s2.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  },
});
