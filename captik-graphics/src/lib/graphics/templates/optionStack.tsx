// Reference: graphics/create-with-ai.mp4  (usable window 1880-3680ms — the capture's opening
// particle field is a separate beat)
// Outlined option buttons stacking up on paper, with a locked one at the end.
//
// Each button gets a hard offset shadow rather than a blur, which is what gives the reference its
// pressed-sticker look; a soft shadow reads as a modern card and loses it.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { smear, swingIn, sway3d, vel } from '../juice';

const MAX_OPTIONS = 6;

export const optionStack = defineGraphicsTemplate({
  id: 'option_stack',
  name: 'Option Stack',
  category: 'cta',
  tags: ['Buttons', 'Menu', 'Choice'],
  design: { w: 900, h: 1200 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 92 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'sheet', label: 'Sheet', hideable: false },
    { key: 'lock',  label: 'Lock' },
    ...Array.from({ length: MAX_OPTIONS }, (_, i) => ({ key: `opt${i + 1}`, label: `Option ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'options', label: 'Options', group: 'Content', multiline: true, maxLength: 200,
      default: 'AI & ML\nDEVELOPMENT\nDESIGN', help: 'One per line.' },
    { type: 'text', key: 'lock',    label: 'Lock glyph', group: 'Content', default: '🔒', maxLength: 4,
      help: 'Leave empty to hide.' },

    { type: 'color',  key: 'bg',     label: 'Paper',   group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'button', label: 'Button',  group: 'Style', default: '#FBF9F2' },
    { type: 'color',  key: 'ink',    label: 'Text',    group: 'Style', default: '#17130C' },
    { type: 'font',   key: 'font',   label: 'Font',    group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Text size', group: 'Style', default: 40, min: 8, max: 80, step: 1, unit: 'px' },
    { type: 'number', key: 'track',  label: 'Tracking', group: 'Style', default: 4, min: 0, max: 20, step: 1, unit: 'px' },
    { type: 'number', key: 'padY',   label: 'Button height', group: 'Style', default: 60, min: 6, max: 80, step: 2, unit: 'px' },
    { type: 'number', key: 'gap',    label: 'Gap',     group: 'Style', default: 54, min: 0, max: 120, step: 2, unit: 'px' },
    { type: 'number', key: 'offset', label: 'Hard shadow', group: 'Style', default: 12, min: 0, max: 24, step: 1, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the paper', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First option at', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Stagger',  group: 'Motion', default: 160, min: 0, max: 1500, step: 20, unit: 'ms' },
    { type: 'number', key: 'lockAt',  label: 'Lock at',  group: 'Motion', default: 450, min: 0, max: 6000, step: 50, unit: 'ms' },
  ],

  // PAPER language: a page-flick as each of the first stickers slaps down (same firstAt/stagger
  // arithmetic as their springs) and a glossy pop when the lock stamps in.
  sfx: (p) => {
    const n = Math.max(1, Math.min(3, p.options.split('\n').map((s) => s.trim()).filter(Boolean).length));
    const cues = Array.from({ length: n }, (_, i) => ({
      atMs: p.firstAt + i * p.stagger + 80, id: 'paper' as const, gain: 0.55 - i * 0.08,
    }));
    return p.lock.trim() ? [...cues, { atMs: p.lockAt + 100, id: 'pop' as const, gain: 0.6 }] : cues;
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const opts = p.options.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_OPTIONS);

    const lockInAt = (ms: number) => spring({
      frame: fr(ms - p.lockAt), fps: FPS,
      config: { damping: 13, mass: 0.5, stiffness: 230 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });
    const lockIn = lockInAt(timeMs);
    // The lock is the fastest mover on the page — its pop velocity smears it for the frames it
    // is actually inflating, then it lands crisp.
    const lockSmear = smear(0, vel((ms: number) => interpolate(lockInAt(ms), [0, 1], [0.3, 1]), timeMs) * p.size * 3.2);

    // DEPTH, paper-style: the whole sheet keeps a casual ≤1° sway — paper resting on a desk,
    // not a locked web page — while each sticker tips in from its own angle below.
    const sheetPose = sway3d(timeMs, seed, 0.8, 4200);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: p.gap, padding: width * 0.08, boxSizing: 'border-box',
          fontFamily: ff,
          transform: sheetPose,
          transformOrigin: 'center center',
          ...el('sheet'),
        }}
      >
        {opts.map((o, i) => {
          const sAt = (ms: number) => spring({
            frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
            config: { damping: 20, mass: 0.7, stiffness: 170 },
            durationInFrames: Math.max(1, Math.round(fr(520))),
          });
          const s = sAt(timeMs);
          // Z-STAGGER, kept casual: each sticker tips in from its OWN angle (alternating hinge
          // plus a small flat twist — paper tossed onto a desk, not glossy cards) and rides its
          // drop velocity as blur that dies the frame it sits.
          const yAt = (ms: number) => (1 - sAt(ms)) * height * 0.03;
          const sm = smear(0, vel(yAt, timeMs), 1.4);
          const rz = (i % 2 ? 1 : -1) * (1.5 + (i % 3));
          const sc = interpolate(s, [0, 1], [0.94, 1]);
          return (
            <div
              key={i}
              style={{
                width: '100%',
                background: p.button, color: p.ink,
                border: `2px solid ${p.ink}`,
                padding: `${p.padY}px ${p.size}px`, boxSizing: 'border-box',
                textAlign: 'center',
                fontSize: p.size, letterSpacing: p.track, fontWeight: 700,
                // Hard offset, not a blur — the reference's stickers sit on the page.
                boxShadow: p.offset > 0 ? `${p.offset}px ${p.offset}px 0 ${rgba(p.ink, 0.9)}` : undefined,
                opacity: clamp01(s * 2),
                filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                transform:
                  `${swingIn(s, { rx: -12 - (i % 2) * 4, ry: (i % 2 ? 7 : -7), z: -70 })} rotate(${((1 - s) * rz).toFixed(2)}deg) `
                  + `translateY(${yAt(timeMs).toFixed(2)}px) `
                  + `scale(${(sc * sm.sx).toFixed(4)}, ${(sc * sm.sy).toFixed(4)})`,
                transformOrigin: 'top center',
                ...el(`opt${i + 1}`),
              }}
            >
              {o}
            </div>
          );
        })}

        {p.lock.trim() && (
          <div
            style={{
              fontSize: p.size * 3.8, lineHeight: 1, marginTop: p.gap * 0.7,
              opacity: clamp01(lockIn * 2),
              filter: lockSmear.blurPx > 0.3 ? `blur(${lockSmear.blurPx.toFixed(2)}px)` : undefined,
              transform: `scale(${(interpolate(lockIn, [0, 1], [0.3, 1]) * lockSmear.sx).toFixed(4)}, ${(interpolate(lockIn, [0, 1], [0.3, 1]) * lockSmear.sy).toFixed(4)})`,
              ...el('lock'),
            }}
          >
            {p.lock}
          </div>
        )}
      </div>
    );
  },
});
