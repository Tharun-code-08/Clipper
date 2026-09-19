// Reference: ui-elements/notepad.mp4  (window 400-9800ms, copy finishes ~6680ms)
// A tilted note card that flies in and then writes itself out, word by word rather than character
// by character — the reference reveals in chunks, and per-character typing on a paragraph this long
// reads as a terminal instead of someone writing.
//
// The card keeps a slight rest tilt, so it never settles into a flat rectangle.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGrain } from '../luxe';
import { depthPose, smear, vel } from '../juice';

const LIGHTS = ['#ff5f57', '#febc2e', '#28c840'];

export const noteCard = defineGraphicsTemplate({
  id: 'note_card',
  name: 'Note Card',
  category: 'story',
  tags: ['Note', 'Typing', 'Card', 'Luxury'],
  design: { w: 760, h: 1000 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 9400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 84 },
  fonts: ['inter'],

  elements: [
    { key: 'card',  label: 'Card', hideable: false },
    { key: 'dots',  label: 'Window dots' },
    { key: 'title', label: 'Title' },
    { key: 'body',  label: 'Body text' },
  ],

  params: [
    { type: 'text', key: 'title', label: 'Title', group: 'Content', default: 'Note', maxLength: 30 },
    { type: 'text', key: 'body',  label: 'Body',  group: 'Content', multiline: true, maxLength: 400,
      default: 'Creating compelling video content requires a deep understanding of your audience. '
        + 'Start by identifying the core message you want to convey, then build a narrative '
        + 'structure that keeps viewers engaged from start to finish.' },

    { type: 'color',  key: 'card',  label: 'Card',  group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',   label: 'Title', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'bodyInk', label: 'Body text', group: 'Style', default: '#C9C5B8' },
    { type: 'font',   key: 'font',  label: 'Font',  group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Body size', group: 'Style', default: 27, min: 10, max: 70, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',   group: 'Style', default: 34, min: 0, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'tilt',  label: 'Rest tilt', group: 'Style', default: -6, min: -25, max: 25, step: 1, unit: '°' },
    { type: 'number', key: 'shadow', label: 'Shadow',   group: 'Style', default: 0.3, min: 0, max: 0.7, step: 0.02 },
    { type: 'boolean', key: 'dots', label: 'Window dots', group: 'Style', default: true },

    { type: 'number', key: 'cardAt',  label: 'Card at',    group: 'Motion', default: 80, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'typeAt',  label: 'Typing at',  group: 'Motion', default: 620, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'wps',     label: 'Words / sec', group: 'Motion', default: 6.5, min: 0.5, max: 30, step: 0.5 },
    { type: 'number', key: 'swoop',   label: 'Fly-in',     group: 'Motion', default: 260, min: 0, max: 800, step: 10, unit: 'px' },
  ],

  // The card swoops in under an air pass; ONE soft tick as the writing starts — a click per
  // word at 6.5wps would read as a terminal, and word-by-word writing is this card's character.
  sfx: (p) => [
    { atMs: p.cardAt + 240, id: 'whoosh', gain: 0.45 },
    { atMs: p.typeAt, id: 'tick', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);

    const cardInAt = (ms: number) => spring({
      frame: fr(ms - p.cardAt), fps: FPS,
      config: { damping: 22, mass: 0.9, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(720))),
    });
    const cardIn = cardInAt(timeMs);
    // The fly-in happens through 3D space (side hinge on the existing spring, faint resting
    // sway after), and the swoop's own velocity smears the card — crisp the frame it settles.
    const pose = depthPose(timeMs, seed, { enter: cardIn, rx: -12, ry: 9, z: -100, swayDeg: 1.4 });
    const vCard = vel((ms) => (1 - cardInAt(ms)) * p.swoop, timeMs);
    const smCard = smear(0, vCard, 1);

    // Word-by-word, not character-by-character. Slicing the ORIGINAL string at a word boundary
    // keeps the line breaks identical to the finished paragraph, so nothing reflows as it fills.
    const words = p.body.split(/(\s+)/);
    const shown = Math.max(0, Math.floor(((timeMs - p.typeAt) / 1000) * p.wps));
    let seen = 0;
    let cut = 0;
    for (let i = 0; i < words.length; i += 1) {
      if (!/^\s+$/.test(words[i])) {
        if (seen >= shown) break;
        seen += 1;
      }
      cut += words[i].length;
    }
    const typed = p.body.slice(0, cut);

    const pad = width * 0.075;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, ${rgba('#ffffff', 0.04)} 0%, ${rgba('#000000', 0.35)} 100%), ${p.card}`,
          border: `1px solid ${LUXE.hairline}`,
          borderRadius: p.radius,
          overflow: 'hidden',
          padding: pad, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: pad * 0.5,
          fontFamily: ff,
          boxShadow: p.shadow > 0
            ? `0 ${width * 0.03}px ${width * 0.07}px ${rgba('#000000', Math.min(1, p.shadow * 0.9))}, 0 ${width * 0.09}px ${width * 0.2}px ${rgba('#000000', p.shadow)}, inset 0 1px 0 ${rgba('#ffffff', 0.06)}`
            : `inset 0 1px 0 ${rgba('#ffffff', 0.06)}`,
          opacity: clamp01(cardIn * 1.8),
          filter: smCard.blurPx > 0.3 ? `blur(${smCard.blurPx.toFixed(2)}px)` : undefined,
          transform:
            `${pose} translateY(${((1 - cardIn) * p.swoop).toFixed(2)}px) `
            + `rotate(${(p.tilt * cardIn + (1 - cardIn) * (p.tilt - 10)).toFixed(2)}deg) `
            + `scale(${(interpolate(cardIn, [0, 1], [0.88, 1]) * smCard.sx).toFixed(4)}, ${(interpolate(cardIn, [0, 1], [0.88, 1]) * smCard.sy).toFixed(4)})`,
          ...el('card'),
        }}
      >
        {p.dots && (
          <div style={{ display: 'flex', gap: width * 0.014, ...el('dots') }}>
            {LIGHTS.map((c) => (
              <span key={c} style={{ width: width * 0.022, height: width * 0.022, borderRadius: '50%', background: c, opacity: 0.9 }} />
            ))}
          </div>
        )}

        <div
          style={{
            fontSize: p.size * 1.7, fontWeight: 700, color: p.ink, lineHeight: 1.1,
            letterSpacing: '-0.015em',
            opacity: clamp01(cardIn * 1.4),
            ...el('title'),
          }}
        >
          {p.title}
        </div>

        <div
          style={{
            fontSize: p.size, color: p.bodyInk, lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            ...el('body'),
          }}
        >
          {typed}
        </div>

        <div style={luxeGrain(0.04)} />
      </div>
    );
  },
});
