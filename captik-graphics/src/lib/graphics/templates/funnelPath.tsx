// Reference: text/funnel-text-animation.mp4  (5.4s, running from frame 0 — a loop)
// A fat ribbon snaking down the frame with a word repeated along it, the text crawling around the
// curve. This is one SVG path used twice: stroked wide for the ribbon, then as the textPath the
// letters ride. Animating `startOffset` off timeMs is what moves the words along the curve — and
// because it is an attribute driven by the clock, not a CSS/SMIL animation, it survives the export.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, smear } from '../juice';

/** Viewbox the paths are authored in. Everything scales with preserveAspectRatio. */
const VB_W = 400;
const VB_H = 710;

// Every path runs off all four edges so the ribbon reaches the frame edges instead of floating in a
// band. `snake` carries the loop-de-loop the reference is built around.
const PATHS: Record<string, string> = {
  snake: 'M 450 -40 C 330 70, 130 20, 80 130 C 30 240, 320 265, 315 175 C 310 105, 195 105, 180 200 C 160 330, 40 340, 55 450 C 70 565, 260 535, 285 620 C 302 680, 350 715, 450 745',
  loop:  'M 200 -50 C 20 110, 20 290, 200 290 C 380 290, 380 100, 200 190 C 20 290, 20 545, 200 605 C 320 645, 370 700, 380 760',
  wave:  'M -50 130 C 110 20, 290 230, 450 120 M -50 390 C 110 280, 290 490, 450 380 M -50 640 C 110 530, 290 740, 450 630',
  fall:  'M 200 -50 C 200 150, 40 250, 200 370 C 360 490, 200 600, 200 760',
};

export const funnelPath = defineGraphicsTemplate({
  id: 'funnel_path',
  name: 'Ribbon Path',
  category: 'title',
  tags: ['Text', 'Path', 'Loop'],
  design: { w: 800, h: 1420 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat'],

  elements: [
    { key: 'ribbon', label: 'Ribbon', hideable: false },
    { key: 'text',   label: 'Text' },
    { key: 'edge',   label: 'Ribbon outline' },
  ],

  params: [
    { type: 'text', key: 'text', label: 'Word', group: 'Content', default: 'CAPTIK', maxLength: 24,
      help: 'Repeated end to end along the ribbon.' },
    { type: 'select', key: 'shape', label: 'Path', group: 'Content', default: 'snake', options: [
      { value: 'snake', label: 'Snake' },
      { value: 'loop',  label: 'Loop' },
      { value: 'wave',  label: 'Waves' },
      { value: 'fall',  label: 'Falling S' },
    ] },

    { type: 'color',  key: 'bg',     label: 'Background', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'ribbon', label: 'Ribbon',     group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'ink',    label: 'Text',       group: 'Style', default: '#101014' },
    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'width',  label: 'Ribbon width', group: 'Style', default: 74, min: 8, max: 160, step: 2, unit: 'px' },
    { type: 'number', key: 'size',   label: 'Text size',    group: 'Style', default: 31, min: 8, max: 80, step: 1, unit: 'px' },
    { type: 'number', key: 'track',  label: 'Tracking',     group: 'Style', default: 4, min: 0, max: 30, step: 1, unit: 'px' },
    { type: 'number', key: 'outline', label: 'Ribbon outline', group: 'Style', default: 0, min: 0, max: 20, step: 1, unit: 'px' },
    { type: 'boolean', key: 'fillBg', label: 'Paint the background', group: 'Style', default: true },

    { type: 'number',  key: 'speed', label: 'Crawl speed', group: 'Motion', default: 70, min: -300, max: 300, step: 5, unit: 'px/s' },
    { type: 'number',  key: 'reveal', label: 'Draw the ribbon over', group: 'Motion', default: 900, min: 0, max: 4000, step: 50, unit: 'ms',
      help: '0 draws it instantly.' },
  ],

  // The band takes off, then completes its run — both cut to `reveal`, the one param that times
  // the draw. Nothing else in the loop is an event, and a cue per crawl cycle would be a
  // metronome over an ambient piece.
  sfx: (p) => [
    { atMs: 0, id: 'whoosh', gain: 0.5 },
    { atMs: p.reveal, id: 'swish', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const d = PATHS[p.shape] ?? PATHS.snake;
    // One id per shape is enough: two instances of the same template would share a def, and they
    // would be sharing an IDENTICAL path, so nothing can cross-wire.
    const pid = `fp_${p.shape}`;

    const draw = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.9, stiffness: 120 },
      durationInFrames: Math.max(1, Math.round(fr(Math.max(1, p.reveal)))),
    });
    const drawn = p.reveal <= 0 ? 1 : draw;

    // Repeat the word enough times to cover any path length in the viewbox.
    const unit = `${p.text} `;
    const repeated = unit.repeat(Math.max(1, Math.ceil(5200 / Math.max(1, unit.length * p.size * 0.62))));
    const offset = -((timeMs / 1000) * p.speed);

    // The ribbon is a physical band hanging in the frame, not a flat decal: it swings into place
    // on the same spring that draws it, then keeps a ±2° breath for the whole loop. The paths
    // deliberately overshoot the viewbox on all four sides, so the tilt never exposes an edge.
    const pose = depthPose(timeMs, seed, { enter: drawn, rx: -9, ry: 13, z: -80, swayDeg: 2, periodMs: 5000 });
    // The words never come to rest — they crawl forever — so their smear is honest and CONSTANT,
    // and self-limiting: at the default 70px/s it sits under the blur floor and the type stays
    // sharp; wind the crawl up past ~150px/s and the letters start to streak, as they should.
    const crawlBlur = smear(Math.abs(p.speed) / 1000, 0, 1).blurPx;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          // A soft top-light over the user's colour keeps the ground from reading flat.
          background: p.fillBg
            ? `radial-gradient(ellipse 120% 85% at 50% 0%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 55%), ${p.bg}`
            : 'transparent',
          fontFamily: ff,
        }}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid slice"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            transform: pose, transformOrigin: 'center center',
          }}
        >
          <defs>
            <path id={pid} d={d} fill="none" />
          </defs>

          <g style={{ ...el('edge') }}>
            {p.outline > 0 && (
              <path
                d={d}
                fill="none"
                stroke={p.ink}
                strokeWidth={p.width + p.outline * 2}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - drawn}
              />
            )}
          </g>
          <g style={{ filter: 'drop-shadow(0 16px 34px rgba(0,0,0,0.45))', ...el('ribbon') }}>
            <path
              d={d}
              fill="none"
              stroke={p.ribbon}
              strokeWidth={p.width}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - drawn}
            />
          </g>

          <text
            fill={p.ink}
            fontSize={p.size}
            fontWeight={700}
            letterSpacing={p.track}
            dominantBaseline="middle"
            style={{
              fontFamily: ff,
              opacity: interpolate(drawn, [0.3, 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              filter: crawlBlur > 0.3 ? `blur(${crawlBlur.toFixed(2)}px)` : undefined,
              ...el('text'),
            }}
          >
            <textPath href={`#${pid}`} startOffset={offset} spacing="auto">
              {repeated}
            </textPath>
          </text>
        </svg>

        {p.fillBg && <div style={luxeVignette(0.45)} />}
        {p.fillBg && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
