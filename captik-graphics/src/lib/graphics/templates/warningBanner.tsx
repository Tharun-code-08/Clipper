// PUNCH warning tape — two amber/black hazard strips slide in from opposite sides at opposing
// ±2° and cross behind a stamped caps label. The stripe crawl translates an OVERSIZED inner
// layer modulo the stripe's horizontal period (stripe·2·√2 for 45° bands) — background-position
// cannot scroll a repeating gradient seamlessly, an offset strip can, and the modulo keeps the
// translate small forever instead of accumulating.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { parallax, smear, sway3d, swingIn, vel } from '../juice';

const INK = '#F4F1E8';
const BG = '#0B0B0D';

/** Decaying settle-shake: pure function of ms-since-impact — zero before the hit, a couple of
 *  fast oscillations after, dead within ~450ms. Never random per frame. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

export const warningBanner = defineGraphicsTemplate({
  id: 'warning_banner',
  name: 'Warning Tape',
  category: 'notify',
  tags: ['Hazard', 'Tape', 'Stripes', 'Warning', 'Stamp'],
  badge: 'New',
  design: { w: 900, h: 300 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3500,
  defaultBox: { xPercent: 50, yPercent: 35, widthPercent: 78 },
  fonts: ['anton'],

  elements: [
    { key: 'tapeA', label: 'Upper tape' },
    { key: 'tapeB', label: 'Lower tape' },
    { key: 'label', label: 'Label', hideable: false },
  ],

  params: [
    { type: 'text', key: 'label', label: 'Label', group: 'Content', default: 'MISTAKE #1', maxLength: 24 },

    { type: 'color',  key: 'accent',  label: 'Tape colour',  group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',    label: 'Label font',   group: 'Style', default: 'anton' },
    { type: 'number', key: 'stripeW', label: 'Stripe width', group: 'Style', default: 28, min: 12, max: 60, step: 2, unit: 'px' },

    { type: 'number', key: 'drift',   label: 'Stripe drift', group: 'Motion', default: 14, min: 0, max: 60, step: 2, unit: 'px/s' },
    { type: 'number', key: 'labelAt', label: 'Label at',     group: 'Motion', default: 650, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'shake',   label: 'Shake',        group: 'Motion', default: 3, min: 0, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay',   label: 'Delay',        group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Two air sweeps as the tapes are thrown on, the lone full-gain slam when the label stamps,
  // and an alert blip on its settle — all keyed off the same labelAt the motion uses.
  sfx: (p) => [
    { atMs: p.delay + 60, id: 'whoosh', gain: 0.5 },
    { atMs: p.delay + 200, id: 'whoosh', gain: 0.45 },
    { atMs: p.delay + p.labelAt + 150, id: 'slam', gain: 1 },
    { atMs: p.delay + p.labelAt + 430, id: 'blip', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    const sw = p.stripeW;
    const periodX = sw * 2 * Math.SQRT2;
    const drift = (Math.max(0, t) * (p.drift / 1000)) % periodX;

    // Tapes slide from opposite sides; B lands 140ms after A so the crossing reads as two layers
    // being thrown on, not one banner splitting. Closures of absolute ms so vel() can sample the
    // same motion for the smear.
    const tapeSpring = (at: number) => (ms: number) => spring({
      frame: fr(ms - at), fps: FPS,
      config: { damping: 19, mass: 0.9, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    const inAAt = tapeSpring(0);
    const inBAt = tapeSpring(140);
    const inA = inAAt(t);
    const inB = inBAt(t);
    // MOTION BLUR: each tape's throw velocity smears it along the slide and dies as it parks.
    const vA = vel((ms) => (inAAt(ms) - 1) * width * 1.1, t);
    const vB = vel((ms) => (1 - inBAt(ms)) * width * 1.1, t);
    const smA = smear(vA, 0, 0.8);
    const smB = smear(vB, 0, 0.8);

    // Label stamps after the tapes are down; damping 16 keeps the 1-2 frame overshoot.
    const labAt = (ms: number) => spring({
      frame: fr(ms - p.labelAt), fps: FPS,
      config: { damping: 16, mass: 0.75, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });
    const lab = labAt(t);
    const lScale = 1.55 - 0.55 * lab;
    const lOp = clamp01(lab * 3);
    const shk = settle(t - p.labelAt - 150, p.shake);
    const fsLab = Math.round(Math.min(height * 0.30, (width * 0.66) / (0.56 * Math.max(4, p.label.length))));
    // Stamp zoom velocity at the label's glyph edge — blurs mid-flight, lands crisp.
    const vLab = vel((ms) => 1.55 - 0.55 * labAt(ms), t) * fsLab * 0.9;
    const smLab = smear(0, vLab, 1.1);

    // Depth split over the root sway: tapes sit at two depths, the stamped label rides
    // foreground — the sway shears the three planes against each other.
    const parA = parallax(t, seed, 0.3, width * 0.007);
    const parB = parallax(t, seed, 0.45, width * 0.007);
    const parLab = parallax(t, seed, 0.75, width * 0.007);

    const th = Math.round(height * 0.40);
    const tapeW = width * 1.4;
    const stripes = `repeating-linear-gradient(45deg, ${p.accent} 0 ${sw}px, #101013 ${sw}px ${sw * 2}px)`;

    const tapeOuter = {
      position: 'absolute', left: -width * 0.2, width: tapeW, height: th,
      overflow: 'hidden',
      boxShadow: '0 12px 34px rgba(0,0,0,0.45)',
    } as const;
    const tapeInner = (dir: 1 | -1) =>
      ({
        position: 'absolute', top: 0, bottom: 0, left: -periodX * 2, width: tapeW + periodX * 4,
        background: stripes,
        transform: `translateX(${(dir * drift).toFixed(2)}px)`,
      }) as const;

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, transform: sway3d(t, seed, 1.5) }}>
        <div
          style={{
            ...tapeOuter,
            top: height * 0.5 - th * 0.78,
            opacity: clamp01(inA * 2),
            filter: smA.blurPx > 0.3 ? `blur(${smA.blurPx.toFixed(2)}px)` : undefined,
            transform: `${swingIn(inA, { ry: -12, z: -70 })} translateX(${((inA - 1) * width * 1.1).toFixed(1)}px) translate(${parA.x.toFixed(2)}px, ${parA.y.toFixed(2)}px) rotate(-2deg) scale(${smA.sx.toFixed(4)}, ${smA.sy.toFixed(4)})`,
            ...el('tapeA'),
          }}
        >
          <div style={tapeInner(1)} />
        </div>

        <div
          style={{
            ...tapeOuter,
            top: height * 0.5 - th * 0.22,
            opacity: clamp01(inB * 2),
            filter: smB.blurPx > 0.3 ? `blur(${smB.blurPx.toFixed(2)}px)` : undefined,
            transform: `${swingIn(inB, { ry: 12, z: -70 })} translateX(${((1 - inB) * width * 1.1).toFixed(1)}px) translate(${parB.x.toFixed(2)}px, ${parB.y.toFixed(2)}px) rotate(2.4deg) scale(${smB.sx.toFixed(4)}, ${smB.sy.toFixed(4)})`,
            ...el('tapeB'),
          }}
        >
          <div style={tapeInner(-1)} />
        </div>

        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span
            style={{
              padding: `${Math.round(height * 0.05)}px ${Math.round(height * 0.11)}px`,
              background: BG,
              border: `2px solid ${rgba(INK, 0.28)}`,
              borderRadius: 10,
              boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
              fontSize: fsLab, fontWeight: 900, lineHeight: 1,
              letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              color: INK,
              opacity: lOp,
              filter: smLab.blurPx > 0.3 ? `blur(${smLab.blurPx.toFixed(2)}px)` : undefined,
              transform: `${swingIn(lab, { rx: -16, z: -110 })} translate(${(shk.x + parLab.x).toFixed(2)}px, ${(shk.y + parLab.y).toFixed(2)}px) rotate(-1.6deg) scale(${(lScale * smLab.sx).toFixed(4)}, ${(lScale * smLab.sy).toFixed(4)})`,
              transformOrigin: 'center center',
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
