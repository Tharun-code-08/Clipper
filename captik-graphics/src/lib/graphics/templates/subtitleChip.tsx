// Kinetic subtitle chip: a rounded pill whose width is the typed text's OWN intrinsic width —
// the chip is an inline-flex around the visible substring inside a centered flex row, so it
// grows and re-centers for free with zero width math or measurement. Typing is a floor() of
// timeMs; the amber "rec light" square pulses on a pure sine of the same clock.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, outRamp, rgba } from '../motion';
import { LUXE } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

const PAPER = '#F5F1E6';
const PAPER_INK = '#22201B';

export const subtitleChip = defineGraphicsTemplate({
  id: 'subtitle_chip',
  name: 'Subtitle Chip',
  category: 'title',
  tags: ['Chip', 'Pill', 'Typing', 'Rec light', 'Bar'],
  badge: 'New',
  design: { w: 900, h: 250 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3500,
  defaultBox: { xPercent: 50, yPercent: 30, widthPercent: 70 },
  fonts: ['montserrat'],

  elements: [
    { key: 'chip', label: 'Chip' },
    { key: 'text', label: 'Text', hideable: false },
    { key: 'dot',  label: 'Rec light' },
  ],

  params: [
    { type: 'text', key: 'text', label: 'Text', group: 'Content', default: 'watch what happens next', maxLength: 60 },

    { type: 'boolean', key: 'dark',   label: 'Dark chip', group: 'Style', default: true,
      help: 'Off = warm paper chip with dark ink.' },
    { type: 'color',   key: 'accent', label: 'Accent',    group: 'Style', default: '#F59E0B' },
    { type: 'font',    key: 'font',   label: 'Font',      group: 'Style', default: 'montserrat' },

    { type: 'number', key: 'typeMs', label: 'Type speed', group: 'Motion', default: 45, min: 16, max: 140, step: 1, unit: 'ms/ch' },
    { type: 'number', key: 'delay',  label: 'Delay',      group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Device language — a glossy pop as the pill lands, then two soft key thocks as the line starts
  // typing. Both thocks are spaced off typeMs, so a faster typist gets a faster pair.
  sfx: (p) => [
    { atMs: p.delay, id: 'pop', gain: 0.6 },
    { atMs: p.delay + 360, id: 'type', gain: 0.35 },
    { atMs: p.delay + 360 + p.typeMs * 6, id: 'type', gain: 0.25 },
  ],

  render: ({ params: p, el, timeMs, durationMs, height, seed }) => {
    const t = timeMs - p.delay;
    const out = outRamp(timeMs, durationMs, 300);

    // Pop with a touch of overshoot, then the chip only ever GROWS (typing), never re-animates.
    const popAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 18, mass: 0.7, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const pop = popAt(t);

    // Floor-of-time typing — never a CSS width animation (static frame on export).
    const shown = Math.max(0, Math.floor((t - 360) / Math.max(8, p.typeMs)));
    const visible = p.text.slice(0, shown);

    // Rec-light pulse: ~0.85Hz sine of timeMs, deterministic on every surface.
    const pulse = 0.5 + 0.5 * Math.sin(t / 190);

    const chipH = Math.round(height * 0.52);
    const fs = Math.round(chipH * 0.4);
    const ds = Math.round(chipH * 0.2);
    const ink = p.dark ? LUXE.ink : PAPER_INK;

    // A chip is a small physical object: it turns in off a top/side hinge on the SAME pop spring
    // and then keeps a ±2° breath so the held pill never flattens out.
    const pose = depthPose(t, seed, { enter: pop, rx: -14, ry: 11, z: -90, swayDeg: 2, periodMs: 3800 });
    // The pop's own growth velocity, measured across the pill's wide axis — smears for the few
    // frames it is inflating, gone by the time the first character types.
    const scaleAt = (ms: number) => 0.7 + 0.3 * popAt(ms);
    const chipSm = smear(vel(scaleAt, t) * height, 0, 1);
    // The rec light floats proud of the pill, the text sits flat on it — the breath shears them.
    const parDot = parallax(t, seed, 0.8, chipH * 0.05, 3800);
    const parText = parallax(t, seed, 0.2, chipH * 0.05, 3800);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, opacity: out,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: fontStack(p.font),
        }}
      >
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: Math.round(chipH * 0.22),
            height: chipH, padding: `0 ${Math.round(chipH * 0.34)}px`,
            borderRadius: chipH / 2,
            background: p.dark ? `linear-gradient(180deg, ${LUXE.bg1} 0%, ${LUXE.bg0} 100%)` : PAPER,
            border: `1px solid ${p.dark ? LUXE.hairline : 'rgba(0,0,0,0.08)'}`,
            boxShadow: p.dark
              ? '0 14px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)'
              : '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
            opacity: clamp01(t / 120),
            filter: chipSm.blurPx > 0.3 ? `blur(${chipSm.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} scale(${(scaleAt(t) * chipSm.sx).toFixed(4)}, ${(scaleAt(t) * chipSm.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('chip'),
          }}
        >
          <div
            style={{
              width: ds, height: ds, borderRadius: Math.round(ds * 0.28), flexShrink: 0,
              background: p.accent,
              opacity: 0.4 + 0.6 * pulse,
              boxShadow: `0 0 ${Math.round(ds * 0.9)}px ${rgba(p.accent, 0.3 + 0.4 * pulse)}`,
              transform: `translate(${parDot.x.toFixed(2)}px, ${parDot.y.toFixed(2)}px)`,
              ...el('dot'),
            }}
          />
          <span
            style={{
              fontSize: fs, fontWeight: 700, lineHeight: 1, color: ink,
              letterSpacing: '0.01em', whiteSpace: 'pre',
              transform: `translate(${parText.x.toFixed(2)}px, ${parText.y.toFixed(2)}px)`,
              ...el('text'),
            }}
          >
            {visible}
          </span>
        </div>
      </div>
    );
  },
});
