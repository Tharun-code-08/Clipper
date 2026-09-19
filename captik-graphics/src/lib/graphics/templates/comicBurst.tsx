// Reference: text/comic-style.mp4  (window 400-3280ms, word set by ~480ms, spokes peak ~1600ms)
// A hard italic word that snaps in, then throws a ring of radiating spokes that shoot out and fade.
// Measured: the word lands almost immediately (80ms of entrance) and the burst is the whole rest of
// the animation, so the spokes carry it — each one gets its own delay, length and lifetime rather
// than the ring scaling as a unit.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { smear, sway3d, swingIn, vel } from '../juice';

const MAX_SPOKES = 24;

export const comicBurst = defineGraphicsTemplate({
  id: 'comic_burst',
  name: 'Comic Burst',
  category: 'title',
  tags: ['Text', 'Burst', 'Impact'],
  design: { w: 900, h: 620 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 98 },
  fonts: ['inter', 'komika', 'thebold'],

  elements: [
    { key: 'word',  label: 'Word', hideable: false },
    { key: 'burst', label: 'Burst' },
    ...Array.from({ length: 12 }, (_, i) => ({ key: `spoke${i + 1}`, label: `Spoke ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'text', label: 'Word', group: 'Content', default: 'TESTING', maxLength: 18 },

    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'komika' },
    { type: 'color',  key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'spoke',  label: 'Spokes', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'glow',   label: 'Glow',   group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'size',   label: 'Size',   group: 'Style', default: 150, min: 30, max: 260, step: 4, unit: 'px' },
    { type: 'number', key: 'skew',   label: 'Italic lean', group: 'Style', default: 12, min: 0, max: 30, step: 1, unit: '°' },
    { type: 'number', key: 'glowPx', label: 'Glow size',   group: 'Style', default: 26, min: 0, max: 90, step: 2, unit: 'px' },

    { type: 'number', key: 'count',   label: 'Spokes',     group: 'Burst', default: 12, min: 4, max: 24, step: 1 },
    { type: 'number', key: 'radius',  label: 'Inner radius', group: 'Burst', default: 250, min: 60, max: 460, step: 10, unit: 'px' },
    { type: 'number', key: 'len',     label: 'Spoke length', group: 'Burst', default: 95, min: 10, max: 200, step: 5, unit: 'px' },
    { type: 'number', key: 'thick',   label: 'Spoke width',  group: 'Burst', default: 8, min: 2, max: 30, step: 1, unit: 'px' },

    { type: 'number',  key: 'burstAt', label: 'Burst at', group: 'Motion', default: 380, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number',  key: 'burstMs', label: 'Burst over', group: 'Motion', default: 1300, min: 200, max: 4000, step: 50, unit: 'ms' },
    { type: 'boolean', key: 'repeat',  label: 'Repeat the burst', group: 'Motion', default: true },
  ],

  // Comic PUNCH: air into the snap, a produced hit as the word stamps, a light pass as the first
  // ring of spokes shoots. The word lands ~190ms in (damping-13 snap); the ring rides p.burstAt.
  sfx: (p) => [
    { atMs: 40, id: 'whoosh', gain: 0.5 },
    { atMs: 190, id: 'slam', gain: 0.8 },
    { atMs: p.burstAt + 80, id: 'swish', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const n = Math.min(MAX_SPOKES, Math.round(p.count));

    const popAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 13, mass: 0.55, stiffness: 240 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const pop = popAt(timeMs);
    // MOTION BLUR: the snap's zoom velocity (scale/ms → px/ms at the glyph edge) drives a smear
    // that peaks mid-pop and lands CRISP the frame the word stamps.
    const vPop = vel(popAt, timeMs) * p.size * 0.9;
    const smPop = smear(0, vPop, 1.1);

    // Looping the burst is a modulo on the clock, never a CSS animation — the export takes one
    // DOM snapshot per frame and a keyframed ring would render frozen.
    const cycle = p.repeat ? p.burstMs : Number.POSITIVE_INFINITY;
    const since = timeMs - p.burstAt;
    const local = since < 0 ? -1 : (p.repeat ? since % cycle : since);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          // Word and spokes sway together in 3D through the hold — the burst stays pinned to the
          // word while the whole lockup keeps living in space.
          transform: sway3d(timeMs, seed, 2),
        }}
      >
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, ...el('burst') }}>
          {Array.from({ length: n }).map((_, i) => {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2;
            // Per-spoke delay and lifetime, so the ring breathes instead of pulsing as one object.
            const lag = random(`${seed}l${i}`) * 0.22;
            const life = 0.6 + random(`${seed}v${i}`) * 0.4;
            const t = local < 0 ? 0 : clamp01((local / p.burstMs - lag) / life);
            const grow = interpolate(t, [0, 1], [0, 1]);
            const r = p.radius + grow * p.len * 1.6;
            const long = p.len * (0.5 + random(`${seed}n${i}`) * 0.9);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute', left: 0, top: 0,
                  width: long, height: p.thick, borderRadius: p.thick,
                  background: p.spoke,
                  opacity: t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI) * 0.95,
                  transformOrigin: '0 50%',
                  transform: `rotate(${(a * 180) / Math.PI}deg) translateX(${r.toFixed(1)}px) translateY(${-p.thick / 2}px)`,
                  ...el(`spoke${(i % 12) + 1}`),
                }}
              />
            );
          })}
        </div>

        <span
          style={{
            position: 'relative',
            fontSize: p.size, fontWeight: 900, color: p.ink,
            letterSpacing: p.size * 0.01, lineHeight: 1, whiteSpace: 'nowrap',
            textShadow: p.glowPx > 0
              ? `0 0 ${p.glowPx}px ${rgba(p.glow, 0.85)}, 0 0 ${p.glowPx * 2.2}px ${rgba(p.glow, 0.45)}`
              : undefined,
            opacity: clamp01(pop * 1.6),
            filter: smPop.blurPx > 0.3 ? `blur(${smPop.blurPx.toFixed(2)}px)` : undefined,
            // The word snaps in THROUGH space — a top-hinged swing from depth riding the same
            // damping-13 spring, so the overshoot reads as the card swinging past vertical.
            transform:
              `${swingIn(pop, { rx: -16, z: -120 })} skewX(${-p.skew}deg) `
              + `scale(${(interpolate(pop, [0, 1], [0.72, 1]) * smPop.sx).toFixed(4)}, `
              + `${(interpolate(pop, [0, 1], [0.72, 1]) * smPop.sy).toFixed(4)})`,
            ...el('word'),
          }}
        >
          {p.text}
        </span>
      </div>
    );
  },
});
