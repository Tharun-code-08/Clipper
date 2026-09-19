// Reference: graphics/explainer-spheres.mp4  (window 0-3640ms, all rings out by ~2440ms)
// Overlapping outlined circles on a gradient, each arriving with its own label. Rings are drawn as
// STROKES with no fill so the overlaps stay legible — filling them at low alpha muddies every
// intersection into a different shade and the labels stop reading.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { idleFloat, swingIn } from '../juice';

const MAX_RINGS = 6;

export const vennCircles = defineGraphicsTemplate({
  id: 'venn_circles',
  name: 'Venn Circles',
  category: 'chart',
  tags: ['Diagram', 'Explainer', 'Concept'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 3800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'scene', label: 'Scene', hideable: false },
    ...Array.from({ length: MAX_RINGS }, (_, i) => ({ key: `ring${i + 1}`, label: `Circle ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'labels', label: 'Labels', group: 'Content', multiline: true, maxLength: 240,
      default: 'Well-balanced\nProfessional stability\nNew Growth\nTrustworthiness maturity',
      help: 'One per circle.' },

    { type: 'color',  key: 'a',     label: 'Gradient A', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'b',     label: 'Gradient B', group: 'Style', default: '#1A1A20' },
    { type: 'color',  key: 'ring',  label: 'Rings',      group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',   label: 'Labels',     group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',       group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Label size', group: 'Style', default: 22, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Circle size', group: 'Style', default: 160, min: 40, max: 380, step: 5, unit: 'px' },
    { type: 'number', key: 'overlap', label: 'Overlap',  group: 'Style', default: 0.52, min: 0.1, max: 1, step: 0.02,
      help: 'Lower packs the circles closer together.' },
    { type: 'number', key: 'thick', label: 'Ring width', group: 'Style', default: 2, min: 1, max: 12, step: 1, unit: 'px' },
    { type: 'boolean', key: 'fill', label: 'Paint the gradient', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First circle at', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Stagger',        group: 'Motion', default: 180, min: 0, max: 1500, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: one air pass as the first ring blooms and a pop as the final ring
  // lands — the same firstAt/stagger clock as the arrivals. The end-of-scene dissolve stays
  // silent on purpose: a cue on an exit fade reads as a mistake.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_RINGS, p.labels.split('\n').map((s) => s.trim()).filter(Boolean).length));
    return [
      { atMs: p.firstAt + 60, id: 'whoosh', gain: 0.4 },
      { atMs: p.firstAt + (n - 1) * p.stagger + 300, id: 'pop', gain: 0.45 },
    ];
  },

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const labels = p.labels.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_RINGS);
    const n = labels.length;
    if (!n) return null;

    const step = p.radius * 2 * p.overlap;
    // Centre the whole chain, then walk left to right.
    const startX = width / 2 - (step * (n - 1)) / 2;
    const cy = height * 0.5;

    /** Arrival spring for circle `i` — kept raw so the swing hinge and landing smear can read
     *  its true settle, separate from the end-of-scene dissolve. */
    const springOf = (i: number) => spring({
      frame: fr(timeMs - p.firstAt - i * p.stagger), fps: FPS,
      config: { damping: 24, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    /** How present circle `i` is: arrival spring, then the staggered end-of-scene dissolve. */
    const alive = (i: number) => {
      const fade = 1 - clamp01((timeMs - (durationMs - 1200) - i * 400) / 500);
      return clamp01(springOf(i) * 1.6) * fade;
    };
    const live = labels.map((_, i) => alive(i));
    const shown = live.map((v, i) => (v > 0.15 ? i : -1)).filter((i) => i >= 0);
    const bandL = shown.length ? startX + step * shown[0] - p.radius : width / 2;
    const bandR = shown.length ? startX + step * shown[shown.length - 1] + p.radius : width / 2;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          // A SOFT band at the left edge only. A bright stop in the middle reads as a silver streak
          // slashing the frame, which the reference never has — it stays near-black throughout.
          background: p.fill ? `linear-gradient(100deg, ${p.b} 0%, ${p.a} 34%, ${p.a} 100%)` : 'transparent',
          fontFamily: ff,
          ...el('scene'),
        }}
      >
        {/* A soft full-height band behind the live circles — the reference's only light on an
            otherwise flat near-black field. It tracks the diagram, so it grows in and dissolves with it. */}
        <div
          style={{
            position: 'absolute', left: bandL, width: Math.max(0, bandR - bandL), top: 0, bottom: 0,
            background: `linear-gradient(90deg, ${rgba(p.ring, 0.1)}, ${rgba(p.ring, 0.02)})`,
          }}
        />

        {labels.map((label, i) => {
          const s = live[i];
          const cx = startX + step * i;
          // The full-frame gradient is the CAMERA — it never moves. Depth lives on the rings:
          // each swings in side-hinged from alternating directions (z-stagger), smears while
          // it lands, then keeps drifting on its own idle float so the held pose never dies.
          const sRaw = springOf(i);
          const ringBlur = sRaw > 0.001 && sRaw < 0.985 ? (1 - Math.min(1, sRaw)) * 2.5 : 0;
          const fl = idleFloat(timeMs, `${seed}-ring${i}`, 3 + (i % 3) * 1.5, 3400 + i * 260);
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: cx, top: cy,
                width: p.radius * 2, height: p.radius * 2,
                marginLeft: -p.radius, marginTop: -p.radius,
                borderRadius: '50%',
                // Stroke only — a tinted fill turns every overlap into a different shade.
                border: `${p.thick}px solid ${rgba(p.ring, 0.8)}`,
                boxSizing: 'border-box',
                boxShadow: `0 0 ${p.thick * 9}px ${rgba(p.ring, 0.22)}, inset 0 0 ${p.thick * 9}px ${rgba(p.ring, 0.1)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: s,
                filter: ringBlur > 0.3 ? `blur(${ringBlur.toFixed(2)}px)` : undefined,
                transform: `${swingIn(Math.min(1, sRaw), { ry: (i % 2 === 0 ? -1 : 1) * (16 + i * 2), z: -60 })} translate(${fl.x.toFixed(2)}px, ${fl.y.toFixed(2)}px) scale(${interpolate(s, [0, 1], [0.55, 1]).toFixed(4)})`,
                ...el(`ring${i + 1}`),
              }}
            >
              <span
                style={{
                  fontSize: p.size, color: p.ink, textAlign: 'center', lineHeight: 1.4,
                  fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                  textShadow: '0 1px 10px rgba(0,0,0,0.5)',
                  maxWidth: p.radius * 1.1,
                  opacity: clamp01((s - 0.35) * 2.4),
                }}
              >
                {label}
              </span>
            </div>
          );
        })}

        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
