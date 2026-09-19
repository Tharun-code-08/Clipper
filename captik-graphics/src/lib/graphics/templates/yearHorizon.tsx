// Reference: general/animated-year.mp4  (window 80-3900ms, hill up by ~900ms then undulates)
// A glowing year over a rolling hill that rises once and then never stops moving.
//
// The hill is a sum of sines on a MODULO phase, not an accumulator, so scrubbing to 3s shows the
// same crest as playing to 3s. Distinct from year_zoom, which is a flat numeral push-in.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

const STEPS = 64;

export const yearHorizon = defineGraphicsTemplate({
  id: 'year_horizon',
  name: 'Year Horizon',
  category: 'title',
  tags: ['Year', 'Hill', 'Glow', 'Number', 'Horizon', 'Wave'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat'],

  elements: [
    { key: 'sky',  label: 'Sky', hideable: false },
    { key: 'year', label: 'Year' },
    { key: 'hill', label: 'Hill' },
  ],

  params: [
    { type: 'text', key: 'year', label: 'Year', group: 'Content', default: '2026', maxLength: 8 },

    { type: 'color',  key: 'sky',   label: 'Sky',   group: 'Style', default: '#050709' },
    { type: 'color',  key: 'ink',   label: 'Year',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'hill',  label: 'Hill',  group: 'Style', default: '#156B44' },
    { type: 'color',  key: 'back',  label: 'Far hill', group: 'Style', default: '#0C4A2F' },
    { type: 'font',   key: 'font',  label: 'Font',  group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Year size', group: 'Style', default: 190, min: 30, max: 400, step: 5, unit: 'px' },
    { type: 'number', key: 'glow',  label: 'Year glow', group: 'Style', default: 0.75, min: 0, max: 1, step: 0.05 },
    { type: 'number', key: 'crest', label: 'Hill height', group: 'Style', default: 36, min: 10, max: 90, step: 1, unit: '%' },
    { type: 'number', key: 'swell', label: 'Wave depth', group: 'Style', default: 26, min: 0, max: 160, step: 2, unit: 'px' },
    { type: 'boolean', key: 'fill', label: 'Paint the sky', group: 'Style', default: true },

    { type: 'number', key: 'yearAt', label: 'Year at', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'hillAt', label: 'Hill rises at', group: 'Motion', default: 200, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'drift',  label: 'Wave speed', group: 'Motion', default: 0.22, min: 0, max: 1.5, step: 0.02 },
  ],

  // Ambient, not PUNCH: air as the numerals arrive, a long crescendo under the rising land, one
  // bell as the year settles — all three off yearAt / hillAt, the params that time the motion.
  sfx: (p) => [
    { atMs: p.yearAt, id: 'whoosh', gain: 0.35 },
    { atMs: p.hillAt, id: 'sweep', gain: 0.35 },
    { atMs: p.yearAt + 600, id: 'chime', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);

    const yearInAt = (ms: number) => spring({
      frame: fr(ms - p.yearAt), fps: FPS,
      config: { damping: 200, mass: 0.9, stiffness: 120 },
      durationInFrames: Math.max(1, Math.round(fr(800))),
    });
    const yearIn = yearInAt(timeMs);
    const riseAt = (ms: number) => spring({
      frame: fr(ms - p.hillAt), fps: FPS,
      config: { damping: 26, mass: 1, stiffness: 105 },
      durationInFrames: Math.max(1, Math.round(fr(900))),
    });

    // Modulo phase — the crest at t=3s is identical whether scrubbed to or played to.
    const ph = ((timeMs / 1000) * p.drift) % 1;
    const baseYAt = (ms: number) => height * (1 - (p.crest / 100) * riseAt(ms));
    const baseY = baseYAt(timeMs);

    // The year hangs in space over the land: it turns in on the same spring that raises it and
    // then breathes at ±1.6° on a slow 5s period — a horizon card is a held beat.
    const pose = depthPose(timeMs, seed, { enter: yearIn, rx: -9, ry: 7, z: -90, swayDeg: 1.6, periodMs: 5000 });
    // RACK FOCUS on the numerals — they resolve out of the haze rather than fading up.
    const focusYear = (1 - yearIn) * p.size * 0.03;
    // The LAND is the big mover — 500+px of crest sweeping up in under a second. Its own px/ms
    // softens it in flight and is dead the moment it settles. Strength is held low deliberately:
    // the hill's fill runs edge to edge, so a heavy blur would feather the frame sides.
    const hillBlur = smear(0, vel(baseYAt, timeMs), 0.35).blurPx;
    // The far ridge drifts vertically against the year's breath — a distant parallax that can
    // never open a seam, because the near hill covers the frame's bottom and both sides.
    const parFar = parallax(timeMs, seed, 0.5, height * 0.004, 5000);

    const path = (offset: number, amp: number) => {
      const pts = Array.from({ length: STEPS + 1 }, (_, i) => {
        const u = i / STEPS;
        const y = baseY
          + Math.sin((u * 2.1 + ph + offset) * Math.PI * 2) * amp
          + Math.sin((u * 3.7 - ph * 1.6 + offset) * Math.PI * 2) * amp * 0.45;
        return `${(u * width).toFixed(1)},${y.toFixed(1)}`;
      });
      return `M ${pts.join(' L ')} L ${width},${height} L 0,${height} Z`;
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.sky : 'transparent',
          fontFamily: ff,
          ...el('sky'),
        }}
      >
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: `${(28 - (1 - yearIn) * 2).toFixed(2)}%`,
            textAlign: 'center',
            fontSize: p.size, fontWeight: 800, letterSpacing: p.size * 0.02,
            color: p.ink,
            // Champagne bloom, not hill-green: the year floats over the emerald like a low moon.
            textShadow: p.glow > 0
              ? `0 0 ${p.size * 0.2}px ${rgba(LUXE.gold, 0.85 * p.glow)}, 0 0 ${p.size * 0.55}px ${rgba(LUXE.gold, 0.4 * p.glow)}`
              : undefined,
            opacity: clamp01(yearIn * 1.4),
            filter: focusYear > 0.3 ? `blur(${focusYear.toFixed(2)}px)` : undefined,
            transform: `${pose} scale(${interpolate(yearIn, [0, 1], [0.94, 1]).toFixed(4)})`,
            ...el('year'),
          }}
        >
          {p.year}
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            filter: hillBlur > 0.3 ? `blur(${hillBlur.toFixed(2)}px)` : undefined,
            ...el('hill'),
          }}
        >
          <path d={path(0.37, p.swell * 0.8)} fill={p.back} transform={`translate(0 ${parFar.y.toFixed(2)})`} />
          <path d={path(0, p.swell)} fill={p.hill} />
        </svg>

        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
