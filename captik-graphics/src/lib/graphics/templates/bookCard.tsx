// A floating book — darker spine strip, hairline cover frame, Playfair title set ON the
// cover — rises in with a gentle settle, then breathes on a slow timeMs sine. The 2.5px
// float is what sells "held object" over "pasted rectangle". Cover ink flips cream/dark off
// the cover colour's luminance, so any user colour keeps the title readable.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, luminance, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.44;
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)}`);
  }
  return 'M ' + pts.join(' L ') + ' Z';
}

export const bookCard = defineGraphicsTemplate({
  id: 'book_card',
  name: 'Book Card',
  category: 'story',
  tags: ['Book', 'Cover', 'Stars', 'Review', 'Author'],
  badge: 'New',
  design: { w: 900, h: 700 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 70 },
  fonts: ['playfair', 'montserrat'],

  elements: [
    { key: 'book',    label: 'Book', hideable: false },
    { key: 'stars',   label: 'Star row' },
    { key: 'caption', label: 'Caption' },
  ],

  params: [
    { type: 'text', key: 'title',   label: 'Title',   group: 'Content', default: 'ATOMIC HABITS', maxLength: 40 },
    { type: 'text', key: 'author',  label: 'Author',  group: 'Content', default: 'James Clear', maxLength: 28 },
    { type: 'text', key: 'caption', label: 'Caption', group: 'Content', multiline: true, maxLength: 90,
      default: 'The book that changed\nhow I work.' },
    { type: 'image', key: 'coverImg', label: 'Cover photo', group: 'Content', default: '', help: 'Optional — the drawn cover keeps its colour when empty.' },

    { type: 'color',  key: 'cover',  label: 'Cover',   group: 'Style', default: '#8A5A1F' },
    { type: 'color',  key: 'ink',    label: 'Caption ink', group: 'Style', default: '#F5F1E8' },
    { type: 'color',  key: 'accent', label: 'Stars',   group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'stars',  label: 'Star count', group: 'Style', default: 5, min: 1, max: 5, step: 1 },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER language: a page flick as the book settles onto the desk, a glossy pop when the
  // first star lands, a soft chime once the last star completes the rating.
  sfx: (p) => {
    const nStars = Math.max(1, Math.min(5, Math.round(p.stars)));
    return [
      { atMs: p.delay + 420, id: 'paper', gain: 0.5 },
      { atMs: p.delay + 900, id: 'pop', gain: 0.45 },
      { atMs: p.delay + 850 + (nStars - 1) * 90 + 200, id: 'chime', gain: 0.35 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;

    const tilt = (random(`${seed}-tilt`) - 0.5) * 2.4;
    const phase = random(`${seed}-ph`) * Math.PI * 2;

    // Gentle settle in, then an endless slow breath. The float only ramps in once the
    // entrance has landed so the two motions never fight.
    const enterAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 22, mass: 0.9, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const enter = enterAt(t);
    const float = Math.sin((timeMs / 2600) * Math.PI * 2 + phase) * 2.5 * clamp01((t - 700) / 500);
    const capIn = easeOutQuint(clamp01((t - 1000) / 480));

    // The book is TOSSED onto the scene, casual paper physics: a top hinge with a touch of
    // side angle, then a resting sway so the held object keeps living in space. Its descent's
    // own velocity drives blur + stretch that die the instant it lands.
    const pose = depthPose(t, seed, { enter, rx: -13, ry: 7, z: -90, swayDeg: 1.4 });
    const yAt = (ms: number) => (1 - enterAt(ms)) * height * 0.09;
    const sm = smear(0, vel(yAt, t), 1);
    // Star row + caption drift at a different depth than the book — the shear reads as space.
    const parSide = parallax(t, seed, 0.4, width * 0.008);

    const bw = width * 0.40;
    const bh = height * 0.78;
    const spine = bw * 0.06;
    const coverInk = luminance(p.cover) > 0.6 ? '#22201B' : '#F5F1E8';

    const fsTitle = Math.round(bh * 0.088);
    const fsAuthor = Math.round(bh * 0.036);
    const fsCaption = Math.round(height * 0.052);
    const starSize = Math.round(height * 0.052);
    const nStars = Math.max(1, Math.min(5, Math.round(p.stars)));

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center',
          gap: width * 0.065,
          paddingLeft: width * 0.06,
          boxSizing: 'border-box',
          fontFamily: fontStack('montserrat'),
        }}
      >
        <div
          style={{
            position: 'relative', width: bw, height: bh, flexShrink: 0,
            background: `linear-gradient(105deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 30%), ${p.cover}`,
            borderRadius: '8px 16px 16px 8px',
            boxShadow: '0 10px 24px rgba(0,0,0,0.18), 0 34px 70px rgba(0,0,0,0.24)',
            opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
            filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
            transform:
              `${pose} translateY(${(yAt(t) + float).toFixed(2)}px) ` +
              `rotate(${(tilt + (1 - enter) * 2).toFixed(3)}deg) ` +
              `scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
            ...el('book'),
          }}
        >
          {p.coverImg && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: '8px 16px 16px 8px', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.coverImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {/* Re-apply the board sheen over the photo so it still reads as a held object. */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 30%)' }} />
            </div>
          )}
          {/* Spine strip + the highlight hairline where the board meets the block. */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: spine, background: 'rgba(0,0,0,0.30)', borderRadius: '8px 0 0 8px' }} />
          <div style={{ position: 'absolute', left: spine, top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.14)' }} />

          {/* Printed cover frame with the title lockup inside it. */}
          <div
            style={{
              position: 'absolute',
              inset: `${(bh * 0.055).toFixed(1)}px ${(bw * 0.075).toFixed(1)}px ${(bh * 0.055).toFixed(1)}px ${(bw * 0.135).toFixed(1)}px`,
              border: `2px solid ${rgba(coverInk, 0.3)}`,
              borderRadius: 4,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
              padding: `${Math.round(bh * 0.1)}px ${Math.round(bw * 0.06)}px ${Math.round(bh * 0.075)}px`,
              boxSizing: 'border-box',
            }}
          >
            <span
              style={{
                fontFamily: fontStack('playfair'), fontWeight: 700, fontSize: fsTitle,
                color: coverInk, textAlign: 'center', lineHeight: 1.18, letterSpacing: '0.02em',
              }}
            >
              {p.title}
            </span>
            <span
              style={{
                fontFamily: fontStack('playfair'), fontStyle: 'italic', fontSize: fsAuthor,
                color: rgba(coverInk, 0.75), letterSpacing: '0.14em', textTransform: 'uppercase',
                textAlign: 'center', whiteSpace: 'nowrap',
              }}
            >
              {p.author}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: height * 0.035, minWidth: 0,
            transform: `translate(${parSide.x.toFixed(2)}px, ${parSide.y.toFixed(2)}px)`,
          }}
        >
          <div style={{ display: 'flex', gap: starSize * 0.24, ...el('stars') }}>
            {Array.from({ length: nStars }, (_, i) => {
              const pop = spring({
                frame: fr(t - 850 - i * 90), fps: FPS,
                config: { damping: 16, mass: 0.6, stiffness: 210 },
                durationInFrames: Math.max(1, Math.round(fr(420))),
              });
              return (
                <svg
                  key={i} width={starSize} height={starSize} viewBox="0 0 24 24"
                  // Each star swings in as an object arriving in space, from its own angle.
                  style={{
                    transform: `${swingIn(pop, { rx: -34 - i * 6, ry: (i % 2 === 0 ? 1 : -1) * 12, z: -40 })} scale(${pop.toFixed(4)})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <path d={starPath(12, 12, 11)} fill={p.accent} />
                </svg>
              );
            })}
          </div>

          <span
            style={{
              fontSize: fsCaption, fontWeight: 600, color: p.ink,
              lineHeight: 1.42, whiteSpace: 'pre-wrap',
              opacity: capIn,
              transform: `translateY(${((1 - capIn) * height * 0.03).toFixed(2)}px)`,
              ...el('caption'),
            }}
          >
            {p.caption}
          </span>
        </div>
      </div>
    );
  },
});
