// Reference: money/money-falling.mp4  (a continuous loop — no entrance, no settle)
// Emoji falling forever with soft bokeh behind them. Every item has its own column, fall speed,
// spin rate and size from `random(seed)`, and its vertical position is `(t * speed) % span` — a
// modulo, not an accumulator, so scrubbing to any millisecond lands on the same frame.
//
// An accumulating position would drift between the preview and the export and never come back.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { parallax, smear, sway3d } from '../juice';

const MAX_ITEMS = 60;
const MAX_BOKEH = 8;

export const emojiRain = defineGraphicsTemplate({
  id: 'emoji_rain',
  name: 'Emoji Rain',
  category: 'fx',
  tags: ['Confetti', 'Money', 'Loop'],
  design: { w: 900, h: 1600 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 6000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'rain',  label: 'Falling items', hideable: false },
    { key: 'bokeh', label: 'Bokeh' },
  ],

  params: [
    { type: 'text',   key: 'glyphs', label: 'Emoji', group: 'Content', default: '💵,🪙', maxLength: 60,
      help: 'Comma-separated. Cycled across the items.' },
    { type: 'number', key: 'count',  label: 'How many', group: 'Content', default: 34, min: 4, max: 60, step: 1 },

    { type: 'number', key: 'size',   label: 'Size',    group: 'Style', default: 46, min: 10, max: 140, step: 2, unit: 'px' },
    { type: 'number', key: 'vary',   label: 'Size variation', group: 'Style', default: 0.45, min: 0, max: 1, step: 0.05 },
    { type: 'color',  key: 'bokeh',  label: 'Bokeh',   group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'bokehOn', label: 'Bokeh strength', group: 'Style', default: 0.35, min: 0, max: 1, step: 0.05 },

    { type: 'number', key: 'speed',  label: 'Fall speed', group: 'Motion', default: 320, min: 20, max: 1200, step: 10, unit: 'px/s' },
    { type: 'number', key: 'spread', label: 'Speed spread', group: 'Motion', default: 0.55, min: 0, max: 1, step: 0.05 },
    { type: 'number', key: 'spin',   label: 'Spin',    group: 'Motion', default: 140, min: 0, max: 720, step: 10, unit: '°/s' },
    { type: 'number', key: 'sway',   label: 'Sway',    group: 'Motion', default: 26, min: 0, max: 160, step: 2, unit: 'px' },
  ],

  // A continuous loop has no impact beat — one soft air pass as the rain fades up is all it earns.
  sfx: () => [
    { atMs: 60, id: 'whoosh', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const glyphs = p.glyphs.split(',').map((s) => s.trim()).filter(Boolean);
    const list = glyphs.length ? glyphs : ['💵'];
    const n = Math.min(MAX_ITEMS, Math.round(p.count));
    const t = timeMs / 1000;
    // Items start above the frame and are removed a full item below it.
    const span = height + p.size * 3;

    const fade = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    // Depth split: bokeh is the far plane, the rain sways as one system in 3D — the shear between
    // them is what reads as air between the layers.
    const parBokeh = parallax(timeMs, seed, 0.35, width * 0.01);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: clamp01(fade) }}>
        {p.bokehOn > 0 && (
          <div style={{ position: 'absolute', inset: 0, transform: `translate(${parBokeh.x.toFixed(2)}px, ${parBokeh.y.toFixed(2)}px)`, ...el('bokeh') }}>
            {Array.from({ length: MAX_BOKEH }).map((_, i) => {
              const bx = random(`${seed}bx${i}`);
              const by = random(`${seed}by${i}`);
              const d = width * (0.06 + random(`${seed}bd${i}`) * 0.1);
              const ph = random(`${seed}bp${i}`) * Math.PI * 2;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${bx * 100}%`, top: `${by * 100}%`,
                    width: d, height: d, borderRadius: '50%',
                    background: `radial-gradient(circle, ${rgba(p.bokeh, 0.55 * p.bokehOn)}, ${rgba(p.bokeh, 0)} 70%)`,
                    transform: `translate(-50%,-50%) translateY(${(Math.sin(t * 0.4 + ph) * height * 0.02).toFixed(2)}px)`,
                  }}
                />
              );
            })}
          </div>
        )}

        <div style={{ position: 'absolute', inset: 0, transform: sway3d(timeMs, seed, 1.2), ...el('rain') }}>
          {Array.from({ length: n }).map((_, i) => {
            const col = random(`${seed}c${i}`);
            const speed = p.speed * (1 - p.spread / 2 + random(`${seed}v${i}`) * p.spread);
            const phase = random(`${seed}o${i}`) * span;
            // Modulo, never an accumulator — see the header.
            const y = ((t * speed + phase) % span) - p.size * 1.5;
            const sz = p.size * (1 - p.vary / 2 + random(`${seed}z${i}`) * p.vary);
            const rot = (t * p.spin * (random(`${seed}r${i}`) > 0.5 ? 1 : -1)) % 360;
            const sway = Math.sin(t * 1.1 + i) * p.sway;
            // MOTION BLUR: true fall + sway velocity (px/ms, analytic — these never rest, so the
            // smear never dies; it scales exactly with how fast THIS item is moving). The stretch
            // sits OUTSIDE the spin in the transform list so it stays on the world's fall axis.
            const vy = speed / 1000;
            const vx = (Math.cos(t * 1.1 + i) * p.sway * 1.1) / 1000;
            const sm = smear(vx, vy, 1);
            return (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: col * width, top: y,
                  fontSize: sz, lineHeight: 1,
                  filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                  transform: `translateX(${sway.toFixed(2)}px) scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)}) rotate(${rot.toFixed(1)}deg)`,
                }}
              >
                {list[i % list.length]}
              </span>
            );
          })}
        </div>
      </div>
    );
  },
});
