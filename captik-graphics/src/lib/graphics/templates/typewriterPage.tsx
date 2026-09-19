// Reference: graphics/typewriter.mp4  (window 480-9560ms, page fills ~4320ms)
// A typewriter with a sheet in the platen, typing character by character. Per-character is right
// HERE — unlike note_card's paragraph, a typewriter is literally one key at a time and the sound of
// it is the point.
//
// The sheet nudges up a line every time the text wraps, so the carriage appears to advance.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export const typewriterPage = defineGraphicsTemplate({
  id: 'typewriter_page',
  name: 'Typewriter',
  category: 'story',
  tags: ['Typewriter', 'Vintage', 'Typing'],
  design: { w: 900, h: 1000 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 9000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter', 'pixel'],

  elements: [
    { key: 'machine', label: 'Machine', hideable: false },
    { key: 'paper',   label: 'Paper' },
    { key: 'text',    label: 'Typed text' },
    { key: 'keys',    label: 'Keys' },
  ],

  params: [
    { type: 'text', key: 'text', label: 'Text', group: 'Content', multiline: true, maxLength: 300,
      default: 'Hello World! This is a typewriter animation.' },

    { type: 'color',  key: 'body',  label: 'Machine', group: 'Style', default: '#17171B' },
    { type: 'color',  key: 'paper', label: 'Paper',   group: 'Style', default: '#f4ecdf' },
    { type: 'color',  key: 'ink',   label: 'Ink',     group: 'Style', default: '#2a2620' },
    { type: 'color',  key: 'key',   label: 'Keys',    group: 'Style', default: '#3a3a42' },
    { type: 'font',   key: 'font',  label: 'Font',    group: 'Style', default: 'pixel' },
    { type: 'number', key: 'size',  label: 'Text size', group: 'Style', default: 26, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow',  group: 'Style', default: 0.3, min: 0, max: 0.6, step: 0.02 },
    { type: 'boolean', key: 'keys', label: 'Keyboard', group: 'Style', default: true },

    { type: 'number', key: 'startAt', label: 'Typing starts', group: 'Motion', default: 500, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'cps',     label: 'Characters / sec', group: 'Motion', default: 2.5, min: 1, max: 40, step: 0.5 },
    { type: 'number', key: 'jitter',  label: 'Key jitter', group: 'Motion', default: 3, min: 0, max: 14, step: 1, unit: 'px',
      help: 'How far the machine kicks on each keystroke.' },
  ],

  // The machine thunks in under an air pass, then ONE soft key thock as the burst of typing
  // opens — a cue per character at 2.5cps would be a metronome; the kick motion carries the
  // rhythm and the typing character stays visual.
  sfx: (p) => [
    { atMs: 120, id: 'whoosh', gain: 0.4 },
    { atMs: p.startAt + 60, id: 'type', gain: 0.55 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);

    const shown = Math.max(0, Math.floor(((timeMs - p.startAt) / 1000) * p.cps));
    const typed = p.text.slice(0, shown);
    const typing = shown > 0 && shown < p.text.length;

    // Kick on each keystroke: a decaying bump keyed to the character index, so it is per-key and
    // still a pure function of the clock.
    const sinceKey = ((timeMs - p.startAt) / 1000) * p.cps % 1;
    const kick = typing ? Math.max(0, 1 - sinceKey * 3) * p.jitter : 0;

    const machineInAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 22, mass: 0.9, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const machineIn = machineInAt(timeMs);
    // The machine sets down through 3D space on its existing spring — a heavy object placed on
    // the desk, with the faintest resting breath after (the keystroke kick does the living
    // while it types). Entrance velocity smears it; it lands crisp.
    const pose = depthPose(timeMs, seed, { enter: machineIn, rx: -10, z: -60, swayDeg: 0.6, periodMs: 4600 });
    const vMach = vel((ms) => (1 - machineInAt(ms)) * height * 0.05, timeMs);
    const smMach = smear(0, vMach, 1.1);

    const bodyW = width * 0.95;
    const bodyX = (width - bodyW) / 2;
    const bodyY = height * 0.56;
    const paperW = width * 0.45;
    // Roller bar the sheet feeds out of, sitting on the deck.
    const carriageH = height * 0.055;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, fontFamily: ff,
          opacity: clamp01(machineIn * 1.6),
          filter: smMach.blurPx > 0.3 ? `blur(${smMach.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} translateY(${((1 - machineIn) * height * 0.05).toFixed(2)}px) scale(${smMach.sx.toFixed(4)}, ${smMach.sy.toFixed(4)})`,
          ...el('machine'),
        }}
      >
        <div
          style={{
            position: 'absolute', left: (width - paperW) / 2, top: height * 0.03,
            width: paperW, height: height * 0.50,
            background: `linear-gradient(180deg, ${rgba('#ffffff', 0.3)} 0%, ${rgba('#000000', 0.03)} 100%), ${p.paper}`,
            border: `1px solid ${rgba('#000000', 0.05)}`,
            boxShadow: p.shadow > 0
              ? `0 ${width * 0.008}px ${width * 0.02}px ${rgba('#000000', p.shadow * 0.5)}, 0 ${width * 0.025}px ${width * 0.06}px ${rgba('#000000', p.shadow * 0.6)}`
              : undefined,
            padding: paperW * 0.09, boxSizing: 'border-box',
            transform: `translateY(${(-kick * 0.4).toFixed(2)}px)`,
            ...el('paper'),
          }}
        >
          <div
            style={{
              fontSize: p.size, color: p.ink, lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              ...el('text'),
            }}
          >
            {typed}
            <span style={{ opacity: typing ? 1 : 0 }}>|</span>
          </div>
        </div>

        {/* Carriage + platen: the light bar the paper rolls out of. */}
        <div
          style={{
            position: 'absolute', left: bodyX, top: bodyY - carriageH,
            width: bodyW, height: carriageH,
            background: rgba(p.paper, 0.22),
            boxShadow: `inset 0 1px 0 ${rgba('#ffffff', 0.1)}`,
            borderRadius: `${carriageH * 0.5}px ${carriageH * 0.5}px 0 0`,
            transform: `translateY(${(kick * 0.7).toFixed(2)}px)`,
          }}
        >
          <div
            style={{
              position: 'absolute', left: '50%', top: carriageH * 0.2,
              width: paperW * 1.12, height: carriageH * 0.6, borderRadius: carriageH * 0.3,
              background: rgba('#000000', 0.45), transform: 'translateX(-50%)',
            }}
          />
        </div>

        <div
          style={{
            position: 'absolute', left: bodyX, top: bodyY,
            width: bodyW, height: height * 0.40,
            background: `linear-gradient(180deg, ${rgba('#ffffff', 0.05)} 0%, ${rgba('#000000', 0.35)} 100%), ${p.body}`,
            border: `1px solid ${rgba('#ffffff', 0.1)}`,
            borderRadius: `${width * 0.02}px ${width * 0.02}px ${width * 0.05}px ${width * 0.05}px`,
            boxShadow: p.shadow > 0
              ? `0 ${width * 0.015}px ${width * 0.04}px ${rgba('#000000', p.shadow * 0.9)}, 0 ${width * 0.05}px ${width * 0.11}px ${rgba('#000000', p.shadow)}, inset 0 1px 0 ${rgba('#ffffff', 0.07)}`
              : `inset 0 1px 0 ${rgba('#ffffff', 0.07)}`,
            padding: bodyW * 0.05, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: bodyW * 0.022,
            transform: `translateY(${kick.toFixed(2)}px)`,
            ...el('keys'),
          }}
        >
          {p.keys && KEY_ROWS.map((row, r) => (
            <div key={r} style={{ display: 'flex', justifyContent: 'center', gap: bodyW * 0.014 }}>
              {[...row].map((k, c) => {
                const lit = typing && random(`${seed}${Math.floor(shown / 1)}`) * 26 < 1 && c === shown % row.length;
                return (
                  <span
                    key={c}
                    style={{
                      width: bodyW * 0.072, height: bodyW * 0.072, borderRadius: bodyW * 0.016,
                      background: lit
                        ? rgba(p.paper, 0.8)
                        : `linear-gradient(180deg, ${rgba('#ffffff', 0.07)} 0%, ${rgba('#000000', 0.28)} 100%), ${p.key}`,
                      border: `1px solid ${rgba('#ffffff', 0.07)}`,
                      boxSizing: 'border-box',
                      boxShadow: `0 ${bodyW * 0.004}px ${bodyW * 0.01}px ${rgba('#000000', 0.35)}, inset 0 1px 0 ${rgba('#ffffff', 0.1)}`,
                      color: rgba(p.paper, 0.75),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: bodyW * 0.032, lineHeight: 1,
                    }}
                  >
                    {k}
                  </span>
                );
              })}
            </div>
          ))}
          <div
            style={{
              alignSelf: 'center', marginTop: bodyW * 0.02,
              width: bodyW * 0.42, height: bodyW * 0.042, borderRadius: bodyW * 0.021,
              background: `linear-gradient(180deg, ${rgba('#ffffff', 0.07)} 0%, ${rgba('#000000', 0.28)} 100%), ${p.key}`,
              border: `1px solid ${rgba('#ffffff', 0.07)}`,
              boxSizing: 'border-box',
              boxShadow: `0 ${bodyW * 0.004}px ${bodyW * 0.01}px ${rgba('#000000', 0.35)}, inset 0 1px 0 ${rgba('#ffffff', 0.1)}`,
              opacity: interpolate(machineIn, [0, 1], [0, 1]),
            }}
          />
        </div>
      </div>
    );
  },
});
