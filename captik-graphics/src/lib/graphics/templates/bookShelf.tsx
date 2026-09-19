// Reference: social/mobile-bookshelf.mp4  (window 520-6280ms, last shelf lands ~4200ms)
// A phone screen that builds a bookshelf a shelf at a time: the heading rises, then for each
// category the label fades in, a coloured plank sweeps out from the left, and the covers push up
// from behind it. The button lands last.
//
// Measured off the capture (phone 289x613 in a 422x752 frame): the book row is 14% of the phone
// height, the plank 2%, the label 4.5%, and covers are 1.35:1. Cadence is ~1050ms per shelf, split
// into plank-then-books ~500ms apart — that split is what stops three shelves reading as one
// block wipe.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, inkOn, luminance, rgba } from '../motion';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_SHELVES = 3;
const MAX_BOOKS = 5;

/** Covers cycle this palette by ABSOLUTE book index, so adding a book never re-colours the ones
 *  before it. The order is the reference's own run of covers read left-to-right, top-to-bottom,
 *  which is why the shipped defaults land on its exact palette per shelf. */
const COVERS = [
  '#e8dcc8', '#1f2a44', '#f5a524', '#f2f4f7',
  '#17a67d', '#a06fd0', '#e5484d',
  '#2f6f4e', '#c98f5a', '#d98cae', '#2b3a55',
  '#8fbf7f', '#e6d7c3', '#6aa6e8', '#f0e3c8',
];

/** "Design|16 books|#f5a524|Complete Book,Industrial Design A-Z,Sketching" */
function parseShelves(raw: string) {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_SHELVES).map((l) => {
    const [name = '', count = '', plank = '#f5a524', books = ''] = l.split('|').map((s) => s.trim());
    return {
      name, count, plank,
      books: books.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_BOOKS),
    };
  });
}

