// PUNCH leaderboard — three dark pills slam in BOTTOM-UP (#3 first, so the winner is the last
// thing to land), then #1 gets the gold treatment: lift + amber glow + a crown that drops on with
// a bounce. Craft: the crown renders INSIDE the #1 row's transform, so the lift and the drop
// compose — dropped in canvas space it would land on a row that is still rising.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { parallax, smear, sway3d, swingIn, vel } from '../juice';

const GOLD_DEEP = '#D97706';
const MAX_ROWS = 3;

/** Decaying settle-shake: pure function of ms-since-impact — zero before the hit, a couple of
 *  fast oscillations after, dead within ~450ms. Never random per frame. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

export const trophyRank = defineGraphicsTemplate({
  id: 'trophy_rank',
  name: 'Trophy Rank',
  category: 'social',
  tags: ['Leaderboard', 'Ranking', 'Crown', 'Rows', 'Winner'],
  badge: 'New',
  design: { w: 720, h: 640 },
  // Rows paint their own dark pills — the canvas around them stays transparent over footage.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 46 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'row1',  label: 'Rank 1 row', hideable: false },
    { key: 'row2',  label: 'Rank 2 row' },
    { key: 'row3',  label: 'Rank 3 row' },
    { key: 'crown', label: 'Crown' },
  ],

  params: [
    { type: 'text', key: 'rows', label: 'Rows', group: 'Content', multiline: true, maxLength: 200,
      default: 'Alex|$12,400\nJordan|$9,850\nSam|$7,200',
      help: 'One per line, top rank first: name | value. Up to 3 rows.' },
    { type: 'image', key: 'r1Img', label: 'Rank 1 photo', group: 'Content', default: '', help: 'Optional — the rank-number disc is drawn when empty.' },
    { type: 'image', key: 'r2Img', label: 'Rank 2 photo', group: 'Content', default: '', help: 'Optional — the rank-number disc is drawn when empty.' },
    { type: 'image', key: 'r3Img', label: 'Rank 3 photo', group: 'Content', default: '', help: 'Optional — the rank-number disc is drawn when empty.' },

    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',    label: 'Ink',    group: 'Style', default: '#F4F1E8' },
    { type: 'font',  key: 'font',   label: 'Font',   group: 'Style', default: 'anton' },

    { type: 'number', key: 'stepMs', label: 'Row cadence', group: 'Motion', default: 340, min: 120, max: 900, step: 20, unit: 'ms' },
    { type: 'number', key: 'shake',  label: 'Shake',       group: 'Motion', default: 3, min: 0, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay',  label: 'Delay',       group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU cues on a leaderboard: air sweep as the first pill arrives, the cash hit when
  // the #1 money row lands, and the chime as the crown settles — all riding stepMs.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_ROWS, p.rows.split('\n').map((l) => l.trim()).filter(Boolean).length));
    const step = Math.max(1, p.stepMs);
    return [
      { atMs: p.delay + 20, id: 'whoosh', gain: 0.5 },
      { atMs: p.delay + (n - 1) * step + 170, id: 'cash', gain: 0.6 },
      { atMs: p.delay + n * step + 420 + 330, id: 'chime', gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    const rows = p.rows.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_ROWS)
      .map((l) => {
        const [name = '', value = ''] = l.split('|').map((s) => s.trim());
        return { name, value };
      });
    if (!rows.length) return null;

    const imgs = [p.r1Img, p.r2Img, p.r3Img];
    const N = rows.length;
    const rh = height * 0.225;
    const gap = height * 0.045;
    const step = Math.max(1, p.stepMs);

    // Gold treatment starts once the last (top) row has settled.
    const tGold = N * step + 420;
    const g = spring({
      frame: fr(t - tGold), fps: FPS,
      config: { damping: 18, mass: 0.8, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const gv = clamp01(g);

    // Crown drops a beat into the lift, damping 11 — the one place a real bounce is earned.
    const cDropAt = (ms: number) => spring({
      frame: fr(ms - (tGold + 180)), fps: FPS,
      config: { damping: 11, mass: 0.9, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const cDrop = cDropAt(t);
    const cw = rh * 0.9;
    // The crown's drop velocity drives a smear that dies as the bounce settles — it arrives
    // as an object falling through air, then lands crisp.
    const vCrown = vel(cDropAt, t) * rh * 1.1;
    const cSm = smear(0, vCrown);

    // Depth: the stack holds a ±1.8° sway so it never flattens back into a web page; the
    // crown and the money values ride different parallax depths over the swaying pills.
    const sway = sway3d(t, seed, 1.8);
    const parCrown = parallax(t, seed, 0.85, rh * 0.06);
    const parVal = parallax(t, seed, 0.35, rh * 0.06);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, fontFamily: ff,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          gap, paddingLeft: width * 0.05, paddingRight: width * 0.05, paddingBottom: height * 0.04,
          transform: sway,
        }}
      >
        {rows.map((r, i) => {
          // Bottom-up arrival: display index 0 is rank #1 and lands LAST.
          const at = (N - 1 - i) * step;
          const sAt = (ms: number) => spring({
            frame: fr(ms - at), fps: FPS,
            config: { damping: 15, mass: 0.7, stiffness: 230 },
            durationInFrames: Math.max(1, Math.round(fr(450))),
          });
          const s = sAt(t);
          // The slam is a genuinely fast mover: its rise velocity drives a smear + stretch
          // that dies as the spring settles — each pill lands crisp.
          const vRow = vel(sAt, t) * 34;
          const sm = smear(0, vRow, 1.1);
          const shk = settle(t - (at + 140), p.shake);
          const isTop = i === 0;
          const lift = isTop ? gv : 0;
          const rowScale = 1.3 - 0.3 * s + lift * 0.045;

          const chipBg = isTop ? p.accent : 'rgba(255,255,255,0.10)';
          const chipInk = isTop ? '#0B0B0D' : rgba(p.ink, 0.6);

          return (
            <div
              key={i}
              style={{
                position: 'relative',
                height: rh,
                display: 'flex', alignItems: 'center',
                gap: width * 0.035,
                paddingLeft: rh * 0.19, paddingRight: rh * 0.3,
                borderRadius: rh / 2,
                background: 'linear-gradient(180deg, #17171A 0%, #0B0B0D 100%)',
                border: `1px solid ${isTop ? rgba(p.accent, 0.2 + 0.7 * lift) : 'rgba(255,255,255,0.13)'}`,
                boxShadow: isTop
                  ? `0 14px 34px rgba(0,0,0,0.4), 0 0 ${(30 * lift).toFixed(1)}px ${rgba(p.accent, 0.35 * lift)}, 0 0 ${(70 * lift).toFixed(1)}px ${rgba(p.accent, 0.16 * lift)}`
                  : '0 14px 34px rgba(0,0,0,0.4)',
                opacity: clamp01(s * 3),
                // Z-stagger: each pill swings in top-hinged from its own slightly different
                // angle (spring overshoot tips it past vertical), with the slam smear on top.
                transform: `${swingIn(s, { rx: -14 + i * 1.5, z: -70 })} translate(${shk.x.toFixed(2)}px, ${(shk.y + (1 - s) * 34 - lift * rh * 0.12).toFixed(2)}px) scale(${(rowScale * sm.sx).toFixed(4)}, ${(rowScale * sm.sy).toFixed(4)})`,
                transformOrigin: 'center center',
                filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                ...el(`row${i + 1}`),
              }}
            >
              {isTop && cDrop > 0.001 && (
                <div
                  style={{
                    position: 'absolute',
                    left: -cw * 0.14, top: -cw * 0.6,
                    width: cw, height: cw * 0.78,
                    opacity: clamp01(cDrop * 4),
                    transform: `translate(${parCrown.x.toFixed(2)}px, ${(parCrown.y + (1 - cDrop) * -rh * 1.1).toFixed(2)}px) rotate(-16deg) scale(${cSm.sx.toFixed(4)}, ${cSm.sy.toFixed(4)})`,
                    transformOrigin: '30% 90%',
                    filter: cSm.blurPx > 0.3 ? `blur(${cSm.blurPx.toFixed(2)}px)` : undefined,
                    ...el('crown'),
                  }}
                >
                  <svg viewBox="0 0 100 78" width="100%" height="100%" style={{ overflow: 'visible', filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.45))' }}>
                    <path d="M8 62 L8 30 L30 46 L50 12 L70 46 L92 30 L92 62 Z" fill={p.accent} stroke={GOLD_DEEP} strokeWidth={4} strokeLinejoin="round" />
                    <circle cx={8} cy={24} r={6} fill={p.accent} stroke={GOLD_DEEP} strokeWidth={3} />
                    <circle cx={50} cy={8} r={6} fill={p.accent} stroke={GOLD_DEEP} strokeWidth={3} />
                    <circle cx={92} cy={24} r={6} fill={p.accent} stroke={GOLD_DEEP} strokeWidth={3} />
                    <rect x={8} y={62} width={84} height={9} rx={4} fill={GOLD_DEEP} />
                  </svg>
                </div>
              )}

              <span
                style={{
                  width: rh * 0.62, height: rh * 0.62,
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flex: 'none',
                  background: imgs[i] ? undefined : chipBg,
                  overflow: imgs[i] ? 'hidden' : undefined,
                  color: chipInk,
                  fontSize: Math.round(rh * 0.3), fontWeight: 900,
                }}
              >
                {imgs[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgs[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <>#{i + 1}</>
                )}
              </span>

              <span
                style={{
                  flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontSize: Math.round(rh * 0.38), fontWeight: 900,
                  letterSpacing: '0.02em', textTransform: 'uppercase',
                  color: p.ink,
                }}
              >
                {r.name}
              </span>

              <span
                style={{
                  fontFamily: fontStack('montserrat'),
                  fontSize: Math.round(rh * 0.3), fontWeight: 800,
                  whiteSpace: 'nowrap',
                  color: isTop ? p.accent : rgba(p.ink, 0.85),
                  transform: `translate(${parVal.x.toFixed(2)}px, ${parVal.y.toFixed(2)}px)`,
                }}
              >
                {r.value}
              </span>
            </div>
          );
        })}
      </div>
    );
  },
});
