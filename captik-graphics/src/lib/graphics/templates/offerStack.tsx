// PUNCH offer stack — the value close: up to 5 item|price rows land one per beat, then an amber
// strike sweeps each price (dimming it to 45%), and a TOTAL TODAY row slams in with the real
// price at 1.6x in amber. All beats are computed from the parsed row COUNT, so trimming the list
// to 2 items tightens the whole sequence instead of leaving dead air before the total.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, swingIn, vel } from '../juice';

const INK = '#F4F1E8';
const BG = '#0B0B0D';

/** Decaying settle-shake: pure function of ms-since-impact, dead within ~450ms. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

export const offerStack = defineGraphicsTemplate({
  id: 'offer_stack',
  name: 'Offer Stack',
  category: 'money',
  tags: ['List', 'Prices', 'Strike', 'Total', 'Offer'],
  badge: 'New',
  design: { w: 900, h: 900 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6000,
  defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 66 },
  fonts: ['montserrat', 'anton'],

  elements: [
    { key: 'item1', label: 'Item 1' },
    { key: 'item2', label: 'Item 2' },
    { key: 'item3', label: 'Item 3' },
    { key: 'item4', label: 'Item 4' },
    { key: 'item5', label: 'Item 5' },
    { key: 'total', label: 'Total row', hideable: false },
  ],

  params: [
    { type: 'text', key: 'items', label: 'Items', group: 'Content', multiline: true, maxLength: 400,
      default: '1:1 Coaching|$2,000\nCommunity|$500\nWeekly Calls|$750\nTemplates|$300',
      help: 'One per line: item|price. Up to 5.' },
    { type: 'text', key: 'totalLabel', label: 'Total label', group: 'Content', default: 'TOTAL TODAY', maxLength: 24 },
    { type: 'text', key: 'totalPrice', label: 'Total price', group: 'Content', default: '$97', maxLength: 12 },

    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'font',  key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },

    { type: 'number', key: 'stagger', label: 'Item stagger', group: 'Motion', default: 480, min: 200, max: 900, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay',        group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // The value close, scored: an air pass as the first row approaches, a swish as the strikes
  // start sweeping the prices, and the cash hit exactly when TOTAL TODAY lands. Beats are
  // computed from the parsed row count, exactly like the motion's own timeline.
  sfx: (p) => {
    const n = Math.max(1, p.items.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5)
      .filter((l) => (l.split('|')[0] ?? '').trim().length > 0).length);
    const strikesStart = 350 + n * p.stagger + 150;
    const totalAt = strikesStart + n * 270 + 250;
    return [
      { atMs: p.delay + 230, id: 'whoosh', gain: 0.5 },
      { atMs: p.delay + strikesStart, id: 'swish', gain: 0.45 },
      { atMs: p.delay + totalAt + 170, id: 'cash', gain: 0.8 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);
    const ffTotal = fontStack('anton');

    const rows = p.items.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5)
      .map((l) => {
        const [name = '', price = ''] = l.split('|').map((s) => s.trim());
        return { name, price };
      })
      .filter((r) => r.name.length > 0);
    const n = rows.length;

    // The whole timeline is derived from n: land all items, strike all prices, then the total.
    const itemAt = (i: number) => 350 + i * p.stagger;
    const strikesStart = 350 + n * p.stagger + 150;
    const strikeAt = (i: number) => strikesStart + i * 270;
    const totalAt = strikesStart + n * 270 + 250;
    const impact = totalAt + 170;

    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 30, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });

    const sTAt = (ms: number) => spring({
      frame: fr(ms - totalAt), fps: FPS,
      config: { damping: 15, mass: 0.85, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    const sT = sTAt(t);
    const shk = settle(t - impact, 3);
    // MOTION BLUR on the close: the total's slam velocity drives a smear + stretch that dies
    // the frame its overshoot spring settles — the price arrives, it doesn't appear.
    const smT = smear(0, vel((ms) => sTAt(ms) * height * 0.12, t), 1.1);

    // Depth: the sheet swings in top-hinged on its existing entrance spring and holds a ±1.6°
    // sway so the held pose never goes dead between row landings.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -80, swayDeg: 1.6 });

    const padX = width * 0.075;
    const rowH = height * 0.108;
    const fsItem = Math.round(height * 0.04);
    const fsTotal = Math.round(fsItem * 1.6);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          fontFamily: ff,
          borderRadius: 26,
          overflow: 'hidden',
          background: `linear-gradient(180deg, #17171A 0%, ${BG} 60%)`,
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          opacity: clamp01(enter * 2),
          transform: `${pose} translateY(${((1 - enter) * 30).toFixed(2)}px)`,
          transformOrigin: '50% 30%',
        }}
      >
        {/* Thick top rule — the offer sheet's letterhead. */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, background: p.accent }} />

        {rows.map((r, i) => {
          const s = spring({
            frame: fr(t - itemAt(i)), fps: FPS,
            config: { damping: 18, mass: 0.7, stiffness: 210 },
            durationInFrames: Math.max(1, Math.round(fr(420))),
          });
          const sw = easeOut((t - strikeAt(i)) / 330);
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: padX, right: padX, top: height * 0.075 + i * rowH, height: rowH,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                opacity: clamp01(s * 3),
                // Z-STAGGER: each row swings down into the sheet at its own slightly different
                // hinge angle — a build of objects arriving in space, not divs appearing.
                transform: `${swingIn(s, { rx: -(15 + (i % 3) * 3), z: -60 })} translateY(${((1 - s) * 30).toFixed(2)}px)`,
                transformOrigin: 'top center',
                ...el(`item${i + 1}`),
              }}
            >
              <span style={{ fontSize: fsItem, fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.name}
              </span>
              <span style={{ position: 'relative', display: 'inline-block', flexShrink: 0, marginLeft: width * 0.03 }}>
                <span
                  style={{
                    fontSize: fsItem, fontWeight: 800, color: INK,
                    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                    opacity: (1 - 0.55 * sw).toFixed(3),
                  }}
                >
                  {r.price}
                </span>
                {sw > 0 && (
                  <span
                    style={{
                      position: 'absolute', left: '-8%', top: '50%', height: 6,
                      width: `${(sw * 116).toFixed(1)}%`,
                      background: p.accent, borderRadius: 3,
                      transform: 'translateY(-50%)',
                      boxShadow: `0 0 12px ${rgba(p.accent, 0.5)}`,
                    }}
                  />
                )}
              </span>
            </div>
          );
        })}

        <div
          style={{
            position: 'absolute', left: padX, right: padX, bottom: height * 0.055, height: height * 0.14,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTop: '4px solid rgba(255,255,255,0.18)',
            opacity: clamp01(sT * 3),
            filter: smT.blurPx > 0.3 ? `blur(${smT.blurPx.toFixed(2)}px)` : undefined,
            transform: `translate(${shk.x.toFixed(2)}px, ${shk.y.toFixed(2)}px) scale(${((1.5 - 0.5 * sT) * smT.sx).toFixed(4)}, ${((1.5 - 0.5 * sT) * smT.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('total'),
          }}
        >
          <span style={{ fontSize: Math.round(height * 0.036), fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: INK, whiteSpace: 'nowrap' }}>
            {p.totalLabel}
          </span>
          <span
            style={{
              fontFamily: ffTotal, fontSize: fsTotal, fontWeight: 900, color: p.accent,
              whiteSpace: 'nowrap', lineHeight: 1, marginLeft: width * 0.03,
              textShadow: `0 0 ${Math.round(fsTotal * 0.3)}px ${rgba(p.accent, 0.4)}, 0 8px 26px rgba(0,0,0,0.45)`,
            }}
          >
            {p.totalPrice}
          </span>
        </div>
      </div>
    );
  },
});
