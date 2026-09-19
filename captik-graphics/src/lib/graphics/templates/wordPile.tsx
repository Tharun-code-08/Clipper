// Reference: text/blog-animations.mp4  (window 240-4880ms, pile settled ~2040ms)
// Outlined word capsules tumbling in and piling up. Each chip drops to a seeded resting slot with
// its own spring, its own tumble and its own overshoot — the pile has to look accumulated, not
// arranged, and a shared timeline gives it away instantly.
//
// Resting positions come from `random(seed)` on a coarse grid rather than a physics sim: a solver
// would have to run from t=0 to know where a chip is at any given millisecond, which breaks the
// "motion is a pure function of timeMs" rule the whole system depends on.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { idleFloat, smear, sway3d, swingIn, vel } from '../juice';

const MAX_CHIPS = 18;

export const wordPile = defineGraphicsTemplate({
  id: 'word_pile',
  name: 'Word Pile',
  category: 'title',
  tags: ['Text', 'Tumble', 'Pile', 'Falling', 'Capsule', 'Outline'],
  design: { w: 900, h: 1400 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['montserrat'],

  elements: [
    { key: 'pile', label: 'Pile', hideable: false },
    ...Array.from({ length: MAX_CHIPS }, (_, i) => ({ key: `chip${i + 1}`, label: `Chip ${i + 1}` })),
  ],

  params: [
    { type: 'text',   key: 'words', label: 'Words', group: 'Content', multiline: true, maxLength: 200,
      default: 'CAPTIK\nAND\nDIFFERENT\nTHINGS', help: 'One per line. Cycled to fill the pile.' },
    { type: 'number', key: 'count', label: 'How many', group: 'Content', default: 16, min: 2, max: 18, step: 1 },

    { type: 'color',  key: 'ink',    label: 'Outline', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'fill',   label: 'Fill',    group: 'Style', default: '#0B0B0D' },
    { type: 'font',   key: 'font',   label: 'Font',    group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Text size', group: 'Style', default: 54, min: 8, max: 80, step: 2, unit: 'px' },
    { type: 'number', key: 'stroke', label: 'Outline width', group: 'Style', default: 3.5, min: 0.5, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'padX',   label: 'Chip padding', group: 'Style', default: 26, min: 4, max: 60, step: 2, unit: 'px' },
    { type: 'number', key: 'fillOpacity', label: 'Fill opacity', group: 'Style', default: 1, min: 0, max: 1, step: 0.05 },

    { type: 'number', key: 'firstAt', label: 'First chip at', group: 'Motion', default: 100, min: 0, max: 2500, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Stagger',       group: 'Motion', default: 80, min: 10, max: 600, step: 10, unit: 'ms' },
    { type: 'number', key: 'tumble',  label: 'Tumble',        group: 'Motion', default: 55, min: 0, max: 180, step: 5, unit: '°' },
    { type: 'number', key: 'spread',  label: 'Spread',        group: 'Motion', default: 0.82, min: 0.2, max: 1, step: 0.02,
      help: 'How much of the frame the pile covers.' },
  ],

  // A light pass as the rain starts, a pop when the first chips hit, a bigger pop when the LAST
  // chip lands — all timed off the same firstAt/stagger/count that drive the drops.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_CHIPS, Math.round(p.count)));
    return [
      { atMs: p.firstAt + 80, id: 'swish', gain: 0.45 },
      { atMs: p.firstAt + 480, id: 'pop', gain: 0.55 },
      { atMs: p.firstAt + (n - 1) * p.stagger + 500, id: 'pop', gain: 0.75 },
    ];
  },

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const words = p.words.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!words.length) return null;
    const n = Math.min(MAX_CHIPS, Math.round(p.count));

    // Coarse grid so chips scatter without clustering, then jittered off it.
    const cols = 3;
    const rows = Math.ceil(n / cols);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: ff,
          // The settled pile keeps a ±1.4° sway — the accumulation lives in space instead of
          // freezing into a flat scatter (rotation-only: safe under the midpoint test).
          transform: sway3d(timeMs, seed, 1.4),
          ...el('pile'),
        }}
      >
        {Array.from({ length: n }).map((_, i) => {
          const w = words[i % words.length];
          const c = i % cols;
          const r = Math.floor(i / cols);
          const jx = (random(`${seed}jx${i}`) - 0.5) * (width / cols) * 0.55;
          const jy = (random(`${seed}jy${i}`) - 0.5) * (height / rows) * 0.5;

          const sAt = (ms: number) => spring({
            frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
            config: { damping: 14, mass: 0.8, stiffness: 160 },
            durationInFrames: Math.max(1, Math.round(fr(680))),
          });
          const s = sAt(timeMs);
          // After a chip lands it keeps creeping toward the middle, so the field COLLIDES into a
          // pile instead of staying an even scatter.
          const settle = clamp01((timeMs - p.firstAt - i * p.stagger - 640) / 800);
          const pull = 1 - 0.12 * settle;
          const x = width / 2 + (((c + 0.5) / cols - 0.5) * width * p.spread + jx) * pull;
          const y = height / 2 + (((r + 0.5) / rows - 0.5) * height * p.spread + jy) * pull;

          // A few plain tokens with no word in them, as in the reference.
          const token = random(`${seed}tok${i}`) > 0.82;
          const dot = p.size * 1.7;
          const rest = (random(`${seed}rr${i}`) - 0.5) * 2 * p.tumble;
          const spin = rest + (1 - s) * (random(`${seed}sp${i}`) > 0.5 ? 150 : -150);

          // Each chip tumbles in through 3D on its own seeded hinge, its fall velocity smearing
          // it vertically (strength 0.5 — the drop is most of a frame tall) until the bounce
          // parks it crisp; a tiny per-chip drift afterwards keeps the pile breathing.
          const hinge = {
            rx: -16 - random(`${seed}hx${i}`) * 10,
            ry: (random(`${seed}hy${i}`) - 0.5) * 30,
            z: -140,
          };
          const vDrop = vel((ms) => (1 - sAt(ms)) * -height * 0.7, timeMs);
          const sm = smear(0, vDrop, 0.5);
          const fl = idleFloat(timeMs, `${seed}fl${i}`, 1.6);

          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: x, top: y,
                padding: token ? 0 : `${p.size * 0.34}px ${p.padX}px`,
                width: token ? dot : undefined,
                height: token ? dot : undefined,
                border: `${p.stroke}px solid ${p.ink}`,
                background: p.fillOpacity > 0 ? rgba(p.fill, p.fillOpacity) : 'transparent',
                borderRadius: 999,
                color: p.ink, fontSize: p.size, fontWeight: 700, lineHeight: 1,
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
                // Soft contact + ambient shadow so the chips sit IN the frame, not on it.
                boxShadow: `0 ${(p.size * 0.16).toFixed(1)}px ${(p.size * 0.4).toFixed(1)}px rgba(0,0,0,0.22), 0 ${(p.size * 0.5).toFixed(1)}px ${(p.size * 1.1).toFixed(1)}px rgba(0,0,0,0.16)`,
                opacity: clamp01(s * 2.2),
                filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                // Centering translate stays FIRST — inside the swung frame it would foreshorten
                // and shove the chip off its drop line; the 3D hinge follows it, then the motion.
                transform:
                  `translate(-50%,-50%) ${swingIn(s, hinge)} `
                  + `translate(${fl.x.toFixed(2)}px, ${((1 - s) * -height * 0.7 + fl.y).toFixed(2)}px) `
                  + `rotate(${(spin + fl.rot).toFixed(2)}deg) `
                  + `scale(${(interpolate(s, [0, 1], [0.7, 1]) * sm.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.7, 1]) * sm.sy).toFixed(4)})`,
                ...el(`chip${i + 1}`),
              }}
            >
              {token ? '' : w}
            </div>
          );
        })}
      </div>
    );
  },
});
