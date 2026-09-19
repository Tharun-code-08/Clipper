// Outline-to-fill title: the word stands as a warm-white OUTLINE, then an amber fill RISES
// through the glyphs and lands with a glow bloom. The fill is a second copy of the same text
// clipped with inset() from the bottom — stroke and fill stay perfectly registered at every
// scale, where a background-clip gradient would shimmer at subpixel stroke widths.

import type { CSSProperties } from 'react';
import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, outRamp } from '../motion';
import { easeOutQuint, luxeGlow } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

export const outlineFill = defineGraphicsTemplate({
  id: 'outline_fill',
  name: 'Outline Fill',
  category: 'title',
  tags: ['Outline', 'Fill', 'Rising', 'Bold', 'Glow'],
  badge: 'New',
  design: { w: 900, h: 400 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3800,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 70 },
  fonts: ['anton'],

  elements: [
    { key: 'outline', label: 'Outline word', hideable: false },
    { key: 'fill',    label: 'Fill' },
  ],

  params: [
    { type: 'text', key: 'word',  label: 'Word', group: 'Content', default: 'RELENTLESS', maxLength: 18 },
    { type: 'text', key: 'line2', label: 'Second line', group: 'Content', default: '', maxLength: 18,
      help: 'Optional second line — stays outline-only.' },

    { type: 'color',  key: 'accent', label: 'Fill',    group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Outline', group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',   label: 'Font',    group: 'Style', default: 'anton' },
    { type: 'number', key: 'stroke', label: 'Outline width', group: 'Style', default: 2.5, min: 1, max: 6, step: 0.5, unit: 'px' },

    { type: 'number', key: 'rise',  label: 'Fill rise', group: 'Motion', default: 700, min: 300, max: 1400, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay',     group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet arrival, a riser building under the fill's climb, a chime when the bloom lands —
  // this one glows rather than slams. The chime rides p.rise so retiming the fill retimes it.
  sfx: (p) => [
    { atMs: p.delay + 80, id: 'whoosh', gain: 0.4 },
    { atMs: p.delay + 480, id: 'riser', gain: 0.45 },
    { atMs: p.delay + 650 + p.rise, id: 'chime', gain: 0.6 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);
    const word = p.word.trim();
    const line2 = p.line2.trim();
    const out = outRamp(timeMs, durationMs, 320);

    // Word arrives as outline first — a quiet weighted settle, no slam; the fill IS the event.
    const arrive = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 24, mass: 0.8, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });

    const fillStart = 650;
    const fillUpAt = (ms: number) => easeOutQuint(clamp01((ms - fillStart) / p.rise));
    const fillUp = fillUpAt(t);
    // Bloom is keyed to the fill LANDING: flashes slightly hot, decays to a held glow.
    const since = t - (fillStart + p.rise);
    const bloom = since <= 0 ? 0 : easeOutQuint(clamp01(since / 240)) * (0.6 + 0.5 * Math.exp(-since / 420));

    const line2In = easeOutQuint(clamp01((t - 420) / 450));
    const longest = Math.max(word.length, line2.length, 3);
    const fs = Math.round(Math.min(height * (line2 ? 0.34 : 0.5), (width * 1.5) / longest));

    // The title block lives in 3D: a gentle top-hinged arrival that settles into a slow ±1.7°
    // breath, with the second line parallaxing against it. The fill's climb velocity drives a
    // molten blur on the fill layer ONLY (never a transform — stroke and fill must stay
    // registered) that sharpens to crisp exactly as the bloom fires.
    const pose = depthPose(t, seed, { enter: arrive, rx: -11, z: -70, swayDeg: 1.7 });
    const parL2 = parallax(t, seed, 0.55, height * 0.012);
    const vFill = vel((ms) => fillUpAt(ms) * fs, t);
    const smFill = smear(0, vFill, 0.75);

    const glyph: CSSProperties = {
      fontSize: fs, fontWeight: 400, lineHeight: 1.06,
      letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0, fontFamily: ff, opacity: out,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: fs * 0.06,
        }}
      >
        <div
          style={{
            position: 'relative',
            opacity: clamp01(t / 180),
            transform: `${pose} scale(${(0.92 + 0.08 * arrive).toFixed(4)})`,
            transformOrigin: 'center center',
          }}
        >
          <span
            style={{
              ...glyph,
              display: 'inline-block',
              color: 'transparent',
              WebkitTextStroke: `${p.stroke}px ${p.ink}`,
              ...el('outline'),
            }}
          >
            {word}
          </span>
          <span
            style={{
              ...glyph,
              position: 'absolute', left: 0, top: 0,
              color: p.accent,
              clipPath: `inset(${((1 - fillUp) * 100).toFixed(2)}% 0% 0% 0%)`,
              filter: smFill.blurPx > 0.3 ? `blur(${smFill.blurPx.toFixed(2)}px)` : undefined,
              textShadow: bloom > 0 ? luxeGlow(p.accent, bloom) : 'none',
              ...el('fill'),
            }}
          >
            {word}
          </span>
        </div>

        {line2 && (
          <span
            style={{
              ...glyph,
              fontSize: Math.round(fs * 0.82),
              color: 'transparent',
              WebkitTextStroke: `${Math.max(1, p.stroke * 0.85)}px ${p.ink}`,
              opacity: line2In,
              transform: `translate(${parL2.x.toFixed(2)}px, ${((1 - line2In) * fs * 0.12 + parL2.y).toFixed(2)}px)`,
              ...el('outline'),
            }}
          >
            {line2}
          </span>
        )}
      </div>
    );
  },
});
