// One-shot film-burn transition: a blown-out warm bloom surges in from one edge on a fast
// spring, peaks near full-frame, then dies back leaving amber-hot edges and a few drifting
// dust flecks. The craft: the opacity attack/decay and the spring scale run on separate
// clocks — the flash is already dying while the burn is still physically growing, which is
// what reads as fire rather than a crossfade.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';

const FLECKS = 12;

export const filmBurn = defineGraphicsTemplate({
  id: 'film_burn',
  name: 'Film Burn',
  category: 'fx',
  tags: ['Burn', 'Flash', 'Bloom', 'Film', 'Transition'],
  badge: 'New',
  design: { w: 900, h: 900 },
  // Frame-wide effect: hugs the REAL video frame at any aspect. Every size below is a fraction
  // of the frame — fullBleed render() gets canvas px, which differ between preview and export.
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 2500,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  // No text is drawn; 'inter' satisfies the export font-warm gate at zero cost.
  fonts: ['inter'],

  elements: [
    { key: 'bloom',  label: 'Bloom', hideable: false },
    { key: 'flecks', label: 'Dust flecks' },
  ],

  params: [
    { type: 'select', key: 'side', label: 'Burns in from', group: 'Content', default: 'left',
      options: [
        { value: 'left',   label: 'Left edge' },
        { value: 'right',  label: 'Right edge' },
        { value: 'bottom', label: 'Bottom edge' },
      ] },

    { type: 'color',  key: 'core',      label: 'Hot core', group: 'Style', default: '#FFF6E5' },
    { type: 'color',  key: 'amber',     label: 'Burn colour', group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'intensity', label: 'Intensity', group: 'Style', default: 1, min: 0.3, max: 1.5, step: 0.05 },

    { type: 'number', key: 'attackMs',    label: 'Attack', group: 'Motion', default: 200, min: 80, max: 600, step: 20, unit: 'ms' },
    { type: 'number', key: 'decayMs',     label: 'Decay',  group: 'Motion', default: 700, min: 300, max: 1600, step: 20, unit: 'ms' },
    { type: 'number', key: 'repeatEvery', label: 'Repeat every', group: 'Motion', default: 0, min: 0, max: 8000, step: 100, unit: 'ms',
      help: '0 burns once at the start of the window. Set an interval to strobe the burn — each pass gets its own fleck scatter.' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // The flame catches exactly when the burn does. One cue — the burn IS the beat.
  sfx: (p) => [
    { atMs: p.delay, id: 'ignite', gain: 0.7 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;

    // Local burn clock: restarts every repeatEvery ms, or runs once from 0.
    const cycle = p.repeatEvery > 0 ? Math.floor(t / p.repeatEvery) : 0;
    const b = p.repeatEvery > 0 ? t % p.repeatEvery : t;

    const rise = 1 - Math.pow(1 - clamp01(b / p.attackMs), 3);
    // The flash collapses fast; the edge heat hangs around ~3x longer.
    const flashFall = b <= p.attackMs ? 1 : Math.exp(-(b - p.attackMs) / (p.decayMs * 0.55));
    const edgeFall  = b <= p.attackMs ? 1 : Math.exp(-(b - p.attackMs) / (p.decayMs * 1.6));
    const flash = rise * flashFall * p.intensity;
    const edge  = rise * edgeFall * p.intensity;

    const grow = spring({
      frame: fr(b), fps: FPS,
      config: { damping: 16, mass: 0.8, stiffness: 120 },
      durationInFrames: Math.max(1, Math.round(fr(p.attackMs + p.decayMs))),
    });

    const ox = p.side === 'left' ? 0 : p.side === 'right' ? 100 : 50;
    const oy = p.side === 'bottom' ? 100 : 50;
    const D = Math.max(width, height) * 2.6;
    const scale = 0.22 + grow * 0.9;

    const stripW = p.side === 'bottom' ? undefined : width * 0.16;
    const stripH = p.side === 'bottom' ? height * 0.16 : undefined;
    const stripDir = p.side === 'left' ? 'to right' : p.side === 'right' ? 'to left' : 'to top';

    const drift = clamp01(b / (p.attackMs + p.decayMs));

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, ...el('bloom') }}>
          <div
            style={{
              position: 'absolute',
              left: `${ox}%`, top: `${oy}%`,
              width: D, height: D,
              marginLeft: -D / 2, marginTop: -D / 2,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${p.core} 0%, ${rgba(p.core, 0.92)} 12%, ${rgba(p.amber, 0.75)} 30%, ${rgba(p.amber, 0.25)} 52%, transparent 72%)`,
              mixBlendMode: 'screen',
              opacity: Math.min(1, flash * 1.15).toFixed(4) as unknown as number,
              transform: `scale(${scale.toFixed(4)})`,
            }}
          />
          {/* Lingering heat on the origin edge — the burn's afterimage. */}
          <div
            style={{
              position: 'absolute',
              left: p.side === 'right' ? undefined : 0,
              right: p.side === 'left' ? undefined : 0,
              top: p.side === 'bottom' ? undefined : 0,
              bottom: 0,
              width: stripW, height: stripH,
              background: `linear-gradient(${stripDir}, ${rgba(p.amber, 0.8)} 0%, ${rgba(p.amber, 0.3)} 45%, transparent 100%)`,
              mixBlendMode: 'screen',
              opacity: (edge * 0.7).toFixed(4) as unknown as number,
            }}
          />
        </div>

        {/* Dust flecks — only alive while the burn is; each pass reseeds its scatter. */}
        <div style={{ position: 'absolute', inset: 0, ...el('flecks') }}>
          {Array.from({ length: FLECKS }, (_, i) => {
            const k = `${seed}-c${cycle}-f${i}`;
            const ra = random(`${k}a`);
            const rb = random(`${k}b`);
            const rc = random(`${k}c`);
            const rd = random(`${k}d`);
            // Fraction of the frame, not absolute px — canvas px differ between preview and export.
            const size = Math.min(width, height) * (0.0025 + rc * 0.0055);
            const travel = (0.12 + rd * 0.45) * Math.max(width, height) * drift;
            const x = p.side === 'left' ? width * (0.02 + ra * 0.22) + travel
              : p.side === 'right' ? width * (0.98 - ra * 0.22) - travel
              : width * (0.08 + ra * 0.84);
            const y = p.side === 'bottom' ? height * (0.98 - rb * 0.22) - travel
              : height * (0.06 + rb * 0.88);
            const flicker = 0.5 + 0.5 * Math.sin(b / (28 + rd * 40) + rd * 20);
            const op = clamp01(flash * (0.35 + 0.65 * flicker));
            // MOTION SMEAR: fleck velocity is the travel ramp's slope — constant while flying,
            // exactly zero once drift clamps (by then the flash has decayed the fleck away).
            // Stretch rides the travel axis; the burn's soft light needs no blur of its own.
            const vf = drift < 1 ? (0.12 + rd * 0.45) * Math.max(width, height) / (p.attackMs + p.decayMs) : 0;
            const st = Math.min(0.6, vf * 0.9);
            const smearT = p.side === 'bottom'
              ? `scale(${(1 - st * 0.35).toFixed(3)}, ${(1 + st).toFixed(3)})`
              : `scale(${(1 + st).toFixed(3)}, ${(1 - st * 0.35).toFixed(3)})`;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: x.toFixed(1), top: y.toFixed(1),
                  width: size.toFixed(1), height: size.toFixed(1),
                  borderRadius: '50%',
                  background: i % 3 === 0 ? p.core : p.amber,
                  boxShadow: `0 0 ${(size * 2).toFixed(1)}px ${rgba(p.amber, 0.8)}`,
                  opacity: op.toFixed(4) as unknown as number,
                  transform: smearT,
                  filter: vf > 0.25 ? `blur(${Math.min(1.2, vf * 1.6).toFixed(2)}px)` : undefined,
                }}
              />
            );
          })}
        </div>
      </div>
    );
  },
});
