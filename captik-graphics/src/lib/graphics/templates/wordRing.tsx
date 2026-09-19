// Reference: text/brand-spinning.mp4  (window 200-5800ms, ring open by ~5000ms)
// One word repeated around a circle, each copy stood on end facing outward, the whole ring turning
// while its radius opens from nothing. Measured: the ring takes ~4800ms to reach full size, which
// is almost the entire window — the slow open IS the animation, and snapping it in loses the piece.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { depthPose, smear, vel } from '../juice';

const MAX_COPIES = 16;

export const wordRing = defineGraphicsTemplate({
  id: 'word_ring',
  name: 'Word Ring',
  category: 'title',
  tags: ['Text', 'Circle', 'Spin'],
  design: { w: 700, h: 700 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat'],

  elements: [
    { key: 'ring', label: 'Ring', hideable: false },
    ...Array.from({ length: MAX_COPIES }, (_, i) => ({ key: `word${i + 1}`, label: `Word ${i + 1}` })),
  ],

  params: [
    { type: 'text',   key: 'text',  label: 'Word',   group: 'Content', default: 'brand', maxLength: 20 },
    { type: 'number', key: 'count', label: 'Copies', group: 'Content', default: 12, min: 3, max: 16, step: 1 },

    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'color',  key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'number', key: 'size',   label: 'Size',   group: 'Style', default: 56, min: 10, max: 140, step: 2, unit: 'px' },
    { type: 'number', key: 'weight', label: 'Weight', group: 'Style', default: 700, min: 300, max: 900, step: 100 },
    { type: 'number', key: 'radius', label: 'Radius', group: 'Style', default: 380, min: 40, max: 460, step: 10, unit: 'px' },
    { type: 'boolean', key: 'outward', label: 'Read outward', group: 'Style', default: true,
      help: 'Off: every copy stays upright.' },

    { type: 'number', key: 'openMs', label: 'Ring opens over', group: 'Motion', default: 4800, min: 200, max: 8000, step: 100, unit: 'ms' },
    { type: 'number', key: 'spin',   label: 'Spin',   group: 'Motion', default: 26, min: -180, max: 180, step: 2, unit: '°/s' },
    { type: 'number', key: 'stagger', label: 'Copy stagger', group: 'Motion', default: 40, min: 0, max: 500, step: 10, unit: 'ms' },
  ],

  // The slow open IS the piece, so it gets the slow sound: one long airy sweep under the whole
  // build, one luxe ping the moment the ring reaches full size. The endless spin stays unscored.
  sfx: (p) => [
    { atMs: 120, id: 'sweep', gain: 0.4 },
    { atMs: p.openMs, id: 'glass', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const n = Math.min(MAX_COPIES, Math.round(p.count));

    // The open EASES OUT hard: the reference is already showing a large partial ring within the
    // first second and then creeps the last of the way. A linear open reads as a clump at t1.
    const openAt = (ms: number) => Math.pow(interpolate(ms, [0, p.openMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    }), 0.22);
    const open = openAt(timeMs);
    const turn = (timeMs / 1000) * p.spin;

    // Depth wraps the SYSTEM: the whole ring swings in on the copies' own spring character and
    // then turns on a plane that sways ±2.2° — a carousel in space, not a rotating flat div.
    // The loop itself (open + spin) is untouched.
    const sysIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const pose = depthPose(timeMs, seed, { enter: sysIn, rx: -14, z: -120, swayDeg: 2.2, periodMs: 4200 });

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          ...el('ring'),
        }}
      >
        <div style={{ position: 'relative', width: 0, height: 0, transform: `${pose} rotate(${turn.toFixed(2)}deg)` }}>
          {Array.from({ length: n }).map((_, i) => {
            // Each copy arrives on its own spring, so the ring assembles rather than inflating.
            const sAt = (ms: number) => spring({
              frame: fr(ms - i * p.stagger), fps: FPS,
              config: { damping: 26, mass: 0.8, stiffness: 130 },
              durationInFrames: Math.max(1, Math.round(fr(420))),
            });
            const s = sAt(timeMs);
            const a = (i / n) * 360;
            const r = p.radius * open * s;
            // RADIAL motion blur: the copy's outward velocity (sampled from the same open x
            // spring product that places it) smears it while the ring is flying open and dies as
            // the open creeps to rest — the steady spin stays crisp so the type keeps reading.
            const vR = vel((ms) => p.radius * openAt(ms) * sAt(ms), timeMs);
            const smR = smear(vR, 0, 0.8);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute', left: 0, top: 0,
                  fontSize: p.size, fontWeight: p.weight, color: p.ink,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  whiteSpace: 'nowrap', lineHeight: 1,
                  opacity: clamp01(s * 1.6),
                  filter: smR.blurPx > 0.3 ? `blur(${smR.blurPx.toFixed(2)}px)` : undefined,
                  transformOrigin: '0 50%',
                  // rotate to the spoke, walk out along it, then stand the word up so it reads
                  // outward from the centre.
                  transform:
                    `rotate(${a}deg) translateX(${r.toFixed(2)}px) `
                    + (p.outward ? 'rotate(90deg)' : `rotate(${(-a - turn).toFixed(2)}deg)`)
                    + ' translate(-50%,-50%)',
                  ...el(`word${i + 1}`),
                }}
              >
                {p.text}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
