// Reference: graphics/clock-and-text.mp4  (window 560-4280ms, chips out by ~2960ms)
// A clock whose minute hand sweeps while word chips pop off the end of it and stack upward.
//
// Each chip is anchored to the hand's tip AT THE MOMENT IT APPEARS, then holds that spot — it does
// not keep riding the hand. Chips that track the hand smear into an unreadable arc; chips that
// freeze where they were dropped read as the clock shedding words.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_CHIPS = 6;

export const clockWords = defineGraphicsTemplate({
  id: 'clock_words',
  name: 'Clock Words',
  category: 'title',
  tags: ['Clock', 'Time', 'Words'],
  design: { w: 900, h: 1560 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['inter', 'playfair'],

  elements: [
    { key: 'scene', label: 'Scene', hideable: false },
    { key: 'face',  label: 'Clock face' },
    { key: 'hands', label: 'Hands' },
    ...Array.from({ length: MAX_CHIPS }, (_, i) => ({ key: `chip${i + 1}`, label: `Word ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'words', label: 'Words', group: 'Content', multiline: true, maxLength: 160,
      default: 'present\nmoment\ninstant\nhour', help: 'One per line, in the order they pop.' },

    { type: 'color',  key: 'bg',    label: 'Background', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'face',  label: 'Face',       group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'hour',  label: 'Hour hand',  group: 'Style', default: '#D97706' },
    { type: 'color',  key: 'minute', label: 'Minute hand', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'chip',  label: 'Chip',       group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'ink',   label: 'Chip text',  group: 'Style', default: '#101014' },
    { type: 'font',   key: 'font',  label: 'Font',       group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size',  label: 'Face size',  group: 'Style', default: 780, min: 120, max: 800, step: 10, unit: 'px' },
    { type: 'number', key: 'chipSize', label: 'Chip text size', group: 'Style', default: 42, min: 8, max: 80, step: 1, unit: 'px' },
    { type: 'boolean', key: 'fill', label: 'Paint the background', group: 'Style', default: true },

    { type: 'number', key: 'faceAt',  label: 'Face at',   group: 'Motion', default: 120, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'firstAt', label: 'First word at', group: 'Motion', default: 900, min: 0, max: 5000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Word stagger', group: 'Motion', default: 520, min: 60, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'sweep',   label: 'Minute sweep', group: 'Motion', default: 200, min: -720, max: 720, step: 10, unit: '°' },
    { type: 'number', key: 'rise',    label: 'Chip stack rise', group: 'Motion', default: 90, min: 0, max: 300, step: 5, unit: 'px' },
    { type: 'number', key: 'settleMs', label: 'Chips settle over', group: 'Motion', default: 2200, min: 200, max: 5000, step: 100, unit: 'ms',
      help: 'A popped word flies clear of the face, then drifts back down onto the stack.' },
  ],

  // ONE tick when the face lands (a clock ticks; a template that ticks per chip is a metronome),
  // then a glossy pop on each of the first three word chips — the same faceAt / firstAt / stagger
  // beats the motion is cut to.
  sfx: (p) => [
    { atMs: p.faceAt, id: 'tick', gain: 0.5 },
    { atMs: p.firstAt, id: 'pop', gain: 0.6 },
    { atMs: p.firstAt + p.stagger, id: 'pop', gain: 0.5 },
    { atMs: p.firstAt + p.stagger * 2, id: 'pop', gain: 0.42 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const words = p.words.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_CHIPS);

    const faceIn = spring({
      frame: fr(timeMs - p.faceAt), fps: FPS,
      config: { damping: 20, mass: 0.9, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });

    const cx = width / 2;
    const cy = height * 0.46;
    const r = p.size / 2;

    // The clock is an OBJECT hanging in space: it swings in top-hinged and then keeps a ±1.8°
    // breath forever. Face and hands share the one pose string — the hands pivot on the clock
    // centre rather than the frame centre — so the dial never slides out from under its hands.
    const clockPose = depthPose(timeMs, seed, { enter: faceIn, rx: -10, z: -80, swayDeg: 1.8, periodMs: 4200 });

    // Total sweep spread across the whole word sequence.
    const lastAt = p.firstAt + Math.max(0, words.length - 1) * p.stagger;
    const swept = interpolate(timeMs, [p.faceAt, lastAt + p.stagger], [0, p.sweep], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const minuteDeg = -70 + swept;
    const hourDeg = -140 + swept * 0.3;

    /** Where the minute hand's tip is at a given absolute time. */
    const tipAt = (ms: number) => {
      const sw = interpolate(ms, [p.faceAt, lastAt + p.stagger], [0, p.sweep], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      });
      const a = (-70 + sw - 90) * (Math.PI / 180);
      return { x: cx + Math.cos(a) * r * 0.82, y: cy + Math.sin(a) * r * 0.82 };
    };

    const hand = (deg: number, len: number, thick: number, colour: string) => (
      <div
        style={{
          position: 'absolute', left: cx, top: cy,
          width: len, height: thick, borderRadius: thick,
          background: colour,
          boxShadow: `0 0 ${(thick * 2).toFixed(1)}px ${rgba(colour, 0.35)}`,
          transformOrigin: '0 50%',
          transform: `rotate(${(deg - 90).toFixed(2)}deg) translateY(${-thick / 2}px)`,
        }}
      />
    );

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          fontFamily: ff,
          ...el('scene'),
        }}
      >
        <div
          style={{
            position: 'absolute', left: cx, top: cy,
            width: p.size, height: p.size, borderRadius: '50%',
            background: p.face,
            border: `1px solid ${LUXE.hairline}`,
            boxShadow: `0 ${(p.size * 0.03).toFixed(0)}px ${(p.size * 0.09).toFixed(0)}px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`,
            opacity: clamp01(faceIn * 1.6),
            transform: `${clockPose} translate(-50%,-50%) scale(${interpolate(faceIn, [0, 1], [0.6, 1]).toFixed(4)})`,
            ...el('face'),
          }}
        />

        <div
          style={{
            position: 'absolute', inset: 0, opacity: clamp01(faceIn),
            transform: clockPose,
            transformOrigin: `${cx.toFixed(1)}px ${cy.toFixed(1)}px`,
            ...el('hands'),
          }}
        >
          {hand(hourDeg, r * 0.55, Math.max(4, p.size * 0.022), p.hour)}
          {hand(minuteDeg, r * 0.84, Math.max(4, p.size * 0.018), p.minute)}
          <div
            style={{
              position: 'absolute', left: cx, top: cy,
              width: p.size * 0.045, height: p.size * 0.045, borderRadius: '50%',
              background: p.minute, transform: 'translate(-50%,-50%)',
            }}
          />
        </div>

        {words.map((w, i) => {
          const sAt = (ms: number) => spring({
            frame: fr(ms - (p.firstAt + i * p.stagger)), fps: FPS,
            config: { damping: 15, mass: 0.6, stiffness: 210 },
            durationInFrames: Math.max(1, Math.round(fr(500))),
          });
          const at = p.firstAt + i * p.stagger;
          const s = sAt(timeMs);
          // Anchored to where the tip WAS when this chip popped — not to the live hand.
          const anchor = tipAt(at);
          // A chip flies well clear of the face when it pops, then drifts back down onto the stack —
          // which is why the block is tallest mid-run and short again once everything has settled.
          const liftAt = (ms: number) => (words.length - i) * p.rise * clamp01(sAt(ms))
            * (1 - clamp01((ms - at - 700) / Math.max(1, p.settleMs)));
          const lift = liftAt(timeMs);
          // The POP's own px/ms smears the chip; the long drift back down runs an order of
          // magnitude slower and falls under the blur floor, so a stacked chip is razor-crisp.
          const chipSm = smear(0, -vel(liftAt, timeMs), 0.55);
          // Z-STAGGER: each word arrives on its own seeded hinge, and each sits at its own depth
          // so the clock's sway SHEARS the stack instead of sliding it as one flat sheet.
          const hinge = {
            rx: -14 - random(`${seed}-ch${i}`) * 9,
            ry: (random(`${seed}-cr${i}`) - 0.5) * 26,
            z: -70,
          };
          const par = parallax(timeMs, seed, 0.4 + i * 0.16, p.chipSize * 0.5, 4200);
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: anchor.x, top: anchor.y - lift,
                background: p.chip, color: p.ink,
                borderRadius: 999,
                padding: `${p.chipSize * 0.3}px ${p.chipSize * 0.7}px`,
                fontSize: p.chipSize, fontStyle: 'italic', lineHeight: 1,
                whiteSpace: 'nowrap',
                boxShadow: `0 ${p.chipSize * 0.1}px ${p.chipSize * 0.28}px ${rgba('#000000', 0.32)}, 0 ${p.chipSize * 0.34}px ${p.chipSize * 0.85}px ${rgba('#000000', 0.26)}`,
                opacity: clamp01(s * 2.2),
                filter: chipSm.blurPx > 0.3 ? `blur(${chipSm.blurPx.toFixed(2)}px)` : undefined,
                transform: `${swingIn(s, hinge)} translate(-50%,-50%) translate(${par.x.toFixed(2)}px, ${par.y.toFixed(2)}px) scale(${(interpolate(s, [0, 1], [0.5, 1]) * chipSm.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.5, 1]) * chipSm.sy).toFixed(4)})`,
                ...el(`chip${i + 1}`),
              }}
            >
              {w}
            </div>
          );
        })}
        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
