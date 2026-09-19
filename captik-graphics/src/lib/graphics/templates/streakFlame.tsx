// Streak flame — the gamified "DAY 47" streak lockup. The flame is DRAWN: three layered teardrop
// bezier paths whose tip and flanks deform on two detuned sines (pure functions of timeMs, each
// layer on its own time-scale so they never sync), with seeded embers looping off the tip — no
// emoji anywhere. The day counts up and lands with a chroma pop + shake; a PB chip stamps under.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { chromaPop, depthPose, idleFloat, impactFlash, parallax, pulse, shakeDecay, smear, sparkleField, SPARKLE_PATH, vel } from '../juice';

/** One teardrop flame layer in the 200x300 viewBox — tip sways and flanks breathe on two
 *  detuned sines. Pure function of t; `ph` de-phases the layers. */
function flamePath(t: number, ph: number, cx: number, baseY: number, w: number, h: number): string {
  const tx = cx + (Math.sin(t / 260 + ph) + 0.6 * Math.sin(t / 167 + ph * 2.3)) * w * 0.18;
  const tipY = baseY - h * (1 + 0.05 * Math.sin(t / 191 + ph * 1.7));
  const wl = w * (1 + 0.09 * Math.sin(t / 233 + ph + 1.9));
  const wr = w * (1 + 0.09 * Math.sin(t / 209 + ph + 4.2));
  const waistY = baseY - h * 0.45;
  return [
    `M ${tx.toFixed(1)} ${tipY.toFixed(1)}`,
    `C ${(tx - wl * 0.28).toFixed(1)} ${(tipY + h * 0.34).toFixed(1)}, ${(cx - wl).toFixed(1)} ${(waistY - h * 0.12).toFixed(1)}, ${(cx - wl).toFixed(1)} ${(waistY + h * 0.1).toFixed(1)}`,
    `C ${(cx - wl).toFixed(1)} ${(baseY - w * 0.55).toFixed(1)}, ${(cx - wl * 0.6).toFixed(1)} ${baseY.toFixed(1)}, ${cx.toFixed(1)} ${baseY.toFixed(1)}`,
    `C ${(cx + wr * 0.6).toFixed(1)} ${baseY.toFixed(1)}, ${(cx + wr).toFixed(1)} ${(baseY - w * 0.55).toFixed(1)}, ${(cx + wr).toFixed(1)} ${(waistY + h * 0.1).toFixed(1)}`,
    `C ${(cx + wr).toFixed(1)} ${(waistY - h * 0.12).toFixed(1)}, ${(tx + wr * 0.28).toFixed(1)} ${(tipY + h * 0.34).toFixed(1)}, ${tx.toFixed(1)} ${tipY.toFixed(1)}`,
    'Z',
  ].join(' ');
}

