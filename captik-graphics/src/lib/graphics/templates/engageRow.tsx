// Like / bell / subscribe chips landing left-to-right on friendly springs, then each takes a
// SOLO in sequence: thumb tilt-pop with a 6-line burst, bell ±20° decaying-sine swing from its
// crown, amber pill glow pulse. The beats are spaced so no two moves ever overlap — one accent
// at a time is what keeps it confident instead of busy. All glyphs are SVG paths, no emoji.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

const THUMB =
  'M1 21h4V9H1v12zM23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 '
  + '1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.72v-2.01z';
const BELL =
  'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5'
  + '-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z';

export const engageRow = defineGraphicsTemplate({
  id: 'engage_row',
  name: 'Like & Subscribe',
  category: 'cta',
  tags: ['Thumb', 'Bell', 'Subscribe', 'Chips', 'Burst'],
  badge: 'New',
  design: { w: 900, h: 300 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 74, widthPercent: 56 },
  fonts: ['montserrat'],

  elements: [
    { key: 'like',      label: 'Like chip' },
    { key: 'bell',      label: 'Bell chip' },
    { key: 'subscribe', label: 'Subscribe pill', hideable: false },
  ],

  params: [
    { type: 'text', key: 'label', label: 'Button text', group: 'Content', default: 'SUBSCRIBE', maxLength: 14 },

    { type: 'color', key: 'accent', label: 'Accent',    group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'chipBg', label: 'Chip fill', group: 'Style', default: '#0B0B0D' },
    { type: 'font',  key: 'font',   label: 'Font',      group: 'Style', default: 'montserrat' },

    { type: 'number', key: 'stagger', label: 'Chip stagger', group: 'Motion', default: 200, min: 80, max: 500, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay',        group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Chips swish in together, then each solo carries its own accent: thumb pop, bell chime,
  // pill pop — cue times derive from the same stagger arithmetic the solo clocks use.
  sfx: (p) => {
    const tThumb = p.delay + p.stagger * 2 + 700;
    return [
      { atMs: p.delay + 60, id: 'swish', gain: 0.5 },
      { atMs: tThumb + 120, id: 'pop', gain: 0.6 },
      { atMs: tThumb + 650, id: 'chime', gain: 0.4 },
      { atMs: tThumb + 1400, id: 'pop', gain: 0.55 },
    ];
  },

  render: ({ params: p, el, timeMs, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    // Landing springs — real overshoot (damping 15) but each chip settles before the next solo.
    const landAt = (i: number) => (ms: number) => spring({
      frame: fr(ms - i * p.stagger), fps: FPS,
      config: { damping: 15, mass: 0.7, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    // Z-STAGGER: each chip swings in from its OWN corner of space (alternating hinge angles),
    // rides its drop velocity as blur, and keeps a faint detuned sway after — three objects
    // arriving in space, not three divs appearing.
    const chipStyle = (i: number): React.CSSProperties => {
      const sAt = landAt(i);
      const s = sAt(t);
      const yAt = (ms: number) => (1 - sAt(ms)) * height * 0.16;
      const sm = smear(0, vel(yAt, t), 1.2);
      const pose = depthPose(t, `${seed}-c${i}`, { enter: s, rx: -14 - i * 3, ry: (i - 1) * 12, z: -85, swayDeg: 1.2 });
      return {
        opacity: interpolate(s, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
        filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
        transform: `${pose} translateY(${yAt(t).toFixed(2)}px) scale(${((0.7 + s * 0.3) * sm.sx).toFixed(4)}, ${((0.7 + s * 0.3) * sm.sy).toFixed(4)})`,
        transformOrigin: 'center center',
      };
    };

    // The solos, spaced apart: thumb pop, bell swing, pill pulse.
    const tThumb = p.stagger * 2 + 700;
    const tBell = tThumb + 650;
    const tPill = tBell + 750;

    const thumbU = clamp01((t - tThumb) / 420);
    const thumbBump = Math.sin(Math.PI * thumbU);
    const burstU = clamp01((t - tThumb) / 480);

    // Two full swings with linear decay: sin(4πu)·(1−u) peaks near ±20° then dies.
    const bellU = clamp01((t - tBell) / 1000);
    const bellRot = bellU > 0 && bellU < 1 ? 20 * Math.sin(4 * Math.PI * bellU) * (1 - bellU) : 0;

    const pillU = clamp01((t - tPill) / 520);
    const pillBump = Math.sin(Math.PI * pillU);

    const chipH = Math.round(height * 0.4);
    const chipW = Math.round(chipH * 1.18);
    const icon = Math.round(chipH * 0.48);
    const fsPill = Math.round(chipH * 0.36);
    const rad = Math.round(chipH * 0.24);

    const chipBase: React.CSSProperties = {
      height: chipH, width: chipW, borderRadius: rad,
      background: p.chipBg,
      border: '1px solid rgba(255,255,255,0.14)',
      boxShadow: '0 10px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, boxSizing: 'border-box',
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: Math.round(height * 0.11),
          fontFamily: ff,
        }}
      >
        {/* Thumb chip + burst */}
        <div style={{ position: 'relative', ...chipStyle(0), ...el('like') }}>
          <div style={{ ...chipBase, transform: `rotate(${(-14 * thumbBump).toFixed(2)}deg) scale(${(1 + thumbBump * 0.16).toFixed(4)})` }}>
            <svg viewBox="0 0 24 24" width={icon} height={icon}>
              <path d={THUMB} fill="#ffffff" />
            </svg>
          </div>
          {burstU > 0 && burstU < 1 && (
            <svg
              viewBox="0 0 100 100"
              width={chipW} height={chipW}
              style={{ position: 'absolute', left: '58%', top: '-46%', pointerEvents: 'none' }}
            >
              {Array.from({ length: 6 }).map((_, i) => {
                const a = (-80 + i * 32) * (Math.PI / 180);
                const r0 = 18 + burstU * 26;
                const r1 = r0 + 10 * (1 - burstU * 0.5);
                return (
                  <line
                    key={i}
                    x1={(50 + Math.cos(a) * r0).toFixed(1)} y1={(50 + Math.sin(a) * r0).toFixed(1)}
                    x2={(50 + Math.cos(a) * r1).toFixed(1)} y2={(50 + Math.sin(a) * r1).toFixed(1)}
                    stroke={p.accent} strokeWidth={4} strokeLinecap="round"
                    opacity={1 - burstU}
                  />
                );
              })}
            </svg>
          )}
        </div>

        {/* Bell chip */}
        <div style={{ ...chipStyle(1), ...el('bell') }}>
          <div style={chipBase}>
            <svg
              viewBox="0 0 24 24" width={icon} height={icon}
              style={{ transform: `rotate(${bellRot.toFixed(2)}deg)`, transformOrigin: '50% 12%' }}
            >
              <path d={BELL} fill="#ffffff" />
            </svg>
          </div>
        </div>

        {/* Subscribe pill */}
        <div style={{ ...chipStyle(2), ...el('subscribe') }}>
          <div
            style={{
              height: chipH, borderRadius: 999,
              background: p.accent,
              padding: `0 ${Math.round(chipH * 0.52)}px`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxSizing: 'border-box',
              transform: `scale(${(1 + pillBump * 0.07).toFixed(4)})`,
              boxShadow: `0 10px 26px ${rgba(p.accent, 0.35)}, 0 0 ${Math.round(30 * pillBump)}px ${rgba(p.accent, 0.6 * pillBump)}`,
            }}
          >
            <span style={{ fontSize: fsPill, fontWeight: 800, letterSpacing: '0.07em', color: '#0B0B0D', whiteSpace: 'nowrap' }}>
              {p.label}
            </span>
          </div>
        </div>
      </div>
    );
  },
});