export const bookShelf = defineGraphicsTemplate({
  id: 'book_shelf',
  name: 'Bookshelf',
  category: 'device',
  tags: ['Phone', 'Shelf', 'Library'],
  // The capture's phone is 289x613 in a 422x752 frame — 2.12:1 and 68% of the frame width. Both
  // numbers matter: a 1.9:1 canvas at appList's 56% renders a noticeably squatter, smaller handset
  // than the reference, which is exactly what the first pass got wrong.
  design: { w: 620, h: 1310 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 68 },
  fonts: ['inter'],

  elements: [
    { key: 'phone',  label: 'Phone', hideable: false },
    { key: 'kicker', label: 'Kicker' },
    { key: 'title',  label: 'Heading' },
    ...Array.from({ length: MAX_SHELVES }, (_, i) => ({ key: `shelf${i + 1}`, label: `Shelf ${i + 1}` })),
    ...Array.from({ length: MAX_SHELVES }, (_, i) => ({ key: `plank${i + 1}`, label: `Plank ${i + 1}` })),
    { key: 'cta', label: 'Button' },
  ],

  params: [
    { type: 'text', key: 'kicker', label: 'Kicker',  group: 'Content', default: 'My Favourite', maxLength: 32 },
    { type: 'text', key: 'title',  label: 'Heading', group: 'Content', default: 'BOOKS', maxLength: 18 },
    { type: 'text', key: 'shelves', label: 'Shelves', group: 'Content', multiline: true, maxLength: 600,
      default:
        'Design|16 books|#F59E0B|Complete Book,Industrial Design A-Z,Discovery Habits,Sketching\n'
        + 'Psychology|3 books|#7E93AF|Reset People,Subconscious Mind,Body Keeps Score\n'
        + 'Novels|8 books|#3F6B54|Paper Palace,House,Vanishing Half,Novel',
      help: 'One shelf per line: name | count | plank colour | comma-separated titles.' },
    { type: 'text', key: 'cta', label: 'Button', group: 'Content', default: 'Add Books', maxLength: 24 },

    { type: 'color',  key: 'screen', label: 'Screen', group: 'Style', default: '#111115' },
    { type: 'color',  key: 'ink',    label: 'Heading', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'sub',    label: 'Secondary', group: 'Style', default: '#9A958A' },
    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'inter' },
    { type: 'boolean', key: 'chrome', label: 'Phone frame', group: 'Style', default: true },
    { type: 'boolean', key: 'covers', label: 'Titles on covers', group: 'Style', default: true },

    // Timings read straight off the capture with its lead-in stripped: heading 520ms, plank 1 at
    // 820 (plank complete 1300, covers 1580), then +1050 per shelf, button at 3800.
    { type: 'number', key: 'titleAt',   label: 'Heading at',   group: 'Motion', default: 520, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'shelfAt',   label: 'First shelf at', group: 'Motion', default: 820, min: 200, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'shelfGap',  label: 'Shelf stagger', group: 'Motion', default: 1050, min: 200, max: 2500, step: 50, unit: 'ms' },
    { type: 'number', key: 'bookDelay', label: 'Covers after plank', group: 'Motion', default: 460, min: 0, max: 1500, step: 20, unit: 'ms' },
    { type: 'number', key: 'bookGap',   label: 'Cover stagger', group: 'Motion', default: 70, min: 0, max: 400, step: 10, unit: 'ms' },
    { type: 'number', key: 'ctaAt',     label: 'Button at',    group: 'Motion', default: 3800, min: 500, max: 9000, step: 50, unit: 'ms' },
  ],

  // Device + PAPER language: air as the handset arrives, a page flick as each of the first two
  // shelves' covers push up, and one glossy pop when the button lands — all off the shelf timing.
  sfx: (p) => [
    { atMs: 30, id: 'whoosh', gain: 0.4 },
    { atMs: p.shelfAt + p.bookDelay + 140, id: 'paper', gain: 0.5 },
    { atMs: p.shelfAt + p.shelfGap + p.bookDelay + 140, id: 'paper', gain: 0.4 },
    { atMs: p.ctaAt + 160, id: 'pop', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const shelves = parseShelves(p.shelves);

    const bezel = p.chrome ? Math.round(width * 0.026) : 0;
    const radius = Math.round(width * 0.11);
    const pad = Math.round(width * 0.055);
    const inner = width - bezel * 2 - pad * 2;

    const bookH = Math.round(height * 0.14);
    const plankH = Math.round(height * 0.02);
    const labelH = Math.round(height * 0.045);
    const blockGap = Math.round(height * 0.026);
    const ctaH = Math.round(height * 0.048);

    const phoneInAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const phoneIn = phoneInAt(timeMs);
    // DEPTH: the handset arrives as a physical object — 3D swing plus an approach smear that dies
    // on landing — then rests nearly still (0.8°: it is a phone, not a floating card). The screen
    // text layers parallax subtly against the glass at different depths.
    const pose = depthPose(timeMs, seed, { enter: phoneIn, rx: -14, ry: 6, z: -150, swayDeg: 0.8, periodMs: 5200 });
    const phoneSmear = smear(0, vel((ms: number) => (1 - phoneInAt(ms)) * width * 0.22, timeMs));
    const parKicker = parallax(timeMs, seed, 0.2, width * 0.009, 5200);
    const parTitle = parallax(timeMs, seed, 0.26, width * 0.009, 5200);
    const parCta = parallax(timeMs, seed, 0.33, width * 0.009, 5200);
    const kickerIn = spring({
      frame: fr(timeMs - p.titleAt), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(340))),
    });
    const titleIn = spring({
      frame: fr(timeMs - p.titleAt - 120), fps: FPS,
      config: { damping: 22, mass: 0.7, stiffness: 175 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });
    const ctaIn = spring({
      frame: fr(timeMs - p.ctaAt), fps: FPS,
      config: { damping: 18, mass: 0.6, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    let bookNo = 0;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.chrome ? '#0f0f10' : 'transparent',
          borderRadius: radius, padding: bezel, boxSizing: 'border-box',
          fontFamily: ff,
          opacity: interpolate(phoneIn, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
          filter: phoneSmear.blurPx > 0.3 ? `blur(${phoneSmear.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} scale(${(interpolate(phoneIn, [0, 1], [0.965, 1]) * phoneSmear.sx).toFixed(4)}, ${(interpolate(phoneIn, [0, 1], [0.965, 1]) * phoneSmear.sy).toFixed(4)})`,
          transformOrigin: 'center center',
          border: p.chrome ? '1px solid rgba(255,255,255,0.12)' : undefined,
          boxShadow: p.chrome ? `0 ${width * 0.04}px ${width * 0.1}px ${rgba('#000000', 0.35)}, 0 ${width * 0.13}px ${width * 0.3}px ${rgba('#000000', 0.4)}` : undefined,
          ...el('phone'),
        }}
      >
        <div
          style={{
            position: 'relative', width: '100%', height: '100%',
            background: p.screen, borderRadius: Math.max(0, radius - bezel), overflow: 'hidden',
            display: 'flex', flexDirection: 'column', padding: pad, boxSizing: 'border-box',
          }}
        >
          {p.chrome && (
            <div style={{ alignSelf: 'center', width: width * 0.26, height: Math.round(height * 0.008), borderRadius: 99, background: rgba(p.ink, 0.22), marginBottom: pad * 0.5 }} />
          )}

          <span
            style={{
              fontSize: Math.round(width * 0.036), color: p.sub, fontWeight: 500,
              opacity: interpolate(kickerIn, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translate(${parKicker.x.toFixed(2)}px, ${(parKicker.y + (1 - kickerIn) * height * 0.012).toFixed(2)}px)`,
              ...el('kicker'),
            }}
          >
            {p.kicker}
          </span>
          <span
            style={{
              fontSize: Math.round(width * 0.118), fontWeight: 800, color: p.ink,
              letterSpacing: -width * 0.002, lineHeight: 1.1, marginBottom: blockGap,
              opacity: interpolate(titleIn, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translate(${parTitle.x.toFixed(2)}px, ${(parTitle.y + (1 - titleIn) * height * 0.022).toFixed(2)}px)`,
              ...el('title'),
            }}
          >
            {p.title}
          </span>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: blockGap }}>
            {shelves.map((sh, si) => {
              const at = p.shelfAt + si * p.shelfGap;
              const labelIn = spring({
                frame: fr(timeMs - at), fps: FPS,
                config: { damping: 26, mass: 0.55, stiffness: 200 },
                durationInFrames: Math.max(1, Math.round(fr(300))),
              });
              // The plank sweeps out from the left on its own spring — measured at ~520ms in the
              // capture, and it is the motion that anchors each shelf before its covers arrive.
              const plankIn = spring({
                frame: fr(timeMs - at - 60), fps: FPS,
                config: { damping: 30, mass: 0.9, stiffness: 120 },
                durationInFrames: Math.max(1, Math.round(fr(420))),
              });
              const nb = sh.books.length;
              const bookW = nb ? (inner - Math.round(inner * 0.023) * (nb - 1)) / nb : inner;

              return (
                <div key={si} style={{ display: 'flex', flexDirection: 'column', ...el(`shelf${si + 1}`) }}>
                  <div
                    style={{
                      height: labelH, display: 'flex', alignItems: 'center', gap: pad * 0.28,
                      opacity: interpolate(labelIn, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
                      transform: `translateX(${((1 - labelIn) * width * 0.03).toFixed(2)}px)`,
                    }}
                  >
                    <span style={{ fontSize: Math.round(width * 0.042), fontWeight: 700, color: p.ink }}>{sh.name}</span>
                    <span style={{ fontSize: Math.round(width * 0.03), color: p.sub }}>{sh.count}</span>
                    <span style={{ flex: 1 }} />
                    {[0, 1].map((k) => (
                      <span
                        key={k}
                        style={{
                          width: Math.round(width * 0.042), height: Math.round(width * 0.042),
                          borderRadius: Math.round(width * 0.012),
                          border: `2px solid ${rgba(p.sub, 0.35)}`,
                          color: rgba(p.sub, 0.9), fontSize: Math.round(width * 0.026),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {k === 0 ? '‹' : '›'}
                      </span>
                    ))}
                  </div>

                  {/* Covers push UP from behind the plank, so the row clips them until they clear it. */}
                  <div style={{ height: bookH, overflow: 'hidden', display: 'flex', alignItems: 'flex-end', gap: Math.round(inner * 0.023) }}>
                    {sh.books.map((b, bi) => {
                      const idx = bookNo++;
                      const sAt = (ms: number) => spring({
                        frame: fr(ms - at - p.bookDelay - bi * p.bookGap), fps: FPS,
                        config: { damping: 21, mass: 0.6, stiffness: 190 },
                        durationInFrames: Math.max(1, Math.round(fr(300))),
                      });
                      const s = sAt(timeMs);
                      // Shelved books are never all the same height. A seeded jitter is what sells
                      // it as a shelf rather than a bar chart.
                      const h = bookH * (0.84 + random(`${seed}b${idx}`) * 0.16);
                      // Z-STAGGER: each cover leans back off its bottom hinge and stands up as it
                      // rises, its climb velocity smearing it mid-flight — books being SHELVED,
                      // not bars growing. Blur dies exactly as each one seats.
                      const coverSmear = smear(0, vel((ms: number) => (1 - sAt(ms)) * h, timeMs));
                      const cover = COVERS[idx % COVERS.length];
                      return (
                        <div
                          key={bi}
                          style={{
                            width: bookW, height: h, flexShrink: 0,
                            background: cover,
                            borderRadius: Math.round(width * 0.008),
                            // A cover too close to the screen tone would otherwise vanish — light
                            // covers get a dark edge, near-black covers a hairline, like the reference.
                            border: luminance(cover) > 0.86 ? `2px solid ${rgba('#000000', 0.09)}`
                              : luminance(cover) < 0.12 ? '1px solid rgba(255,255,255,0.14)' : undefined,
                            boxShadow: `0 ${(h * 0.03).toFixed(1)}px ${(h * 0.08).toFixed(1)}px ${rgba('#000000', 0.3)}`,
                            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                            padding: Math.round(width * 0.01), boxSizing: 'border-box',
                            opacity: clamp01(s * 3),
                            filter: coverSmear.blurPx > 0.3 ? `blur(${coverSmear.blurPx.toFixed(2)}px)` : undefined,
                            transform: `${swingIn(s, { rx: -16 - (bi % 3) * 4, z: -50 })} translateY(${((1 - s) * h).toFixed(2)}px) scale(${coverSmear.sx.toFixed(4)}, ${coverSmear.sy.toFixed(4)})`,
                            transformOrigin: 'center bottom',
                          }}
                        >
                          {p.covers && (
                            <span
                              style={{
                                fontSize: Math.round(width * 0.019), fontWeight: 600, lineHeight: 1.15,
                                textAlign: 'center', color: rgba(inkOn(cover), 0.85),
                              }}
                            >
                              {b}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      height: plankH, borderRadius: plankH * 0.35, background: sh.plank,
                      transformOrigin: 'left center',
                      transform: `scaleX(${plankIn.toFixed(4)})`,
                      ...el(`plank${si + 1}`),
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div
            style={{
              alignSelf: 'center',
              height: ctaH, padding: `0 ${pad}px`, borderRadius: 99,
              background: p.ink, color: p.screen,
              boxShadow: `0 ${Math.round(ctaH * 0.2)}px ${Math.round(ctaH * 0.6)}px ${rgba('#000000', 0.35)}`,
              fontSize: Math.round(width * 0.036), fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: interpolate(ctaIn, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `${swingIn(ctaIn, { rx: -14, z: -60 })} translate(${parCta.x.toFixed(2)}px, ${(parCta.y + (1 - ctaIn) * height * 0.02).toFixed(2)}px) scale(${interpolate(ctaIn, [0, 1], [0.86, 1]).toFixed(4)})`,
              ...el('cta'),
            }}
          >
            {p.cta}
          </div>
        </div>
      </div>
    );
  },
});
