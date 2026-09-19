// Premium money rain + hero counter. Bills are DRAWN — rounded rects with an inset ring and a
// currency watermark — in two parallax banks, and their tumble is rotate-then-scaleY (squash
// along the rotated axis), which fakes a 3D paper flip with no 3D transforms. The counter chip
// parses "₹1,00,000" as prefix + number + suffix and keeps Indian lakh grouping while counting,
// landing with chroma pop + shake + sparkles. Rain never stops; the glow never sits still.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { chromaPop, depthPose, idleFloat, impactFlash, parallax, pulse, shakeDecay, smear, sparkleField, SPARKLE_PATH } from '../juice';

/** Multiply a hex toward black — bill faces are DEEP versions of the accent, not the accent raw. */
function shade(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const ch = (sh: number) => Math.round(((v >> sh) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** 1234567 → "12,34,567" — the lakh/crore grouping Indian amounts are written in. */
function groupIndian(s: string): string {
  if (s.length <= 3) return s;
  return s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
}

export const cashFlow = defineGraphicsTemplate({
  id: 'cash_flow',
  name: 'Cash Flow',
  category: 'money',
  tags: ['Money', 'Bills', 'Rain', 'Counter', 'Green'],
  badge: 'Hot',
  design: { w: 720, h: 1000 },
  // Bills fall over the footage and the chip paints its own glass — a plate would box the rain.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 42 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'counter', label: 'Counter chip', hideable: false },
    { key: 'label',   label: 'Label' },
    { key: 'near',    label: 'Near bills' },
    { key: 'far',     label: 'Far bills' },
  ],

  params: [
    { type: 'text', key: 'amount', label: 'Amount', group: 'Content', default: '₹1,00,000', maxLength: 14,
      help: 'Symbol + number — "₹1,00,000", "$12,400", "42K" all count up.' },
    { type: 'text', key: 'label', label: 'Label', group: 'Content', default: 'this month', maxLength: 24 },

    { type: 'color',  key: 'bill',    label: 'Bill colour', group: 'Style', default: '#4ADE80' },
    { type: 'color',  key: 'ink',     label: 'Counter ink', group: 'Style', default: '#FFF7ED' },
    { type: 'color',  key: 'accent',  label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'density', label: 'Bills', group: 'Style', default: 14, min: 8, max: 24, step: 1 },

    { type: 'number', key: 'countMs', label: 'Count-up time', group: 'Motion', default: 1500, min: 400, max: 3000, step: 50, unit: 'ms' },
    { type: 'number', key: 'speed',   label: 'Fall speed', group: 'Motion', default: 220, min: 120, max: 420, step: 10, unit: 'px/s' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // ONE cash hit, exactly when the counter lands (count starts at 500) — money you can hear.
  sfx: (p) => [
    { atMs: p.delay + 500 + p.countMs, id: 'cash', gain: 0.9 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;

    const m = Math.min(height, width * (1000 / 720));
    const unit = m / 1000;
    const ffM = fontStack('montserrat');

    // "₹1,00,000" → prefix "₹", count 0→100000, suffix "". Lakh grouping is kept while counting.
    const match = p.amount.replace(/,/g, '').match(/^([^\d]*)([\d.]+)(.*)$/);
    const prefix = match ? match[1] : '';
    const target = match ? parseFloat(match[2]) : NaN;
    const suffix = match ? match[3] : '';
    const decimals = match && match[2].includes('.') ? match[2].split('.')[1].length : 0;
    const indian = /\d,\d{2},/.test(p.amount) || prefix.includes('₹');
    const countQ = easeOutQuint(clamp01((t - 500) / p.countMs));
    const landAt = 500 + p.countMs;
    let shown = p.amount;
    if (Number.isFinite(target)) {
      const raw = (target * countQ).toFixed(decimals);
      const [ip, fp] = raw.split('.');
      const grouped = indian ? groupIndian(ip) : ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      shown = prefix + grouped + (fp ? '.' + fp : '') + suffix;
    }
    const glyphMatch = p.amount.match(/[₹$€£¥]/);
    const glyph = glyphMatch ? glyphMatch[0] : '₹';

    const enter = spring({
      frame: fr(t - 200), fps: FPS,
      config: { damping: 18, mass: 0.8, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    const chipShake = shakeDecay(t, landAt, m * 0.009, { seed });
    const flash = impactFlash(t, landAt, 150);
    const drift = idleFloat(t, seed, m * 0.006, 3300);
    const glowK = pulse(t, 1900, 0.5, 1);
    const sparks = sparkleField(seed, 9, t, landAt, { spreadMs: 420, lifeMs: 620 });

    // DEPTH: the counter chip swings in top-hinged and keeps swaying while the two bill banks
    // parallax against it at different depths — the rain reads as a volume, not a curtain.
    const pose = depthPose(t, seed, { enter, rx: -16, z: -90, swayDeg: 1.8, periodMs: 3300 });
    const parNear = parallax(t, seed, 0.55, m * 0.012, 3300);
    const parFar = parallax(t, seed, 0.25, m * 0.012, 3300);

    const fsVal = Math.min(m * 0.115, (width * 0.86) / (Math.max(6, p.amount.length) * 0.52));
    const fsLab = m * 0.03;

    const cycle = height * 1.3;
    const n = Math.round(p.density);
    const nearN = Math.ceil(n * 0.55);

    // One tumbling bill. Position is a MODULO of t (scrub-safe, like ember_rise), never a state.
    const bills = (bank: 'near' | 'far', count: number) => {
      const near = bank === 'near';
      return Array.from({ length: count }, (_, i) => {
        const r = (s: string) => random(`${seed}-${bank}${s}${i}`);
        const bw = m * 0.17 * (0.85 + r('z') * 0.35) * (near ? 1 : 0.55);
        const bh = bw / 2.15;
        const v = p.speed * unit * (near ? 0.85 + r('v') * 0.5 : 0.42 + r('v') * 0.3);
        const qLin = (((t / 1000) * v + r('p') * cycle) % cycle) / cycle;
        const y = height * (-0.14 + qLin * 1.28);
        const ph = r('h') * Math.PI * 2;
        const x = width * (0.06 + r('x') * 0.88) + Math.sin((t / 1000) * (0.7 + r('sw')) + ph) * m * 0.022;
        const rot = r('r0') * 360 + (t / 1000) * (40 + r('rs') * 50) * (r('rd') > 0.5 ? 1 : -1);
        const flip = 0.3 + 0.7 * Math.abs(Math.sin((t / 1000) * (1.1 + r('f') * 0.9) * Math.PI + ph));
        const env = clamp01(qLin * 8) * clamp01((1 - qLin) * 8);
        const op = env * (near ? 0.95 : 0.55);
        // Bills never rest, so they carry a constant fall-speed motion blur — faster and nearer
        // bills smear more, which is exactly how a real camera would see the rain.
        const fallBlur = smear(0, (v / 1000) * (near ? 1.2 : 0.8)).blurPx;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: (x - bw / 2).toFixed(1) + 'px',
              top: (y - bh / 2).toFixed(1) + 'px',
              width: bw.toFixed(1) + 'px',
              height: bh.toFixed(1) + 'px',
              borderRadius: bh * 0.18,
              background: `linear-gradient(160deg, ${shade(p.bill, 0.52)} 0%, ${shade(p.bill, 0.72)} 45%, ${shade(p.bill, 0.4)} 100%)`,
              border: `${Math.max(1.5, bh * 0.045).toFixed(1)}px solid ${rgba(p.bill, 0.5)}`,
              boxShadow: `0 0 ${(bh * 0.55 * glowK).toFixed(1)}px ${rgba(p.bill, (near ? 0.3 : 0.16) * glowK)}, 0 ${(bh * 0.18).toFixed(1)}px ${(bh * 0.5).toFixed(1)}px rgba(0,0,0,0.35)`,
              transform: `rotate(${rot.toFixed(1)}deg) scaleY(${flip.toFixed(3)})`,
              filter: fallBlur > 0.3 ? `blur(${fallBlur.toFixed(2)}px)` : undefined,
              opacity: op,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div
              style={{
                position: 'absolute', inset: '9%',
                border: `${Math.max(1, bh * 0.03).toFixed(1)}px solid ${rgba(p.bill, 0.35)}`,
                borderRadius: bh * 0.12,
              }}
            />
            <span
              style={{
                fontFamily: ffM,
                fontWeight: 800,
                fontSize: bh * 0.58,
                lineHeight: 1,
                color: rgba(p.bill, 0.85),
                textShadow: `0 0 ${(bh * 0.2).toFixed(1)}px ${rgba(p.bill, 0.5)}`,
              }}
            >
              {glyph}
            </span>
          </div>
        );
      });
    };

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, transform: `translate(${parFar.x.toFixed(2)}px, ${parFar.y.toFixed(2)}px)`, ...el('far') }}>{bills('far', n - nearN)}</div>
        <div style={{ position: 'absolute', inset: 0, transform: `translate(${parNear.x.toFixed(2)}px, ${parNear.y.toFixed(2)}px)`, ...el('near') }}>{bills('near', nearN)}</div>

        {/* ── Hero counter chip (the wrapper centres; the chip owns the 3D pose so the swing
             pivots the chip's true centre, not the pre-translate corner) ── */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}>
        <div
          style={{
            position: 'relative',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: m * 0.012,
            padding: `${(m * 0.032).toFixed(1)}px ${(m * 0.055).toFixed(1)}px`,
            borderRadius: m * 0.032,
            background: 'linear-gradient(180deg, rgba(19,26,21,0.92) 0%, rgba(11,11,13,0.92) 100%)',
            border: '1.5px solid rgba(255,255,255,0.16)',
            boxShadow: [
              `0 ${m * 0.024}px ${m * 0.07}px rgba(0,0,0,0.55)`,
              `0 0 ${(m * 0.06 * glowK).toFixed(1)}px ${rgba(p.bill, 0.28 * glowK)}`,
              'inset 0 1px 0 rgba(255,255,255,0.14)',
            ].join(', '),
            opacity: Math.min(1, enter * 1.5),
            transform: `${pose} translate(${(chipShake.x + drift.x).toFixed(2)}px, ${(chipShake.y + drift.y + (1 - enter) * m * 0.06).toFixed(2)}px) rotate(${drift.rot.toFixed(3)}deg) scale(${(0.9 + enter * 0.1).toFixed(4)})`,
            ...el('counter'),
          }}
        >
          <span
            style={{
              fontFamily: fontStack('anton'),
              fontSize: fsVal,
              lineHeight: 1,
              color: p.ink,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              textShadow: [
                `0 ${m * 0.008}px ${m * 0.035}px rgba(0,0,0,0.6)`,
                `0 0 ${(m * 0.07 * glowK).toFixed(1)}px ${rgba(p.bill, 0.4 * glowK)}`,
                chromaPop(t, landAt, m * 0.011),
              ].filter(Boolean).join(', '),
            }}
          >
            {shown}
          </span>
          {p.label && (
            <span
              style={{
                fontFamily: ffM,
                fontSize: fsLab, fontWeight: 700,
                letterSpacing: '0.3em', textTransform: 'uppercase',
                color: rgba(p.accent, 0.95),
                paddingLeft: '0.3em',
                textShadow: `0 0 ${(m * 0.025 * glowK).toFixed(1)}px ${rgba(p.accent, 0.45 * glowK)}`,
                opacity: clamp01((t - 700) / 380),
                ...el('label'),
              }}
            >
              {p.label}
            </span>
          )}

          {flash > 0.02 && (
            <div
              style={{
                position: 'absolute', inset: '-8%',
                borderRadius: m * 0.04,
                background: `radial-gradient(circle, rgba(255,255,255,${(0.4 * flash).toFixed(3)}) 0%, transparent 65%)`,
                pointerEvents: 'none',
              }}
            />
          )}
          {sparks.map((s, i) => (
            <svg
              key={i}
              width={m * 0.045} height={m * 0.045} viewBox="0 0 24 24"
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
        </div>
      </div>
    );
  },
});
