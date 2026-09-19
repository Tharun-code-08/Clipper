// Chapter stepper — numbered circles over footage, an amber line draws between them, each
// step pops when reached and flips to a check once passed. Craft: the draw is eased PER
// SEGMENT (ease-in-out each leg), so the line pauses at every node exactly when its pop
// lands — and the auto-advance is derived from durationMs, finishing holdMs before the end.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint, luxeGlow, luxeLabel } from '../luxe';
import { parallax, swingIn, sway3d } from '../juice';

const MAX = 5;

function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export const progressSteps = defineGraphicsTemplate({
  id: 'progress_steps',
  name: 'Progress Steps',
  category: 'chart',
  tags: ['Stepper', 'Steps', 'Circles', 'Checkmarks', 'Progress'],
  badge: 'New',
  design: { w: 900, h: 240 },
  // Floats transparently over footage like a chapter tracker.
  backdrop: false,
  defaultDurationMs: 5500,
  defaultBox: { xPercent: 50, yPercent: 26, widthPercent: 72 },
  fonts: ['montserrat'],

  elements: [
    { key: 'line', label: 'Line', hideable: false },
    ...Array.from({ length: MAX }, (_, i) => ({ key: `step${i + 1}`, label: `Step ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'steps', label: 'Steps', group: 'Content', default: 'Plan|Build|Launch|Scale', maxLength: 100,
      help: 'Up to 5 steps, separated by |. The tracker auto-advances across the clip.' },

    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },

    { type: 'number', key: 'holdMs',  label: 'Hold at end', group: 'Motion', default: 900, min: 0, max: 3000, step: 50, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Entrance stagger', group: 'Motion', default: 120, min: 0, max: 500, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: an air pass as the circles arrive and one pop the instant the journey
  // clock starts (reachAt(0) = last entrance + 500, the same stagger-derived beat the render
  // uses). The later reach/pass beats derive from durationMs, which cues cannot know — so the
  // finish deliberately carries no payoff cue.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX, p.steps.split('|').map((s) => s.trim()).filter(Boolean).length));
    return [
      { atMs: p.delay + 100, id: 'whoosh', gain: 0.35 },
      { atMs: p.delay + (n - 1) * p.stagger + 60 + 500, id: 'pop', gain: 0.4 },
    ];
  },

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const steps = p.steps.split('|').map((s) => s.trim()).filter(Boolean).slice(0, MAX);
    if (!steps.length) return null;
    const n = steps.length;

    const r = height * 0.17;
    const cy = height * 0.34;
    const pad = width * 0.055 + r;
    const x = (i: number) => (n === 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2));

    // Journey clock: reach step i at reachAt(i); the whole journey lands holdMs early.
    const entLast = (n - 1) * p.stagger + 60;
    const jStart = entLast + 500;
    const jEnd = Math.max(jStart + 900, durationMs - p.delay - p.holdMs);
    const reachAt = (i: number) => (n === 1 ? jStart : jStart + (i / (n - 1)) * (jEnd - jStart));
    const passAt = (i: number) => (i < n - 1 ? reachAt(i + 1) : jEnd + 300);

    // Per-segment eased draw — sums to the amber line's total fraction.
    let frac = 0;
    for (let i = 0; i < n - 1; i++) {
      frac += easeInOutCubic((t - reachAt(i)) / Math.max(1, reachAt(i + 1) - reachAt(i)));
    }
    frac = n > 1 ? frac / (n - 1) : 0;

    const baseF = easeOutQuint(clamp01((t - 80) / 500));
    const x0 = x(0);
    const xLast = x(n - 1);
    const progX = x0 + (xLast - x0) * frac;

    // Depth: the whole tracker holds a faint 3D sway so it never flattens back to a web page;
    // the labels ride a parallax depth under it so the sway shears them against the circles.
    const parLabel = parallax(t, seed, 0.4, height * 0.02);

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, transform: sway3d(t, seed, 1.3), transformOrigin: '50% 40%' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: 'drop-shadow(0 1px 6px rgba(0,0,0,0.5))', ...el('line') }}
        >
          <line
            x1={x0} y1={cy} x2={x0 + (xLast - x0) * baseF} y2={cy}
            stroke="rgba(255,255,255,0.30)" strokeWidth={2} strokeDasharray="2 7"
          />
          {frac > 0 && (
            <line
              x1={x0} y1={cy} x2={progX} y2={cy}
              stroke={p.accent} strokeWidth={3.5} strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 8px ${rgba(p.accent, 0.55)})` }}
            />
          )}
          {frac > 0 && frac < 1 && <circle cx={progX} cy={cy} r={4.5} fill={p.accent} opacity={0.95} />}
        </svg>

        {steps.map((label, i) => {
          const ent = spring({
            frame: fr(t - (i * p.stagger + 60)), fps: FPS,
            config: { damping: 18, mass: 0.6, stiffness: 210 },
            durationInFrames: Math.max(1, Math.round(fr(420))),
          });
          const reached = t >= reachAt(i);
          const passed = t >= passAt(i);
          const reachS = spring({
            frame: fr(t - reachAt(i)), fps: FPS,
            config: { damping: 14, mass: 0.55, stiffness: 240 },
            durationInFrames: Math.max(1, Math.round(fr(420))),
          });
          const fillF = clamp01((t - reachAt(i)) / 160);
          const checkIn = clamp01((t - passAt(i)) / 240);
          const bump = reached ? interpolate(reachS, [0, 1], [1.22, 1]) : 1;
          // Active step breathes — pure sin of timeMs, no wall clock.
          const glowStr = reached && !passed ? 0.8 + 0.3 * Math.sin(t * 0.008) : passed ? 0.45 : 0;
          // Z-stagger: each circle swings in top-hinged at its own angle, with a landing smear
          // that dies the instant its entrance spring settles.
          const entBlur = ent > 0.001 && ent < 0.985 ? (1 - Math.min(1, ent)) * 2.5 : 0;

          return (
            <div key={i} style={{ position: 'absolute', left: x(i), top: cy, ...el(`step${i + 1}`) }}>
              <div
                style={{
                  position: 'absolute', left: -r, top: -r, width: r * 2, height: r * 2,
                  borderRadius: '50%',
                  background: 'rgba(11,11,13,0.72)',
                  border: '2px solid rgba(255,255,255,0.35)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: clamp01(ent * 1.5),
                  filter: entBlur > 0.3 ? `blur(${entBlur.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(Math.min(1, ent), { rx: -18 - i * 2, z: -60 })} scale(${(interpolate(ent, [0, 1], [0.3, 1]) * bump).toFixed(4)})`,
                }}
              >
                <div
                  style={{
                    position: 'absolute', inset: -2, borderRadius: '50%',
                    background: p.accent,
                    opacity: fillF,
                    boxShadow: glowStr > 0 ? luxeGlow(p.accent, glowStr) : undefined,
                  }}
                />
                <span
                  style={{
                    position: 'relative',
                    fontSize: Math.round(r * 0.85), fontWeight: 800, lineHeight: 1,
                    color: reached ? '#1A1206' : rgba(p.ink, 0.75),
                    fontVariantNumeric: 'tabular-nums',
                    opacity: 1 - checkIn,
                  }}
                >
                  {i + 1}
                </span>
                <svg
                  viewBox="0 0 24 24" width={r * 1.15} height={r * 1.15}
                  style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -r * 0.575, marginTop: -r * 0.575 }}
                >
                  <polyline
                    points="6,12.5 10.5,17 18,8"
                    fill="none" stroke="#1A1206" strokeWidth={3}
                    strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray={20} strokeDashoffset={((1 - checkIn) * 20).toFixed(1)}
                  />
                </svg>
              </div>
              <span
                style={{
                  position: 'absolute', left: 0, top: r + height * 0.09,
                  transform: `translate(${parLabel.x.toFixed(2)}px, ${parLabel.y.toFixed(2)}px) translateX(-50%)`,
                  ...luxeLabel(Math.round(height * 0.072), reached ? p.ink : rgba(p.ink, 0.55)),
                  whiteSpace: 'nowrap',
                  textShadow: '0 2px 10px rgba(0,0,0,0.7), 0 0 24px rgba(0,0,0,0.45)',
                  opacity: clamp01(ent * 1.3),
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    );
  },
});
