// PUNCH discount starburst — a seeded-tilt sticker star SLAMS in with settle-shake, "50% OFF"
// stacked inside, and a price chip snaps in below where a red strike SWEEPS the old price only
// after the chip has landed. Craft: the post-impact sway rides the same rotate as the seeded
// tilt (one slow sine, one transform system), so the badge breathes through the hold instead of
// freezing — a second transform layer here is what makes stickers read wobbly.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

const RED = '#E5484D';

/** Decaying settle-shake: pure function of ms-since-impact — zero before the hit, a couple of
 *  fast oscillations after, dead within ~450ms. Never random per frame. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

export const discountBadge = defineGraphicsTemplate({
  id: 'discount_badge',
  name: 'Discount Badge',
  category: 'cta',
  tags: ['Starburst', 'Badge', 'Discount', 'Sticker', 'Percent'],
  badge: 'New',
  design: { w: 620, h: 800 },
  // Transparent by design — a sticker floating over footage; the shared plate would read as a box.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 34 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'badge', label: 'Starburst', hideable: false },
    { key: 'chip',  label: 'Price chip' },
    { key: 'ring',  label: 'Flash ring' },
  ],

  params: [
    { type: 'text', key: 'percent',  label: 'Big text',  group: 'Content', default: '50%',  maxLength: 6 },
    { type: 'text', key: 'sub',      label: 'Sub text',  group: 'Content', default: 'OFF',  maxLength: 10 },
    { type: 'text', key: 'oldPrice', label: 'Old price', group: 'Content', default: '₹999', maxLength: 12 },
    { type: 'text', key: 'newPrice', label: 'New price', group: 'Content', default: '₹499', maxLength: 12 },

    { type: 'color',  key: 'fill',   label: 'Badge fill',  group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Badge ink',   group: 'Style', default: '#0B0B0D' },
    { type: 'font',   key: 'font',   label: 'Font',        group: 'Style', default: 'anton' },
    { type: 'number', key: 'points', label: 'Star points', group: 'Style', default: 12, min: 8, max: 16, step: 1 },

    { type: 'number', key: 'slamAt', label: 'Slam at', group: 'Motion', default: 250, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'shake',  label: 'Shake',   group: 'Motion', default: 3, min: 0, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay',  label: 'Delay',   group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Whoosh into the sticker slam, pop when the price chip lands, cash when the strike finishes
  // killing the old price — all keyed off the same slamAt the motion uses.
  sfx: (p) => [
    { atMs: p.delay + Math.max(0, p.slamAt - 110), id: 'whoosh', gain: 0.6 },
    { atMs: p.delay + p.slamAt + 150, id: 'slam', gain: 1 },
    { atMs: p.delay + p.slamAt + 520, id: 'pop', gain: 0.5 },
    { atMs: p.delay + p.slamAt + 820, id: 'cash', gain: 0.65 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    const cx = width / 2;
    const cy = height * 0.4;
    const R = width * 0.44;

    // The slam: 1.55x -> 1.0, damping 14 — the 1-2 frame overshoot IS the impact. A closure of
    // absolute ms so vel() can sample the same motion for the smear.
    const sAt = (ms: number) => spring({
      frame: fr(ms - p.slamAt), fps: FPS,
      config: { damping: 14, mass: 0.8, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const s = sAt(t);
    const scale = 1.55 - 0.55 * s;
    const badgeOp = clamp01(s * 3);
    // MOTION BLUR: the stamp's zoom velocity at the star's rim — smears mid-flight, lands
    // CRISP the frame the sticker parks.
    const vStamp = vel((ms) => 1.55 - 0.55 * sAt(ms), t) * R;
    const sm = smear(0, vStamp, 1.25);

    const impact = p.slamAt + 150;
    const shk = settle(t - impact, p.shake);
    // Seeded tilt (a sticker never lands square) + slow post-impact sway on the SAME rotate.
    const ang = (random(`${seed}-ang`) - 0.5) * 12;
    const sway = Math.sin(t / 950) * 1.5 * clamp01((t - impact) / 500);
    const rot = ang + sway;
    // DEPTH: the sticker is tossed on through 3D (casual paper-toss hinge, not glossy) and keeps
    // breathing in space through the hold; the price chip parallaxes against it as foreground.
    const pose = depthPose(t, seed, { enter: s, rx: -12, ry: 7, z: -90, swayDeg: 1.8 });
    const parChip = parallax(t, seed, 0.7, width * 0.014);

    // Starburst polygon — shallow spikes (0.82 inner ratio) read "sale sticker", deep ones "explosion".
    const n = Math.max(8, Math.min(16, Math.round(p.points)));
    const pts: string[] = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 === 0 ? R : R * 0.82;
      const a = (i * Math.PI) / n - Math.PI / 2;
      pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
    }
    const starPts = pts.join(' ');

    // One-shot flash ring at impact — expands, thins, gone in ~620ms.
    const ringAge = t - impact;
    const ringOn = ringAge > 0 && ringAge < 620;
    const rp = easeOut(ringAge / 620);
    const ringR = R * 0.9 + rp * R * 1.0;

    // Price chip snaps in after the badge has landed; the strike sweeps a beat later.
    const chipAt = p.slamAt + 380;
    const cs = spring({
      frame: fr(t - chipAt), fps: FPS,
      config: { damping: 18, mass: 0.7, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(450))),
    });
    const chipOp = clamp01(cs * 2.5);
    const strikeP = easeOut((t - (chipAt + 300)) / 320);

    const lenP = Math.max(2, p.percent.length);
    const fsP = Math.round(Math.min(R * 0.62, (R * 1.6) / (0.55 * lenP)));
    const fsS = Math.round(R * 0.26);
    const fsChip = Math.round(width * 0.072);

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff }}>
        {ringOn && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', ...el('ring') }}>
            <circle
              cx={cx} cy={cy}
              r={ringR.toFixed(1)}
              fill="none"
              stroke={p.fill}
              strokeWidth={(14 * (1 - rp * 0.8)).toFixed(2)}
              opacity={(1 - rp).toFixed(3)}
            />
          </svg>
        )}

        <div
          style={{
            position: 'absolute', inset: 0,
            opacity: badgeOp,
            filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} translate(${shk.x.toFixed(2)}px, ${shk.y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${(scale * sm.sx).toFixed(4)}, ${(scale * sm.sy).toFixed(4)})`,
            transformOrigin: `${cx}px ${cy}px`,
            ...el('badge'),
          }}
        >
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <polygon points={starPts} fill="rgba(0,0,0,0.28)" transform="translate(0 7)" />
            <polygon points={starPts} fill={p.fill} />
            <circle
              cx={cx} cy={cy} r={(R * 0.7).toFixed(1)}
              fill="none"
              stroke={rgba(p.ink, 0.5)}
              strokeWidth={3}
              strokeDasharray="10 14"
            />
          </svg>

          <div
            style={{
              position: 'absolute', left: cx, top: cy,
              transform: 'translate(-50%, -50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: Math.round(R * 0.02),
            }}
          >
            <span style={{ fontSize: fsP, fontWeight: 900, lineHeight: 0.95, whiteSpace: 'nowrap', color: p.ink }}>
              {p.percent}
            </span>
            {p.sub && (
              <span style={{ fontSize: fsS, fontWeight: 900, lineHeight: 1, letterSpacing: '0.2em', paddingLeft: '0.2em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: rgba(p.ink, 0.85) }}>
                {p.sub}
              </span>
            )}
          </div>
        </div>

        {(p.oldPrice || p.newPrice) && (
          <div
            style={{
              position: 'absolute', left: '50%', top: '80%',
              transform: `translate(-50%, ${((1 - cs) * 40).toFixed(2)}px) translate(${parChip.x.toFixed(2)}px, ${parChip.y.toFixed(2)}px)`,
              opacity: chipOp,
              display: 'flex', alignItems: 'baseline', gap: Math.round(width * 0.035),
              padding: `${Math.round(height * 0.02)}px ${Math.round(width * 0.055)}px`,
              borderRadius: 999,
              fontFamily: fontStack('montserrat'),
              background: 'linear-gradient(180deg, #17171A 0%, #0B0B0D 100%)',
              border: '1px solid rgba(255,255,255,0.13)',
              boxShadow: '0 14px 40px rgba(0,0,0,0.45)',
              whiteSpace: 'nowrap',
              ...el('chip'),
            }}
          >
            {p.oldPrice && (
              <span style={{ position: 'relative', fontSize: Math.round(fsChip * 0.8), fontWeight: 600, color: 'rgba(244,241,232,0.55)' }}>
                {p.oldPrice}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', left: 0, top: '52%',
                    width: `${(strikeP * 100).toFixed(1)}%`, height: 3,
                    background: RED, borderRadius: 2,
                  }}
                />
              </span>
            )}
            {p.newPrice && (
              <span style={{ fontSize: fsChip, fontWeight: 800, color: p.fill }}>
                {p.newPrice}
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
});
