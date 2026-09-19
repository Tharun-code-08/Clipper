// Cream paper note — a bold heading lands on a gently tilted note card, a hand-drawn amber
// underline draws itself beneath it, then a quieter body line follows. The underline is a
// seeded-wobble SVG stroke swept on by dash-offset (markerAnnotate's idiom), and the card's
// tilt is seeded too — so two notes in one video never share the same hand.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

export const paperNote = defineGraphicsTemplate({
  id: 'paper_note',
  name: 'Paper Note',
  category: 'story',
  tags: ['Note', 'Paper', 'Underline', 'Handwritten', 'Card'],
  badge: 'New',
  design: { w: 900, h: 600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 58 },
  fonts: ['montserrat'],

  elements: [
    { key: 'card',      label: 'Card', hideable: false },
    { key: 'heading',   label: 'Heading', hideable: false },
    { key: 'underline', label: 'Underline' },
    { key: 'body',      label: 'Body line' },
  ],

  params: [
    { type: 'text', key: 'heading', label: 'Heading', group: 'Content', default: 'Write it down', maxLength: 40 },
    { type: 'text', key: 'body',    label: 'Body',    group: 'Content', multiline: true, maxLength: 120,
      default: 'A goal on paper is a decision.\nEverything else is a wish.' },

    { type: 'boolean', key: 'underline', label: 'Underline', group: 'Style', default: true },
    { type: 'color',   key: 'paper',     label: 'Paper',     group: 'Style', default: '#F5F1E6' },
    { type: 'color',   key: 'ink',       label: 'Ink',       group: 'Style', default: '#22201B' },
    { type: 'color',   key: 'accent',    label: 'Accent',    group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER: the note lands with a flick, the underline draws on a swish, the body line settles
  // with a soft pop — all on the beats the motion already keeps.
  sfx: (p) => [
    { atMs: p.delay + 240, id: 'paper', gain: 0.5 },
    { atMs: p.delay + 960, id: 'swish', gain: 0.4 },
    { atMs: p.delay + 1420, id: 'pop', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');

    // Seeded, per-instance hand: card tilt ±1.5°, underline wobble below.
    const tilt = (random(`${seed}-tilt`) - 0.5) * 3;

    // Card rises with a medium spring; the small extra rotation decays with the same spring,
    // so the note "settles onto the desk" rather than sliding into place.
    const enterAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });
    const enter = enterAt(t);
    // Casual paper toss: 3D hinge on the same spring + faint desk-sway after; drop velocity
    // smears the card and dies the frame it lands. The heading parallaxes over the sway.
    const pose = depthPose(t, seed, { enter, rx: -12, ry: -6, z: -70, swayDeg: 1.0 });
    const vCard = vel((ms) => (1 - enterAt(ms)) * height * 0.07, t);
    const smCard = smear(0, vCard, 1.2);
    const parHead = parallax(t, seed, 0.45, height * 0.01);
    const headIn = spring({
      frame: fr(t - 260), fps: FPS,
      config: { damping: 21, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const draw = easeOutQuint(clamp01((t - 880) / 500));
    const bodyIn = easeOutQuint(clamp01((t - 1320) / 450));

    const padX = width * 0.08;
    const fsHead = Math.round(height * 0.125);
    const fsBody = Math.round(height * 0.057);

    // Hand-drawn underline: slight downward bow + seeded jitter per anchor.
    const uw = Math.round((width - padX * 2) * 0.62);
    const uh = height * 0.05;
    const N = 8;
    const pts: string[] = [];
    for (let i = 0; i <= N; i++) {
      const x = 3 + (i / N) * (uw - 6);
      const y = uh * 0.5
        + Math.sin((i / N) * Math.PI) * uh * 0.16
        + (random(`${seed}-u${i}`) - 0.5) * uh * 0.3;
      pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    const path = 'M ' + pts.join(' L ');
    const len = uw * 1.2;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.paper,
          borderRadius: 24,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          filter: smCard.blurPx > 0.3 ? `blur(${smCard.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} translateY(${((1 - enter) * height * 0.07).toFixed(2)}px) rotate(${(tilt + (1 - enter) * 2.4).toFixed(3)}deg) scale(${smCard.sx.toFixed(4)}, ${smCard.sy.toFixed(4)})`,
          fontFamily: ff,
          padding: `${Math.round(height * 0.13)}px ${Math.round(padX)}px`,
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
          overflow: 'hidden',
          ...el('card'),
        }}
      >
        <span
          style={{
            fontSize: fsHead, fontWeight: 700, color: p.ink,
            lineHeight: 1.08, letterSpacing: '-0.01em',
            opacity: interpolate(headIn, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
            transform: `translate(${parHead.x.toFixed(2)}px, ${(parHead.y + (1 - headIn) * height * 0.055).toFixed(2)}px)`,
            ...el('heading'),
          }}
        >
          {p.heading}
        </span>

        {p.underline && (
          <svg
            width={uw} height={uh} viewBox={`0 0 ${uw} ${uh}`}
            style={{ marginTop: height * 0.012, overflow: 'visible', flexShrink: 0, ...el('underline') }}
          >
            <path
              d={path}
              fill="none"
              stroke={p.accent}
              strokeWidth={Math.max(4, height * 0.013)}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={len}
              strokeDashoffset={((1 - draw) * len).toFixed(1)}
            />
          </svg>
        )}

        <span
          style={{
            marginTop: height * 0.065,
            fontSize: fsBody, fontWeight: 600, color: rgba(p.ink, 0.72),
            lineHeight: 1.5, whiteSpace: 'pre-wrap',
            opacity: bodyIn,
            transform: `translateY(${((1 - bodyIn) * height * 0.03).toFixed(2)}px)`,
            ...el('body'),
          }}
        >
          {p.body}
        </span>
      </div>
    );
  },
});
