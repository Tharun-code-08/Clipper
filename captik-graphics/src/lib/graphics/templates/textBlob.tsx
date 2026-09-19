// Reference: text/text-blob.mp4  (window 0-7680ms, blobs settle ~920ms then swell until the frame floods)
// Blobs that grow, drift and MERGE into each other around a line of copy, then swallow the frame.
//
// The merging is an SVG gooey filter: blur, then an feColorMatrix that crushes the ALPHA ramp so
// overlapping soft circles weld into one hard-edged shape.
//
// CSS `filter: blur() contrast()` is the better-known spelling of this and it does NOT work here.
// contrast() operates on the colour channels, not alpha, so on a transparent-backed layer the
// blobs stay soft-edged no matter how far you push it; making it bite means giving the filtered
// layer an opaque background, which then gets crushed to white along with everything else.
// feColorMatrix on the alpha row is the version that keeps a transparent backdrop AND a crisp edge.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax } from '../juice';

const MAX_BLOBS = 10;
/** One filter def for the whole page. Two instances of this template would both point at it, but
 *  they would be pointing at an IDENTICAL filter, so there is nothing to cross-wire. */
const GOO_ID = 'captik_goo';

export const textBlob = defineGraphicsTemplate({
  id: 'text_blob',
  name: 'Blob Field',
  category: 'title',
  tags: ['Text', 'Blob', 'Organic'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 7800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['playfair', 'montserrat'],

  elements: [
    { key: 'field',  label: 'Blobs', hideable: false },
    { key: 'quote',  label: 'Quote' },
    { key: 'kicker', label: 'Kicker' },
    ...Array.from({ length: MAX_BLOBS }, (_, i) => ({ key: `blob${i + 1}`, label: `Blob ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'kicker', label: 'Kicker', group: 'Content', default: 'Design inspiration   @captik', maxLength: 60 },
    { type: 'text', key: 'quote',  label: 'Quote',  group: 'Content', multiline: true, maxLength: 160,
      default: 'A mind too full\nof information\nhas no space\nfor inspiration' },

    { type: 'color',  key: 'bg',   label: 'Background', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'blob', label: 'Blobs',      group: 'Style', default: '#D97706' },
    { type: 'color',  key: 'ink',  label: 'Text',       group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font', label: 'Font',       group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size', label: 'Quote size', group: 'Style', default: 42, min: 10, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'goo',  label: 'Merge',      group: 'Style', default: 18, min: 0, max: 60, step: 2, unit: 'px',
      help: 'How readily neighbouring blobs weld together.' },
    { type: 'number', key: 'edge', label: 'Edge hardness', group: 'Style', default: 20, min: 4, max: 40, step: 1,
      help: 'Lower is softer and more liquid.' },

    { type: 'number',  key: 'count',  label: 'How many', group: 'Motion', default: 8, min: 1, max: 10, step: 1 },
    { type: 'number',  key: 'grow',   label: 'Grow over', group: 'Motion', default: 900, min: 100, max: 3000, step: 50, unit: 'ms' },
    { type: 'number',  key: 'stagger', label: 'Stagger',  group: 'Motion', default: 90, min: 0, max: 600, step: 10, unit: 'ms' },
    { type: 'number',  key: 'drift',  label: 'Drift',    group: 'Motion', default: 70, min: 0, max: 300, step: 5, unit: 'px' },
    { type: 'boolean', key: 'flood',  label: 'Flood the frame at the end', group: 'Motion', default: true },
  ],

  // Liquid, not percussive: a quiet air pass as the quote racks into focus, a gooey pop as the
  // first blobs weld (timed off the same stagger/grow that drive them), and a long airy sweep
  // under the flood swell (0.72 x the 7800ms default window — the flood is duration-driven).
  sfx: (p) => [
    { atMs: 380, id: 'whoosh', gain: 0.35 },
    { atMs: p.stagger * 2 + p.grow * 0.55, id: 'pop', gain: 0.3 },
    ...(p.flood ? [{ atMs: 5620, id: 'sweep' as const, gain: 0.45 }] : []),
  ],

  render: ({ params: p, el, timeMs, durationMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const n = Math.min(MAX_BLOBS, Math.round(p.count));

    // The flood is one blob scaled past the diagonal, on the same gooey layer, so it absorbs the
    // others rather than drawing over them.
    const flood = p.flood
      ? interpolate(timeMs, [durationMs * 0.72, durationMs * 0.97], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        })
      : 0;

    const textIn = spring({
      frame: fr(timeMs - 320), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    // The copy dims under the flood but never leaves — the reference still reads through it.
    const textOut = clamp01(1.5 - flood);

    // Cinematic depth: the quote arrives as a RACK FOCUS (blur → sharp) inside a slow ±1.4°
    // sway that never dies, while the kicker and the blob field shear over it at different
    // parallax depths — three layers, one space. periodMs 4200: liquid, not nervous.
    const quotePose = depthPose(timeMs, seed, { enter: clamp01(textIn), rx: -8, z: -60, swayDeg: 1.4, periodMs: 4200 });
    const focusQuote = (1 - clamp01(textIn)) * 6;
    const focusKick = (1 - clamp01(textIn)) * 4;
    const parKick = parallax(timeMs, seed, 0.55, height * 0.008, 4200);
    const parField = parallax(timeMs, seed, 0.3, height * 0.008, 4200);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: p.bg, fontFamily: ff }}>
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
          <defs>
            <filter id={GOO_ID}>
              <feGaussianBlur in="SourceGraphic" stdDeviation={p.goo} result="soft" />
              <feColorMatrix
                in="soft"
                type="matrix"
                values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${p.edge} -${(p.edge / 2.2).toFixed(2)}`}
              />
            </filter>
          </defs>
        </svg>
        <div
          style={{
            position: 'absolute', inset: 0,
            filter: p.goo > 0 ? `url(#${GOO_ID})` : undefined,
            transform: `translate(${parField.x.toFixed(2)}px, ${parField.y.toFixed(2)}px)`,
            ...el('field'),
          }}
        >
          {Array.from({ length: n }).map((_, i) => {
            const bx = 0.08 + random(`${seed}bx${i}`) * 0.84;
            const by = 0.08 + random(`${seed}by${i}`) * 0.84;
            const base = (0.07 + random(`${seed}br${i}`) * 0.16) * width;
            const s = spring({
              frame: fr(timeMs - i * p.stagger), fps: FPS,
              config: { damping: 18, mass: 0.7, stiffness: 170 },
              durationInFrames: Math.max(1, Math.round(fr(p.grow))),
            });
            // A slow seeded wander keeps neighbours drifting in and out of contact, which is what
            // makes the merge look alive rather than a static overlap.
            const ph = random(`${seed}bp${i}`) * Math.PI * 2;
            const t = timeMs / 1000;
            const dx = Math.cos(t * 0.55 + ph) * p.drift;
            const dy = Math.sin(t * 0.4 + ph * 1.7) * p.drift * 0.7;
            // Capped so the flood swells past the copy without crushing the frame to one flat
            // colour — the reference keeps its edges readable right to the end.
            const size = base * s * (1 + flood * 0.8);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: bx * width, top: by * height,
                  width: size, height: size,
                  marginLeft: -size / 2, marginTop: -size / 2,
                  borderRadius: '50%',
                  background: p.blob,
                  transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`,
                  ...el(`blob${i + 1}`),
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute', left: '5%', right: '5%', top: '6%',
            display: 'flex', justifyContent: 'space-between',
            fontFamily: fontStack('montserrat'),
            fontSize: Math.round(p.size * 0.4), color: rgba(p.ink, 0.55), fontWeight: 600,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            opacity: clamp01(textIn) * textOut,
            filter: focusKick > 0.3 ? `blur(${focusKick.toFixed(2)}px)` : undefined,
            transform: `translate(${parKick.x.toFixed(2)}px, ${parKick.y.toFixed(2)}px)`,
            ...el('kicker'),
          }}
        >
          {p.kicker.split(/\s{2,}/).map((s, i) => <span key={i}>{s}</span>)}
        </div>

        <div
          style={{
            position: 'absolute', left: '8%', right: '8%', top: '46%',
            fontSize: p.size, lineHeight: 1.4, color: p.ink, fontWeight: 500, fontStyle: 'italic',
            whiteSpace: 'pre-line',
            filter: focusQuote > 0.3 ? `blur(${focusQuote.toFixed(2)}px)` : undefined,
            transform: `${quotePose} translateY(${((1 - textIn) * height * 0.02).toFixed(2)}px)`,
            opacity: clamp01(textIn) * textOut,
            ...el('quote'),
          }}
        >
          {p.quote}
        </div>

        <div style={luxeVignette(0.4)} />
        <div style={luxeGrain(0.05)} />
      </div>
    );
  },
});
