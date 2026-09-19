// Reference: social/like.mp4  (window 0-4480ms, badge lands by ~160ms then keeps living)
// A like badge that pops, pulses a glow, and streams little hearts upward. The particles are the
// point of this one: each is a pure function of timeMs with a seeded offset, so they rise, drift
// and fade on independent clocks and the whole thing still renders identically on every frame of
// an export. A particle system driven by CSS animation or a rAF counter would freeze.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

export const likeBadge = defineGraphicsTemplate({
  id: 'like_badge',
  name: 'Like Badge',
  category: 'social',
  tags: ['Like', 'Heart', 'Counter'],
  design: { w: 420, h: 560 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 34 },
  fonts: ['inter'],

  elements: [
    { key: 'badge',     label: 'Badge', hideable: false },
    { key: 'count',     label: 'Count' },
    { key: 'particles', label: 'Floating hearts' },
  ],

  params: [
    { type: 'text',    key: 'count',     label: 'Count',      group: 'Content', default: '1', maxLength: 8 },
    { type: 'boolean', key: 'showCount', label: 'Show count', group: 'Content', default: true },

    { type: 'color',  key: 'fill', label: 'Badge', group: 'Style', default: '#E5484D' },
    { type: 'color',  key: 'ink',  label: 'Icon',  group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font', label: 'Font',  group: 'Style', default: 'inter' },
    { type: 'number', key: 'glow', label: 'Glow',  group: 'Style', default: 0.55, min: 0, max: 1, step: 0.05 },

    { type: 'number',  key: 'pulseMs',  label: 'Pulse period', group: 'Motion', default: 1400, min: 400, max: 3000, step: 50, unit: 'ms' },
    { type: 'number',  key: 'particles', label: 'Hearts',      group: 'Motion', default: 13, min: 0, max: 16, step: 1 },
    { type: 'number',  key: 'riseMs',   label: 'Rise time',    group: 'Motion', default: 2600, min: 500, max: 4000, step: 50, unit: 'ms' },
  ],

  // The badge lands with a glossy pop; a light swish rides the heart burst (emitFrom is the
  // burst's fixed clock below). Gamified language — no slam, this is a like, not a stamp.
  sfx: (p) => [
    { atMs: 60, id: 'pop', gain: 0.7 },
    ...(p.particles > 0 ? [{ atMs: 840, id: 'swish', gain: 0.35 }] as const : []),
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const popAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 12, mass: 0.5, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(320))),
    });
    const pop = popAt(timeMs);

    // Steady heartbeat once it has landed.
    const settled = interpolate(timeMs, [200, 460], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const pulse = 1 + Math.sin((timeMs / p.pulseMs) * Math.PI * 2) * 0.055 * settled;
    const glowPulse = (0.6 + 0.4 * Math.sin((timeMs / p.pulseMs) * Math.PI * 2)) * p.glow * settled;

    const R = width * 0.34;
    const cx = width / 2;
    const cy = height * 0.66;
    const ff = fontStack(p.font);

    // DEPTH + BLUR: the badge swings in through 3D on its own overshooting spring and keeps a
    // soft ±1.8° sway under the heartbeat pulse; the entrance zoom velocity smears it for the
    // frames it is actually moving, then it lands crisp.
    const pose = depthPose(timeMs, seed, { enter: pop, rx: -14, ry: 9, z: -90, swayDeg: 1.8 });
    const popSmear = smear(0, vel((ms: number) => 0.3 + 0.7 * popAt(ms), timeMs) * R * 1.2);

    // The reference throws its hearts as ONE staggered burst partway in — they spread sideways
    // first, climb, and are gone by the end. A free-running loop puts risen hearts on screen from
    // the first frame, which reads as the wrong beat against the reference.
    const emitFrom = 800;
    const emitSpread = 700;

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff }}>
        {/* Floating hearts. Each has its own phase so they never move as a group. */}
        <div style={{ position: 'absolute', inset: 0, ...el('particles') }}>
          {Array.from({ length: p.particles }).map((_, i) => {
            const phase = random(`${seed}p${i}`);
            const lane = (random(`${seed}l${i}`) - 0.5) * width * 1.6;
            const size = width * (0.09 + random(`${seed}s${i}`) * 0.09);
            // Each particle runs its own clock, launched on a staggered offset.
            const t = Math.min(1, Math.max(0, (timeMs - emitFrom - phase * emitSpread) / p.riseMs));
            const rise = t * height * 0.65;
            const drift = Math.sin((t + phase) * Math.PI * 2) * width * 0.16;
            const fade = interpolate(t, [0, 0.15, 0.75, 1], [0, 1, 1, 0]);
            // Analytic flight velocity (px/ms) — the climb plus the sway derivative — drives a
            // light smear so the burst reads as filmed particles; zero once the heart is spent.
            const flying = t > 0 && t < 1 ? 1 : 0;
            const vy = -(height * 0.65) / p.riseMs * flying;
            const vx = Math.cos((t + phase) * Math.PI * 2) * (Math.PI * 2 / p.riseMs) * width * 0.16 * flying;
            const pSm = smear(vx, vy, 0.8);
            return (
              <svg
                key={i} width={size} height={size} viewBox="0 0 100 96" aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: cx + lane + drift - size / 2,
                  top: cy - rise - size / 2,
                  opacity: fade * 0.95 * settled,
                  filter: pSm.blurPx > 0.3 ? `blur(${pSm.blurPx.toFixed(2)}px)` : undefined,
                  transform: `scale(${pSm.sx.toFixed(3)}, ${pSm.sy.toFixed(3)})`,
                }}
              >
                <path d="M50 88C50 88 8 62 8 34.5 8 19.9 19.4 9 33 9c8 0 14 4 17 9.5C53 13 59 9 67 9c13.6 0 25 10.9 25 25.5C92 62 50 88 50 88Z" fill={p.fill} />
              </svg>
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute', left: cx - R, top: cy - R,
            width: R * 2, height: R * 2, borderRadius: '50%',
            background: `linear-gradient(180deg, ${rgba('#ffffff', 0.12)} 0%, ${rgba('#000000', 0.1)} 100%), ${p.fill}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: R * 0.04,
            opacity: interpolate(pop, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
            filter: popSmear.blurPx > 0.3 ? `blur(${popSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} scale(${(interpolate(pop, [0, 1], [0.3, 1]) * pulse * popSmear.sx).toFixed(4)}, ${(interpolate(pop, [0, 1], [0.3, 1]) * pulse * popSmear.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            boxShadow: `0 ${(R * 0.16).toFixed(1)}px ${(R * 0.45).toFixed(1)}px ${rgba('#000000', 0.3)}${glowPulse > 0
              ? `, 0 0 ${(R * 0.8 * glowPulse).toFixed(1)}px ${rgba(p.fill, 0.5 * glowPulse)}, 0 0 ${(R * 1.5 * glowPulse).toFixed(1)}px ${(R * 0.22 * glowPulse).toFixed(1)}px ${rgba(p.fill, 0.45 * glowPulse)}`
              : ''}`,
            ...el('badge'),
          }}
        >
          <svg width={R * 0.86} height={R * 0.82} viewBox="0 0 100 96" aria-hidden="true">
            <path d="M50 88C50 88 8 62 8 34.5 8 19.9 19.4 9 33 9c8 0 14 4 17 9.5C53 13 59 9 67 9c13.6 0 25 10.9 25 25.5C92 62 50 88 50 88Z" fill={p.ink} />
          </svg>
          {p.showCount && (
            <span style={{ fontSize: R * 0.36, fontWeight: 700, color: p.ink, lineHeight: 1, ...el('count') }}>
              {p.count}
            </span>
          )}
        </div>
      </div>
    );
  },
});
