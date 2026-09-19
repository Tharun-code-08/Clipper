// PUNCH number ladder — an escalation sequence: up to four values climb one per beat, each
// REPLACING the last at center. The outgoing value dims upward INSIDE the incoming beat (never on
// a beat of its own), so exactly one thing is moving at a time; each rung's RESTING size grows
// toward the final value, which lands amber with a glow — the climb is felt in scale, not digits.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

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

export const numberLadder = defineGraphicsTemplate({
  id: 'number_ladder',
  name: 'Number Ladder',
  category: 'money',
  tags: ['Number', 'Climb', 'Slam', 'Money', 'Escalation'],
  badge: 'New',
  design: { w: 900, h: 700 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 80 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'kicker', label: 'Kicker' },
    { key: 'value',  label: 'Value', hideable: false },
    { key: 'trail',  label: 'Outgoing trail' },
  ],

  params: [
    { type: 'text', key: 'values', label: 'Values', group: 'Content', default: '$1K|$10K|$100K|$1M',
      maxLength: 64, help: 'Up to 4, pipe-separated. One climbs per beat, each replacing the last.' },
    { type: 'text', key: 'kicker', label: 'Kicker', group: 'Content', default: 'THE JOURNEY', maxLength: 32 },

    { type: 'color',   key: 'accent', label: 'Accent',          group: 'Style', default: '#F59E0B' },
    { type: 'font',    key: 'font',   label: 'Number font',     group: 'Style', default: 'anton' },
    { type: 'boolean', key: 'plate',  label: 'Draw background', group: 'Style', default: true },

    { type: 'number', key: 'stepMs', label: 'Beat',  group: 'Motion', default: 1000, min: 400, max: 2000, step: 50, unit: 'ms' },
    { type: 'number', key: 'shake',  label: 'Shake', group: 'Motion', default: 3, min: 0, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Air sweep as the first rung approaches, a riser building under the climb, and the cash
  // hit exactly when the final amber value lands — all riding stepMs like the motion.
  sfx: (p) => {
    const n = Math.max(1, Math.min(4, p.values.split('|').map((s) => s.trim()).filter(Boolean).length));
    const lastAt = 300 + (n - 1) * p.stepMs;
    return [
      { atMs: p.delay + 200, id: 'whoosh', gain: 0.5 },
      { atMs: p.delay + Math.max(0, lastAt - 600), id: 'riser', gain: 0.35 },
      { atMs: p.delay + lastAt + 170, id: 'cash', gain: 0.65 },
    ];
  },

  render: ({ params: p, el, timeMs, height, seed }) => {
    const t = timeMs - p.delay;
    const ffNum = fontStack(p.font);
    const ffSans = fontStack('montserrat');

    const values = p.values.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 4);
    if (!values.length) return null;
    const n = values.length;

    const rootIn = clamp01(t / 150);

    // Depth: the plate swings in top-hinged and holds a ±1.8° sway so the held pose never
    // goes dead between slams; the kicker rides a parallax depth over it.
    const rootS = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 24, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const pose = depthPose(t, seed, { enter: rootS, rx: -12, z: -80, swayDeg: 1.8 });
    const parKick = parallax(t, seed, 0.45, height * 0.012);

    // Kicker settles first, quietly — it is never the thing slamming.
    const kickIn = spring({
      frame: fr(t - 60), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });

    // Beat clock: rung i slams at 300 + i*stepMs. Before the first slam the spring sits at 0,
    // so nothing needs a separate "not yet" branch.
    const bt = t - 300;
    const i = Math.min(n - 1, Math.max(0, Math.floor(bt / Math.max(1, p.stepMs))));
    const within = bt - i * p.stepMs;
    const isLast = i === n - 1;

    // The slam: from below, oversized; damping 16 leaves a 1-2 frame overshoot that reads as the
    // new value compressing into place.
    const slamAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 16, mass: 0.75, stiffness: 205 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });
    const slam = slamAt(within);
    const scale = 1.45 - 0.45 * slam;
    const rise = (1 - slam) * height * 0.16;
    const op = clamp01(slam * 3);
    const shk = settle(within - 170, p.shake);
    // MOTION BLUR: the rung's rise velocity drives a smear + stretch that dies the moment the
    // spring settles — the value arrives through air and lands crisp.
    const vSlam = vel(slamAt, within) * height * 0.16;
    const sm = smear(0, vSlam, 1.1);

    // Resting size grows per rung (0.6x -> 1x of base); long values auto-shrink so "$1,000,000"
    // never bleeds off the plate.
    const mul = (k: number) => (n === 1 ? 1 : 0.6 + 0.4 * (k / (n - 1)));
    const fit = (v: string) => Math.min(1, 5.5 / Math.max(3, v.length));
    const fs = (k: number) => Math.round(height * 0.32 * mul(k) * fit(values[k]));

    // Outgoing value: scales down 0.6x and dims upward, gone within ~420ms of the swap.
    const trailP = easeOut(within / 420);

    const fsKick = Math.round(height * 0.042);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          opacity: rootIn,
          fontFamily: ffSans,
          borderRadius: 28,
          overflow: p.plate ? 'hidden' : 'visible',
          background: p.plate ? `linear-gradient(180deg, #17171A 0%, ${BG} 55%)` : 'transparent',
          border: p.plate ? '1px solid rgba(255,255,255,0.10)' : 'none',
          boxShadow: p.plate ? '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)' : 'none',
          transform: pose,
          transformOrigin: '50% 30%',
        }}
      >
        <span
          style={{
            position: 'absolute', left: 0, right: 0, top: height * 0.12,
            textAlign: 'center',
            fontSize: fsKick, fontWeight: 700, letterSpacing: '0.32em', textTransform: 'uppercase',
            color: rgba(INK, 0.72),
            opacity: clamp01(kickIn * 2),
            transform: `translate(${parKick.x.toFixed(2)}px, ${(parKick.y + (1 - kickIn) * height * 0.03).toFixed(2)}px)`,
            ...el('kicker'),
          }}
        >
          {p.kicker}
        </span>

        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {i > 0 && trailP < 1 && (
            <span
              style={{
                position: 'absolute',
                fontFamily: ffNum,
                fontSize: fs(i - 1), fontWeight: 900, lineHeight: 0.95, whiteSpace: 'nowrap',
                color: INK,
                opacity: ((1 - trailP) * 0.5).toFixed(3),
                transform: `translateY(${(-trailP * height * 0.13).toFixed(2)}px) scale(${(1 - 0.4 * trailP).toFixed(4)})`,
                transformOrigin: 'center center',
                ...el('trail'),
              }}
            >
              {values[i - 1]}
            </span>
          )}

          <span
            style={{
              fontFamily: ffNum,
              fontSize: fs(i), fontWeight: 900, lineHeight: 0.95,
              letterSpacing: '0.01em', whiteSpace: 'nowrap',
              color: isLast ? p.accent : INK,
              opacity: op,
              filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
              transform: `translate(${shk.x.toFixed(2)}px, ${(rise + shk.y).toFixed(2)}px) scale(${(scale * sm.sx).toFixed(4)}, ${(scale * sm.sy).toFixed(4)})`,
              transformOrigin: 'center center',
              textShadow: isLast
                ? `0 0 ${Math.round(fs(i) * 0.16)}px ${rgba(p.accent, 0.4)}, 0 10px 34px rgba(0,0,0,0.45)`
                : '0 10px 34px rgba(0,0,0,0.45)',
              ...el('value'),
            }}
          >
            {values[i]}
          </span>
        </div>
      </div>
    );
  },
});
