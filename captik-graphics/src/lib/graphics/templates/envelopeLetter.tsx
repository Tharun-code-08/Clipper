// Reference: ui-elements/charming-letting.mp4  (window 1920-7240ms, letter fully out ~6480ms)
// An envelope that lands, opens its flap, and lifts a letter out of itself. The letter has to be
// BEHIND the envelope's front panel and in front of its back, so it appears to slide out of the
// pocket rather than over it — that z-order is the entire illusion and costs nothing but care.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

export const envelopeLetter = defineGraphicsTemplate({
  id: 'envelope_letter',
  name: 'Envelope Letter',
  category: 'story',
  tags: ['Letter', 'Mail', 'Reveal', 'Paper'],
  design: { w: 820, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 6600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 72 },
  fonts: ['inter', 'playfair'],

  elements: [
    { key: 'envelope', label: 'Envelope', hideable: false },
    { key: 'flap',     label: 'Flap' },
    { key: 'letter',   label: 'Letter' },
    { key: 'note',     label: 'Message' },
  ],

  params: [
    { type: 'text', key: 'note', label: 'Message', group: 'Content', multiline: true, maxLength: 180,
      default: "You're not behind, don't worry.\nYou're just doing your things." },

    { type: 'color',  key: 'paper',  label: 'Envelope', group: 'Style', default: '#e4d9c3' },
    { type: 'color',  key: 'flapCol', label: 'Flap',    group: 'Style', default: '#d8ccb3' },
    { type: 'color',  key: 'letter', label: 'Letter',   group: 'Style', default: '#f7f4ea' },
    { type: 'color',  key: 'ink',    label: 'Text',     group: 'Style', default: '#4a4034' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size',   label: 'Text size', group: 'Style', default: 34, min: 8, max: 70, step: 1, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow',   group: 'Style', default: 0.16, min: 0, max: 0.5, step: 0.02 },

    { type: 'number', key: 'dropAt',  label: 'Envelope at', group: 'Motion', default: 120, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'openAt',  label: 'Flap opens at', group: 'Motion', default: 1820, min: 0, max: 5000, step: 20, unit: 'ms' },
    { type: 'number', key: 'liftAt',  label: 'Letter rises at', group: 'Motion', default: 2300, min: 0, max: 7000, step: 20, unit: 'ms' },
    { type: 'number', key: 'liftMs',  label: 'Rises over',   group: 'Motion', default: 1200, min: 200, max: 5000, step: 50, unit: 'ms' },
    { type: 'number', key: 'textAt',  label: 'Message at',   group: 'Motion', default: 3000, min: 0, max: 9000, step: 50, unit: 'ms' },
  ],

  // PAPER language: the envelope thumps onto the desk, the flap flicks open, the letter slides
  // free with a light pass of air — each cue keyed to the same Motion param as its beat.
  sfx: (p) => [
    { atMs: p.dropAt + 260, id: 'paper', gain: 0.5 },
    { atMs: p.openAt + 140, id: 'paper', gain: 0.45 },
    { atMs: p.liftAt + 220, id: 'swish', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);

    const dropAt = (ms: number) => spring({
      frame: fr(ms - p.dropAt), fps: FPS,
      config: { damping: 20, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    const drop = dropAt(timeMs);
    const open = spring({
      frame: fr(timeMs - p.openAt), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const liftAt = (ms: number) => spring({
      frame: fr(ms - p.liftAt), fps: FPS,
      config: { damping: 30, mass: 1, stiffness: 100 },
      durationInFrames: Math.max(1, Math.round(fr(p.liftMs))),
    });
    const lift = liftAt(timeMs);
    const text = spring({
      frame: fr(timeMs - p.textAt), fps: FPS,
      config: { damping: 26, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });

    const envW = width * 0.82;
    const envH = envW * 0.6;
    const envX = (width - envW) / 2;
    const envY = height * 0.52;
    const letterH = envH * 1.7;

    // The envelope is TOSSED onto the desk, not slid down a web page: the drop spring drives a
    // casual 3D hinge, and a faint paper sway keeps the pose alive after it lands.
    const pose = depthPose(timeMs, seed, { enter: drop, rx: -13, ry: -6, z: -70, swayDeg: 1.1 });
    // Velocity of the letter's rise (px/ms at its top edge) → blur + stretch that die the
    // moment the letter stops — the pull-out reads as motion, the held letter stays crisp.
    const vLift = vel((ms) => interpolate(liftAt(ms), [0, 1], [letterH * 0.92, 0]), timeMs);
    const smLift = smear(0, vLift, 0.9);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          opacity: clamp01(drop * 1.6),
          transform: `${pose} translateY(${((1 - drop) * -height * 0.14).toFixed(2)}px)`,
          ...el('envelope'),
        }}
      >
        {/* Back panel — everything else stacks above this. */}
        <div
          style={{
            position: 'absolute', left: envX, top: envY, width: envW, height: envH,
            background: `linear-gradient(180deg, ${rgba('#ffffff', 0.22)} 0%, ${rgba('#000000', 0.05)} 100%), ${p.paper}`,
            border: `1px solid ${rgba('#000000', 0.05)}`,
            borderRadius: envW * 0.02, zIndex: 1,
            boxSizing: 'border-box',
          }}
        />

        {/* The letter: above the back panel, BELOW the front panel, so it slides out of the pocket.
            The clip is load-bearing — the letter is TALLER than the envelope, so without a mask
            ending at the envelope's bottom edge its lower half hangs visibly below the pocket
            before it has even started to rise. */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: envY + envH, overflow: 'hidden', zIndex: 2 }}>
        <div
          style={{
            position: 'absolute', left: envX + envW * 0.06, top: envY - letterH + envH * 0.9,
            width: envW * 0.88, height: letterH,
            background: `linear-gradient(180deg, ${rgba('#ffffff', 0.35)} 0%, ${rgba('#000000', 0.03)} 100%), ${p.letter}`,
            border: `1px solid ${rgba('#000000', 0.04)}`,
            borderRadius: envW * 0.015,
            boxShadow: p.shadow > 0
              ? `0 ${envW * 0.012}px ${envW * 0.035}px ${rgba('#000000', p.shadow * 0.5)}, 0 ${envW * 0.04}px ${envW * 0.1}px ${rgba('#000000', p.shadow * 0.65)}, inset 0 1px 0 ${rgba('#ffffff', 0.5)}`
              : `inset 0 1px 0 ${rgba('#ffffff', 0.5)}`,
            padding: envW * 0.08, boxSizing: 'border-box',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            fontFamily: ff, color: p.ink, fontSize: p.size, lineHeight: 1.5, textAlign: 'center',
            whiteSpace: 'pre-line',
            filter: smLift.blurPx > 0.3 ? `blur(${smLift.blurPx.toFixed(2)}px)` : undefined,
            transform: `translateY(${(interpolate(lift, [0, 1], [letterH * 0.92, 0])).toFixed(2)}px) scale(${smLift.sx.toFixed(4)}, ${smLift.sy.toFixed(4)})`,
            ...el('letter'),
          }}
        >
          <span style={{ opacity: clamp01(text * 1.4), ...el('note') }}>{p.note}</span>
        </div>
        </div>

        {/* Front panel: the pocket the letter comes out of. */}
        <div
          style={{
            position: 'absolute', left: envX, top: envY + envH * 0.3, width: envW, height: envH * 0.7,
            background: `linear-gradient(180deg, ${rgba('#ffffff', 0.18)} 0%, ${rgba('#000000', 0.06)} 100%), ${p.paper}`,
            border: `1px solid ${rgba('#000000', 0.05)}`,
            borderTop: 'none',
            boxSizing: 'border-box',
            borderRadius: `0 0 ${envW * 0.02}px ${envW * 0.02}px`,
            boxShadow: p.shadow > 0
              ? `0 ${envW * 0.02}px ${envW * 0.05}px ${rgba('#000000', p.shadow * 0.85)}, 0 ${envW * 0.06}px ${envW * 0.14}px ${rgba('#000000', p.shadow)}`
              : undefined,
            zIndex: 3,
          }}
        />

        {/* Flap, hinged at the top edge. Rotating past 90° puts its back face to camera. */}
        <div
          style={{
            position: 'absolute', left: envX, top: envY, width: envW, height: 0,
            borderLeft: `${envW / 2}px solid transparent`,
            borderRight: `${envW / 2}px solid transparent`,
            borderTop: `${envH * 0.5}px solid ${p.flapCol}`,
            transformOrigin: '50% 0%',
            transform: `rotateX(${interpolate(open, [0, 1], [0, 168]).toFixed(2)}deg)`,
            filter: p.shadow > 0 ? `drop-shadow(0 ${envW * 0.008}px ${envW * 0.02}px ${rgba('#000000', p.shadow * 0.6)})` : undefined,
            zIndex: open > 0.5 ? 1 : 4,
            ...el('flap'),
          }}
        />
      </div>
    );
  },
});
