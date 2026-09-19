// PUNCH money stack — bill-like amber bars drop onto a pile one per beat while a bold figure
// counts up beside them with a motion-blur roll that sharpens exactly at landing (wealthCounter's
// trick). Each bill carries a seeded x-jitter and tilt so the pile reads as thrown-down cash, not
// a bar chart; the whole stack settle-shakes once, when the LAST bill hits.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const INK = '#F4F1E8';
const BG = '#0B0B0D';

/** Decaying settle-shake: pure function of ms-since-impact, dead within ~450ms. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

const easeOutQ = (x: number) => 1 - Math.pow(1 - clamp01(x), 5);

function group(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const moneyStack = defineGraphicsTemplate({
  id: 'money_stack',
  name: 'Money Stack',
  category: 'money',
  tags: ['Cash', 'Stack', 'Bills', 'Counter', 'Money'],
  badge: 'New',
  design: { w: 900, h: 700 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 78 },
  fonts: ['montserrat'],

  elements: [
    { key: 'stack',  label: 'Bill stack' },
    { key: 'amount', label: 'Amount', hideable: false },
    { key: 'label',  label: 'Label' },
  ],

  params: [
    { type: 'text',   key: 'value', label: 'Value', group: 'Content', default: '$25,000', maxLength: 14 },
    { type: 'text',   key: 'label', label: 'Label', group: 'Content', default: 'CASH COLLECTED', maxLength: 28 },
    { type: 'number', key: 'bills', label: 'Bills', group: 'Content', default: 5, min: 3, max: 9, step: 1 },

    { type: 'color', key: 'accent', label: 'Bill top',  group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'deep',   label: 'Bill base', group: 'Style', default: '#D97706' },
    { type: 'font',  key: 'font',   label: 'Font',      group: 'Style', default: 'montserrat' },

    { type: 'number', key: 'countMs', label: 'Count-up',     group: 'Motion', default: 2200, min: 400, max: 4000, step: 50, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Bill stagger', group: 'Motion', default: 380, min: 150, max: 800, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay',        group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Money you can hear: a swish as the first bill drops, ONE tick as the count starts rolling,
  // a coin when the LAST bill lands on the pile, and the cash hit where the figure lands — all
  // riding the same stagger/countMs clocks as the motion.
  sfx: (p) => [
    { atMs: p.delay + 120, id: 'swish', gain: 0.4 },
    { atMs: p.delay + 180, id: 'tick', gain: 0.35 },
    { atMs: p.delay + 150 + (p.bills - 1) * p.stagger + 160, id: 'coin', gain: 0.5 },
    { atMs: p.delay + 150 + p.countMs, id: 'cash', gain: 0.65 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    // Count-up: digits parsed out of the value text, currency prefix preserved (wealthCounter's
    // parse) — blur follows the remaining count velocity so digits are sharp at landing.
    const digits = p.value.replace(/[^0-9]/g, '');
    const target = digits ? parseInt(digits, 10) : 0;
    const prefix = digits ? p.value.slice(0, p.value.search(/[0-9]/)) : p.value;
    const cu = easeOutQ((t - 150) / Math.max(1, p.countMs));
    const shown = Math.round(target * cu);
    const blur = t > 150 ? (1 - cu) * 7 : 0;

    const billW = width * 0.34, billH = height * 0.062;
    const stepY = billH * 0.84;
    const bottomY = height * 0.87;
    const baseX = width * 0.09;

    const lastImpact = 150 + (p.bills - 1) * p.stagger + 160;
    const stackShk = settle(t - lastImpact, 3);

    // Depth: the card swings in top-hinged and holds a ±1.8° sway; the pile and the figure sit
    // at different parallax depths so the sway shears them — cash in a volume, not a diagram.
    const rootIn = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const pose = depthPose(t, seed, { enter: rootIn, rx: -12, z: -80, swayDeg: 1.8 });
    const parStack = parallax(t, seed, 0.3, height * 0.01);
    const parAmt = parallax(t, seed, 0.6, height * 0.01);

    const fsAmt = Math.min(height * 0.16, (width * 0.45) / (0.62 * Math.max(4, p.value.length)));
    const fsLabel = Math.round(height * 0.035);

    const bills = Array.from({ length: p.bills }, (_, i) => {
      const sAt = (ms: number) => spring({
        frame: fr(ms - (150 + i * p.stagger)), fps: FPS,
        config: { damping: 17, mass: 0.8, stiffness: 210 },
        durationInFrames: Math.max(1, Math.round(fr(480))),
      });
      const s = sAt(t);
      return {
        x: baseX + (random(`${seed}-bx${i}`) - 0.5) * width * 0.035,
        y: bottomY - billH - i * stepY,
        rot: (random(`${seed}-br${i}`) - 0.5) * 4,
        s,
        // Each bill falls with its own hinge angle (Z-STAGGER) and a fall-velocity smear that
        // dies the frame its spring settles on the pile.
        rx: -(16 + (i % 3) * 4),
        sm: smear(0, vel((ms) => sAt(ms) * -height * 0.3, t), 1),
      };
    });

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          opacity: clamp01(t / 150),
          fontFamily: ff,
          borderRadius: 28,
          overflow: 'hidden',
          background: `linear-gradient(180deg, #17171A 0%, ${BG} 55%)`,
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          transform: pose,
          transformOrigin: '50% 30%',
        }}
      >
        <div
          style={{
            position: 'absolute', inset: 0,
            transform: `translate(${(stackShk.x + parStack.x).toFixed(2)}px, ${(stackShk.y + parStack.y).toFixed(2)}px)`,
            ...el('stack'),
          }}
        >
          {bills.map((b, i) => (
            <div
              key={i}
              style={{
                position: 'absolute', left: b.x.toFixed(1), top: b.y.toFixed(1),
                width: billW, height: billH,
                boxSizing: 'border-box',
                borderRadius: billH * 0.3,
                background: `linear-gradient(180deg, ${p.accent} 0%, ${p.deep} 100%)`,
                border: '2px solid rgba(120,53,15,0.6)',
                boxShadow: '0 6px 14px rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,255,255,0.28)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: clamp01(b.s * 4),
                filter: b.sm.blurPx > 0.3 ? `blur(${b.sm.blurPx.toFixed(2)}px)` : undefined,
                transform: `${swingIn(b.s, { rx: b.rx, z: -70 })} translateY(${((1 - b.s) * -height * 0.3).toFixed(2)}px) rotate(${b.rot.toFixed(2)}deg) scale(${b.sm.sx.toFixed(4)}, ${b.sm.sy.toFixed(4)})`,
                transformOrigin: 'top center',
              }}
            >
              {/* The seal: an inner outlined pill is what makes a bar read as a bill. */}
              <div
                style={{
                  width: billH * 1.1, height: billH * 0.52,
                  borderRadius: 999,
                  border: '2px solid rgba(120,53,15,0.5)',
                }}
              />
            </div>
          ))}
        </div>

        <div
          style={{
            position: 'absolute', left: width * 0.48, right: width * 0.05, top: 0, bottom: height * 0.08,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            gap: height * 0.025,
            transform: `translate(${parAmt.x.toFixed(2)}px, ${parAmt.y.toFixed(2)}px)`,
          }}
        >
          <span
            style={{
              fontSize: Math.round(fsAmt), fontWeight: 800, color: INK,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
              whiteSpace: 'nowrap', lineHeight: 1,
              filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
              textShadow: `0 0 ${Math.round(fsAmt * 0.2)}px ${rgba(p.accent, 0.25)}, 0 10px 30px rgba(0,0,0,0.45)`,
              ...el('amount'),
            }}
          >
            {prefix}{digits ? group(shown) : ''}
          </span>
          <span
            style={{
              fontSize: fsLabel, fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase',
              color: rgba(INK, 0.6),
              opacity: clamp01((t - 400) / 350),
              ...el('label'),
            }}
          >
            {p.label}
          </span>
        </div>
      </div>
    );
  },
});
