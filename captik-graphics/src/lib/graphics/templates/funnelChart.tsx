// Marketing funnel: stacked trapezoids narrowing downward, landing top-to-bottom one per
// beat with a leader line to their label + value on the right. All stage fills derive from
// the ONE accent param by mixing toward black (amber → deep amber → darker), so a user
// recolor keeps the depth ramp instead of flattening it. The final stage is the payoff:
// a springier landing, an amber glow, and its value at 1.3x.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax, swingIn } from '../juice';

const MAX = 4;

/** Mix a hex colour toward black by factor f (0..1). Non-hex input passes through. */
function shade(hex: string, f: number): string {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return hex;
  const ch = (i: number) => Math.round(parseInt(full.slice(i, i + 2), 16) * (1 - f));
  return `rgb(${ch(0)},${ch(2)},${ch(4)})`;
}

export const funnelChart = defineGraphicsTemplate({
  id: 'funnel_chart',
  name: 'Funnel',
  category: 'chart',
  tags: ['Funnel', 'Stages', 'Trapezoid', 'Conversion', 'Chart'],
  badge: 'New',
  design: { w: 900, h: 700 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 80 },
  fonts: ['montserrat'],

  elements: Array.from({ length: MAX }, (_, i) => ({ key: `stage${i + 1}`, label: `Stage ${i + 1}` })),

  params: [
    { type: 'text', key: 'stages', label: 'Stages', group: 'Content', multiline: true, maxLength: 200,
      default: 'Viewers|120K\nClicked|18K\nBooked|2,400\nClosed|312',
      help: 'One per line: label | value. 2-4 stages, top to bottom. The last stage is the payoff.' },

    { type: 'color',   key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'color',   key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'boolean', key: 'plate',  label: 'Glass panel', group: 'Style', default: true },

    { type: 'number', key: 'beatMs', label: 'Stage beat', group: 'Motion', default: 420, min: 150, max: 900, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: air sweep on the swing-in, a softer sweep as the last stage
  // approaches, and the chime on the payoff glow — all riding beatMs like the motion.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX, p.stages.split('\n').map((l) => l.trim()).filter(Boolean).length));
    return [
      { atMs: p.delay + 60, id: 'whoosh', gain: 0.45 },
      { atMs: p.delay + Math.max(0, 260 + (n - 1) * p.beatMs - 120), id: 'whoosh', gain: 0.3 },
      { atMs: p.delay + 260 + (n - 1) * p.beatMs + 300, id: 'chime', gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const rows = p.stages.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX)
      .map((l) => {
        const [label = '', value = ''] = l.split('|').map((s) => s.trim());
        return { label, value };
      });
    if (!rows.length) return null;
    const n = rows.length;

    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 32, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    // Depth: the card swings in top-hinged on the entrance spring and holds a ±1.8° sway;
    // the label/value column rides a foreground parallax depth so the sway shears it over
    // the trapezoids, which stay glued to the glass.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -80, swayDeg: 1.8 });
    const parChips = parallax(t, seed, 0.7, height * 0.008);

    // Funnel geometry: trapezoids on the left, labels on the right.
    const cxF = width * 0.315;
    const topW = width * 0.48;
    const botW = width * 0.145;
    const wAt = (f: number) => topW + (botW - topW) * f;
    const areaTop = height * 0.115;
    const gapY = 14;
    const stageH = (height * 0.77 - gapY * (n - 1)) / n;
    const labelX = width * 0.605;
    const fsVal = Math.round(height * 0.049);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          ...(p.plate ? luxePanel(Math.round(height * 0.05)) : {}),
          opacity: enter,
          transform: `${pose} translateY(${((1 - enter) * height * 0.04).toFixed(2)}px)`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          overflow: 'hidden',
        }}
      >
        {rows.map((r, i) => {
          const isLast = i === n - 1;
          const at = 260 + i * p.beatMs;
          const land = spring({
            frame: fr(t - at), fps: FPS,
            config: { damping: isLast ? 16 : 24, mass: 0.7, stiffness: isLast ? 190 : 170 },
            durationInFrames: Math.max(1, Math.round(fr(550))),
          });
          const glowIn = isLast ? easeOutQuint(clamp01((t - at - 300) / 350)) : 0;
          const y = areaTop + i * (stageH + gapY);
          const wTop = wAt(i / n);
          const wBot = wAt((i + 1) / n);
          const wMid = (wTop + wBot) / 2;
          const fill = shade(p.accent, n > 1 ? (i / (n - 1)) * 0.42 : 0);
          const pts = [
            `${(cxF - wTop / 2).toFixed(1)},0`,
            `${(cxF + wTop / 2).toFixed(1)},0`,
            `${(cxF + wBot / 2).toFixed(1)},${stageH.toFixed(1)}`,
            `${(cxF - wBot / 2).toFixed(1)},${stageH.toFixed(1)}`,
          ].join(' ');
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: 0, right: 0, top: y, height: stageH,
                opacity: Math.min(1, land),
                // Z-stagger: each stage swings in top-hinged from its own slightly different
                // angle (overshoot in the land spring tips it past vertical and settles).
                transform: `${swingIn(land, { rx: -14 + i * 1.5, z: -60 })} translateY(${((1 - land) * -26).toFixed(2)}px)`,
                transformOrigin: 'top center',
                ...el(`stage${i + 1}`),
              }}
            >
              <svg viewBox={`0 0 ${width} ${stageH.toFixed(1)}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <polygon
                  points={pts}
                  fill={fill}
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={2}
                  style={glowIn > 0.01 ? { filter: `drop-shadow(0 0 16px ${rgba(p.accent, +(0.55 * glowIn).toFixed(3))})` } : undefined}
                />
                <line
                  x1={(cxF + wMid / 2 + 14).toFixed(1)} y1={(stageH / 2).toFixed(1)}
                  x2={(labelX - 18).toFixed(1)} y2={(stageH / 2).toFixed(1)}
                  stroke="rgba(255,255,255,0.18)" strokeWidth={2} strokeDasharray="2 7"
                />
              </svg>
              <div
                style={{
                  position: 'absolute', left: labelX, top: '50%',
                  transform: `translateY(-50%) translate(${parChips.x.toFixed(2)}px, ${parChips.y.toFixed(2)}px)`,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}
              >
                <span style={{ ...luxeLabel(Math.round(height * 0.029)), whiteSpace: 'nowrap' }}>
                  {r.label}
                </span>
                <span
                  style={{
                    fontSize: isLast ? Math.round(fsVal * 1.3) : fsVal,
                    fontWeight: 800,
                    color: isLast ? p.accent : p.ink,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    textShadow: isLast && glowIn > 0.01 ? `0 0 18px ${rgba(p.accent, +(0.4 * glowIn).toFixed(3))}` : undefined,
                  }}
                >
                  {r.value}
                </span>
              </div>
            </div>
          );
        })}

        {p.plate && <div style={luxeGrain(0.045)} />}
      </div>
    );
  },
});
