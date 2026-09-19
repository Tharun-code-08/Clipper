// Thermal receipt unrolling over footage — the documentary "let's add it up" beat. Paper
// feeds downward line by line, each item printing on its own beat, then the TOTAL stamps in
// amber above a seeded barcode. The paper height is keyframed to the SAME beat times as the
// item fades (one multi-stop interpolate), so the feed advances exactly when a line prints —
// a continuous unroll reads as a window shade, not a printer.

import { Easing, interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

const MAX = 6;

export const receiptRoll = defineGraphicsTemplate({
  id: 'receipt_roll',
  name: 'Receipt Roll',
  category: 'money',
  tags: ['Receipt', 'Paper', 'Prices', 'Printed', 'Total', 'Torn'],
  badge: 'New',
  design: { w: 900, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5500,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 52 },
  fonts: ['inter'],

  elements: [
    { key: 'paper', label: 'Paper', hideable: false },
    { key: 'items', label: 'Items' },
    { key: 'total', label: 'Total' },
  ],

  params: [
    { type: 'text', key: 'title', label: 'Title', group: 'Content', default: 'THE REAL COST', maxLength: 24 },
    { type: 'text', key: 'lines', label: 'Items', group: 'Content', multiline: true, maxLength: 240,
      default: 'Netflix binge|₹649\nScrolling reels|₹0\nCourse never opened|₹4,999\nGym you skipped|₹1,200',
      help: 'One per line: item | price. Up to 6.' },
    { type: 'text', key: 'total',  label: 'Total',  group: 'Content', default: '₹6,848', maxLength: 16 },
    { type: 'text', key: 'footer', label: 'Footer', group: 'Content', default: 'NO REFUNDS', maxLength: 24 },

    { type: 'color', key: 'paper',  label: 'Paper',  group: 'Style', default: '#FAF8F2' },
    { type: 'color', key: 'ink',    label: 'Ink',    group: 'Style', default: '#2A2620' },
    { type: 'color', key: 'accent', label: 'Total accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'printMs', label: 'Print beat', group: 'Motion', default: 520, min: 200, max: 1200, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER palette: a page flick as the roll starts feeding, ONE typewriter tick on the first
  // printed line, a pop when the TOTAL stamps, and a second flick on the final feed-out — all
  // timed off the same printMs beat clock as the paper itself.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX, p.lines.split('\n').map((l) => l.trim()).filter(Boolean).length));
    const totalAt = 420 + n * p.printMs + 170;
    return [
      { atMs: p.delay + 120, id: 'paper', gain: 0.5 },
      { atMs: p.delay + 420, id: 'tick', gain: 0.4 },
      { atMs: p.delay + totalAt, id: 'pop', gain: 0.55 },
      { atMs: p.delay + totalAt + 320, id: 'paper', gain: 0.4 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('inter');

    const rows = p.lines.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX)
      .map((l) => {
        const [item = '', price = ''] = l.split('|').map((s) => s.trim());
        return { item, price };
      });
    const n = rows.length;

    // ── Fixed vertical plan, in design px. The beat keyframes below reference these tops.
    const paperW = width * 0.62;
    const padX = 40;
    const rowsTop = 112;
    const rowH = 62;
    const rowsEnd = rowsTop + n * rowH;
    const totalRuleY = rowsEnd + 16;
    const totalRowY = totalRuleY + 18;
    const barcodeY = totalRowY + 76;
    const footerY = barcodeY + 46;
    const fullH = footerY + 24 + 30;

    // ── Feed keyframes: (time, height) pairs, strictly increasing by construction.
    const itemAt = (i: number) => 420 + i * p.printMs;
    const totalAt = itemAt(n) + 170;
    const times = [0, 260, ...rows.map((_, i) => itemAt(i)), totalAt, totalAt + 320];
    const heights = [8, rowsTop - 4, ...rows.map((_, i) => rowsTop + (i + 1) * rowH), totalRowY + 58, fullH];
    const hOf = (ms: number) => interpolate(ms, times, heights, {
      easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const h = hOf(t);
    const unrolled = clamp01((h - (fullH - 8)) / 8);
    // M2 FEED SMEAR: the paying-out edge blurs with the feed's own velocity (the same keyframe
    // curve that moves it) and is crisp the instant a print beat completes.
    const smFeed = smear(0, vel(hOf, t));

    const stamp = spring({
      frame: fr(t - totalAt), fps: FPS,
      config: { damping: 18, mass: 0.6, stiffness: 240 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    const rot = ((random(`${seed}-rot`) - 0.5) * 2).toFixed(2);
    // Depth, kept casual: the strip tips in like paper tossed at the lens and keeps a small
    // ±1.2° sway — printed paper hanging in space, not a glossy card.
    const enterP = 1 - Math.pow(1 - clamp01(t / 550), 3);
    const pose = depthPose(t, seed, { enter: enterP, rx: -10, z: -60, swayDeg: 1.2, periodMs: 4200 });
    const paperTop = Math.max(30, (height - fullH) / 2);
    const paperLeft = (width - paperW) / 2;
    const tearBg = `repeating-linear-gradient(90deg, ${p.paper} 0px, ${p.paper} 12px, transparent 12px, transparent 20px)`;
    const dashed = `2px dashed ${rgba(p.ink, 0.35)}`;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, fontFamily: ff,
          opacity: clamp01(t / 140),
          transform: `${pose} rotate(${rot}deg)`,
          transformOrigin: '50% 18%',
        }}
      >
        <div style={{ position: 'absolute', left: paperLeft, top: paperTop, width: paperW, ...el('paper') }}>
          {/* Perforation teeth outside the body — the strip torn off the last customer's roll. */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: -9, height: 10, background: tearBg }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: h, height: 10, background: tearBg, filter: smFeed.blurPx > 0.3 ? `blur(${smFeed.blurPx.toFixed(2)}px)` : undefined, transform: `scale(1, ${smFeed.sy.toFixed(4)})` }} />

          <div
            style={{
              position: 'relative', width: '100%', height: h,
              overflow: 'hidden',
              background: `linear-gradient(180deg, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0) 60px), ${p.paper}`,
              boxShadow: '0 16px 44px rgba(0,0,0,0.38), 0 4px 14px rgba(0,0,0,0.28)',
              color: p.ink,
            }}
          >
            {/* Header */}
            <div
              style={{
                position: 'absolute', left: padX, right: padX, top: 34,
                textAlign: 'center', fontSize: 28, fontWeight: 700,
                letterSpacing: '0.2em', textTransform: 'uppercase', lineHeight: 1,
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}
            >
              {p.title}
            </div>
            <div style={{ position: 'absolute', left: padX, right: padX, top: 88, borderTop: dashed }} />

            {/* Line items — each prints on its beat, in step with the paper feed. */}
            <div style={{ position: 'absolute', inset: 0, ...el('items') }}>
              {rows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute', left: padX, right: padX, top: rowsTop + i * rowH,
                    height: rowH,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 26, fontWeight: 500,
                    letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums',
                    opacity: clamp01((t - itemAt(i)) / 180),
                  }}
                >
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 16 }}>
                    {r.item}
                  </span>
                  <span style={{ flexShrink: 0, fontWeight: 600 }}>{r.price}</span>
                </div>
              ))}
            </div>

            {/* Total — bold row above its own dashed rule, stamped in with a small spring pop. */}
            <div style={{ position: 'absolute', left: padX, right: padX, top: totalRuleY, ...el('total') }}>
              <div style={{ borderTop: dashed }} />
              <div
                style={{
                  marginTop: 16,
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  opacity: clamp01(stamp * 1.5),
                  transform: `scale(${interpolate(stamp, [0, 1], [1.12, 1]).toFixed(4)})`,
                }}
              >
                <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '0.18em' }}>TOTAL</span>
                <span
                  style={{
                    fontSize: 40, fontWeight: 800, color: p.accent,
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em',
                    textShadow: `0 0 18px ${rgba(p.accent, 0.3)}`,
                  }}
                >
                  {p.total}
                </span>
              </div>
            </div>

            {/* Seeded barcode + footer line. */}
            <div
              style={{
                position: 'absolute', left: padX, right: padX, top: barcodeY,
                height: 32, display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 2.5,
                opacity: 0.8 * clamp01((t - totalAt - 200) / 240),
              }}
            >
              {Array.from({ length: 38 }, (_, i) => (
                <div key={i} style={{ width: random(`${seed}-bc${i}`) > 0.5 ? 3.5 : 1.5, background: p.ink }} />
              ))}
            </div>
            <div
              style={{
                position: 'absolute', left: padX, right: padX, top: footerY + 8,
                textAlign: 'center', fontSize: 18, fontWeight: 600,
                letterSpacing: '0.3em', textTransform: 'uppercase',
                color: rgba(p.ink, 0.55),
                opacity: clamp01((t - totalAt - 280) / 240),
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}
            >
              {p.footer}
            </div>

            {/* Curl shadow at the leading edge — fades once the roll has fully paid out. */}
            <div
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: 30,
                background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 70%, rgba(0,0,0,0.22) 100%)',
                opacity: 1 - unrolled,
                filter: smFeed.blurPx > 0.3 ? `blur(${smFeed.blurPx.toFixed(2)}px)` : undefined,
              }}
            />
          </div>
        </div>
      </div>
    );
  },
});
