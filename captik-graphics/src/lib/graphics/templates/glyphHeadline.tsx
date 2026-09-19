// Reference: text/make-with-notion.mp4  (window 160-2320ms, assembled by ~1120ms)
// A headline in which some letters are replaced by coloured shapes. The letters resolve left to
// right while the shapes FLY IN from off-frame and spin into their slots, which is why the
// reference reads as a logo assembling rather than text appearing.
//
// Shapes are inline tokens in the text — {t} triangle, {c} circle, {s} square, {d} diamond — so a
// user can put them anywhere in any word without the template knowing anything about the copy.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { ghosts, smear, sway3d, swingIn, vel } from '../juice';

const MAX_GLYPHS = 6;
const TOKEN = /\{([tcsd])\}/g;

type Piece =
  | { kind: 'text'; text: string }
  | { kind: 'shape'; shape: 't' | 'c' | 's' | 'd'; n: number };

/** Split "M{t}ke with N{c}tion" into runs of text and shape tokens. */
function parse(src: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  let n = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(src); m; m = TOKEN.exec(src)) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) });
    if (n < MAX_GLYPHS) out.push({ kind: 'shape', shape: m[1] as 't' | 'c' | 's' | 'd', n: n++ });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
  return out;
}

export const glyphHeadline = defineGraphicsTemplate({
  id: 'glyph_headline',
  name: 'Glyph Headline',
  category: 'title',
  tags: ['Text', 'Logo', 'Assemble'],
  design: { w: 900, h: 400 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 92 },
  fonts: ['montserrat'],

  elements: [
    { key: 'line', label: 'Headline', hideable: false },
    { key: 'words', label: 'Letters' },
    ...Array.from({ length: MAX_GLYPHS }, (_, i) => ({ key: `glyph${i + 1}`, label: `Shape ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'text', label: 'Headline', group: 'Content', default: 'M{t}ke with N{c}tion', maxLength: 60,
      help: 'Use {t} triangle, {c} circle, {s} square, {d} diamond in place of a letter.' },
    { type: 'text', key: 'colours', label: 'Shape colours', group: 'Content', default: '#F59E0B,#D97706,#F4F1E8,#8B887E', maxLength: 90,
      help: 'Comma-separated, cycled across the shapes.' },

    { type: 'color',  key: 'ink',   label: 'Text',  group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',  group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Size',  group: 'Style', default: 96, min: 20, max: 200, step: 2, unit: 'px' },
    { type: 'number', key: 'weight', label: 'Weight', group: 'Style', default: 700, min: 300, max: 900, step: 100 },
    { type: 'number', key: 'glyphScale', label: 'Shape size', group: 'Style', default: 0.62, min: 0.2, max: 1.4, step: 0.02,
      help: 'Relative to the text size.' },

    { type: 'number', key: 'firstAt', label: 'Letters start', group: 'Motion', default: 80, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'perChar', label: 'Per letter',    group: 'Motion', default: 34, min: 0, max: 200, step: 2, unit: 'ms' },
    { type: 'number', key: 'flyMs',   label: 'Shapes fly in over', group: 'Motion', default: 640, min: 120, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'flyFrom', label: 'Fly-in distance', group: 'Motion', default: 320, min: 0, max: 900, step: 10, unit: 'px' },
    { type: 'number', key: 'spin',    label: 'Shape spin',     group: 'Motion', default: 200, min: 0, max: 900, step: 10, unit: '°' },
  ],

  // Logo assembly: a light pass as the letters start resolving, glossy pops as the first and last
  // shapes spin into their slots (a dry snap on the last letter when there are no shapes).
  sfx: (p) => {
    const nShapes = Math.min(MAX_GLYPHS, (p.text.match(/\{[tcsd]\}/g) ?? []).length);
    const chars = Math.max(1, p.text.replace(/\{[tcsd]\}/g, '#').length);
    const cues: { atMs: number; id: 'swish' | 'pop' | 'snap'; gain: number }[] = [
      { atMs: p.firstAt + 40, id: 'swish', gain: 0.45 },
    ];
    if (nShapes > 0) {
      cues.push({ atMs: p.firstAt + 430, id: 'pop', gain: 0.55 });
      if (nShapes > 1) cues.push({ atMs: p.firstAt + (nShapes - 1) * 140 + 430, id: 'pop', gain: 0.7 });
    } else {
      cues.push({ atMs: p.firstAt + chars * p.perChar + 220, id: 'snap', gain: 0.55 });
    }
    return cues;
  },

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const pieces = parse(p.text);
    const pal = p.colours.split(',').map((s) => s.trim()).filter(Boolean);
    const colours = pal.length ? pal : ['#F59E0B'];
    const g = p.size * p.glyphScale;

    let charNo = 0;

    const shapeStyle = (kind: 'e' | 'c' | 's' | 'd', fill: string) => {
      if (kind === 'c') return { width: g, height: g, borderRadius: '50%', background: fill };
      if (kind === 's') return { width: g * 0.92, height: g * 0.92, borderRadius: g * 0.12, background: fill };
      if (kind === 'd') return { width: g * 0.86, height: g * 0.86, background: fill, borderRadius: g * 0.08 };
      // Triangle from a border trick — no SVG needed and it inherits the same layout box.
      return {
        width: 0, height: 0,
        borderLeft: `${g * 0.55}px solid transparent`,
        borderRight: `${g * 0.55}px solid transparent`,
        borderBottom: `${g * 0.95}px solid ${fill}`,
      };
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          ...el('line'),
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', flexWrap: 'nowrap',
            fontSize: p.size, fontWeight: p.weight, color: p.ink, lineHeight: 1.1,
            whiteSpace: 'pre',
            // The assembled lockup keeps living in 3D — a ±1.5° sway so the logo reads as an
            // object in space once every piece has parked.
            transform: sway3d(timeMs, seed, 1.5),
            ...el('words'),
          }}
        >
          {pieces.map((piece, pi) => {
            if (piece.kind === 'text') {
              return [...piece.text].map((ch, ci) => {
                const i = charNo++;
                const s = spring({
                  frame: fr(timeMs - p.firstAt - i * p.perChar), fps: FPS,
                  config: { damping: 26, mass: 0.5, stiffness: 210 },
                  durationInFrames: Math.max(1, Math.round(fr(280))),
                });
                // Letters resolve through a shallow seeded hinge — objects tipping up into the
                // line, not characters fading in.
                const hinge = {
                  rx: -10 - random(`${seed}lx${i}`) * 6,
                  ry: (random(`${seed}ly${i}`) - 0.5) * 10,
                  z: -50,
                };
                return (
                  <span
                    key={`${pi}-${ci}`}
                    style={{
                      display: 'inline-block', whiteSpace: 'pre',
                      opacity: clamp01(s * 1.8),
                      transform: `${swingIn(s, hinge)} translateY(${((1 - s) * p.size * 0.12).toFixed(2)}px)`,
                    }}
                  >
                    {ch}
                  </span>
                );
              });
            }
            charNo += 1;
            const n = piece.n;
            const sAt = (ms: number) => spring({
              frame: fr(ms - p.firstAt - n * 140), fps: FPS,
              config: { damping: 17, mass: 0.8, stiffness: 150 },
              durationInFrames: Math.max(1, Math.round(fr(p.flyMs))),
            });
            const s = sAt(timeMs);
            const ang = random(`${seed}a${n}`) * Math.PI * 2;
            const dx = Math.cos(ang) * p.flyFrom * (1 - s);
            const dy = Math.sin(ang) * p.flyFrom * (1 - s);
            const rot = (1 - s) * p.spin * (random(`${seed}d${n}`) > 0.5 ? 1 : -1);
            const base = piece.shape === 'd' ? 45 : 0;
            // MOTION BLUR: the shapes are the big movers — their flight velocity drives a smear
            // plus two trailing ghost frames against the flight line, all gone the frame the
            // shape clicks into its slot.
            const vx = vel((ms) => Math.cos(ang) * p.flyFrom * (1 - sAt(ms)), timeMs);
            const vy = vel((ms) => Math.sin(ang) * p.flyFrom * (1 - sAt(ms)), timeMs);
            const sm = smear(vx, vy, 1);
            const trail = ghosts(vx, vy, 2);
            const grow = interpolate(s, [0, 1], [0.4, 1]);
            return (
              <span
                key={`${pi}-g`}
                style={{
                  position: 'relative',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: g * 1.02, height: p.size, margin: `0 ${p.size * 0.03}px`,
                  filter: `drop-shadow(0 10px 24px rgba(0,0,0,0.35))${sm.blurPx > 0.3 ? ` blur(${sm.blurPx.toFixed(2)}px)` : ''}`,
                  opacity: clamp01(s * 2),
                  transform:
                    `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) `
                    + `rotate(${(base + rot).toFixed(2)}deg) `
                    + `scale(${(grow * sm.sx).toFixed(4)}, ${(grow * sm.sy).toFixed(4)})`,
                  ...el(`glyph${n + 1}`),
                }}
              >
                {trail.map((gh, gi) => (
                  <span
                    key={`gh${gi}`}
                    style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: gh.opacity,
                      transform: `translate(${gh.dx.toFixed(2)}px, ${gh.dy.toFixed(2)}px)`,
                    }}
                  >
                    <span style={shapeStyle(piece.shape === 't' ? 'e' : piece.shape, colours[n % colours.length])} />
                  </span>
                ))}
                <span style={shapeStyle(piece.shape === 't' ? 'e' : piece.shape, colours[n % colours.length])} />
              </span>
            );
          })}
        </div>
      </div>
    );
  },
});
