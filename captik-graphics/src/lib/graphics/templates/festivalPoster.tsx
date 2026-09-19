// Reference: graphics/outsidelands-poster.mp4  (window 680-5280ms, poster set ~4120ms)
// A festival bill: a chunky outlined wordmark, a date/venue strip, then day columns whose headliner
// and act list fill in one column at a time.
//
// Columns arrive left to right and each column's acts cascade inside it, so the poster reads as
// being typeset rather than three blocks switching on together.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_DAYS = 3;
/** Day columns stay colour-KEYED (the reference's trick), but in a harmonised luxe poster
 *  trio — champagne / sage / terracotta — instead of neon pink / orange / blue. */
const ACCENTS = ['#F59E0B', '#9BA88D', '#C07B62'];

export const festivalPoster = defineGraphicsTemplate({
  id: 'festival_poster',
  name: 'Festival Poster',
  category: 'title',
  tags: ['Poster', 'Lineup', 'Music'],
  design: { w: 900, h: 1520 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'poster', label: 'Poster', hideable: false },
    { key: 'strip',  label: 'Date strip' },
    { key: 'logo',   label: 'Wordmark' },
    { key: 'venue',  label: 'Venue line' },
    ...Array.from({ length: MAX_DAYS }, (_, i) => ({ key: `day${i + 1}`, label: `Day ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'dates', label: 'Date strip', group: 'Content', default: 'AUG 7-9 · 2026', maxLength: 32 },
    { type: 'text', key: 'logo',  label: 'Wordmark',   group: 'Content', default: 'OUTSIDE LANDS', maxLength: 24 },
    { type: 'text', key: 'venue', label: 'Venue',      group: 'Content', default: 'SAN FRANCISCO · GOLDEN GATE PARK', maxLength: 48 },
    { type: 'text', key: 'days',  label: 'Days', group: 'Content', multiline: true, maxLength: 500,
      default:
        'FRIDAY|CHARLI XCX|TURNSTILE,QUEEN OMEGA,LAROSSA,DOJA CAT,PEGGY GOU,BLEACHERS\n'
        + 'SATURDAY|THE STROKES|TAME IMPALA,SBTRKT,BLOOD ORANGE,KHRUANGBIN,JAMIE XX\n'
        + 'SUNDAY|HOZIER|MODEST MOUSE,PARCELS,BEACH HOUSE,FOUR TET,CARIBOU,JPEGMAFIA',
      help: 'One day per line: day | headliner | comma-separated acts.' },

    { type: 'color',  key: 'bg',     label: 'Paper',    group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'ink',    label: 'Text',     group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'logoFill', label: 'Wordmark fill', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'strip',  label: 'Strip',    group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',   label: 'Wordmark font', group: 'Style', default: 'anton' },
    { type: 'font',   key: 'bodyFont', label: 'Body font', group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'logoSize', label: 'Wordmark size', group: 'Style', default: 136, min: 20, max: 200, step: 2, unit: 'px' },
    { type: 'number', key: 'headSize', label: 'Headliner size', group: 'Style', default: 26, min: 8, max: 70, step: 1, unit: 'px' },
    { type: 'number', key: 'actSize',  label: 'Act size', group: 'Style', default: 14, min: 6, max: 40, step: 1, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the paper', group: 'Style', default: true },

    { type: 'number', key: 'logoAt',  label: 'Wordmark at', group: 'Motion', default: 150, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'firstAt', label: 'First column at', group: 'Motion', default: 150, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'colGap',  label: 'Column stagger', group: 'Motion', default: 160, min: 0, max: 2500, step: 20, unit: 'ms' },
    { type: 'number', key: 'actGap',  label: 'Act stagger', group: 'Motion', default: 40, min: 0, max: 400, step: 10, unit: 'ms' },
  ],

  // PAPER language, not PUNCH: the bill drops onto the desk, the wordmark sets, and the artwork
  // band closes it out — cut to the same logoAt / firstAt / colGap beats as the typesetting.
  sfx: (p) => [
    { atMs: p.logoAt, id: 'paper', gain: 0.6 },
    { atMs: p.logoAt + 120, id: 'pop', gain: 0.5 },
    { atMs: p.firstAt + MAX_DAYS * p.colGap, id: 'paper', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const logoFf = fontStack(p.font);
    const bodyFf = fontStack(p.bodyFont);
    const days = p.days.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_DAYS)
      .map((l) => {
        const [name = '', head = '', acts = ''] = l.split('|').map((s) => s.trim());
        return { name, head, acts: acts.split(',').map((s) => s.trim()).filter(Boolean) };
      });

    // Same spring, exposed as a CLOSURE so vel() can sample it — `at()` is unchanged.
    const springAt = (ms: number, dur = 460) => (sample: number) => spring({
      frame: fr(sample - ms), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 175 },
      durationInFrames: Math.max(1, Math.round(fr(dur))),
    });
    const at = (ms: number, dur = 460) => springAt(ms, dur)(timeMs);

    const pad = width * 0.02;

    // PAPER, not glass: a printed bill dropped onto a desk. It lands on a shallow top hinge with
    // a degree and a half of skew, then keeps a slow ±1.3° breath — casual, never glossy.
    const sheetIn = at(p.logoAt);
    const pose = depthPose(timeMs, seed, { enter: sheetIn, rx: -11, ry: 5, z: -70, swayDeg: 1.3, periodMs: 5200 });
    const skew = (1 - sheetIn) * -1.6;
    // The wordmark's growth measured at the outer glyph edge — a breath of ink smear as it sets.
    const logoScaleAt = (ms: number) => 0.9 + 0.1 * clamp01(springAt(p.logoAt + 120)(ms));
    const logoSm = smear(vel(logoScaleAt, timeMs) * width * 0.45, 0, 1);
    // Strip in front, venue mid, artwork band behind — the breath shears the sheet's layers.
    const parStrip = parallax(timeMs, seed, 0.8, height * 0.008, 5200);
    const parVenue = parallax(timeMs, seed, 0.45, height * 0.008, 5200);
    const parBand = parallax(timeMs, seed, 0.2, height * 0.008, 5200);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          padding: pad, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: p.headSize * 0.5,
          fontFamily: bodyFf, color: p.ink,
          transform: `${pose} rotate(${skew.toFixed(3)}deg)`,
          ...el('poster'),
        }}
      >
        <div
          style={{
            alignSelf: 'center',
            background: p.strip, color: p.bg,
            fontSize: p.logoSize * 0.2, letterSpacing: p.logoSize * 0.04, fontWeight: 700,
            padding: `${p.logoSize * 0.06}px ${p.logoSize * 0.28}px`,
            opacity: clamp01(at(p.logoAt) * 1.6),
            transform: `translate(${parStrip.x.toFixed(2)}px, ${parStrip.y.toFixed(2)}px)`,
            ...el('strip'),
          }}
        >
          {p.dates}
        </div>

        <div
          style={{
            alignSelf: 'center', textAlign: 'center',
            fontFamily: logoFf, fontSize: p.logoSize, lineHeight: 1,
            color: p.logoFill,
            // Chunky outline, not a shadow — the reference's wordmark is stroked.
            WebkitTextStroke: `${p.logoSize * 0.07}px ${p.ink}`,
            paintOrder: 'stroke fill',
            letterSpacing: p.logoSize * 0.01,
            opacity: clamp01(at(p.logoAt + 120) * 1.6),
            filter: logoSm.blurPx > 0.3 ? `blur(${logoSm.blurPx.toFixed(2)}px)` : undefined,
            transform: `scale(${(logoScaleAt(timeMs) * logoSm.sx).toFixed(4)}, ${(logoScaleAt(timeMs) * logoSm.sy).toFixed(4)})`,
            ...el('logo'),
          }}
        >
          {p.logo}
        </div>

        <div
          style={{
            alignSelf: 'center',
            fontSize: p.logoSize * 0.16, letterSpacing: p.logoSize * 0.03, fontWeight: 600,
            opacity: clamp01(at(p.logoAt + 300) * 1.6),
            transform: `translate(${parVenue.x.toFixed(2)}px, ${parVenue.y.toFixed(2)}px)`,
            ...el('venue'),
          }}
        >
          {p.venue}
        </div>

        <div style={{ display: 'flex', gap: pad * 0.55, flex: 1, minHeight: 0, marginTop: p.headSize * 0.4 }}>
          {days.map((d, i) => {
            const colAt = p.firstAt + i * p.colGap;
            const col = at(colAt);
            const accent = ACCENTS[i % ACCENTS.length];
            // Z-STAGGER: the columns hinge OUTWARD — the left one swings from its left edge, the
            // right one from its right — so the bill reads as being typeset in space rather than
            // three blocks switching on. Their rise velocity smears and dies as they seat.
            const riseAt = (ms: number) => (1 - springAt(colAt)(ms)) * height * 0.012;
            const colSm = smear(0, -vel(riseAt, timeMs), 1.4);
            const side = i - (days.length - 1) / 2;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  border: `3px solid ${rgba(accent, 0.85)}`,
                  padding: pad * 0.35, boxSizing: 'border-box',
                  display: 'flex', flexDirection: 'column', gap: p.actSize * 0.5,
                  opacity: clamp01(col * 1.8),
                  filter: colSm.blurPx > 0.3 ? `blur(${colSm.blurPx.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(col, { rx: -10, ry: side * -15, z: -60 })} translateY(${riseAt(timeMs).toFixed(2)}px) scale(${colSm.sx.toFixed(4)}, ${colSm.sy.toFixed(4)})`,
                  transformOrigin: side < 0 ? 'left center' : side > 0 ? 'right center' : 'center center',
                  ...el(`day${i + 1}`),
                }}
              >
                <div
                  style={{
                    alignSelf: 'stretch', textAlign: 'center',
                    background: accent, color: p.bg,
                    fontSize: p.actSize * 0.85, letterSpacing: p.actSize * 0.1, fontWeight: 700,
                    padding: `${p.actSize * 0.16}px 0`,
                  }}
                >
                  {d.name}
                </div>
                <div style={{ fontSize: p.headSize, fontWeight: 800, lineHeight: 1.08, textAlign: 'center', color: accent }}>
                  {d.head}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: p.actSize * 0.22 }}>
                  {d.acts.map((a, k) => {
                    const s = at(colAt + 260 + k * p.actGap, 300);
                    return (
                      <span
                        key={k}
                        style={{
                          fontSize: p.actSize, textAlign: 'center', lineHeight: 1.25,
                          opacity: clamp01(s * 1.8),
                        }}
                      >
                        {a}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Artwork band along the foot of the bill — the reference's poster is not type all the
            way down. */}
        <div
          style={{
            height: p.headSize * 3.4, flexShrink: 0,
            background: `linear-gradient(115deg, ${rgba(ACCENTS[0], 0.85)}, ${rgba(ACCENTS[1], 0.8)} 48%, ${rgba(ACCENTS[2], 0.85)})`,
            opacity: clamp01(at(p.firstAt + MAX_DAYS * p.colGap) * 1.6),
            transform: `translate(${parBand.x.toFixed(2)}px, ${parBand.y.toFixed(2)}px)`,
          }}
        />

        {/* Paper texture: fine grain + a faint vignette keep the dark stock from reading as
            one flat hex. Skipped when the paper isn't painted. */}
        {p.fill && <div style={luxeVignette(0.32)} />}
        {p.fill && <div style={luxeGrain(0.06)} />}
      </div>
    );
  },
});
