// Reference: general/list-of-things.mp4  (window 880-5600ms, fourth row lands ~3400ms)
// An emoji-led list where each row fades up dim and settles to full ink.
//
// The rows are LEFT-aligned as a block but the block is centred, so adding a long row never shifts
// the ones above it. Centring each row individually is the version that jitters as it fills.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { parallax, smear, sway3d, swingIn, vel } from '../juice';

const MAX_ROWS = 8;

export const emojiList = defineGraphicsTemplate({
  id: 'emoji_list',
  name: 'Emoji List',
  category: 'title',
  tags: ['List', 'Emoji', 'Reveal'],
  design: { w: 900, h: 1200 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 92 },
  fonts: ['montserrat'],

  elements: [
    { key: 'field', label: 'Field', hideable: false },
    ...Array.from({ length: MAX_ROWS }, (_, i) => ({ key: `row${i + 1}`, label: `Row ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'items', label: 'Items', group: 'Content', multiline: true, maxLength: 300,
      default: '🏨 Hotels\n💍 Wedding Venues\n🏝️ Resorts\n💆 Spas',
      help: 'One per line. Lead with an emoji and it becomes the row icon.' },

    { type: 'color',  key: 'bg',    label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'ink',   label: 'Settled text', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'pend',  label: 'Arriving text', group: 'Style', default: '#87816F' },
    { type: 'font',   key: 'font',  label: 'Font',     group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Text size', group: 'Style', default: 100, min: 12, max: 130, step: 2, unit: 'px' },
    { type: 'number', key: 'gap',   label: 'Row gap',  group: 'Style', default: 60, min: 0, max: 100, step: 2, unit: 'px' },
    { type: 'number', key: 'wrap',  label: 'Row width', group: 'Style', default: 62, min: 25, max: 100, step: 1, unit: '%',
      help: 'Rows wrap at this width, which is what puts "Wedding Venues" on two lines.' },
    { type: 'boolean', key: 'fill', label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First row at', group: 'Motion', default: 0, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Row stagger', group: 'Motion', default: 400, min: 40, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'settleMs', label: 'Ink settles over', group: 'Motion', default: 420, min: 60, max: 2000, step: 20, unit: 'ms' },
  ],

  // A glossy pop per arriving row, decaying in gain so the list builds instead of drumming —
  // cut to the exact firstAt / stagger beats the rows swing in on.
  sfx: (p) => [
    { atMs: p.firstAt, id: 'pop', gain: 0.55 },
    { atMs: p.firstAt + p.stagger, id: 'pop', gain: 0.48 },
    { atMs: p.firstAt + p.stagger * 2, id: 'pop', gain: 0.42 },
    { atMs: p.firstAt + p.stagger * 3, id: 'pop', gain: 0.36 },
  ],

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const items = p.items.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_ROWS);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          // Top-light + bottom-shade layered over the user's backdrop color, so the plate
          // never reads as one flat hex.
          background: p.fill
            ? `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.28) 100%), ${p.bg}`
            : 'transparent',
          border: p.fill ? '1px solid rgba(255,255,255,0.13)' : undefined,
          borderRadius: p.fill ? 28 : undefined,
          boxShadow: p.fill ? '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)' : undefined,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          ...el('field'),
        }}
      >
        {/* The BLOCK is centred; the rows inside it are left-aligned, so a long row never nudges
            the ones already placed. The block also keeps a ±1.8° breath so the settled list goes
            on living in space rather than freezing into a web page. */}
        <div
          style={{
            width: `${p.wrap}%`, display: 'flex', flexDirection: 'column', gap: p.gap,
            transform: sway3d(timeMs, seed, 1.8, 4000),
          }}
        >
          {items.map((text, i) => {
            const at = p.firstAt + i * p.stagger;
            const arriveAt = (ms: number) => spring({
              frame: fr(ms - at), fps: FPS,
              config: { damping: 24, mass: 0.6, stiffness: 175 },
              durationInFrames: Math.max(1, Math.round(fr(400))),
            });
            const arrive = arriveAt(timeMs);
            const settle = interpolate(timeMs, [at + 120, at + 120 + p.settleMs], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
            const space = text.indexOf(' ');
            const icon = space > 0 ? text.slice(0, space) : '';
            const label = space > 0 ? text.slice(space + 1) : text;
            // Z-STAGGER: the rows are left-anchored, so they hinge on their LEFT edge and swing
            // open like a page — each on its own angle, so the build reads as objects arriving in
            // space. Their rise velocity smears them and dies as they settle, and each row sits at
            // its own depth so the block's breath shears the list apart.
            const riseAt = (ms: number) => (1 - arriveAt(ms)) * p.size * 0.3;
            const rowSm = smear(0, -vel(riseAt, timeMs), 1.3);
            const par = parallax(timeMs, seed, 0.25 + i * 0.13, p.size * 0.09, 4000);
            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: p.size * 0.34,
                  fontSize: p.size, fontWeight: 700, lineHeight: 1.12,
                  color: settle > 0.5 ? p.ink : p.pend,
                  opacity: clamp01(arrive * 2),
                  filter: rowSm.blurPx > 0.3 ? `blur(${rowSm.blurPx.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(arrive, { rx: -6, ry: 17 + i * 2, z: -70 })} translate(${par.x.toFixed(2)}px, ${(par.y + riseAt(timeMs)).toFixed(2)}px) scale(${rowSm.sx.toFixed(4)}, ${rowSm.sy.toFixed(4)})`,
                  transformOrigin: 'left center',
                  ...el(`row${i + 1}`),
                }}
              >
                {icon && <span style={{ flex: 'none' }}>{icon}</span>}
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
