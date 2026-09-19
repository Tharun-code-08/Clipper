// Reference: text/sentence-reveal.mp4
// A vertical picker that scrolls terms past a focus line: the centred one is bright and bold, the
// rest fall away in weight and opacity by distance. The scroll is a pure function of timeMs and
// the styling is derived from each row's distance from centre, so no row needs its own timeline —
// yet every row still animates independently as it passes through.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

const MAX_ROWS = 10;

export const wordCycler = defineGraphicsTemplate({
  id: 'word_cycler',
  name: 'Word Cycler',
  category: 'title',
  tags: ['List', 'Picker', 'Reveal'],
  design: { w: 760, h: 900 },
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 84 },
  fonts: ['inter'],

  elements: [
    { key: 'list',  label: 'List', hideable: false },
    { key: 'focus', label: 'Focused row' },
    ...Array.from({ length: MAX_ROWS }, (_, i) => ({ key: `row${i + 1}`, label: `Row ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'items', label: 'Terms', group: 'Content', multiline: true, maxLength: 400,
      default: 'web-design-guidelines\nfrontend-design\nui-design-system\ninterface-design\nswiftui-ui-patterns\ninteraction-design\nui-ux-pro-max',
      help: 'One per line. The list cycles endlessly.' },
    { type: 'boolean', key: 'landOn', label: 'Settle on the final term', group: 'Content', default: true },

    { type: 'color',  key: 'ink',   label: 'Focused',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Unfocused', group: 'Style', default: '#8F8B80' },
    { type: 'font',   key: 'font',  label: 'Font',     group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Text size', group: 'Style', default: 56, min: 12, max: 90, step: 1, unit: 'px' },
    { type: 'number', key: 'gap',   label: 'Row gap',  group: 'Style', default: 28, min: 4, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'falloff', label: 'Fade falloff', group: 'Style', default: 70, min: 10, max: 100, step: 5, unit: '%' },

    { type: 'number', key: 'speed',  label: 'Cycle period', group: 'Motion', default: 340, min: 80, max: 1200, step: 20, unit: 'ms',
      help: 'Time per term as the list scrolls past.' },
    { type: 'number', key: 'settleAt', label: 'Settle at', group: 'Motion', default: 2600, min: 300, max: 8000, step: 100, unit: 'ms',
      showIf: { key: 'landOn', equals: true } },
  ],

  // Picker language, first cycle only: a light pass as the wheel spins up, ONE tick while rows
  // are streaming past, a dry snap the instant the wheel locks (skipped on the endless loop).
  sfx: (p) => [
    { atMs: 120, id: 'swish', gain: 0.45 },
    { atMs: p.speed * 3, id: 'tick', gain: 0.5 },
    ...(p.landOn ? [{ atMs: p.settleAt + 60, id: 'snap' as const, gain: 0.65 }] : []),
  ],

  render: ({ params: p, el, timeMs, height, seed }) => {
    const ff = fontStack(p.font);
    const items = p.items.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_ROWS);
    if (!items.length) return null;

    const rowH = p.size + p.gap;

    // Scroll decelerates into a stop when "settle" is on — like a picker coming to rest.
    // Kept as a closure of ms so the SAME function that positions the rows can be sampled for
    // their velocity (the motion-blur driver).
    const offsetAt = (ms: number) => {
      const st = p.landOn
        ? interpolate(ms, [0, p.settleAt], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
          })
        : ms / Math.max(1, p.speed * items.length);
      const tr = p.landOn ? items.length * 2.4 : (ms / Math.max(1, p.speed));
      return (p.landOn ? st * tr : tr) * rowH;
    };
    const offset = offsetAt(timeMs);
    // MOTION BLUR: the wheel's scroll velocity blurs the WHOLE list — physically every row
    // shares one speed — and dies exactly as the settle easing brings it to rest, so the
    // locked pose is crisp. On the endless loop it stays proportional to the constant speed.
    const smList = smear(0, vel(offsetAt, timeMs), 0.55);

    const appear = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(340))),
    });
    // The picker swings in on its existing appear spring and then keeps a ±1.5° sway — the
    // wheel is an object in space, not a scrolling div (rotation/translateZ only: midpoint-safe).
    const pose = depthPose(timeMs, seed, { enter: appear, rx: -12, z: -80, swayDeg: 1.5 });

    // Render enough repeats that the window is always full.
    const repeats = Math.ceil(height / rowH) + items.length + 2;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          fontFamily: ff, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: interpolate(appear, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
          transform: pose,
          ...el('list'),
        }}
      >
        <div
          style={{
            position: 'relative', width: '100%', height: '100%',
            filter: smList.blurPx > 0.3 ? `blur(${smList.blurPx.toFixed(2)}px)` : undefined,
          }}
        >
          {Array.from({ length: repeats }).map((_, k) => {
            const item = items[k % items.length];
            const y = height / 2 + k * rowH - offset - rowH / 2;
            // Distance from the focus line drives weight, colour and opacity — every row animates
            // continuously as it travels, with no per-row timeline.
            const d = Math.abs(y + rowH / 2 - height / 2) / (height * (p.falloff / 100));
            if (y < -rowH * 2 || y > height + rowH) return null;
            const focus = Math.max(0, 1 - d);
            return (
              <div
                key={k}
                style={{
                  position: 'absolute', left: 0, right: 0, top: y,
                  height: rowH,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: p.size,
                  fontWeight: focus > 0.72 ? 700 : 500,
                  color: focus > 0.72 ? p.ink : rgba(p.dim, Math.max(0.12, 0.85 * focus)),
                  opacity: Math.max(0.08, focus),
                  transform: `scale(${(0.92 + focus * 0.08).toFixed(4)})`,
                  whiteSpace: 'nowrap',
                  ...(focus > 0.72 ? el('focus') : {}),
                  ...el(`row${(k % items.length) + 1}`),
                }}
              >
                {item}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
