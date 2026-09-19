// Reference: text/spill-word.mp4  (window 440-6920ms, letters gone by ~5120ms)
// A heavy word that holds, then loses its letters one at a time from the RIGHT (~940ms apart
// in the capture, which is why the stagger default is not the snappier value it wants to be) — each drops on a
// real gravity curve with its own spin and drift, so no two fall alike. The reference keeps the
// tittle of the "i" behind as a coloured dot after its stem has gone, which is the detail that
// makes it read as the word coming apart rather than a wipe.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { depthPose, parallax, smear } from '../juice';

const MAX_LETTERS = 12;

export const spillWord = defineGraphicsTemplate({
  id: 'spill_word',
  name: 'Spill Word',
  category: 'title',
  tags: ['Text', 'Gravity', 'Drop'],
  design: { w: 900, h: 1180 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 6500,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 84 },
  fonts: ['montserrat'],

  elements: [
    { key: 'word', label: 'Word', hideable: false },
    { key: 'dot',  label: 'Accent dot' },
    ...Array.from({ length: MAX_LETTERS }, (_, i) => ({ key: `letter${i + 1}`, label: `Letter ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'text', label: 'Word', group: 'Content', default: 'Spill', maxLength: 12 },

    { type: 'font',   key: 'font',  label: 'Font',  group: 'Style', default: 'montserrat' },
    { type: 'color',  key: 'ink',   label: 'Text',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'accent', label: 'Accent dot', group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'size',  label: 'Size',  group: 'Style', default: 240, min: 40, max: 420, step: 4, unit: 'px' },
    { type: 'number', key: 'weight', label: 'Weight', group: 'Style', default: 800, min: 300, max: 900, step: 100 },
    { type: 'number', key: 'track', label: 'Tracking', group: 'Style', default: -6, min: -30, max: 40, step: 1, unit: 'px' },

    { type: 'number',  key: 'holdMs',  label: 'Hold before falling', group: 'Motion', default: 3600, min: 0, max: 5000, step: 50, unit: 'ms' },
    { type: 'number',  key: 'stagger', label: 'Stagger',   group: 'Motion', default: 560, min: 20, max: 1200, step: 10, unit: 'ms' },
    { type: 'number',  key: 'gravity', label: 'Gravity',   group: 'Motion', default: 640, min: 200, max: 8000, step: 100, unit: 'px/s²' },
    { type: 'number',  key: 'spin',    label: 'Spin',      group: 'Motion', default: 220, min: 0, max: 900, step: 10, unit: '°/s' },
    { type: 'boolean', key: 'fromLeft', label: 'Fall left-to-right', group: 'Motion', default: false,
      help: 'Off: the last letter goes first, as in the reference.' },
  ],

  // A soft arrival, then air passes as the letters let go — swishes ride the same
  // holdMs/stagger grid gravity runs on; a one-letter word gets a single release.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_LETTERS, [...p.text].length));
    const cues: { atMs: number; id: 'whoosh' | 'swish'; gain: number }[] = [
      { atMs: 100, id: 'whoosh', gain: 0.35 },
      { atMs: p.holdMs + 120, id: 'swish', gain: 0.45 },
    ];
    if (n > 2) cues.push({ atMs: p.holdMs + 2 * p.stagger + 120, id: 'swish', gain: 0.4 });
    return cues;
  },

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const chars = [...p.text].slice(0, MAX_LETTERS);
    if (!chars.length) return null;

    const entry = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 22, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    // The word's long hold used to be a dead pose; now the whole plane (letters AND the tittle
    // that outlives them) swings in top-hinged and keeps a ±1.8° breath until — and after —
    // gravity takes the letters.
    const pose = depthPose(timeMs, seed, { enter: entry, rx: -12, z: -70, swayDeg: 1.8 });
    const parDot = parallax(timeMs, seed, 0.6, width * 0.008);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          transform: pose,
          transformOrigin: 'center center',
          ...el('word'),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', letterSpacing: p.track }}>
          {chars.map((ch, i) => {
            // Order of departure. The reference empties from the right.
            const order = p.fromLeft ? i : chars.length - 1 - i;
            const fallAt = p.holdMs + order * p.stagger;
            const tSec = Math.max(0, (timeMs - fallAt) / 1000);
            // Real ballistics, not an eased ramp — the acceleration is the whole read.
            const drop = 0.5 * p.gravity * tSec * tSec;
            const drift = (random(`${seed}d${i}`) - 0.5) * 2 * width * 0.09 * tSec;
            const rot = (random(`${seed}r${i}`) - 0.5) * 2 * p.spin * tSec;
            // A fallen letter stays in the flex row, invisible. Unmounting it would re-flow the
            // remaining letters and slide the whole word sideways as it empties — the reference's
            // "Sp" holds its position exactly where it started.
            const gone = drop > height * 1.1;
            // MOTION BLUR from the ballistics themselves: v = g·t is known analytically, so the
            // smear grows exactly as the letter accelerates — zero while it still hangs in the
            // word, streaking by the time it clears the frame.
            const sm = smear(
              (random(`${seed}d${i}`) - 0.5) * 2 * width * 0.09 / 1000,
              (p.gravity * tSec) / 1000,
              tSec > 0 ? 0.9 : 0,
            );

            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  fontSize: p.size, fontWeight: p.weight, color: p.ink,
                  lineHeight: 1,
                  whiteSpace: 'pre',
                  opacity: gone ? 0 : clamp01(entry * 1.4),
                  filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                  transform:
                    `translate(${drift.toFixed(2)}px, ${(drop - (1 - entry) * height * 0.06).toFixed(2)}px) `
                    + `rotate(${rot.toFixed(2)}deg) scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
                  ...el(`letter${i + 1}`),
                }}
              >
                {ch}
              </span>
            );
          })}
          {/* Left behind once its stem has fallen — the reference's magenta tittle. */}
          <span
            style={{
              // Rides just above the cap line, where the tittle of the "i" actually sits.
              position: 'absolute', left: '52%', top: height / 2 - p.size * 0.62,
              width: p.size * 0.09, height: p.size * 0.09, borderRadius: '50%',
              background: p.accent,
              // The tittle is part of the word from the start — it is what is LEFT once the stem goes.
              opacity: interpolate(timeMs, [200, 600], [0, 1], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              }),
              // A touch nearer the camera than the letters — the sway shears it subtly.
              transform: `translate(${parDot.x.toFixed(2)}px, ${parDot.y.toFixed(2)}px)`,
              ...el('dot'),
            }}
          />
        </div>
      </div>
    );
  },
});
