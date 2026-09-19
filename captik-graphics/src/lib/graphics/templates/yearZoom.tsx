// Reference: text/2026.mp4  (window 120-3920ms, digits set by ~840ms then recede for the rest)
// A year that starts filling the frame and pulls away from you, digits laid out in a block. Each
// digit dims on its own offset rather than the block fading as one, which is what stops it reading
// as a plain scale-down.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_DIGITS = 8;

export const yearZoom = defineGraphicsTemplate({
  id: 'year_zoom',
  name: 'Year Zoom',
  category: 'title',
  tags: ['Text', 'Number', 'Zoom'],
  design: { w: 900, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 90 },
  fonts: ['montserrat'],

  elements: [
    { key: 'block', label: 'Block', hideable: false },
    ...Array.from({ length: MAX_DIGITS }, (_, i) => ({ key: `digit${i + 1}`, label: `Digit ${i + 1}` })),
  ],

  params: [
    { type: 'text',   key: 'text',    label: 'Number', group: 'Content', default: '2026', maxLength: 8 },
    { type: 'number', key: 'perRow',  label: 'Per row', group: 'Content', default: 2, min: 1, max: 8, step: 1 },

    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'color',  key: 'ink',    label: 'Digits', group: 'Style', default: '#F4F1E8' },
    { type: 'number', key: 'size',   label: 'Size',   group: 'Style', default: 280, min: 60, max: 520, step: 10, unit: 'px' },
    { type: 'number', key: 'weight', label: 'Weight', group: 'Style', default: 800, min: 300, max: 900, step: 100 },
    { type: 'number', key: 'gapX',   label: 'Column gap', group: 'Style', default: 40, min: 0, max: 240, step: 4, unit: 'px' },
    { type: 'number', key: 'gapY',   label: 'Row gap',    group: 'Style', default: 0, min: -80, max: 200, step: 4, unit: 'px' },

    { type: 'number', key: 'from',    label: 'Start scale', group: 'Motion', default: 1.85, min: 0.2, max: 4, step: 0.05 },
    { type: 'number', key: 'to',      label: 'End scale',   group: 'Motion', default: 1.24, min: 0.1, max: 4, step: 0.02 },
    { type: 'number', key: 'settleMs', label: 'Snap in over', group: 'Motion', default: 720, min: 100, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'flicker',  label: 'Digit flicker', group: 'Motion', default: 0.12, min: 0, max: 1, step: 0.05,
      help: 'How much each digit dims on its own offset as the block recedes.' },
  ],

  // Air as the numerals rush the lens, the hit when they set. The recede is timed off durationMs,
  // which sfx() cannot see, so its swish is cut to the same 45% of the template's own 3800ms
  // default window that `away` starts at.
  sfx: (p) => [
    { atMs: 0, id: 'whoosh', gain: 0.6 },
    { atMs: p.settleMs, id: 'slam', gain: 0.9 },
    { atMs: 3800 * 0.45, id: 'swish', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, durationMs, seed }) => {
    const ff = fontStack(p.font);
    const chars = [...p.text].slice(0, MAX_DIGITS);
    if (!chars.length) return null;

    const snapAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 19, mass: 0.7, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(p.settleMs))),
    });
    const snap = snapAt(timeMs);
    // The recede is a single move partway through the window and then it HOLDS — the reference
    // does not keep shrinking into a speck for the rest of the clip.
    const awayAt = (ms: number) => interpolate(ms, [durationMs * 0.45, durationMs * 0.66], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const away = awayAt(timeMs);
    const scaleAt = (ms: number) => interpolate(snapAt(ms), [0, 1], [p.from * 1.25, p.from])
      * interpolate(awayAt(ms), [0, 1], [1, p.to / p.from]);
    const scale = scaleAt(timeMs);

    // This template is literally about depth — the block pulls AWAY from you — so it arrives
    // through space and keeps a ±2° breath once it holds, instead of freezing as flat type.
    const pose = depthPose(timeMs, seed, { enter: snap, rx: -12, ry: 10, z: -160, swayDeg: 2, periodMs: 4200 });
    // Both moves — the snap and the recede — are sampled by ONE closure, so the block smears at
    // the glyph edge while it is travelling and is crisp the instant `away` clamps and it holds.
    const blockSm = smear(0, vel(scaleAt, timeMs) * p.size * 1.5, 1);

    const rows: string[][] = [];
    for (let i = 0; i < chars.length; i += p.perRow) rows.push(chars.slice(i, i + p.perRow));

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          opacity: clamp01(snap * 2),
          filter: blockSm.blurPx > 0.3 ? `blur(${blockSm.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} scale(${(scale * blockSm.sx).toFixed(4)}, ${(scale * blockSm.sy).toFixed(4)})`,
          ...el('block'),
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: p.gapY }}>
          {rows.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: p.gapX, justifyContent: 'center' }}>
              {row.map((ch, c) => {
                const i = r * p.perRow + c;
                const phase = random(`${seed}p${i}`);
                // Each digit dims through its own part of the recede.
                const dim = p.flicker * clamp01((away - phase * 0.5) / 0.5);
                // As the block pulls back the digits also track OUTWARD from the centre, so the
                // lockup opens up towards the corners instead of collapsing into a cluster.
                const ox = (c - (row.length - 1) / 2) * away * p.size * 0.16;
                const oy = (r - (rows.length - 1) / 2) * away * p.size * 0.16;
                // Z-STAGGER: every digit arrives on its own seeded hinge and converges as the
                // block snaps — the lockup reads as four objects landing in space, not a word
                // switching on — and each sits at its own depth, so the breath shears them.
                const hinge = {
                  rx: -12 - random(`${seed}hx${i}`) * 10,
                  ry: (random(`${seed}hy${i}`) - 0.5) * 30,
                  z: -60,
                };
                const par = parallax(timeMs, seed, 0.18 + i * 0.15, p.size * 0.03, 4200);
                return (
                  <span
                    key={c}
                    style={{
                      fontSize: p.size, fontWeight: p.weight, color: p.ink,
                      lineHeight: 0.92, letterSpacing: -p.size * 0.02,
                      opacity: clamp01(1 - dim),
                      transform: `${swingIn(snap, hinge)} translate(${(ox + par.x).toFixed(2)}px, ${(oy + par.y).toFixed(2)}px)`,
                      ...el(`digit${i + 1}`),
                    }}
                  >
                    {ch}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  },
});
