// PUNCH impact stat — a giant number stamps onto a near-black card, lands with a decaying
// settle-shake and a one-shot burst of radial impact lines. The burst rides an ELLIPSE, not a
// circle, so the lines clear the wide number instead of landing on its glyphs; the number
// auto-shrinks with value length so "$1,250,000" never bleeds off the plate.

import { random, spring } from 'remotion';
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

export const impactStat = defineGraphicsTemplate({
  id: 'impact_stat',
  name: 'Impact Stat',
  category: 'money',
  tags: ['Giant', 'Number', 'Slam', 'Burst', 'Stat'],
  badge: 'New',
  design: { w: 900, h: 700 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 80 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'kicker', label: 'Kicker' },
    { key: 'number', label: 'Number', hideable: false },
    { key: 'sub',    label: 'Sub-line' },
    { key: 'burst',  label: 'Impact burst' },
  ],

  params: [
    { type: 'text', key: 'value',  label: 'Value',    group: 'Content', default: '$100M', maxLength: 14 },
    { type: 'text', key: 'kicker', label: 'Kicker',   group: 'Content', default: 'REVENUE GENERATED', maxLength: 32 },
    { type: 'text', key: 'sub',    label: 'Sub-line', group: 'Content', default: 'in 14 months — zero paid ads', maxLength: 48 },

    { type: 'color',   key: 'accent',   label: 'Accent',          group: 'Style', default: '#F59E0B' },
    { type: 'boolean', key: 'amberNum', label: 'Amber number',    group: 'Style', default: true },
    { type: 'font',    key: 'font',     label: 'Number font',     group: 'Style', default: 'anton' },
    { type: 'boolean', key: 'plate',    label: 'Draw background', group: 'Style', default: true },

    { type: 'number', key: 'slamAt', label: 'Slam at', group: 'Motion', default: 350, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'shake',  label: 'Shake',   group: 'Motion', default: 3, min: 0, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay',  label: 'Delay',   group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Whoosh on approach, low slam when the stamp lands — timed off the same params as the motion.
  sfx: (p) => [
    { atMs: p.delay + Math.max(0, p.slamAt - 120), id: 'whoosh', gain: 0.7 },
    { atMs: p.delay + p.slamAt + 170, id: 'slam' },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ffNum = fontStack(p.font);
    const ffSans = fontStack('montserrat');

    const rootIn = clamp01(t / 150);

    // The CARD arrives through 3D space (top-hinged swing) and then never flattens back into a
    // web page: a ±2° sway keeps it living, and the kicker/sub parallax against it.
    const cardIn = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 19, mass: 0.9, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    const pose = depthPose(t, seed, { enter: cardIn, rx: -18, z: -110, swayDeg: 2 });
    const parKick = parallax(t, seed, 0.55, height * 0.012);
    const parSub = parallax(t, seed, 0.35, height * 0.012);

    // Kicker settles first, quietly — max ONE thing slamming at a time, and it isn't this.
    const kickIn = spring({
      frame: fr(t - 60), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });

    // The slam: scale stamps down from 2.35; damping 16 gives a 1-2 frame overshoot (a brief
    // dip below final size) that reads as the number compressing into the card.
    const scaleAt = (ms: number) => 2.35 - 1.35 * spring({
      frame: fr(ms - p.slamAt), fps: FPS,
      config: { damping: 16, mass: 0.75, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const scale = scaleAt(t);
    const slam = (2.35 - scale) / 1.35;
    const numOp = clamp01(slam * 3);
    // MOTION BLUR: the stamp's zoom velocity (units/ms → px/ms at the glyph edge) drives a blur
    // that peaks mid-flight and lands CRISP — the difference between a div appearing and a
    // number arriving.
    const vNum = vel(scaleAt, t) * height * 0.2;
    const numSmear = smear(0, vNum, 1.15);

    const impactAt = p.slamAt + 170;                 // ~when the stamp first reaches full size
    const tImp = t - impactAt;
    const shk = settle(tImp, p.shake);

    const subIn = spring({
      frame: fr(t - impactAt - 240), fps: FPS,
      config: { damping: 24, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    const numCol = p.amberNum ? p.accent : INK;
    // Auto-fit: long values shrink so the plate never clips them.
    const fsNum = Math.round(height * 0.40 * Math.min(1, 6 / Math.max(3, p.value.length)));
    const fsKick = Math.round(height * 0.042);
    const fsSub = Math.round(height * 0.05);

    // One-shot burst: 8 short strokes shoot outward ~22px and are gone within ~320ms.
    const burstOn = tImp > 0 && tImp < 320;
    const burstP = 1 - Math.pow(1 - clamp01(tImp / 300), 3);
    const cx = width / 2;
    const cy = height * 0.5;
    const rx = width * 0.33, ry = height * 0.19;
    const burstLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    if (burstOn) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2 + (random(`${seed}-b${i}`) - 0.5) * 0.5;
        const co = Math.cos(a), si = Math.sin(a);
        const out = burstP * 22;
        const seg = 30 * (1 - burstP * 0.6);
        burstLines.push({
          x1: cx + co * (rx + out), y1: cy + si * (ry + out),
          x2: cx + co * (rx + out + seg), y2: cy + si * (ry + out + seg),
        });
      }
    }

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
        {burstOn && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', ...el('burst') }}>
            {burstLines.map((l, i) => (
              <line
                key={i}
                x1={l.x1.toFixed(1)} y1={l.y1.toFixed(1)} x2={l.x2.toFixed(1)} y2={l.y2.toFixed(1)}
                stroke={p.accent} strokeWidth={9} strokeLinecap="round"
                opacity={(1 - burstP).toFixed(3)}
              />
            ))}
          </svg>
        )}

        <span
          style={{
            position: 'absolute', left: 0, right: 0, top: height * 0.13,
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
          <span
            style={{
              fontFamily: ffNum,
              fontSize: fsNum, fontWeight: 900, lineHeight: 0.95,
              letterSpacing: '0.01em', whiteSpace: 'nowrap',
              color: numCol,
              opacity: numOp,
              filter: numSmear.blurPx > 0.3 ? `blur(${numSmear.blurPx.toFixed(2)}px)` : undefined,
              transform: `translate(${shk.x.toFixed(2)}px, ${shk.y.toFixed(2)}px) scale(${(scale * numSmear.sx).toFixed(4)}, ${(scale * numSmear.sy).toFixed(4)})`,
              transformOrigin: 'center center',
              textShadow: p.amberNum
                ? `0 0 ${Math.round(fsNum * 0.14)}px ${rgba(p.accent, 0.35)}, 0 10px 34px rgba(0,0,0,0.45)`
                : '0 10px 34px rgba(0,0,0,0.45)',
              ...el('number'),
            }}
          >
            {p.value}
          </span>
        </div>

        <span
          style={{
            position: 'absolute', left: 0, right: 0, bottom: height * 0.13,
            textAlign: 'center',
            fontSize: fsSub, fontWeight: 600, color: rgba(INK, 0.78), letterSpacing: '0.01em',
            opacity: clamp01(subIn * 2),
            transform: `translate(${parSub.x.toFixed(2)}px, ${(parSub.y + (1 - subIn) * height * 0.025).toFixed(2)}px)`,
            ...el('sub'),
          }}
        >
          {p.sub}
        </span>
      </div>
    );
  },
});
