// A diagonal light-leak that sweeps the frame once (easeOutQuint), a fainter band trailing
// behind, with a 2.5px amber line riding the leading edge. No mix-blend-mode — it breaks across
// export surfaces — the "add light" read is faked with low-alpha layered gradients whose warm
// stops bias toward the leading side. `repeat` 0 = one-shot; otherwise it sweeps on a cadence.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { smear, vel } from '../juice';

export const lightSweep = defineGraphicsTemplate({
  id: 'light_sweep',
  name: 'Light Sweep',
  category: 'fx',
  tags: ['Flare', 'Light', 'Leak', 'Sweep', 'Glow'],
  badge: 'New',
  design: { w: 900, h: 900 },
  // Frame-wide effect: hugs the REAL video frame at any aspect. Every size below is a fraction
  // of the frame — fullBleed render() gets canvas px, which differ between preview and export.
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 3000,
  defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 100 },
  // No text is drawn; 'inter' satisfies the export font-warm gate at zero cost.
  fonts: ['inter'],

  elements: [
    { key: 'band',  label: 'Light band', hideable: false },
    { key: 'trail', label: 'Trailing band' },
  ],

  params: [
    { type: 'select', key: 'dir', label: 'Direction', group: 'Content', default: 'ltr',
      options: [
        { value: 'ltr', label: 'Left to right' },
        { value: 'rtl', label: 'Right to left' },
      ] },

    { type: 'color',  key: 'color', label: 'Light',  group: 'Style', default: '#FBBF24' },
    { type: 'color',  key: 'edge',  label: 'Edge line', group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'intensity', label: 'Intensity', group: 'Style', default: 0.55, min: 0.15, max: 1, step: 0.05 },
    { type: 'number', key: 'width', label: 'Band width', group: 'Style', default: 25, min: 12, max: 40, step: 1, unit: '%' },
    { type: 'number', key: 'angle', label: 'Angle', group: 'Style', default: 20, min: -45, max: 45, step: 1, unit: '°' },

    { type: 'number', key: 'sweepMs', label: 'Sweep time', group: 'Motion', default: 1500, min: 600, max: 3000, step: 50, unit: 'ms' },
    { type: 'number', key: 'repeat', label: 'Repeat every', group: 'Motion', default: 0, min: 0, max: 6000, step: 100, unit: 'ms',
      help: '0 sweeps once.' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // One long airy pass, launched with the band itself.
  sfx: (p) => [
    { atMs: p.delay, id: 'sweep', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, width, height }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;

    const local = p.repeat > 0 ? t % p.repeat : t;
    const i = p.intensity;
    const mirror = p.dir === 'rtl' ? -1 : 1;

    const m = Math.min(width, height);
    const rad = (Math.abs(p.angle) * Math.PI) / 180;
    const bandW = width * (p.width / 100);
    const bandH = Math.hypot(width, height) * 1.35;
    // A rotated tall band's horizontal footprint is dominated by its HEIGHT — travel must clear
    // that, not just the band width, or the sweep never fully leaves the frame.
    const travel = (width + bandW * Math.cos(rad) + bandH * Math.sin(rad)) / 2 + m * 0.045;

    const s = easeOutQuint(clamp01(local / p.sweepMs));
    const s2 = easeOutQuint(clamp01((local - p.sweepMs * 0.22) / p.sweepMs));
    const x = mirror * (-travel + s * 2 * travel);
    const x2 = mirror * (-travel + s2 * 2 * travel);

    // MOTION BLUR: the leading band smears with its own sweep velocity — hardest as it launches,
    // dying to nothing as the easeOutQuint settles, so the sweep LANDS crisp. The stretch is
    // applied in screen-x (before the rotate), the axis the band actually travels along; the
    // edge line inside inherits it and streaks with the pass.
    const vB = vel((ms) => {
      const lm = p.repeat > 0 ? (ms - p.delay) % p.repeat : ms - p.delay;
      return mirror * (-travel + easeOutQuint(clamp01(lm / p.sweepMs)) * 2 * travel);
    }, timeMs);
    const bandSm = smear(vB, 0, 0.5);

    const fade = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 200, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(240))),
    });

    const bandBase: React.CSSProperties = {
      position: 'absolute',
      left: '50%', top: '50%',
      height: bandH.toFixed(0) + 'px',
    };

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: clamp01(fade) }}>
        {/* Trailing band — soft, symmetric, behind the leader */}
        <div
          style={{
            ...bandBase,
            width: (bandW * 0.72).toFixed(1) + 'px',
            transform: `translate(-50%, -50%) translateX(${x2.toFixed(1)}px) rotate(${p.angle}deg)`,
            background: `linear-gradient(90deg, ${rgba(p.color, 0)} 0%, ${rgba(p.color, i * 0.2)} 50%, ${rgba(p.color, 0)} 100%)`,
            ...el('trail'),
          }}
        />

        {/* Leading band — warm stops bias toward the leading edge */}
        <div
          style={{
            ...bandBase,
            width: bandW.toFixed(1) + 'px',
            transform: `translate(-50%, -50%) translateX(${x.toFixed(1)}px) scaleX(${bandSm.sx.toFixed(3)}) rotate(${p.angle}deg)`,
            filter: bandSm.blurPx > 0.3 ? `blur(${bandSm.blurPx.toFixed(2)}px)` : undefined,
            background: `linear-gradient(${mirror === 1 ? 90 : 270}deg, ${rgba(p.color, 0)} 0%, ${rgba(p.color, i * 0.16)} 34%, ${rgba(p.color, i * 0.38)} 66%, ${rgba(p.color, i * 0.55)} 90%, ${rgba(p.color, 0)} 100%)`,
            ...el('band'),
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0, bottom: 0,
              ...(mirror === 1 ? { right: '3%' } : { left: '3%' }),
              width: Math.max(1, m * 0.0028),
              background: rgba(p.edge, 0.9 * i),
              boxShadow: `0 0 ${(m * 0.02).toFixed(1)}px ${rgba(p.edge, 0.55 * i)}, 0 0 ${(m * 0.0045).toFixed(1)}px ${rgba(p.edge, 0.8 * i)}`,
            }}
          />
        </div>
      </div>
    );
  },
});
