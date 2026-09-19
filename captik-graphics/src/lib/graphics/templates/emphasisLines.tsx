// Reference: launch-videos/motivational.mp4  (window 0-6000ms, ~1500ms per phrase)
// A phrase built word by word where marked words come in bigger and coloured, then the whole line
// is replaced by the next phrase. Words carry their own weight and colour from inline markup, so a
// user can emphasise anything without the template knowing the copy.
//
// *word* makes a word the accent. The un-marked words stay small and dim, which is what gives the
// reference its "small words, one loud word" rhythm.

import { Easing, interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { luxeGlow } from '../luxe';
import { smear, sway3d, swingIn, vel } from '../juice';

const MAX_PHRASES = 6;

export const emphasisLines = defineGraphicsTemplate({
  id: 'emphasis_lines',
  name: 'Emphasis Lines',
  category: 'title',
  tags: ['Text', 'Kinetic', 'Sequence'],
  design: { w: 900, h: 620 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 7200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 92 },
  fonts: ['montserrat'],

  elements: [
    { key: 'line',   label: 'Line', hideable: false },
    { key: 'accent', label: 'Accent words' },
    { key: 'quiet',  label: 'Quiet words' },
  ],

  params: [
    { type: 'text', key: 'phrases', label: 'Phrases', group: 'Content', multiline: true, maxLength: 300,
      default: 'THE *BIG* IDEA\nBuild the *narrative*\nMake it *matter*',
      help: 'One phrase per line. Wrap a word in *asterisks* to emphasise it.' },

    { type: 'color',  key: 'accent', label: 'Accent',  group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'quiet',  label: 'Quiet',   group: 'Style', default: '#8B887E' },
    { type: 'font',   key: 'font',   label: 'Font',    group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Accent size', group: 'Style', default: 108, min: 16, max: 220, step: 2, unit: 'px' },
    { type: 'number', key: 'quietScale', label: 'Quiet size', group: 'Style', default: 0.48, min: 0.2, max: 1, step: 0.02,
      help: 'Relative to the accent size.' },
    { type: 'number', key: 'gap',    label: 'Word gap', group: 'Style', default: 18, min: 0, max: 90, step: 2, unit: 'px' },

    { type: 'number', key: 'hold',    label: 'Time per phrase', group: 'Motion', default: 2400, min: 300, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'perWord', label: 'Per word',       group: 'Motion', default: 150, min: 10, max: 700, step: 10, unit: 'ms' },
    { type: 'number', key: 'outMs',   label: 'Leaves over',    group: 'Motion', default: 300, min: 60, max: 1500, step: 20, unit: 'ms' },
  ],

  // Kinetic build: air into the first phrase, a pop as its last word (the payoff) lands, a light
  // lift as the line leaves, air again as phrase two arrives — the loop's rhythm, cued once.
  sfx: (p) => {
    const first = p.phrases.split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? '';
    const nWords = Math.max(1, first.split(/\s+/).filter(Boolean).length);
    return [
      { atMs: 60, id: 'whoosh', gain: 0.45 },
      { atMs: (nWords - 1) * p.perWord + 220, id: 'pop', gain: 0.6 },
      { atMs: Math.max(0, p.hold - p.outMs), id: 'swish', gain: 0.4 },
      { atMs: p.hold + 100, id: 'whoosh', gain: 0.45 },
    ];
  },

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const phrases = p.phrases.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_PHRASES);
    if (!phrases.length) return null;

    const i = Math.floor(timeMs / Math.max(1, p.hold)) % phrases.length;
    const withinAt = (ms: number) => ms - Math.floor(ms / Math.max(1, p.hold)) * p.hold;
    const within = withinAt(timeMs);
    const words = phrases[i].split(/\s+/).filter(Boolean);

    // The whole line lifts away in its last beat; individual words arrive staggered.
    const out = interpolate(within, [p.hold - p.outMs, p.hold], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    // A phrase starts assembling from the upper-left and settles into the centre once built.
    const built = interpolate(within, [0, words.length * p.perWord + 420], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad),
    });
    // MOTION BLUR on the exit: while the line lifts, its constant ramp velocity smears it — the
    // moment the next phrase owns the frame the blur is gone with the opacity.
    const vOut = out > 0 && out < 1 ? (p.size * 0.35) / Math.max(1, p.outMs) : 0;
    const smOut = smear(0, vOut, 1);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          opacity: clamp01(1 - out),
          filter: smOut.blurPx > 0.3 ? `blur(${smOut.blurPx.toFixed(2)}px)` : undefined,
          // The assembled line never flattens into a web page — a ±1.7° sway holds it in space
          // through every hold (perspective prefix FIRST, then the drift/lift translates).
          transform:
            `${sway3d(timeMs, seed, 1.7)} `
            + `translate(${((1 - built) * -0.28 * 900).toFixed(2)}px, ${((1 - built) * -0.2 * 620).toFixed(2)}px) `
            + `translateY(${(-out * p.size * 0.35).toFixed(2)}px)`,
          ...el('line'),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'center', gap: p.gap }}>
          {words.map((raw, k) => {
            const accent = raw.startsWith('*') && raw.endsWith('*') && raw.length > 2;
            const text = accent ? raw.slice(1, -1) : raw;
            const sAt = (ms: number) => spring({
              frame: fr(withinAt(ms) - k * p.perWord), fps: FPS,
              config: { damping: 22, mass: 0.6, stiffness: 190 },
              durationInFrames: Math.max(1, Math.round(fr(420))),
            });
            const s = sAt(timeMs);
            // Each word arrives through 3D on its own seeded hinge — the accents hinge harder —
            // and its arrival velocity drives a smear that dies the frame it settles, so the
            // build reads as objects landing in space, not divs fading in.
            const hinge = {
              rx: -12 - random(`${seed}-wx${i}-${k}`) * 8,
              ry: (random(`${seed}-wy${i}-${k}`) - 0.5) * 18,
              z: accent ? -90 : -60,
            };
            const fsWord = accent ? p.size : p.size * p.quietScale;
            const vW = vel(sAt, timeMs) * fsWord * 0.9;
            const sm = smear(0, vW, 1);
            const base = interpolate(s, [0, 1], [0.86, 1]);
            return (
              <span
                key={k}
                style={{
                  fontSize: fsWord,
                  fontWeight: accent ? 800 : 600,
                  color: accent ? p.accent : p.quiet,
                  letterSpacing: accent ? '-0.01em' : '0.06em',
                  textShadow: accent ? luxeGlow(p.accent, 0.8) : undefined,
                  lineHeight: 1.05, whiteSpace: 'nowrap',
                  opacity: clamp01(s * 1.8),
                  filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                  transform:
                    `${swingIn(s, hinge)} `
                    + `translateY(${((1 - s) * p.size * 0.16).toFixed(2)}px) `
                    + `scale(${(base * sm.sx).toFixed(4)}, ${(base * sm.sy).toFixed(4)})`,
                  ...(accent ? el('accent') : el('quiet')),
                }}
              >
                {text}
              </span>
            );
          })}
        </div>
      </div>
    );
  },
});