export const streakFlame = defineGraphicsTemplate({
  id: 'streak_flame',
  name: 'Streak Flame',
  category: 'story',
  tags: ['Flame', 'Streak', 'Fire', 'Counter', 'Embers'],
  badge: 'Hot',
  design: { w: 940, h: 560 },
  // Transparent by design — the flame + number float straight over footage.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 36, widthPercent: 52 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'flame',  label: 'Flame' },
    { key: 'embers', label: 'Embers' },
    { key: 'count',  label: 'Day number', hideable: false },
    { key: 'chip',   label: 'Chip' },
  ],

  params: [
    { type: 'text', key: 'day',    label: 'Day', group: 'Content', default: '47', maxLength: 6 },
    { type: 'text', key: 'prefix', label: 'Prefix', group: 'Content', default: 'DAY', maxLength: 10 },
    { type: 'text', key: 'sub',    label: 'Chip', group: 'Content', default: 'longest streak yet', maxLength: 32 },

    { type: 'color', key: 'flame',  label: 'Flame', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',    label: 'Number', group: 'Style', default: '#FFF7ED' },
    { type: 'color', key: 'accent', label: 'Chip colour', group: 'Style', default: '#4ADE80' },

    { type: 'number', key: 'countMs', label: 'Count-up time', group: 'Motion', default: 900, min: 300, max: 2000, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // The flame ignites as it enters; ONE tick as the day count starts rolling (at 380) — never
  // per digit.
  sfx: (p) => [
    { atMs: p.delay + 60, id: 'ignite', gain: 0.7 },
    { atMs: p.delay + 380, id: 'tick', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;
    const m = Math.min(height, width * (560 / 940));
    const ffM = fontStack('montserrat');

    // "47" → count 0→47; a suffix ("47+") survives; non-numeric days pop in whole.
    const dm = p.day.trim().match(/^(\d+)(.*)$/);
    const target = dm ? parseInt(dm[1], 10) : NaN;
    const daySuffix = dm ? dm[2] : '';
    const countQ = easeOutQuint(clamp01((t - 380) / p.countMs));
    const landAt = 380 + p.countMs;
    const shown = Number.isFinite(target) ? Math.round(target * countQ).toString() + daySuffix : p.day;

    const flameIn = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 16, mass: 0.8, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    const numInAt = (ms: number) => spring({
      frame: fr(ms - 260), fps: FPS,
      config: { damping: 15, mass: 0.7, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });
    const numIn = numInAt(t);
    const chipAt = landAt + 300;
    const chipIn = spring({
      frame: fr(t - chipAt), fps: FPS,
      config: { damping: 14, mass: 0.6, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const numShake = shakeDecay(t, landAt, m * 0.016, { seed });
    const chipShake = shakeDecay(t, chipAt, m * 0.008, { seed: `${seed}-c` });
    const flash = impactFlash(t, landAt, 160);
    const drift = idleFloat(t, seed, m * 0.007, 3000);
    const glowK = pulse(t, 1100, 0.5, 1);
    const sparks = sparkleField(seed, 8, t, landAt, { spreadMs: 320, lifeMs: 560 });

    // DEPTH: the lockup swings in top-hinged on the flame's spring and keeps swaying; flame,
    // embers and chip sit at three parallax depths (embers float FOREGROUND of the fire), and
    // the day number smears with its entrance/flash velocity, landing crisp.
    const pose = depthPose(t, seed, { enter: flameIn, rx: -14, z: -90, swayDeg: 1.8, periodMs: 3000 });
    const numScaleAt = (ms: number) => (0.7 + 0.3 * numInAt(ms)) * (1 + 0.1 * impactFlash(ms, landAt, 160));
    const numSmear = smear(0, vel(numScaleAt, t) * m * 0.45);
    const parFlame = parallax(t, seed, 0.3, m * 0.011, 3000);
    const parEmbers = parallax(t, seed, 0.65, m * 0.011, 3000);
    const parChip = parallax(t, seed, 0.85, m * 0.011, 3000);

    // Layer phases seeded per instance so two flames on one video never flicker in sync.
    const phBase = random(`${seed}-fl`) * Math.PI * 2;
    const layers = [
      { tScale: 1.0,  ph: phBase,       cx: 100, baseY: 272, w: 56, h: 190, fill: rgba(p.flame, 0.97) },
      { tScale: 1.14, ph: phBase + 2.1, cx: 100, baseY: 268, w: 38, h: 132, fill: '#FDE68A' },
      { tScale: 1.31, ph: phBase + 4.4, cx: 100, baseY: 262, w: 22, h: 76,  fill: '#FFFBEB' },
    ];

    // Embers loop up off the tip on seeded periods; each fades in fast, out slow, and shrinks.
    const emberOn = clamp01((t - 400) / 300);
    const embers: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const period = 1500 + random(`${seed}-ep${i}`) * 900;
      const q = ((t + random(`${seed}-eo${i}`) * period) % period) / period;
      const x0 = 100 + (random(`${seed}-ex${i}`) - 0.5) * 40;
      embers.push({
        x: x0 + Math.sin(q * 7 + i * 1.7) * 10 * q,
        y: 92 - q * (66 + random(`${seed}-er${i}`) * 24),
        r: 3.6 * (1 - q * 0.65),
        o: (q < 0.14 ? q / 0.14 : 1 - (q - 0.14) / 0.86) * 0.9 * emberOn,
      });
    }

    // 0.95, not 0.66: the drawn flame occupies ~28% of its viewBox width, so the box must be
    // generous or the flame reads as a bullet point beside the huge day count.
    const flameH = m * 0.95;
    const flameW = flameH * (200 / 300);
    const fsNum = m * 0.26;
    const fsChip = m * 0.042;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: m * 0.045,
          opacity: clamp01(t / 240),
          transform: `${pose} translate(${drift.x.toFixed(2)}px, ${drift.y.toFixed(2)}px) rotate(${drift.rot.toFixed(3)}deg)`,
          transformOrigin: '50% 40%',
        }}
      >
        {/* ── Drawn flame + ember overlay ── */}
        <div style={{ position: 'relative', width: flameW, height: flameH, flex: 'none', transform: `translate(${parFlame.x.toFixed(2)}px, ${parFlame.y.toFixed(2)}px)` }}>
          <svg
            width={flameW} height={flameH} viewBox="0 0 200 300"
            style={{
              position: 'absolute', inset: 0,
              overflow: 'visible',
              filter: `drop-shadow(0 0 ${(m * 0.04 * glowK).toFixed(1)}px ${rgba(p.flame, 0.7 * glowK)})`,
              transform: `scale(${flameIn.toFixed(4)})`,
              transformOrigin: '50% 92%',
              ...el('flame'),
            }}
          >
            {layers.map((l, i) => (
              <path key={i} d={flamePath(t * l.tScale, l.ph, l.cx, l.baseY, l.w, l.h)} fill={l.fill} />
            ))}
          </svg>
          <svg
            width={flameW} height={flameH} viewBox="0 0 200 300"
            style={{ position: 'absolute', inset: 0, overflow: 'visible', transform: `translate(${parEmbers.x.toFixed(2)}px, ${parEmbers.y.toFixed(2)}px)`, ...el('embers') }}
          >
            {embers.map((e2, i) => (
              <circle key={i} cx={e2.x.toFixed(1)} cy={e2.y.toFixed(1)} r={e2.r.toFixed(2)} fill="#FDE68A" opacity={e2.o.toFixed(3)} />
            ))}
          </svg>
        </div>

        {/* ── Counting day + chip ── */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: m * 0.03 }}>
          <span
            style={{
              fontFamily: fontStack('anton'),
              fontSize: fsNum, lineHeight: 1,
              letterSpacing: '0.01em',
              color: p.ink,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              textShadow: [
                `0 ${m * 0.01}px ${m * 0.045}px rgba(0,0,0,0.7)`,
                `0 0 ${(m * 0.09 * glowK).toFixed(1)}px ${rgba(p.flame, 0.45 * glowK)}`,
                chromaPop(t, landAt, m * 0.013),
              ].filter(Boolean).join(', '),
              opacity: Math.min(1, numIn * 1.5),
              filter: numSmear.blurPx > 0.3 ? `blur(${numSmear.blurPx.toFixed(2)}px)` : undefined,
              transform: `translate(${numShake.x.toFixed(2)}px, ${numShake.y.toFixed(2)}px) scale(${(numScaleAt(t) * numSmear.sx).toFixed(4)}, ${(numScaleAt(t) * numSmear.sy).toFixed(4)})`,
              ...el('count'),
            }}
          >
            {p.prefix ? `${p.prefix} ${shown}` : shown}
          </span>

          {p.sub && (
            <div
              style={{
                fontFamily: ffM,
                padding: `${m * 0.014}px ${m * 0.032}px`,
                borderRadius: m * 0.05,
                background: rgba(p.accent, 0.16),
                border: `1.5px solid ${rgba(p.accent, 0.65)}`,
                color: p.accent,
                fontSize: fsChip, fontWeight: 800,
                letterSpacing: '0.16em', textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                boxShadow: `0 0 ${(m * 0.04 * glowK).toFixed(1)}px ${rgba(p.accent, 0.35 * glowK)}`,
                opacity: Math.min(1, chipIn * 1.4),
                transform: `translate(${(chipShake.x + parChip.x).toFixed(2)}px, ${(chipShake.y + parChip.y).toFixed(2)}px) scale(${(0.7 + chipIn * 0.3).toFixed(4)})`,
                ...el('chip'),
              }}
            >
              {p.sub}
            </div>
          )}

          {sparks.map((s, i) => (
            <svg
              key={i}
              width={m * 0.05} height={m * 0.05} viewBox="0 0 24 24"
              style={{
                position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
                transform: `translate(-50%,-50%) scale(${s.s.toFixed(3)}) rotate(${s.rot.toFixed(1)}deg)`,
                opacity: s.o,
              }}
            >
              <path d={SPARKLE_PATH} fill={p.flame} />
            </svg>
          ))}
        </div>

        {/* impact flash */}
        {flash > 0.02 && (
          <div
            style={{
              position: 'absolute', inset: '-4%',
              background: `radial-gradient(circle, rgba(255,255,255,${(0.4 * flash).toFixed(3)}) 0%, transparent 60%)`,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    );
  },
});
