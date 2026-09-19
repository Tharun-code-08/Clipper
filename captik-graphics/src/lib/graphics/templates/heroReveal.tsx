// Reference: launch-videos/animate-characters.mp4  (window 0-4600ms, lockup set ~2000ms)
// A hero mark lit against a starfield, with a title and a tracked-out subtitle arriving after it,
// then a hard CUT to a second scene — a forest under its own chapter title.
// The stars twinkle on their own seeded phases and the mark keeps a slow float, so the frame is
// never completely still even once the copy has landed.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

const MAX_STARS = 16;

export const heroReveal = defineGraphicsTemplate({
  id: 'hero_reveal',
  name: 'Hero Reveal',
  category: 'title',
  tags: ['Hero', 'Starfield', 'Launch'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat'],

  elements: [
    { key: 'scene', label: 'Scene', hideable: false },
    { key: 'stars', label: 'Stars' },
    { key: 'mark',  label: 'Hero mark' },
    { key: 'title', label: 'Title' },
    { key: 'sub',   label: 'Subtitle' },
    { key: 'part2', label: 'Part 2 title' },
    { key: 'forest', label: 'Part 2 forest' },
  ],

  params: [
    { type: 'text',  key: 'glyph', label: 'Hero glyph', group: 'Content', default: '🦄', maxLength: 4,
      help: 'Ignored when an image is supplied.' },
    { type: 'image', key: 'image', label: 'Hero image', group: 'Content', default: '' },
    { type: 'text',  key: 'title', label: 'Title',      group: 'Content', default: 'Magic Horse', maxLength: 32 },
    { type: 'text',  key: 'sub',   label: 'Subtitle',   group: 'Content', default: 'A MYSTICAL JOURNEY', maxLength: 40 },

    { type: 'color',  key: 'bg',    label: 'Background', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'glow',  label: 'Glow',       group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',   label: 'Title',      group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Subtitle',   group: 'Style', default: '#8B887E' },
    { type: 'font',   key: 'font',  label: 'Font',       group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Hero size',  group: 'Style', default: 430, min: 60, max: 700, step: 10, unit: 'px' },
    { type: 'number', key: 'titleSize', label: 'Title size', group: 'Style', default: 82, min: 12, max: 160, step: 2, unit: 'px' },
    { type: 'number', key: 'subSize', label: 'Subtitle size', group: 'Style', default: 29, min: 8, max: 70, step: 1, unit: 'px' },
    { type: 'number', key: 'track', label: 'Subtitle tracking', group: 'Style', default: 6, min: 0, max: 30, step: 1, unit: 'px' },
    { type: 'boolean', key: 'fill', label: 'Paint the background', group: 'Style', default: true },
    { type: 'boolean', key: 'stars', label: 'Starfield',  group: 'Style', default: true },

    { type: 'number', key: 'markAt',  label: 'Hero at',  group: 'Motion', default: 120, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'titleAt', label: 'Title at', group: 'Motion', default: 800, min: 0, max: 5000, step: 20, unit: 'ms' },
    { type: 'number', key: 'subAt',   label: 'Subtitle at', group: 'Motion', default: 1150, min: 0, max: 6000, step: 20, unit: 'ms' },
    { type: 'number', key: 'float',   label: 'Float',    group: 'Motion', default: 14, min: 0, max: 90, step: 2, unit: 'px' },

    { type: 'text',   key: 'part2',   label: 'Part 2 title', group: 'Part 2', default: 'Part 2: The Mystery Forest', maxLength: 44,
      help: 'The reference cuts to a second scene near the end. Clear this to stop after the hero.' },
    { type: 'color',  key: 'canopy',  label: 'Near trees', group: 'Part 2', default: '#1F4426' },
    { type: 'color',  key: 'far',     label: 'Far trees',  group: 'Part 2', default: '#0F2617' },
    { type: 'color',  key: 'ground',  label: 'Ground glow', group: 'Part 2', default: '#3F8A4A' },
    { type: 'number', key: 'rows',    label: 'Tree rows',  group: 'Part 2', default: 4, min: 1, max: 5, step: 1 },
    { type: 'number', key: 'part2At', label: 'Part 2 at',  group: 'Part 2', default: 3700, min: 500, max: 14000, step: 50, unit: 'ms' },
    { type: 'number', key: 'cutMs',   label: 'Scene cut over', group: 'Part 2', default: 420, min: 60, max: 2000, step: 20, unit: 'ms' },
  ],

  // Air as the mark descends, a mystical chime when the title lands, and a fast pass on the hard
  // cut to scene 2 — all riding the same At params as the motion, and no cut cue if part2 is off.
  sfx: (p) => {
    const cues: { atMs: number; id: 'whoosh' | 'chime' | 'swish'; gain: number }[] = [
      { atMs: p.markAt + 60, id: 'whoosh', gain: 0.55 },
      { atMs: p.titleAt + 150, id: 'chime', gain: 0.4 },
    ];
    if (p.part2) cues.push({ atMs: p.part2At + 40, id: 'swish', gain: 0.45 });
    return cues;
  },

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);

    const markAt = (ms: number) => spring({
      frame: fr(ms - p.markAt), fps: FPS,
      config: { damping: 18, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(430))),
    });
    const mark = markAt(timeMs);
    const title = spring({
      frame: fr(timeMs - p.titleAt), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const sub = spring({
      frame: fr(timeMs - p.subAt), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const bob = Math.sin(timeMs / 1700) * p.float;

    // The lockup lives in 3D: mark, title and subtitle each carry the SAME seeded sway (one
    // assembly, not three floating divs) but swing in on their own hinges, and the flat layers
    // parallax against the mark so the hold has depth instead of a web page's stillness.
    const poseMark = depthPose(timeMs, seed, { enter: mark, rx: -14, z: -110, swayDeg: 2 });
    const poseTitle = depthPose(timeMs, seed, { enter: title, rx: -10, z: -60, swayDeg: 2 });
    const poseSub = depthPose(timeMs, seed, { enter: sub, rx: -8, z: -40, swayDeg: 2 });
    const parStars = parallax(timeMs, seed, 0.25, height * 0.008);
    const parTitle = parallax(timeMs, seed, 0.45, height * 0.009);
    const parSub = parallax(timeMs, seed, 0.7, height * 0.009);
    // MOTION BLUR: the mark's arrival velocity (entrance drop + scale-up edge speed) smears it
    // mid-flight; the glow pose lands crisp the moment the spring settles.
    const vMark = vel(markAt, timeMs) * (height * 0.02 + p.size * 0.07);
    const smMark = smear(0, vMark, 1);

    // Scene 2. The hero does NOT stay under it — the reference hard-cuts, and leaving the mark
    // showing through a semi-transparent forest is what would make it read as a dissolve.
    const cut = p.part2
      ? interpolate(timeMs, [p.part2At, p.part2At + p.cutMs], [0, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      })
      : 0;
    const rows = Math.round(p.rows);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? `radial-gradient(120% 80% at 50% 42%, ${rgba(p.glow, 0.16)}, ${p.bg} 62%)` : 'transparent',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          ...el('scene'),
        }}
      >
        {p.stars && (
          <div style={{ position: 'absolute', inset: 0, transform: `translate(${parStars.x.toFixed(2)}px, ${parStars.y.toFixed(2)}px)`, ...el('stars') }}>
            {Array.from({ length: MAX_STARS }).map((_, i) => {
              const sx = random(`${seed}sx${i}`);
              const sy = random(`${seed}sy${i}`);
              const ph = random(`${seed}sp${i}`) * Math.PI * 2;
              const d = 2 + random(`${seed}sd${i}`) * 2.4;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${(9 + sx * 82).toFixed(1)}%`, top: `${(6 + sy * 66).toFixed(1)}%`,
                    width: d, height: d, borderRadius: '50%',
                    background: '#F4F1E8',
                    opacity: (0.14 + 0.42 * (0.5 + 0.5 * Math.sin(timeMs / 800 + ph))) * clamp01(mark),
                  }}
                />
              );
            })}
          </div>
        )}

        <div
          style={{
            position: 'relative',
            fontSize: p.size, lineHeight: 1,
            width: p.image ? p.size : undefined, height: p.image ? p.size : undefined,
            filter: `${smMark.blurPx > 0.3 ? `blur(${smMark.blurPx.toFixed(2)}px) ` : ''}drop-shadow(0 0 ${width * 0.06}px ${rgba(p.glow, 0.85 * clamp01(mark))})`,
            opacity: clamp01(mark * 1.6) * (1 - cut),
            transform:
              `${poseMark} translateY(${(bob - (1 - mark) * height * 0.02).toFixed(2)}px) `
              + `scale(${(interpolate(mark, [0, 1], [0.86, 1]) * smMark.sx).toFixed(4)}, ${(interpolate(mark, [0, 1], [0.86, 1]) * smMark.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('mark'),
          }}
        >
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : p.glyph}
        </div>

        <span
          style={{
            marginTop: p.titleSize * 0.6,
            fontSize: p.titleSize, fontWeight: 700, color: p.ink, lineHeight: 1.1,
            opacity: clamp01(title * 1.6) * (1 - cut),
            transform: `${poseTitle} translate(${parTitle.x.toFixed(2)}px, ${(parTitle.y + (1 - title) * height * 0.014).toFixed(2)}px)`,
            ...el('title'),
          }}
        >
          {p.title}
        </span>
        <span
          style={{
            marginTop: p.subSize * 0.5,
            fontSize: p.subSize, color: p.dim, letterSpacing: p.track, fontWeight: 600,
            textTransform: 'uppercase',
            opacity: clamp01(sub * 1.6) * (1 - cut),
            transform: `${poseSub} translate(${parSub.x.toFixed(2)}px, ${(parSub.y + (1 - sub) * height * 0.01).toFixed(2)}px)`,
            ...el('sub'),
          }}
        >
          {p.sub}
        </span>

        {cut > 0 && (
          <>
            {/* The hero scene's warm wash has to go, or the forest sits in the wrong night.
                The reference's second scene is near-black with only the ground glowing. */}
            <div
              style={{
                position: 'absolute', inset: 0,
                background: '#070708',
                opacity: cut * 0.82,
              }}
            />

            {/* Forest. Rows are drawn far-to-near with the near rows taller and lighter, so the
                band reads as depth rather than as one stripe of triangles. */}
            <svg
              viewBox={`0 0 ${width} ${height}`}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: cut, ...el('forest') }}
            >
              <defs>
                <linearGradient id="captik_hero_ground" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={rgba(p.ground, 0)} />
                  <stop offset="100%" stopColor={rgba(p.ground, 0.55)} />
                </linearGradient>
              </defs>
              <rect x={0} y={height * 0.74} width={width} height={height * 0.26} fill="url(#captik_hero_ground)" />
              {Array.from({ length: rows }).map((_, r) => {
                const depth = r / Math.max(1, rows - 1);
                const baseY = height * (0.66 + r * 0.072);
                const th = height * (0.036 + r * 0.014);
                const tw = th * 0.72;
                const step = tw * 0.86;
                const n = Math.ceil(width / step) + 1;
                // Rows rise into place a beat apart, nearest last.
                const lift = (1 - clamp01((cut - r * 0.12) / 0.6)) * height * 0.05;
                const tint = r === 0 ? p.far : depth > 0.6 ? p.canopy : rgba(p.canopy, 0.85);
                // Near rows drift more than far ones — the same parallax phase as the hero
                // scene's sway, so the forest band reads as PLANES of trees, not one stripe.
                const parRow = parallax(timeMs, seed, 0.12 + depth * 0.45, width * 0.008);
                return (
                  <g key={r} transform={`translate(${parRow.x.toFixed(1)} ${(lift + parRow.y).toFixed(1)})`}>
                    {Array.from({ length: n }).map((_, i) => {
                      const x = i * step - (r % 2 ? step * 0.45 : 0);
                      return (
                        <polygon
                          key={i}
                          points={`${x},${baseY} ${x + tw / 2},${baseY - th} ${x + tw},${baseY}`}
                          fill={tint}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>

            <span
              style={{
                position: 'absolute', left: 0, right: 0, top: '8%',
                textAlign: 'center',
                fontSize: p.titleSize * 0.80, fontWeight: 700, color: p.ink, letterSpacing: 0.5,
                opacity: cut,
                transform: `${depthPose(timeMs, seed, { enter: cut, rx: -10, z: -50, swayDeg: 1.5 })} translateY(${((1 - cut) * height * 0.012).toFixed(2)}px)`,
                ...el('part2'),
              }}
            >
              {p.part2}
            </span>
          </>
        )}

        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
