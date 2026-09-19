// "+999 AURA" — the game-loot points popup. The number counts up fast and lands MID-AIR: the
// whole lockup rises on a decelerating loot-drift while a breathing aura disc and a one-shot
// shockwave ring fire behind it, then a thin AURA meter fills with a hot leading edge. The craft:
// the amount is parsed sign+digits+suffix, so "+999", "1,247" and "+1.2K" all count up and keep
// their dressing.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { chromaPop, depthPose, idleFloat, impactFlash, parallax, pulse, shakeDecay, smear, sparkleField, SPARKLE_PATH, vel } from '../juice';

export const auraPoints = defineGraphicsTemplate({
  id: 'aura_points',
  name: 'Aura Points',
  category: 'fx',
  tags: ['Aura', 'Glow', 'Loot', 'Counter', 'Meter'],
  badge: 'Hot',
  design: { w: 900, h: 760 },
  // Floats transparently over footage — a plate would kill the game-loot read.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 38, widthPercent: 42 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'ring',  label: 'Aura ring' },
    { key: 'value', label: 'Points', hideable: false },
    { key: 'label', label: 'Label' },
    { key: 'meter', label: 'Meter' },
  ],

  params: [
    { type: 'text', key: 'amount', label: 'Points', group: 'Content', default: '+999', maxLength: 10,
      help: 'Sign + number + suffix — "+999", "+1.2K", "1,247" all count up.' },
    { type: 'text', key: 'label', label: 'Label', group: 'Content', default: 'AURA', maxLength: 14 },

    { type: 'color', key: 'glow',   label: 'Aura glow', group: 'Style', default: '#A78BFA' },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',    label: 'Number', group: 'Style', default: '#FFF7ED' },
    { type: 'number', key: 'fill', label: 'Meter fill', group: 'Style', default: 88, min: 5, max: 100, step: 1, unit: '%' },

    { type: 'number', key: 'countMs', label: 'Count-up time', group: 'Motion', default: 800, min: 300, max: 2000, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Loot pop as the count lands (count starts at 220), sparkle chime as the meter tops out —
  // both retimed by the same countMs the motion uses.
  sfx: (p) => [
    { atMs: p.delay + 220 + p.countMs, id: 'pop', gain: 0.8 },
    { atMs: p.delay + 220 + p.countMs + 900, id: 'chime', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;
    const m = Math.min(height, width * (760 / 900));

    // "+1.2K" → sign "+", count 0→1.2, keep "K". Non-numeric amounts pop in whole.
    const match = p.amount.trim().replace(/,/g, '').match(/^([+-]?)([\d.]+)(.*)$/);
    const sign = match ? match[1] : '';
    const target = match ? parseFloat(match[2]) : NaN;
    const decimals = match && match[2].includes('.') ? match[2].split('.')[1].length : 0;
    const suffix = match ? match[3] : '';
    const countQ = easeOutQuint(clamp01((t - 220) / p.countMs));
    const landAt = 220 + p.countMs;
    const shown = Number.isFinite(target)
      ? sign + (target * countQ).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix
      : p.amount;

    const enterAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 15, mass: 0.7, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const enter = enterAt(t);
    const shake = shakeDecay(t, landAt, m * 0.014, { seed });
    const flash = impactFlash(t, landAt, 170);
    const drift = idleFloat(t, seed, m * 0.007, 2800);
    const glowK = pulse(t, 1300, 0.5, 1);
    const rise = easeOutQuint(clamp01(t / 2800)) * m * 0.055;
    const sparks = sparkleField(seed, 10, t, landAt, { spreadMs: 380, lifeMs: 600 });
    const meterQ = easeOutQuint(clamp01((t - landAt) / 900));
    const ringQ = clamp01((t - landAt) / 620);
    const fillPct = (p.fill * meterQ).toFixed(1);

    // DEPTH: the lockup swings in top-hinged and keeps swaying on the loot-drift; the aura disc
    // (backplate), label and meter (foreground) shear at different parallax depths, and the
    // number smears with its entrance/flash-bump velocity, landing crisp.
    const pose = depthPose(t, seed, { enter, rx: -16, z: -100, swayDeg: 2, periodMs: 2800 });
    const valScaleAt = (ms: number) => (0.6 + 0.4 * enterAt(ms)) * (1 + 0.12 * impactFlash(ms, landAt, 170));
    const valSmear = smear(0, vel(valScaleAt, t) * m * 0.5);
    const parRing = parallax(t, seed, 0.3, m * 0.012, 2800);
    const parLab = parallax(t, seed, 0.55, m * 0.012, 2800);
    const parMeter = parallax(t, seed, 0.8, m * 0.012, 2800);

    const discR = m * 0.42;
    const fsVal = m * 0.21;
    const fsLab = m * 0.055;
    const meterW = m * 0.52;
    const meterH = m * 0.03;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: m * 0.028,
          opacity: Math.min(1, enter * 1.5),
          transform: `${pose} translate(${(shake.x + drift.x).toFixed(2)}px, ${(shake.y + drift.y - rise).toFixed(2)}px) rotate(${drift.rot.toFixed(3)}deg)`,
          transformOrigin: '50% 40%',
        }}
      >
        {/* ── Aura disc (breathes) + shockwave ring (fires on land) ── */}
        <div
          style={{
            position: 'absolute', left: '50%', top: '44%',
            width: discR * 2, height: discR * 2,
            transform: `translate(-50%,-50%) translate(${parRing.x.toFixed(2)}px, ${parRing.y.toFixed(2)}px)`,
            pointerEvents: 'none',
            ...el('ring'),
          }}
        >
          <div
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: `radial-gradient(circle, ${rgba(p.glow, 0.5 * glowK)} 0%, ${rgba(p.glow, 0.18 * glowK)} 42%, transparent 70%)`,
              transform: `scale(${(enter * (0.92 + 0.1 * pulse(t, 1700, 0, 1, 1.3))).toFixed(4)})`,
            }}
          />
          {ringQ > 0 && ringQ < 1 && (
            <div
              style={{
                position: 'absolute', inset: '18%', borderRadius: '50%',
                border: `${Math.max(2, m * 0.006).toFixed(1)}px solid ${rgba(p.glow, 0.85 * (1 - ringQ))}`,
                transform: `scale(${(0.55 + ringQ * 1.15).toFixed(4)})`,
              }}
            />
          )}
        </div>

        {/* ── Counting number ── */}
        <span
          style={{
            fontFamily: fontStack('anton'),
            fontSize: fsVal, lineHeight: 1,
            color: p.ink,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            textShadow: [
              `0 ${m * 0.008}px ${m * 0.04}px rgba(0,0,0,0.6)`,
              `0 0 ${(m * 0.1 * glowK).toFixed(1)}px ${rgba(p.glow, 0.55 * glowK)}`,
              chromaPop(t, landAt, m * 0.012),
            ].filter(Boolean).join(', '),
            filter: valSmear.blurPx > 0.3 ? `blur(${valSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `scale(${(valScaleAt(t) * valSmear.sx).toFixed(4)}, ${(valScaleAt(t) * valSmear.sy).toFixed(4)})`,
            ...el('value'),
          }}
        >
          {shown}
        </span>

        {/* ── Tracked label ── */}
        {p.label && (
          <span
            style={{
              fontFamily: fontStack('montserrat'),
              fontSize: fsLab, fontWeight: 800,
              letterSpacing: '0.42em', paddingLeft: '0.42em',
              textTransform: 'uppercase',
              color: rgba(p.ink, 0.92),
              textShadow: `0 0 ${(m * 0.045 * glowK).toFixed(1)}px ${rgba(p.accent, 0.5 * glowK)}, 0 2px 8px rgba(0,0,0,0.6)`,
              opacity: clamp01((t - 360) / 320),
              transform: `translate(${parLab.x.toFixed(2)}px, ${parLab.y.toFixed(2)}px)`,
              ...el('label'),
            }}
          >
            {p.label}
          </span>
        )}

        {/* ── Meter — fills after the land, hot leading edge ── */}
        <div
          style={{
            position: 'relative',
            width: meterW, height: meterH,
            marginTop: m * 0.012,
            borderRadius: meterH,
            background: 'rgba(255,255,255,0.13)',
            border: '1.5px solid rgba(255,255,255,0.2)',
            overflow: 'hidden',
            opacity: clamp01((t - 500) / 350),
            boxShadow: `0 0 ${(m * 0.03 * glowK * meterQ).toFixed(1)}px ${rgba(p.glow, 0.4 * glowK * meterQ)}`,
            transform: `translate(${parMeter.x.toFixed(2)}px, ${parMeter.y.toFixed(2)}px)`,
            ...el('meter'),
          }}
        >
          <div
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${fillPct}%`,
              borderRadius: meterH,
              background: `linear-gradient(90deg, ${rgba(p.glow, 0.9)} 0%, ${p.accent} 100%)`,
              boxShadow: `0 0 ${(meterH * 0.9 * glowK).toFixed(1)}px ${rgba(p.accent, 0.75 * glowK)}`,
            }}
          />
          {meterQ > 0.01 && (
            <div
              style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${fillPct}%`,
                width: meterH * 1.8,
                transform: 'translateX(-100%)',
                borderRadius: meterH,
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 100%)',
              }}
            />
          )}
        </div>

        {/* impact flash + sparkles */}
        {flash > 0.02 && (
          <div
            style={{
              position: 'absolute', inset: '-6%',
              background: `radial-gradient(circle, rgba(255,255,255,${(0.45 * flash).toFixed(3)}) 0%, transparent 62%)`,
              pointerEvents: 'none',
            }}
          />
        )}
        {sparks.map((s, i) => (
          <svg
            key={i}
            width={m * 0.055} height={m * 0.055} viewBox="0 0 24 24"
            style={{
              position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
              transform: `translate(-50%,-50%) scale(${s.s.toFixed(3)}) rotate(${s.rot.toFixed(1)}deg)`,
              opacity: s.o,
            }}
          >
            <path d={SPARKLE_PATH} fill={p.accent} />
          </svg>
        ))}
      </div>
    );
  },
});
