// Reference: logos/logo-reveal-1.mp4  (window 0-4480ms, lockup set ~2320ms)
// A tile that rounds itself from square to circle while it grows, a monogram fading in once it is
// round, and the wordmark last.
//
// Square -> circle is one border-radius interpolation, and it is deliberately NOT tied to the scale
// spring: the tile reaches full size well before it finishes rounding, so the shape change reads on
// its own instead of disappearing into the grow.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

/** The reveal re-runs on this loop (see render) — shared with sfx so the second cycle's cue
 *  lands exactly when the tile starts morphing again. */
const LOOP_MS = 3800;

export const logoMorph = defineGraphicsTemplate({
  id: 'logo_morph',
  name: 'Logo Morph',
  category: 'title',
  tags: ['Logo', 'Monogram', 'Reveal'],
  design: { w: 900, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 90 },
  fonts: ['montserrat'],

  elements: [
    { key: 'lockup', label: 'Lockup', hideable: false },
    { key: 'tile',   label: 'Tile' },
    { key: 'mark',   label: 'Monogram' },
    { key: 'word',   label: 'Wordmark' },
  ],

  params: [
    { type: 'text', key: 'mark', label: 'Monogram', group: 'Content', default: 'V', maxLength: 3 },
    { type: 'text', key: 'word', label: 'Wordmark', group: 'Content', default: 'VENTURE STUDIO', maxLength: 32 },

    { type: 'color',  key: 'tile',  label: 'Tile',   group: 'Style', default: '#101014' },
    { type: 'color',  key: 'ink',   label: 'Monogram', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'wordInk', label: 'Wordmark colour', group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Tile size', group: 'Style', default: 240, min: 60, max: 560, step: 4, unit: 'px' },
    { type: 'number', key: 'markSize', label: 'Monogram size', group: 'Style', default: 0.42, min: 0.1, max: 0.9, step: 0.02,
      help: 'Relative to the tile.' },
    { type: 'number', key: 'wordSize', label: 'Wordmark size', group: 'Style', default: 52, min: 8, max: 100, step: 2, unit: 'px' },
    { type: 'number', key: 'track', label: 'Wordmark tracking', group: 'Style', default: 6, min: 0, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'gap',   label: 'Gap',    group: 'Style', default: 230, min: 0, max: 240, step: 4, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow', group: 'Style', default: 0.2, min: 0, max: 0.6, step: 0.02 },
    { type: 'number', key: 'endRadius', label: 'Final roundness', group: 'Style', default: 50, min: 0, max: 50, step: 1, unit: '%',
      help: '50 is a circle. Lower stops at a rounded square.' },

    { type: 'number', key: 'tileAt',  label: 'Tile at',   group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'roundAt', label: 'Rounds at', group: 'Motion', default: 500, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'roundMs', label: 'Rounds over', group: 'Motion', default: 900, min: 100, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'markAt',  label: 'Monogram at', group: 'Motion', default: 1250, min: 0, max: 6000, step: 20, unit: 'ms' },
    { type: 'number', key: 'wordAt',  label: 'Wordmark at', group: 'Motion', default: 2400, min: 0, max: 7000, step: 20, unit: 'ms' },
    { type: 'number', key: 'spin',    label: 'Entry spin', group: 'Motion', default: 14, min: 0, max: 90, step: 1, unit: '°' },
  ],

  // Air as the tile arrives, a glossy pop for the monogram, a luxe ping for the wordmark, and
  // the second cycle's whoosh when the loop re-runs — all on the same At params as the motion.
  sfx: (p) => [
    { atMs: p.tileAt + 100, id: 'whoosh', gain: 0.5 },
    { atMs: p.markAt + 140, id: 'pop', gain: 0.5 },
    { atMs: p.wordAt + 240, id: 'glass', gain: 0.4 },
    { atMs: LOOP_MS + p.tileAt + 100, id: 'whoosh', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);

    // The reference re-runs the reveal: the wordmark clears and the tile is morphing again before
    // the clip ends. Modulo of the clock, never an accumulator, so any frame renders standalone.
    const cyc = timeMs % LOOP_MS;

    const growAt = (ms: number) => spring({
      frame: fr(ms - p.tileAt), fps: FPS,
      config: { damping: 18, mass: 0.8, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    const grow = growAt(cyc);
    // Independent of `grow` on purpose — see the header.
    const round = interpolate(cyc, [p.roundAt, p.roundAt + p.roundMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const mark = spring({
      frame: fr(cyc - p.markAt), fps: FPS,
      config: { damping: 24, mass: 0.6, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const word = spring({
      frame: fr(cyc - p.wordAt), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 175 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });

    // The tile swings in through 3D each cycle (enter rides the loop clock) but its resting
    // sway rides the CONTINUOUS clock, so the pose never snaps at the loop seam. The wordmark
    // parallaxes against the tile plane, and the tile's growth velocity smears it — blur that
    // is gone the moment the spring lands.
    const pose = depthPose(timeMs, seed, { enter: grow, rx: -16, z: -100, swayDeg: 1.6 });
    const parWord = parallax(timeMs, seed, 0.5, p.size * 0.045);
    const vTile = vel((ms) => interpolate(growAt(ms), [0, 1], [0.35, 1]), cyc) * p.size * 0.5;
    const smT = smear(0, vTile, 0.9);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          ...el('lockup'),
        }}
      >
        <div
          style={{
            width: p.size, height: p.size,
            borderRadius: `${(round * p.endRadius).toFixed(2)}%`,
            background: p.tile,
            border: '1px solid rgba(255,255,255,0.13)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: p.shadow > 0
              ? `0 ${p.size * 0.07}px ${p.size * 0.2}px ${rgba('#000000', p.shadow)}, `
                + `0 ${p.size * 0.02}px ${p.size * 0.06}px ${rgba('#000000', p.shadow * 0.9)}, `
                + 'inset 0 1px 0 rgba(255,255,255,0.06)'
              : 'inset 0 1px 0 rgba(255,255,255,0.06)',
            opacity: clamp01(grow * 2),
            filter: smT.blurPx > 0.3 ? `blur(${smT.blurPx.toFixed(2)}px)` : undefined,
            transform:
              `${pose} rotate(${((1 - grow) * p.spin).toFixed(2)}deg) `
              + `scale(${interpolate(grow, [0, 1], [0.35, 1]).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('tile'),
          }}
        >
          <span
            style={{
              fontSize: p.size * p.markSize, fontWeight: 700, color: p.ink, lineHeight: 1,
              textShadow: `0 0 ${Math.round(p.size * 0.12)}px ${rgba(p.ink, 0.4)}, 0 0 ${Math.round(p.size * 0.3)}px ${rgba(p.ink, 0.18)}`,
              opacity: clamp01(mark * 1.8),
              transform: `scale(${interpolate(mark, [0, 1], [0.6, 1]).toFixed(4)})`,
              ...el('mark'),
            }}
          >
            {p.mark}
          </span>
        </div>

        <span
          style={{
            marginTop: p.gap,
            fontSize: p.wordSize, fontWeight: 600, color: p.wordInk,
            letterSpacing: p.track, lineHeight: 1,
            opacity: clamp01(word * 1.6),
            transform: `translate(${parWord.x.toFixed(2)}px, ${(parWord.y + (1 - word) * p.wordSize * 0.5).toFixed(2)}px)`,
            ...el('word'),
          }}
        >
          {p.word}
        </span>
      </div>
    );
  },
});
