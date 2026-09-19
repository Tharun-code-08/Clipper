// Reference: logos/logo-code.mp4  (window 960-3280ms, name resolved ~2120ms)
// A monospace line that scrambles through junk glyphs and resolves left to right.
//
// Same purity rule as split_flap: the junk character is `random(seed + index + tickIndex)`, where
// the tick is floor(timeMs / churnMs). It looks like noise but is identical at the same millisecond
// on every surface. Unlike split_flap this is one line with per-character locking, so it also needs
// a fixed character cell — proportional glyphs would make the line breathe as junk resolves.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { depthPose, parallax } from '../juice';

// Deliberately no ascender/descender glyphs — junk that pokes above and below the cap line makes the
// line's height jump around while it resolves, which the reference's does not.
const JUNK = '/\\|[]{}#%&0123456789';

export const decodeText = defineGraphicsTemplate({
  id: 'decode_text',
  name: 'Decode Text',
  category: 'title',
  tags: ['Logo', 'Terminal', 'Scramble'],
  design: { w: 900, h: 340 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 88 },
  fonts: ['inter', 'pixel'],

  elements: [
    { key: 'line',  label: 'Line', hideable: false },
    { key: 'sub',   label: 'Subtitle' },
  ],

  params: [
    { type: 'text', key: 'text', label: 'Text',     group: 'Content', default: 'Captik', maxLength: 28 },
    { type: 'text', key: 'sub',  label: 'Subtitle', group: 'Content', default: '', maxLength: 40 },

    { type: 'color',  key: 'ink',  label: 'Text',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',  label: 'Scrambling', group: 'Style', default: '#D97706' },
    { type: 'font',   key: 'font', label: 'Font',  group: 'Style', default: 'inter' },
    { type: 'number', key: 'size', label: 'Size',  group: 'Style', default: 118, min: 16, max: 200, step: 2, unit: 'px' },
    { type: 'number', key: 'cell', label: 'Character width', group: 'Style', default: 0.8, min: 0.4, max: 1.4, step: 0.02,
      help: 'Relative to the size. Fixed, so the line does not breathe while it resolves.' },
    { type: 'number', key: 'subSize', label: 'Subtitle size', group: 'Style', default: 26, min: 8, max: 70, step: 1, unit: 'px' },

    { type: 'number', key: 'startAt', label: 'Starts at', group: 'Motion', default: 200, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'perChar', label: 'Per character', group: 'Motion', default: 380, min: 10, max: 600, step: 10, unit: 'ms' },
    { type: 'number', key: 'warm',    label: 'Scramble lead', group: 'Motion', default: 1450, min: 0, max: 4000, step: 50, unit: 'ms',
      help: 'How long a character churns before it locks. The line fills with junk first, then resolves.' },
    { type: 'number', key: 'churnMs', label: 'Scramble speed', group: 'Motion', default: 55, min: 16, max: 300, step: 1, unit: 'ms' },
    { type: 'number', key: 'subAt',   label: 'Subtitle at', group: 'Motion', default: 2100, min: 0, max: 8000, step: 50, unit: 'ms' },
  ],

  // Terminal decode: a quiet pass as the junk starts churning, ONE tick as the first character
  // locks, a dry snap when the last one resolves — all off the same startAt/perChar/warm the
  // scramble runs on.
  sfx: (p) => {
    const n = Math.max(1, [...p.text].length);
    return [
      { atMs: Math.max(0, p.startAt - p.warm), id: 'swish', gain: 0.4 },
      { atMs: p.startAt, id: 'tick', gain: 0.55 },
      { atMs: p.startAt + (n - 1) * p.perChar, id: 'snap', gain: 0.7 },
    ];
  },

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const chars = [...p.text];
    const tick = Math.floor(timeMs / Math.max(1, p.churnMs));

    const enter = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(320))),
    });
    const sub = spring({
      frame: fr(timeMs - p.subAt), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    // The terminal is a pane in 3D: it swings in from a shallow top hinge and never flattens —
    // a ±1.4° sway holds it in space while the characters churn on its surface.
    const pose = depthPose(timeMs, seed, { enter, rx: -10, z: -70, swayDeg: 1.4 });
    // The subtitle sits on a nearer plane and shears against the swaying line.
    const parSub = parallax(timeMs, seed, 0.6, p.size * 0.06);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: p.size * 0.24, fontFamily: ff,
          opacity: clamp01(enter),
          transform: pose,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', ...el('line') }}>
          {chars.map((ch, i) => {
            const lockAt = p.startAt + i * p.perChar;
            const locked = timeMs >= lockAt;
            // Each cell starts churning on its own clock, so the junk line itself builds left to
            // right before any of it resolves.
            const started = timeMs >= lockAt - p.warm;
            const shown = locked
              ? ch
              : started
                ? JUNK[Math.floor(random(`${seed}${i}_${tick}`) * JUNK.length)]
                : ' ';
            // Churning glyphs are IN MOTION — they carry a soft unfocused blur; the lock is the
            // rest: a micro snap-scale that decays over ~150ms and lands pixel-crisp.
            const lockP = clamp01((timeMs - lockAt) / 150);
            const cellBlur = locked ? (1 - lockP) * 2.2 : started ? 1.1 : 0;
            const snapS = 1 + 0.16 * Math.pow(1 - lockP, 3);
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block', textAlign: 'center',
                  width: p.size * p.cell,
                  fontSize: p.size, lineHeight: 1.1,
                  color: locked ? p.ink : p.dim,
                  opacity: locked ? 1 : 0.85,
                  filter: cellBlur > 0.3 ? `blur(${cellBlur.toFixed(2)}px)` : undefined,
                  transform: locked ? `scale(${snapS.toFixed(4)})` : undefined,
                }}
              >
                {shown}
              </span>
            );
          })}
        </div>

        {p.sub.trim() && (
          <div
            style={{
              fontSize: p.subSize, color: p.dim, letterSpacing: p.subSize * 0.12,
              opacity: clamp01(sub * 1.5),
              transform: `translate(${parSub.x.toFixed(2)}px, ${(parSub.y + (1 - sub) * p.subSize * 0.4).toFixed(2)}px)`,
              ...el('sub'),
            }}
          >
            {p.sub}
          </div>
        )}
      </div>
    );
  },
});
