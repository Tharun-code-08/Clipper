// Wrapped-style stat card — the year-recap flex format. A drifting gradient-mesh card (layered
// radial gradients whose centres orbit slowly — pure functions of t), a HUGE count-up number
// that lands with overshoot + chromatic pop + sparkle burst, and a "TOP 1%" chip that stamps in
// late with a decay-shake. The craft: the value param is parsed as number+suffix ("10M" → counts
// 0→10 and keeps the M), so the count-up works for any way the user writes their flex.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { chromaPop, depthPose, idleFloat, parallax, pulse, shakeDecay, smear, sparkleField, SPARKLE_PATH, vel } from '../juice';

const HUES: Record<string, { a: string; b: string; c: string }> = {
  violet: { a: '#7C3AED', b: '#DB2777', c: '#F59E0B' },
  amber:  { a: '#D97706', b: '#DC2626', c: '#FBBF24' },
  teal:   { a: '#0D9488', b: '#2563EB', c: '#4ADE80' },
};

export const wrappedStats = defineGraphicsTemplate({
  id: 'wrapped_stats',
  name: 'Wrapped Stats',
  category: 'money',
  tags: ['Stats', 'Recap', 'Gradient', 'Year', 'Flex'],
  badge: 'Hot',
  design: { w: 900, h: 1100 },
  // Paints its own gradient-mesh card — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 62 },
  fonts: ['montserrat', 'anton'],

  elements: [
    { key: 'card',   label: 'Card', hideable: false },
    { key: 'kicker', label: 'Kicker' },
    { key: 'value',  label: 'Big number', hideable: false },
    { key: 'label',  label: 'Label' },
    { key: 'chip',   label: 'Rank chip' },
  ],

  params: [
    { type: 'text', key: 'kicker', label: 'Kicker', group: 'Content', default: 'YOUR 2026', maxLength: 22 },
    { type: 'text', key: 'value',  label: 'Value', group: 'Content', default: '10M', maxLength: 12,
      help: 'Number + optional suffix — "10M", "42K", "1,247" all count up.' },
    { type: 'text', key: 'label',  label: 'Label', group: 'Content', default: 'minutes watched', maxLength: 30 },
    { type: 'text', key: 'chip',   label: 'Chip', group: 'Content', default: 'TOP 1% OF CREATORS', maxLength: 26 },

    { type: 'select', key: 'hue', label: 'Mesh', group: 'Style', default: 'violet',
      options: [
        { value: 'violet', label: 'Violet sunset' },
        { value: 'amber',  label: 'Amber heat' },
        { value: 'teal',   label: 'Ocean' },
      ] },
    { type: 'color', key: 'ink', label: 'Text', group: 'Style', default: '#FFF7ED' },

    { type: 'number', key: 'countMs', label: 'Count-up time', group: 'Motion', default: 1400, min: 400, max: 3000, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Riser builds under the count-up (count starts at 500), the number lands with a pop, and
  // the rank chip chimes in 260ms later — all retimed by the same countMs the motion uses.
  sfx: (p) => [
    { atMs: p.delay + 260, id: 'riser', gain: 0.5 },
    { atMs: p.delay + 500 + p.countMs, id: 'pop', gain: 0.75 },
    { atMs: p.delay + 500 + p.countMs + 260, id: 'chime', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;
    const hue = HUES[p.hue] ?? HUES.violet;
    const m = Math.min(height, width * (1100 / 900));
    const ffM = fontStack('montserrat');

    // "10M" → count 0→10, keep suffix. Non-numeric values just fade in whole.
    const match = p.value.replace(/,/g, '').match(/^([\d.]+)(.*)$/);
    const target = match ? parseFloat(match[1]) : NaN;
    const suffix = match ? match[2] : '';
    const decimals = match && match[1].includes('.') ? match[1].split('.')[1].length : 0;
    const countQ = easeOutQuint(clamp01((t - 500) / p.countMs));
    const landAt = 500 + p.countMs;
    const shown = Number.isFinite(target)
      ? (target * countQ).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix
      : p.value;

    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 22, mass: 0.9, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });
    const landPopAt = (ms: number) => spring({
      frame: fr(ms - landAt), fps: FPS,
      config: { damping: 13, mass: 0.6, stiffness: 240 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const chipAt = landAt + 260;
    const chipIn = spring({
      frame: fr(t - chipAt), fps: FPS,
      config: { damping: 14, mass: 0.6, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const chipShake = shakeDecay(t, chipAt, m * 0.008, { seed });
    const drift = idleFloat(t, seed, m * 0.006, 3400);
    const glowK = pulse(t, 2100, 0.55, 1);
    const sparks = sparkleField(seed, 9, t, landAt, { spreadMs: 420, lifeMs: 640 });

    // DEPTH: the mesh card swings in top-hinged and keeps a soft sway; kicker/label/chip sit at
    // three parallax depths so the sway shears them. The land-pop's velocity smears the big
    // number for the couple of frames it is actually moving — it lands crisp.
    const pose = depthPose(t, seed, { enter, rx: -14, z: -90, swayDeg: 1.8 });
    const valScaleAt = (ms: number) =>
      1 + (landPopAt(ms) - 1) * -0.06 + (ms > landAt ? 0.06 * (1 - Math.min(1, (ms - landAt) / 420)) : 0);
    const valSmear = smear(0, vel(valScaleAt, t) * m * 0.6);
    const parKick = parallax(t, seed, 0.5, m * 0.012);
    const parLab = parallax(t, seed, 0.35, m * 0.012);
    const parChip = parallax(t, seed, 0.85, m * 0.012);

    // Mesh centres orbit VERY slowly — alive, never a static poster.
    const ox = Math.sin(t / 4200) * 12;
    const oy = Math.cos(t / 5100) * 10;

    const fsKick = m * 0.032;
    const fsVal = m * 0.16;
    const fsLab = m * 0.042;
    const fsChip = m * 0.028;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          borderRadius: m * 0.055,
          overflow: 'hidden',
          background: [
            `radial-gradient(circle at ${34 + ox}% ${24 + oy}%, ${rgba(hue.a, 0.85)} 0%, transparent 52%)`,
            `radial-gradient(circle at ${78 - ox}% ${64 + oy}%, ${rgba(hue.b, 0.7)} 0%, transparent 56%)`,
            `radial-gradient(circle at ${18 - ox}% ${86 - oy}%, ${rgba(hue.c, 0.55)} 0%, transparent 48%)`,
            'linear-gradient(180deg, #17111F 0%, #0B0B0D 100%)',
          ].join(', '),
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow: `0 ${m * 0.03}px ${m * 0.09}px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: m * 0.028,
          fontFamily: ffM,
          opacity: enter,
          transform: `${pose} translate(${drift.x.toFixed(2)}px, ${(drift.y + (1 - enter) * m * 0.05).toFixed(2)}px) rotate(${drift.rot.toFixed(3)}deg)`,
          transformOrigin: '50% 35%',
          ...el('card'),
        }}
      >
        <span
          style={{
            fontSize: fsKick, fontWeight: 700,
            letterSpacing: '0.42em', textTransform: 'uppercase',
            color: rgba(p.ink, 0.75), paddingLeft: '0.42em',
            opacity: clamp01((t - 260) / 380),
            transform: `translate(${parKick.x.toFixed(2)}px, ${parKick.y.toFixed(2)}px)`,
            ...el('kicker'),
          }}
        >
          {p.kicker}
        </span>

        <span
          style={{
            fontFamily: fontStack('anton'),
            fontSize: fsVal, lineHeight: 1,
            color: p.ink,
            fontVariantNumeric: 'tabular-nums',
            textShadow: [
              `0 ${m * 0.01}px ${m * 0.05}px rgba(0,0,0,0.6)`,
              `0 0 ${(m * 0.12 * glowK).toFixed(1)}px ${rgba(hue.c, 0.4 * glowK)}`,
              chromaPop(t, landAt, m * 0.012),
            ].filter(Boolean).join(', '),
            filter: valSmear.blurPx > 0.3 ? `blur(${valSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `scale(${(valScaleAt(t) * valSmear.sx).toFixed(4)}, ${(valScaleAt(t) * valSmear.sy).toFixed(4)})`,
            opacity: clamp01((t - 420) / 300),
            ...el('value'),
          }}
        >
          {shown}
        </span>

        <span
          style={{
            fontSize: fsLab, fontWeight: 600,
            color: rgba(p.ink, 0.9),
            opacity: clamp01((t - 700) / 380),
            transform: `translate(${parLab.x.toFixed(2)}px, ${parLab.y.toFixed(2)}px)`,
            ...el('label'),
          }}
        >
          {p.label}
        </span>

        {p.chip && (
          <div
            style={{
              marginTop: m * 0.012,
              padding: `${m * 0.014}px ${m * 0.032}px`,
              borderRadius: m * 0.05,
              background: rgba(hue.c, 0.16),
              border: `1.5px solid ${rgba(hue.c, 0.65)}`,
              color: hue.c,
              fontSize: fsChip, fontWeight: 800,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              boxShadow: `0 0 ${(m * 0.045 * glowK).toFixed(1)}px ${rgba(hue.c, 0.35 * glowK)}`,
              opacity: Math.min(1, chipIn * 1.4),
              transform: `translate(${(chipShake.x + parChip.x).toFixed(2)}px, ${(chipShake.y + parChip.y).toFixed(2)}px) scale(${(0.7 + chipIn * 0.3).toFixed(4)})`,
              ...el('chip'),
            }}
          >
            {p.chip}
          </div>
        )}

        {sparks.map((s, i) => (
          <svg
            key={i}
            width={m * 0.045} height={m * 0.045} viewBox="0 0 24 24"
            style={{
              position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
              transform: `translate(-50%,-50%) scale(${s.s.toFixed(3)}) rotate(${s.rot.toFixed(1)}deg)`,
              opacity: s.o * 0.9,
            }}
          >
            <path d={SPARKLE_PATH} fill={hue.c} />
          </svg>
        ))}
      </div>
    );
  },
});
