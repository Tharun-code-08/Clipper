// Full-frame spotlight — the footage dims to near-black except a circular spotlight that irises
// open on a spring at a param position, then (optionally) grows to swallow the whole frame as the
// reveal beat. Craft: the iris drives the radial-gradient's circle RADIUS, not a scale transform —
// scaling a div would scale the feather with it, so the edge softness would visibly breathe during
// the iris; radius-driven stops keep the falloff optically constant at every size and any aspect.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, outRamp, rgba } from '../motion';

const easeOutQuint = (x: number) => 1 - Math.pow(1 - clamp01(x), 5);

export const spotlightReveal = defineGraphicsTemplate({
  id: 'spotlight_reveal',
  name: 'Spotlight Reveal',
  category: 'fx',
  tags: ['Spotlight', 'Circle', 'Dark', 'Focus', 'Reveal'],
  badge: 'New',
  design: { w: 900, h: 900 },
  // Frame-wide effect: hugs the REAL video frame at any aspect. The spotlight radius is a
  // percentage of min(width,height), so the beam reads the same on 16:9, 9:16 and 1:1.
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  // No text is drawn; 'inter' satisfies the export font-warm gate at zero cost.
  fonts: ['inter'],

  elements: [
    { key: 'dim', label: 'Dim plate', hideable: false },
    { key: 'rim', label: 'Edge glow' },
  ],

  params: [
    { type: 'number', key: 'x',      label: 'Spot X',    group: 'Content', default: 50, min: 0, max: 100, step: 1, unit: '%' },
    { type: 'number', key: 'y',      label: 'Spot Y',    group: 'Content', default: 40, min: 0, max: 100, step: 1, unit: '%' },
    { type: 'number', key: 'radius', label: 'Spot size', group: 'Content', default: 24, min: 8, max: 60, step: 1, unit: '%',
      help: 'Radius as a percentage of the frame’s shorter side.' },

    { type: 'number', key: 'soft',  label: 'Edge softness', group: 'Style', default: 22, min: 2, max: 60, step: 1, unit: '%' },
    { type: 'number', key: 'dim',   label: 'Darkness', group: 'Style', default: 0.75, min: 0.3, max: 0.95, step: 0.05 },
    { type: 'color',  key: 'shade', label: 'Shade',    group: 'Style', default: '#0B0B0D' },
    { type: 'boolean', key: 'rim',      label: 'Warm rim',   group: 'Style', default: true },
    { type: 'color',   key: 'rimColor', label: 'Rim colour', group: 'Style', default: '#F59E0B' },

    { type: 'boolean', key: 'reveal',   label: 'Grow to reveal', group: 'Motion', default: true,
      help: 'Second beat: the spotlight swallows the whole frame and the dim is gone.' },
    { type: 'number', key: 'revealAt', label: 'Reveal at', group: 'Motion', default: 2400, min: 500, max: 8000, step: 100, unit: 'ms' },
    { type: 'number', key: 'revealMs', label: 'Reveal over', group: 'Motion', default: 700, min: 200, max: 2000, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay',    label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // An airy crescendo under the iris, and the payoff hit exactly on the reveal beat — but only
  // when that beat actually lands inside the default window (4000ms = defaultDurationMs above).
  sfx: (p) => [
    { atMs: p.delay, id: 'sweep' as const, gain: 0.4 },
    ...(p.reveal && p.delay + p.revealAt <= 4000
      ? [{ atMs: p.delay + p.revealAt, id: 'boom' as const, gain: 0.65 }]
      : []),
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const m = Math.min(width, height);

    // Iris open: the spring drives the circle radius from 0 to the target, damping 20 leaves a
    // small dignified settle. A faint breathing sine keeps the beam alive through the hold.
    const iris = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 20, mass: 0.9, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(900))),
    });
    const breathe = 1 + 0.015 * Math.sin(t / 700) * clamp01((t - 600) / 400);
    const r0 = (m * p.radius) / 100;
    const rCur = Math.max(0.01, r0 * iris * breathe);

    // Reveal beat: grow to cover the farthest corner (plus the feather) so no dim residue is left.
    const rp = p.reveal ? easeOutQuint((t - p.revealAt) / Math.max(1, p.revealMs)) : 0;
    const dx = (Math.max(p.x, 100 - p.x) / 100) * width;
    const dy = (Math.max(p.y, 100 - p.y) / 100) * height;
    const rMax = Math.hypot(dx, dy) * 1.3;
    const r = rCur + (rMax - rCur) * rp;

    // The dim fades in over the first beat (a hard cut to 75% black reads as a playback error),
    // and fades back out at the window's end when there is no reveal beat to clear it.
    const plateOp = clamp01(t / 240) * (p.reveal ? 1 : outRamp(timeMs, durationMs, 350));
    if (plateOp <= 0) return null;

    const soft = Math.max(2, Math.min(60, p.soft));
    const stopIn = (100 - soft).toFixed(1);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(circle ${r.toFixed(1)}px at ${p.x}% ${p.y}%, transparent 0%, transparent ${stopIn}%, ${rgba(p.shade, p.dim)} 100%)`,
            opacity: plateOp.toFixed(4) as unknown as number,
            ...el('dim'),
          }}
        />
        {p.rim && (
          <div
            style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(circle ${r.toFixed(1)}px at ${p.x}% ${p.y}%, transparent 0%, transparent ${stopIn}%, ${rgba(p.rimColor, 0.3)} ${(100 - soft * 0.45).toFixed(1)}%, transparent 104%)`,
              mixBlendMode: 'screen',
              opacity: (plateOp * clamp01(iris * 1.5) * (1 - rp)).toFixed(4) as unknown as number,
              ...el('rim'),
            }}
          />
        )}
      </div>
    );
  },
});
