// Market-ticker strip on dark glass: SYMBOL + price + a green/red change chip (real SVG
// triangles), scrolling left forever. There is no DOM to measure in a pure render, so each
// entry gets an explicit width estimated from its character counts — the strip's total
// width is therefore known exactly, timeMs modulo it gives the offset, and repeating the
// list until it covers offset + viewport makes the wrap seamless. Pure loop, scrub-safe.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { luxeGrain, luxePanel } from '../luxe';
import { depthPose, parallax, smear } from '../juice';

export const tickerTape = defineGraphicsTemplate({
  id: 'ticker_tape',
  name: 'Ticker Tape',
  category: 'money',
  tags: ['Ticker', 'Stocks', 'Scroll', 'Strip', 'Prices'],
  badge: 'New',
  design: { w: 900, h: 160 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6000,
  defaultBox: { xPercent: 50, yPercent: 22, widthPercent: 92 },
  fonts: ['montserrat'],

  elements: [
    { key: 'bar',     label: 'Glass bar' },
    { key: 'entries', label: 'Entries', hideable: false },
  ],

  params: [
    { type: 'text', key: 'entries', label: 'Entries', group: 'Content', multiline: true, maxLength: 300,
      default: 'NVDA|489.20|+2.4\nBTC|51.2L|+1.8\nTSLA|212.10|-3.1\nGOLD|72,400|+0.6\nNIFTY|24,812|+1.2',
      help: 'One per line: symbol | price | change. The sign of the change picks the chip colour.' },

    { type: 'color', key: 'up',   label: 'Up',   group: 'Style', default: '#4ADE80' },
    { type: 'color', key: 'down', label: 'Down', group: 'Style', default: '#E5484D' },
    { type: 'color', key: 'ink',  label: 'Text', group: 'Style', default: '#F4F1E8' },

    { type: 'number', key: 'speed', label: 'Speed', group: 'Motion', default: 110, min: 30, max: 300, step: 5, unit: 'px/s' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // A ticker has no beats — its whole character is the endless glide. Two quiet entrance cues
  // only: a fast air pass as the bar arrives and a luxe glass ping as it settles into place.
  sfx: (p) => [
    { atMs: p.delay + 20, id: 'swish', gain: 0.35 },
    { atMs: p.delay + 180, id: 'glass', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const fsSym = Math.round(height * 0.21);
    const fsPrice = Math.round(height * 0.2);
    const fsChip = Math.round(height * 0.14);

    const rows = p.entries.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 10)
      .map((l) => {
        const [sym = '', price = '', chgRaw = ''] = l.split('|').map((s) => s.trim());
        const num = Number.parseFloat(chgRaw);
        const up = Number.isFinite(num) ? num >= 0 : true;
        const chg = Number.isFinite(num) ? `${Math.abs(num).toFixed(1)}%` : (chgRaw || '0.0%');
        // Estimated width — generous per-glyph factors so the estimate never clips content.
        const w = Math.round(
          40 + sym.length * fsSym * 0.74
          + 20 + price.length * fsPrice * 0.62
          + 20 + (16 + chg.length * fsChip * 0.66 + 34)
          + 40,
        );
        return { sym, price, chg, up, w };
      });
    if (!rows.length) return null;

    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 26, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });

    const total = rows.reduce((s, r) => s + r.w, 0);
    const offset = total > 0 ? (Math.max(0, t) * (p.speed / 1000)) % total : 0;
    // Enough copies that [offset, offset + width] is always covered — short lists loop too.
    const copies = total > 0 ? Math.max(2, Math.ceil(width / total) + 1) : 2;
    const strip = Array.from({ length: copies }, () => rows).flat();
    const triW = Math.round(fsChip * 0.62);
    const fade = Math.round(width * 0.07);

    // Depth: the glass bar swings in top-hinged and holds a small ±1.2° sway while the strip
    // shears over it at its own parallax depth. The strip GENUINELY never rests, so it carries
    // a constant scroll-speed motion blur — how a real camera sees an endless glide.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -60, swayDeg: 1.2, periodMs: 4200 });
    const parStrip = parallax(t, seed, 0.3, height * 0.045, 4200);
    const scrollBlur = t > 0 ? smear(p.speed / 1000, 0).blurPx : 0;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          opacity: enter,
          transform: `${pose} translateY(${((1 - enter) * height * 0.3).toFixed(2)}px)`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          overflow: 'hidden',
          borderRadius: Math.round(height * 0.2),
        }}
      >
        <div style={{ position: 'absolute', inset: 0, ...luxePanel(Math.round(height * 0.2)), ...el('bar') }} />

        <div
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            display: 'flex', alignItems: 'center',
            transform: `translate(${parStrip.x.toFixed(2)}px, ${parStrip.y.toFixed(2)}px) translateX(${(-offset).toFixed(2)}px)`,
            filter: scrollBlur > 0.3 ? `blur(${scrollBlur.toFixed(2)}px)` : undefined,
            ...el('entries'),
          }}
        >
          {strip.map((r, i) => {
            const col = r.up ? p.up : p.down;
            return (
              <div
                key={i}
                style={{
                  position: 'relative', width: r.w, flex: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: Math.round(height * 0.12),
                }}
              >
                <span style={{ fontSize: fsSym, fontWeight: 800, color: p.ink, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                  {r.sym}
                </span>
                <span style={{ fontSize: fsPrice, fontWeight: 600, color: rgba(p.ink, 0.72), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {r.price}
                </span>
                <span
                  style={{
                    display: 'flex', alignItems: 'center', gap: Math.round(fsChip * 0.32),
                    fontSize: fsChip, fontWeight: 700, color: col,
                    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                    background: rgba(col, 0.14),
                    border: `1px solid ${rgba(col, 0.3)}`,
                    borderRadius: 999,
                    padding: `${Math.round(height * 0.045)}px ${Math.round(height * 0.1)}px`,
                  }}
                >
                  <svg width={triW} height={Math.round(triW * 0.85)} viewBox="0 0 10 8.5">
                    {r.up
                      ? <polygon points="5,0 10,8.5 0,8.5" fill={col} />
                      : <polygon points="0,0 10,0 5,8.5" fill={col} />}
                  </svg>
                  {r.chg}
                </span>
                {/* separator dot between entries */}
                <span
                  style={{
                    position: 'absolute', right: -3, top: '50%',
                    width: 6, height: 6, borderRadius: 999,
                    transform: 'translateY(-50%)',
                    background: 'rgba(255,255,255,0.18)',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* edge fades so entries dissolve into the bar instead of hitting its border */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: fade, background: 'linear-gradient(90deg, rgba(11,11,13,0.9) 0%, rgba(11,11,13,0) 100%)' }} />
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: fade, background: 'linear-gradient(270deg, rgba(11,11,13,0.9) 0%, rgba(11,11,13,0) 100%)' }} />

        <div style={luxeGrain(0.04)} />
      </div>
    );
  },
});
