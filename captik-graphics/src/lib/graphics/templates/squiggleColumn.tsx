// Reference: text/squiggle-flow-text.mp4  (10.5s, already scrolling at frame 0 — it is a loop)
// A wavy column of words crawling upward. The blobby edge is not a shape or a mask: every row is a
// pill sized to its own text, and consecutive rows of different widths OVERLAP vertically so they
// merge into one continuous squiggle. Getting that right is the whole template — a clip-path or an
// SVG blob would need re-authoring for every word list.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { depthPose, smear } from '../juice';

const MAX_WORDS = 8;

export const squiggleColumn = defineGraphicsTemplate({
  id: 'squiggle_column',
  name: 'Squiggle Column',
  category: 'title',
  tags: ['Text', 'Loop', 'Marquee'],
  design: { w: 760, h: 1350 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 10300,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat'],

  elements: [
    { key: 'column', label: 'Column', hideable: false },
    ...Array.from({ length: MAX_WORDS }, (_, i) => ({ key: `word${i + 1}`, label: `Word ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'words', label: 'Words', group: 'Content', multiline: true, maxLength: 240,
      default: 'TUESDAY\nTWENTYSIX\n2026\nMAY',
      help: 'One per line. The column repeats them forever.' },

    { type: 'color',  key: 'fill',  label: 'Blob',  group: 'Style', default: '#D97706' },
    { type: 'color',  key: 'ink',   label: 'Text',  group: 'Style', default: '#0B0B0D' },
    { type: 'font',   key: 'font',  label: 'Font',  group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Text size', group: 'Style', default: 78, min: 14, max: 120, step: 2, unit: 'px' },
    { type: 'number', key: 'padX',  label: 'Side padding', group: 'Style', default: 68, min: 0, max: 160, step: 4, unit: 'px' },
    { type: 'number', key: 'rowH',  label: 'Row height', group: 'Style', default: 128, min: 20, max: 200, step: 2, unit: 'px' },
    { type: 'number', key: 'bleed', label: 'Row overlap', group: 'Style', default: 16, min: 0, max: 60, step: 2, unit: 'px',
      help: 'How far rows merge into each other. This is what makes the edge wavy.' },

    { type: 'number',  key: 'speed', label: 'Scroll speed', group: 'Motion', default: 90, min: 0, max: 420, step: 5, unit: 'px/s' },
    { type: 'boolean', key: 'up',    label: 'Scroll upward', group: 'Motion', default: true },
  ],

  // One quiet air pass as the column materialises — the crawl itself is ambience and stays
  // unscored; a cue per row would loop into noise.
  sfx: () => [
    { atMs: 90, id: 'whoosh', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, height, seed }) => {
    const ff = fontStack(p.font);
    const words = p.words.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_WORDS);
    if (!words.length) return null;

    const pitch = Math.max(8, p.rowH - p.bleed);
    // Repeat enough to overfill the frame at any offset, plus one full word cycle so the loop is
    // seamless when the offset wraps.
    const repeats = Math.ceil(height / pitch) + words.length + 2;

    const travel = (timeMs / 1000) * p.speed * (p.up ? 1 : -1);
    // Wrap on a whole number of words so the sequence never jumps mid-list.
    const loop = words.length * pitch;
    const offset = ((travel % loop) + loop) % loop;

    const appear = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    // The SYSTEM lives in depth: the whole column swings in on the existing appear spring and
    // then holds a ±1.7° sway — the crawl itself is untouched, it just happens on a plane in
    // space instead of a flat web page. Rotating the one plane foreshortens far rows naturally.
    const pose = depthPose(timeMs, seed, { enter: appear, rx: -12, z: -80, swayDeg: 1.7 });
    // Uniform crawl blur: the rows share one constant velocity, so one filter on the column IS
    // the motion blur of the scroll. Sub-threshold at the default speed; smears when cranked.
    const crawl = smear(0, p.speed / 1000);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          fontFamily: ff,
          opacity: interpolate(appear, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
          transform: pose,
          filter: crawl.blurPx > 0.3 ? `blur(${crawl.blurPx.toFixed(2)}px)` : undefined,
          ...el('column'),
        }}
      >
        {Array.from({ length: repeats }).map((_, k) => {
          const w = words[k % words.length];
          const y = k * pitch - offset - pitch;
          if (y < -p.rowH * 2 || y > height + p.rowH) return null;
          return (
            <div
              key={k}
              style={{
                position: 'absolute', left: 0, right: 0, top: y,
                display: 'flex', justifyContent: 'center',
              }}
            >
              <div
                style={{
                  height: p.rowH, padding: `0 ${p.padX}px`,
                  borderRadius: p.rowH,
                  background: p.fill, color: p.ink,
                  fontSize: p.size, fontWeight: 800, letterSpacing: p.size * 0.04,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  whiteSpace: 'nowrap',
                  ...el(`word${(k % words.length) + 1}`),
                }}
              >
                {w}
              </div>
            </div>
          );
        })}
      </div>
    );
  },
});
