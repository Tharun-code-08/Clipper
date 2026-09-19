// PUNCH countdown — "3 .. 2 .. 1" then the payoff. Numerals HARD-CUT: a floor() of the beat
// clock restarts one shared slam spring, no cross-fade — the cut IS the rhythm. The payoff lands
// amber with a one-shot expanding impact ring whose stroke THINS as it grows, so it reads as a
// shockwave dissipating rather than a target being drawn.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { smear, sway3d, swingIn, vel } from '../juice';

const INK = '#F4F1E8';
const BG = '#0B0B0D';

/** Decaying settle-shake: pure function of ms-since-impact — zero before the hit, a couple of
 *  fast oscillations after, dead within ~450ms. Never random per frame. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

export const countdownSlam = defineGraphicsTemplate({
  id: 'countdown_slam',
  name: 'Countdown Slam',
  category: 'title',
  tags: ['Countdown', 'Numbers', 'Slam', 'Ring', 'Huge'],
  badge: 'New',
  design: { w: 700, h: 500 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 55 },
  fonts: ['anton'],

  elements: [
    { key: 'number', label: 'Numeral', hideable: false },
    { key: 'payoff', label: 'Payoff' },
    { key: 'ring',   label: 'Impact ring' },
  ],

  params: [
    { type: 'number', key: 'start',  label: 'Start from',  group: 'Content', default: 3, min: 3, max: 10, step: 1 },
    { type: 'text',   key: 'payoff', label: 'Payoff word', group: 'Content', default: 'GO', maxLength: 12 },

    { type: 'color',   key: 'accent', label: 'Accent',          group: 'Style', default: '#F59E0B' },
    { type: 'font',    key: 'font',   label: 'Font',            group: 'Style', default: 'anton' },
    { type: 'boolean', key: 'plate',  label: 'Draw background', group: 'Style', default: false },

    { type: 'number', key: 'beatMs', label: 'Beat',  group: 'Motion', default: 800, min: 300, max: 1500, step: 50, unit: 'ms' },
    { type: 'number', key: 'shake',  label: 'Shake', group: 'Motion', default: 3, min: 0, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // A tick as the first numeral lands, a riser building into the payoff beat, then the lone
  // full-gain slam at the payoff impact (the same instant the shockwave ring fires).
  sfx: (p) => {
    const count = Math.round(Math.min(10, Math.max(3, p.start)));
    const beat = Math.max(1, p.beatMs);
    return [
      { atMs: p.delay + 130, id: 'tick', gain: 0.5 },
      { atMs: p.delay + Math.max(0, count * beat - 650), id: 'riser', gain: 0.5 },
      { atMs: p.delay + count * beat + 150, id: 'slam', gain: 1 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    const count = Math.round(Math.min(10, Math.max(3, p.start)));
    const beat = Math.max(1, p.beatMs);
    const idx = Math.max(0, Math.floor(t / beat));
    const onPayoff = idx >= count;
    const within = onPayoff ? t - count * beat : t - idx * beat;

    // One slam per beat: 1.4x -> 1.0 for numerals, 1.5x -> 1.0 (heavier, damping 14) for the
    // payoff; opacity rides the same spring so a new beat pops on hard. Written as a closure of
    // absolute ms so vel() can sample it — across a hard cut the sampled scale JUMPS, which
    // maxes the smear for exactly one beat-boundary window: the cut itself carries the blur.
    const scaleAt = (ms: number) => {
      const i = Math.max(0, Math.floor(ms / beat));
      const po = i >= count;
      const w = po ? ms - count * beat : ms - i * beat;
      const sp = spring({
        frame: fr(w), fps: FPS,
        config: po
          ? { damping: 14, mass: 0.8, stiffness: 220 }
          : { damping: 15, mass: 0.7, stiffness: 240 },
        durationInFrames: Math.max(1, Math.round(fr(po ? 500 : 420))),
      });
      return po ? 1.5 - 0.5 * sp : 1.4 - 0.4 * sp;
    };
    const s = spring({
      frame: fr(within), fps: FPS,
      config: onPayoff
        ? { damping: 14, mass: 0.8, stiffness: 220 }
        : { damping: 15, mass: 0.7, stiffness: 240 },
      durationInFrames: Math.max(1, Math.round(fr(onPayoff ? 500 : 420))),
    });
    const scale = scaleAt(t);
    const op = clamp01(s * 3);
    const shk = settle(within - 130, p.shake);
    // MOTION BLUR: zoom velocity at the glyph edge — peaks mid-slam and at each hard cut,
    // lands CRISP every beat.
    const vZ = vel(scaleAt, t) * height * 0.29;
    const sm = smear(0, vZ, 1.1);
    // Each beat swings in from an alternating side hinge (payoff: heavier, top-hinged) so the
    // count reads as objects arriving in space, not divs blinking.
    const hinge = onPayoff
      ? { rx: -18, z: -140 }
      : { ry: (idx % 2 === 0 ? 1 : -1) * 16, z: -90 };
    const pose = swingIn(s, hinge);

    const fsNum = Math.round(height * 0.58);
    const fsPay = Math.round(Math.min(height * 0.40, (width * 0.86) / (0.6 * Math.max(2, p.payoff.length))));

    // One-shot shockwave at payoff impact — expands, thins, gone in ~620ms, never loops.
    const ringAge = t - (count * beat + 150);
    const ringOn = ringAge > 0 && ringAge < 620;
    const rp = easeOut(ringAge / 620);
    const ringR = height * 0.16 + rp * width * 0.46;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          fontFamily: ff,
          borderRadius: 24,
          overflow: p.plate ? 'hidden' : 'visible',
          background: p.plate ? `linear-gradient(180deg, #17171A 0%, ${BG} 55%)` : 'transparent',
          border: p.plate ? '1px solid rgba(255,255,255,0.10)' : 'none',
          boxShadow: p.plate ? '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)' : 'none',
          // The countdown never flattens into a web page — a ±1.8° sway holds the whole frame
          // in space through every beat and the payoff hold (rotation-only: midpoint-safe).
          transform: sway3d(t, seed, 1.8),
        }}
      >
        {ringOn && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', ...el('ring') }}>
            <circle
              cx={width / 2} cy={height / 2}
              r={ringR.toFixed(1)}
              fill="none"
              stroke={p.accent}
              strokeWidth={(16 * (1 - rp * 0.78)).toFixed(2)}
              opacity={(1 - rp).toFixed(3)}
            />
          </svg>
        )}

        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!onPayoff && (
            <span
              style={{
                fontSize: fsNum, fontWeight: 900, lineHeight: 0.95, whiteSpace: 'nowrap',
                color: INK,
                opacity: op,
                filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                transform: `${pose} translate(${shk.x.toFixed(2)}px, ${shk.y.toFixed(2)}px) scale(${(scale * sm.sx).toFixed(4)}, ${(scale * sm.sy).toFixed(4)})`,
                transformOrigin: 'center center',
                textShadow: '0 12px 40px rgba(0,0,0,0.5)',
                ...el('number'),
              }}
            >
              {count - idx}
            </span>
          )}

          {onPayoff && (
            <span
              style={{
                fontSize: fsPay, fontWeight: 900, lineHeight: 0.95,
                letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                color: p.accent,
                opacity: op,
                filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                transform: `${pose} translate(${shk.x.toFixed(2)}px, ${shk.y.toFixed(2)}px) scale(${(scale * sm.sx).toFixed(4)}, ${(scale * sm.sy).toFixed(4)})`,
                transformOrigin: 'center center',
                textShadow: `0 0 ${Math.round(fsPay * 0.2)}px ${rgba(p.accent, 0.4)}, 0 12px 40px rgba(0,0,0,0.5)`,
                ...el('payoff'),
              }}
            >
              {p.payoff}
            </span>
          )}
        </div>
      </div>
    );
  },
});
