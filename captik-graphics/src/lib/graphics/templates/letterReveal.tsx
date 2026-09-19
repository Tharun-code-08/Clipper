// Reference: logos/animate-netflix-logo.mp4  (window 560-4240ms, wordmark by ~2120ms)
// A single letter that grows out of a thin vertical bar, with a light sweep crossing it, and the
// wordmark arriving underneath once it has settled.
//
// The stretch is scaleX on a letter that starts near zero width — NOT a font-size ramp. Scaling the
// glyph keeps its weight and edges consistent through the whole move; growing the size re-hints the
// outline every frame and shimmers.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGlow } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

export const letterReveal = defineGraphicsTemplate({
  id: 'letter_reveal',
  name: 'Letter Reveal',
  category: 'title',
  tags: ['Logo', 'Monogram', 'Stretch', 'Letter', 'Brand', 'Wordmark'],
  design: { w: 900, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 90 },
  fonts: ['montserrat'],

  elements: [
    { key: 'lockup', label: 'Lockup', hideable: false },
    { key: 'letter', label: 'Letter' },
    { key: 'word',   label: 'Wordmark' },
    { key: 'sweep',  label: 'Light sweep' },
  ],

  params: [
    { type: 'text', key: 'letter', label: 'Letter',   group: 'Content', default: 'N', maxLength: 3 },
    { type: 'text', key: 'word',   label: 'Wordmark', group: 'Content', default: 'NETFLIX', maxLength: 24 },

    { type: 'color',  key: 'ink',   label: 'Colour', group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Letter size', group: 'Style', default: 480, min: 80, max: 800, step: 10, unit: 'px' },
    { type: 'number', key: 'wordSize', label: 'Wordmark size', group: 'Style', default: 66, min: 10, max: 160, step: 2, unit: 'px' },
    { type: 'number', key: 'track', label: 'Wordmark tracking', group: 'Style', default: 10, min: 0, max: 50, step: 1, unit: 'px' },
    { type: 'number', key: 'gap',   label: 'Gap',    group: 'Style', default: 120, min: -60, max: 200, step: 4, unit: 'px' },
    { type: 'boolean', key: 'shadow', label: 'Cast shadow', group: 'Style', default: true },

    { type: 'number', key: 'growAt', label: 'Letter at',  group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'growMs', label: 'Stretches over', group: 'Motion', default: 700, min: 100, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'wordAt', label: 'Wordmark at', group: 'Motion', default: 900, min: 0, max: 6000, step: 20, unit: 'ms' },
    { type: 'number', key: 'sweepAt', label: 'Sweep at',  group: 'Motion', default: 900, min: 0, max: 6000, step: 20, unit: 'ms' },
  ],

  // A brand reveal glows, it doesn't slam: air under the stretch, a fast light pass with the
  // sweep, one luxe ping as the wordmark settles — each riding its own At param.
  sfx: (p) => [
    { atMs: p.growAt + 60, id: 'whoosh', gain: 0.55 },
    { atMs: p.sweepAt + 120, id: 'swish', gain: 0.4 },
    { atMs: p.wordAt + 260, id: 'glass', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);

    const growAt = (ms: number) => spring({
      frame: fr(ms - p.growAt), fps: FPS,
      config: { damping: 24, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(p.growMs))),
    });
    const grow = growAt(timeMs);
    const word = spring({
      frame: fr(timeMs - p.wordAt), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 175 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const sweep = interpolate(timeMs, [p.sweepAt, p.sweepAt + 900], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    // The lockup swings in side-hinged (the letter grows sideways, so the card arrives on the
    // same axis) and then never flattens — a ±1.8° sway holds through the whole clip, with the
    // wordmark parallaxing against the monogram plane. The letter's stretch velocity drives a
    // horizontal smear that dies exactly as the glyph reaches full width.
    const pose = depthPose(timeMs, seed, { enter: grow, ry: 20, z: -90, swayDeg: 1.8 });
    const parWord = parallax(timeMs, seed, 0.55, width * 0.011);
    const vLetter = vel((ms) => interpolate(growAt(ms), [0, 1], [0.06, 1]), timeMs) * p.size * 0.5;
    const smL = smear(vLetter, 0, 1);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          transform: pose,
          transformOrigin: 'center center',
          ...el('lockup'),
        }}
      >
        <div style={{ position: 'relative', overflow: 'hidden', lineHeight: 0.95 }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: p.size, fontWeight: 900, color: p.ink, lineHeight: 0.95,
              // Bloom in the mark's own colour over a soft layered cast — the monogram is
              // the one lit element in the lockup.
              textShadow: p.shadow
                ? `${luxeGlow(p.ink, 0.8)}, 0 ${p.size * 0.02}px ${p.size * 0.07}px ${rgba('#000000', 0.35)}, 0 ${p.size * 0.06}px ${p.size * 0.16}px ${rgba('#000000', 0.3)}`
                : undefined,
              opacity: clamp01(grow * 4),
              filter: smL.blurPx > 0.3 ? `blur(${smL.blurPx.toFixed(2)}px)` : undefined,
              // scaleX on the glyph, never a font-size ramp — see the header.
              transform: `scaleX(${(interpolate(grow, [0, 1], [0.06, 1]) * smL.sx).toFixed(4)}) scaleY(${smL.sy.toFixed(4)})`,
              transformOrigin: 'center center',
              ...el('letter'),
            }}
          >
            {p.letter}
          </span>

          <div
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${(sweep * 160 - 30).toFixed(1)}%`,
              width: '22%',
              background: `linear-gradient(100deg, ${rgba('#FFF6DF', 0)}, ${rgba('#FFF6DF', 0.5)}, ${rgba('#FFF6DF', 0)})`,
              opacity: sweep > 0 && sweep < 1 ? 1 : 0,
              ...el('sweep'),
            }}
          />
        </div>

        <span
          style={{
            marginTop: p.gap,
            fontSize: p.wordSize, fontWeight: 800, color: p.ink,
            letterSpacing: p.track, lineHeight: 1,
            opacity: clamp01(word * 1.6),
            transform: `translate(${parWord.x.toFixed(2)}px, ${(parWord.y + (1 - word) * width * 0.02).toFixed(2)}px)`,
            ...el('word'),
          }}
        >
          {p.word}
        </span>
      </div>
    );
  },
});
