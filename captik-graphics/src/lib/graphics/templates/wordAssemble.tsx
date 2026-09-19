// Reference: graphics/concert-animation.mp4  (window 480-3760ms, lockup set ~840ms)
// Words flown in from scattered directions that converge into a finished lockup.
//
// Each word's approach vector is seeded from its OWN index, so re-ordering the copy re-choreographs
// the piece instead of shuffling which word takes which fixed path. They all land on one shared
// spring, so however scattered the entrances are, the arrival is a single beat.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { LUXE, luxeGrain, luxeLightLeak, luxeVignette } from '../luxe';
import { parallax, smear, sway3d, swingIn, vel } from '../juice';

const MAX_WORDS = 10;

export const wordAssemble = defineGraphicsTemplate({
  id: 'word_assemble',
  name: 'Word Assemble',
  category: 'title',
  tags: ['Lockup', 'Converge', 'Event'],
  design: { w: 900, h: 900 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 3800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['inter', 'montserrat'],

  elements: [
    { key: 'lockup', label: 'Lockup', hideable: false },
    { key: 'strip',  label: 'Date line' },
    { key: 'venue',  label: 'Venue line' },
    ...Array.from({ length: MAX_WORDS }, (_, i) => ({ key: `word${i + 1}`, label: `Word ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'dates', label: 'Date line', group: 'Content', default: 'AUG 7-9 · 2026', maxLength: 32 },
    { type: 'text', key: 'words', label: 'Headline', group: 'Content', default: 'OUTSIDE LANDS', maxLength: 60,
      help: 'Each word flies in from its own direction.' },
    { type: 'text', key: 'venue', label: 'Venue line', group: 'Content', default: 'SAN FRANCISCO · GOLDEN GATE PARK', maxLength: 48 },

    { type: 'color',  key: 'bg',    label: 'Background', group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',   label: 'Headline',   group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Small lines', group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',  label: 'Headline font', group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Headline size', group: 'Style', default: 133, min: 20, max: 220, step: 2, unit: 'px' },
    { type: 'number', key: 'small', label: 'Small size', group: 'Style', default: 11, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'track', label: 'Small tracking', group: 'Style', default: 4, min: 0, max: 30, step: 1, unit: 'px' },
    { type: 'boolean', key: 'fill', label: 'Paint the background', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First word at', group: 'Motion', default: 120, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Word stagger', group: 'Motion', default: 130, min: 0, max: 600, step: 10, unit: 'ms' },
    { type: 'number', key: 'throw',   label: 'Fly-in distance', group: 'Motion', default: 400, min: 60, max: 1200, step: 20, unit: 'px' },
    { type: 'number', key: 'spin',    label: 'Entry spin', group: 'Motion', default: 26, min: 0, max: 180, step: 2, unit: '°' },
    { type: 'number', key: 'linesAt', label: 'Small lines at', group: 'Motion', default: 900, min: 0, max: 4000, step: 20, unit: 'ms' },
  ],

  // Air as the words start flying, one produced hit when the LAST word locks the headline (the
  // arrival is a single beat — so is the score), a luxe ping as the small lines slide in.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_WORDS, p.words.split(/\s+/).filter(Boolean).length));
    return [
      { atMs: p.firstAt, id: 'whoosh', gain: 0.55 },
      { atMs: p.firstAt + (n - 1) * p.stagger + 420, id: 'slam', gain: 0.8 },
      { atMs: p.linesAt + 180, id: 'glass', gain: 0.4 },
    ];
  },

  render: ({ params: p, el, timeMs, seed, width }) => {
    const headFf = fontStack(p.font);
    const bodyFf = fontStack('inter');
    const words = p.words.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);

    const lines = (k: number) => spring({
      frame: fr(timeMs - p.linesAt - k * 180), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });

    // The finished lockup never flattens back into a web page: the whole poster holds a ±1.6°
    // sway (rotation-only — safe under the midpoint test) and the small lines shear over the
    // headline at their own parallax depths, sharing the sway's seed so the phases agree.
    const parStrip = parallax(timeMs, seed, 0.5, width * 0.008);
    const parVenue = parallax(timeMs, seed, 0.85, width * 0.008);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          // Vertical charcoal-to-black falloff instead of a flat plate.
          background: p.fill ? `linear-gradient(180deg, ${p.bg} 0%, ${LUXE.bg0} 100%)` : 'transparent',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: p.small * 0.2,
          fontFamily: bodyFf,
          transform: sway3d(timeMs, seed, 1.6),
          ...el('lockup'),
        }}
      >
        {p.fill && <div style={luxeLightLeak('76%', '0%', 0.12)} />}
        <div
          style={{
            fontSize: p.small, letterSpacing: p.track, color: p.dim, fontWeight: 700,
            opacity: clamp01(lines(0) * 1.6),
            filter: (1 - lines(0)) * 4 > 0.3 ? `blur(${((1 - lines(0)) * 4).toFixed(2)}px)` : undefined,
            transform: `translate(${parStrip.x.toFixed(2)}px, ${(parStrip.y + (1 - lines(0)) * -width * 0.12).toFixed(2)}px)`,
            ...el('strip'),
          }}
        >
          {p.dates}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: p.size * 0.22 }}>
          {words.map((w, i) => {
            const sAt = (ms: number) => spring({
              frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
              config: { damping: 19, mass: 0.8, stiffness: 155 },
              durationInFrames: Math.max(1, Math.round(fr(700))),
            });
            const s = sAt(timeMs);
            // Seeded per WORD INDEX — re-ordering the copy re-choreographs the piece.
            const ang = random(`${seed}a${i}`) * Math.PI * 2;
            // Biased flat: words come in from the sides rather than from everywhere, so the
            // lockup is already at its full span while it is still assembling.
            const dx = Math.cos(ang) * p.throw * 1.5 * (1 - s);
            const dy = Math.sin(ang) * p.throw * 0.7 * (1 - s);
            const rot = (1 - s) * p.spin * (random(`${seed}d${i}`) > 0.5 ? 1 : -1);
            // Each word flies through 3D on a hinge facing its own approach direction, and its
            // flight velocity (sampled from the same closures that place it) smears it along the
            // travel axis — crisp the frame the lockup beat lands.
            const hinge = {
              rx: -6 - random(`${seed}hx${i}`) * 8,
              ry: (Math.cos(ang) >= 0 ? 1 : -1) * (12 + random(`${seed}hy${i}`) * 9),
              z: -110,
            };
            const vx = vel((ms) => Math.cos(ang) * p.throw * 1.5 * (1 - sAt(ms)), timeMs);
            const vy = vel((ms) => Math.sin(ang) * p.throw * 0.7 * (1 - sAt(ms)), timeMs);
            const sm = smear(vx, vy, 0.7);
            return (
              <span
                key={i}
                style={{
                  fontFamily: headFf,
                  // Tight leading: the date and venue lines hug the headline as one lockup.
                  fontSize: p.size, color: p.ink, lineHeight: 0.78, whiteSpace: 'nowrap',
                  fontWeight: 800, letterSpacing: '-0.01em',
                  opacity: clamp01(s * 2.2),
                  filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                  transform:
                    `${swingIn(s, hinge)} `
                    + `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) `
                    + `rotate(${rot.toFixed(2)}deg) `
                    + `scale(${(interpolate(s, [0, 1], [0.88, 1]) * sm.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.88, 1]) * sm.sy).toFixed(4)})`,
                  ...el(`word${i + 1}`),
                }}
              >
                {w}
              </span>
            );
          })}
        </div>

        <div
          style={{
            fontSize: p.small * 0.82, letterSpacing: p.track, color: p.dim, fontWeight: 600,
            opacity: clamp01(lines(1) * 1.6),
            filter: (1 - lines(1)) * 4 > 0.3 ? `blur(${((1 - lines(1)) * 4).toFixed(2)}px)` : undefined,
            transform: `translate(${parVenue.x.toFixed(2)}px, ${(parVenue.y + (1 - lines(1)) * width * 0.22).toFixed(2)}px)`,
            ...el('venue'),
          }}
        >
          {p.venue}
        </div>

        {p.fill && <div style={luxeVignette(0.4)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
