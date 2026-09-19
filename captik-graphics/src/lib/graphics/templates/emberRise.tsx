// Cinematic embers rising from a fire source below frame. Position is a MODULO of timeMs (never
// an accumulator — scrub-safe), and height is q^1.45 of the cycle, so particles linger in the
// lower third and accelerate away — that lopsided density is what reads as fire, not confetti.
// Two parallax banks: near (bigger, brighter, faster) and far (smaller, dimmer, slower). Plateless.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr } from '../motion';

/** rgba() mix of two hex ambers — embers need a colour BETWEEN the palette stops, per particle. */
function mixRgba(a: string, b: string, t: number, alpha: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const k = clamp01(t);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * k);
  return `rgba(${ch(16)},${ch(8)},${ch(0)},${alpha.toFixed(3)})`;
}

const DEEP = '#B45309';
const LIGHT = '#FBBF24';

export const emberRise = defineGraphicsTemplate({
  id: 'ember_rise',
  name: 'Ember Rise',
  category: 'fx',
  tags: ['Embers', 'Sparks', 'Fire', 'Particles', 'Rising'],
  badge: 'New',
  design: { w: 600, h: 900 },
  // Frame-wide effect: hugs the REAL video frame at any aspect. px-unit params are authored
  // against the 600-wide design and rescaled by `unit` below — fullBleed render() gets canvas px.
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 6000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 80 },
  // No text is drawn; 'inter' satisfies the export font-warm gate at zero cost.
  fonts: ['inter'],

  elements: [
    { key: 'near', label: 'Near embers', hideable: false },
    { key: 'far',  label: 'Far embers' },
  ],

  params: [
    { type: 'number', key: 'density', label: 'Embers', group: 'Content', default: 20, min: 8, max: 28, step: 1 },

    { type: 'number', key: 'warmth', label: 'Warmth', group: 'Style', default: 0.65, min: 0, max: 1, step: 0.05,
      help: 'Low = deep amber coals, high = bright golden sparks.' },
    { type: 'number', key: 'size', label: 'Ember size', group: 'Style', default: 9, min: 4, max: 18, step: 1, unit: 'px' },
    { type: 'number', key: 'glow', label: 'Glow', group: 'Style', default: 1, min: 0, max: 2, step: 0.1 },

    { type: 'number', key: 'speed', label: 'Rise speed', group: 'Motion', default: 130, min: 40, max: 320, step: 10, unit: 'px/s' },
    { type: 'number', key: 'sway', label: 'Sway', group: 'Motion', default: 22, min: 0, max: 80, step: 2, unit: 'px' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // One low flame-catch as the embers start to rise. This is ambience — anything louder lies.
  sfx: (p) => [
    { atMs: p.delay, id: 'ignite', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;

    const n = Math.round(p.density);
    const nearN = Math.ceil(n * 0.55);
    const cycle = height * 1.18;
    // px-unit params mean "px on the 600-wide design canvas" — rescale to whatever frame we got.
    const unit = Math.min(width, height) / 600;

    const fade = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    const embers = (bank: 'near' | 'far', count: number) => {
      const near = bank === 'near';
      return Array.from({ length: count }).map((_, i) => {
        const rnd = (sfx: string) => random(`${seed}${bank}${sfx}${i}`);

        // Triangular distribution keeps the column centre-weighted, like a source below frame.
        const x0 = 0.5 + (rnd('x1') + rnd('x2') - 1) * 0.42;
        const v = p.speed * unit * (near ? 0.85 + rnd('v') * 0.55 : 0.45 + rnd('v') * 0.35);
        const qLin = (((t / 1000) * v + rnd('p') * cycle) % cycle) / cycle;
        const qe = Math.pow(qLin, 1.45);           // slow low (dense), accelerating up
        const y = height * (1.04 - qe * 1.16);

        const drift = (rnd('d') - 0.5) * 2 * qe * width * 0.10;
        const sway = Math.sin((t / 1000) * (1.5 + rnd('sr') * 1.4) + rnd('s') * Math.PI * 2)
          * p.sway * unit * (0.35 + qe);
        const x = width * x0 + drift + sway;

        const sz = p.size * unit * (0.75 + rnd('z') * 0.7) * (near ? 1 : 0.55);
        const flick = 0.72 + 0.28 * Math.sin((t / 110) * (0.8 + rnd('f') * 0.8) + rnd('f2') * Math.PI * 2);
        const env = clamp01(qLin * 10) * Math.pow(1 - qLin, 1.3);
        const alpha = env * flick * (near ? 1 : 0.55);

        const k = clamp01(p.warmth * 0.55 + rnd('c') * 0.45 + (near ? 0.1 : 0));
        const d = sz * (2.1 + p.glow * 1.5);       // halo lives inside the gradient, no blur filter

        // MOTION SMEAR: rise speed is q^1.45-driven, so it genuinely VARIES — slow coals near
        // the source stay round, accelerating sparks up high stretch along their motion.
        // Analytic velocity (no extra sampling): d(qe)/dt from the power curve, plus the sway
        // sine's derivative for the horizontal component. Stretch only — the glow gradient is
        // already soft, a blur filter would add cost and no read.
        const dq = 1.45 * Math.pow(Math.max(qLin, 0.0001), 0.45) * ((v / 1000) / cycle);
        const vyE = height * 1.16 * dq;
        const swayW = 1.5 + rnd('sr') * 1.4;
        const vxE = Math.cos((t / 1000) * swayW + rnd('s') * Math.PI * 2)
          * p.sway * unit * (0.35 + qe) * (swayW / 1000);
        const spd = Math.hypot(vxE, vyE);
        const stretch = Math.min(0.45, spd * 1.1);

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: (x - d / 2).toFixed(1) + 'px',
              top: (y - d / 2).toFixed(1) + 'px',
              width: d.toFixed(1) + 'px',
              height: d.toFixed(1) + 'px',
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(255,241,205,${(alpha * 0.95).toFixed(3)}) 0%, ${mixRgba(DEEP, LIGHT, k, alpha * 0.85)} 30%, ${mixRgba(DEEP, LIGHT, k, 0)} 68%)`,
              transform: `scale(${(1 - stretch * 0.3).toFixed(3)}, ${(1 + stretch).toFixed(3)})`,
            }}
          />
        );
      });
    };

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: clamp01(fade) }}>
        <div style={{ position: 'absolute', inset: 0, ...el('far') }}>{embers('far', n - nearN)}</div>
        <div style={{ position: 'absolute', inset: 0, ...el('near') }}>{embers('near', nearN)}</div>
      </div>
    );
  },
});
