// PUNCH quote — the quote lands in 2-3-word groups on a fast beat; every landed group STAYS at
// full weight (a quote reads as ONE statement, not karaoke) and only the final group lands amber.
// All groups render from frame 0 as invisible inline-blocks, so line-breaks are locked before the
// first slam — a landing group can never reflow the words around it — and each group wraps as a
// unit because the block is atomic.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { parallax, smear, sway3d, swingIn, vel } from '../juice';

const INK = '#F4F1E8';

/** Decaying settle-shake: pure function of ms-since-impact — zero before the hit, a couple of
 *  fast oscillations after, dead within ~450ms. Never random per frame. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

/** Greedy groups of 3; a 4-word remainder splits 2+2 so no group ever lands as a lone word.
 *  Shared by render() and sfx() so the sound always lands on the same beats as the motion. */
function quoteGroups(quote: string): string[] {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  const groups: string[] = [];
  for (let k = 0; k < words.length; ) {
    const remN = words.length - k;
    const take = remN === 4 ? 2 : Math.min(3, remN);
    groups.push(words.slice(k, k + take).join(' '));
    k += take;
  }
  return groups;
}

export const quotePunch = defineGraphicsTemplate({
  id: 'quote_punch',
  name: 'Quote Punch',
  category: 'title',
  tags: ['Quote', 'Words', 'Slam', 'Caps', 'Statement'],
  badge: 'New',
  design: { w: 900, h: 600 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 80 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'quote',       label: 'Quote', hideable: false },
    { key: 'attribution', label: 'Attribution' },
  ],

  params: [
    { type: 'text', key: 'quote', label: 'Quote', group: 'Content', multiline: true, maxLength: 140,
      default: 'Nobody remembers the ones who played it safe' },
    { type: 'text', key: 'attribution', label: 'Attribution', group: 'Content', default: 'THE GAME', maxLength: 32 },

    { type: 'color',   key: 'accent', label: 'Accent',     group: 'Style', default: '#F59E0B' },
    { type: 'font',    key: 'font',   label: 'Quote font', group: 'Style', default: 'anton' },
    { type: 'number',  key: 'size',   label: 'Size',       group: 'Style', default: 76, min: 40, max: 140, step: 2, unit: 'px' },
    { type: 'boolean', key: 'caps',   label: 'All caps',   group: 'Style', default: true },

    { type: 'number', key: 'beatMs', label: 'Beat',  group: 'Motion', default: 380, min: 150, max: 800, step: 10, unit: 'ms' },
    { type: 'number', key: 'shake',  label: 'Shake', group: 'Motion', default: 2, min: 0, max: 6, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // One whoosh into the first slam, then hits on the SAME beats the groups land on — the final
  // (amber) group takes the lone full-gain impact.
  sfx: (p) => {
    const n = Math.max(1, quoteGroups(p.quote).length);
    const impact = (k: number) => p.delay + 260 + k * p.beatMs + 140;
    const cues: { atMs: number; id: 'whoosh' | 'slam'; gain: number }[] = [
      { atMs: p.delay + 170, id: 'whoosh', gain: 0.55 },
    ];
    if (n > 1) cues.push({ atMs: impact(0), id: 'slam', gain: 0.55 });
    cues.push({ atMs: impact(n - 1), id: 'slam', gain: 1 });
    return cues;
  },

  render: ({ params: p, el, timeMs, height, seed }) => {
    const t = timeMs - p.delay;
    const ffQuote = fontStack(p.font);
    const ffSans = fontStack('montserrat');

    const groups = quoteGroups(p.quote);
    if (!groups.length) return null;

    const gAt = (k: number) => 260 + k * p.beatMs;
    const attAt = gAt(groups.length) + 60;

    const chars = p.quote.trim().length;
    const fit = Math.min(1, Math.sqrt(80 / Math.max(20, chars)));
    const fs = Math.round(p.size * fit);

    const att = spring({
      frame: fr(t - attAt), fps: FPS,
      config: { damping: 24, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    // The whole statement keeps living in 3D through the hold (±2° sway); the attribution
    // parallaxes against it so the two planes shear — depth, not a flat web page.
    const swayQ = sway3d(t, seed, 2);
    const parAtt = parallax(t, seed, 0.6, height * 0.012);

    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <div
          style={{
            position: 'absolute', left: '6%', right: '6%', top: '42%',
            transform: `${swayQ} translateY(-50%)`,
            textAlign: 'center',
            fontFamily: ffQuote,
            fontSize: fs, fontWeight: 900, lineHeight: 1.14, letterSpacing: '0.015em',
            textTransform: p.caps ? 'uppercase' : 'none',
            color: INK,
            ...el('quote'),
          }}
        >
          {groups.map((g, k) => {
            // One group slams per beat: fast spring (damping 15) + a micro settle-shake, then it
            // holds at full weight forever.
            const skAt = (ms: number) => spring({
              frame: fr(ms - gAt(k)), fps: FPS,
              config: { damping: 15, mass: 0.7, stiffness: 235 },
              durationInFrames: Math.max(1, Math.round(fr(360))),
            });
            const sk = skAt(t);
            const shk = settle(t - gAt(k) - 140, p.shake);
            const last = k === groups.length - 1;
            // Each group arrives through space on its own seeded hinge (top-heavy, a touch of
            // side), and its slam velocity drives a smear that dies the frame it lands — the
            // group STAMPS in and holds crisp.
            const vG = vel(skAt, t) * (fs * 0.44 + 16);
            const sm = smear(0, vG, 1.05);
            const scaleG = 1.32 - 0.32 * sk;
            const hinge = {
              rx: -13 - random(`${seed}-gx${k}`) * 7,
              ry: (random(`${seed}-gy${k}`) - 0.5) * 18,
              z: -80,
            };
            return (
              <span
                key={k}
                style={{
                  display: 'inline-block',
                  marginRight: k < groups.length - 1 ? '0.27em' : 0,
                  color: last ? p.accent : INK,
                  opacity: clamp01(sk * 2.5),
                  filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(sk, hinge)} translate(${shk.x.toFixed(2)}px, ${((1 - sk) * 16 + shk.y).toFixed(2)}px) scale(${(scaleG * sm.sx).toFixed(4)}, ${(scaleG * sm.sy).toFixed(4)})`,
                  transformOrigin: 'center center',
                  textShadow: last
                    ? `0 0 ${Math.round(fs * 0.2)}px ${rgba(p.accent, 0.35)}, 0 6px 24px rgba(0,0,0,0.45)`
                    : '0 6px 24px rgba(0,0,0,0.45)',
                }}
              >
                {g}
              </span>
            );
          })}
        </div>

        {p.attribution.trim() ? (
          <span
            style={{
              position: 'absolute', left: 0, right: 0, bottom: '13%',
              textAlign: 'center',
              fontFamily: ffSans,
              fontSize: Math.round(height * 0.045), fontWeight: 600,
              letterSpacing: '0.22em', textTransform: 'uppercase',
              color: rgba(INK, 0.66),
              opacity: clamp01(att * 2),
              transform: `translate(${parAtt.x.toFixed(2)}px, ${((1 - att) * 12 + parAtt.y).toFixed(2)}px)`,
              ...el('attribution'),
            }}
          >
            {'— '}{p.attribution}
          </span>
        ) : null}
      </div>
    );
  },
});
