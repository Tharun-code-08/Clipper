// Reference: graphics/retro-phone.mp4  (window 0-4720ms, menu filled ~960ms then holds)
// A candybar feature phone with a green LCD, a menu filling row by row, and a full keypad.
//
// The LCD is drawn with a hard pixel grain rather than a smooth fill — a flat green rectangle reads
// as a modern panel, and the grain is what makes it read as a 90s screen. It is a repeating-gradient
// background, not an image, so it stays crisp at any scale.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

const MAX_ROWS = 6;
const KEYS = [
  ['1', '2 abc', '3 def'],
  ['4 ghi', '5 jkl', '6 mno'],
  ['7 pqrs', '8 tuv', '9 wxyz'],
  ['*', '0 +', '#'],
];

export const retroPhone = defineGraphicsTemplate({
  id: 'retro_phone',
  name: 'Retro Phone',
  category: 'device',
  tags: ['Phone', 'Retro', 'Nokia'],
  design: { w: 620, h: 1180 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 62 },
  fonts: ['inter', 'pixel'],

  elements: [
    { key: 'phone',  label: 'Phone', hideable: false },
    { key: 'screen', label: 'Screen' },
    { key: 'keypad', label: 'Keypad' },
    ...Array.from({ length: MAX_ROWS }, (_, i) => ({ key: `row${i + 1}`, label: `Menu row ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'header', label: 'Status bar', group: 'Content', default: 'Menu', maxLength: 20 },
    { type: 'text', key: 'rows',   label: 'Menu rows', group: 'Content', multiline: true, maxLength: 200,
      default: 'Contacts\nMessages\nCall Register\nSettings\nGames', help: 'One per line.' },
    { type: 'text', key: 'left',   label: 'Left key',  group: 'Content', default: 'Select', maxLength: 12 },
    { type: 'text', key: 'right',  label: 'Right key', group: 'Content', default: 'Back', maxLength: 12 },

    { type: 'color',  key: 'body',   label: 'Body',   group: 'Style', default: '#17171b' },
    { type: 'color',  key: 'lcd',    label: 'Screen', group: 'Style', default: '#8ea832' },
    { type: 'color',  key: 'ink',    label: 'Screen text', group: 'Style', default: '#1e2408' },
    { type: 'color',  key: 'key',    label: 'Keys',   group: 'Style', default: '#2a2a31' },
    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'pixel' },
    { type: 'number', key: 'size',   label: 'Screen text size', group: 'Style', default: 24, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Body corner', group: 'Style', default: 44, min: 0, max: 120, step: 2, unit: 'px' },
    { type: 'number', key: 'grain',  label: 'Screen grain', group: 'Style', default: 0.1, min: 0, max: 0.4, step: 0.02 },
    { type: 'boolean', key: 'antenna', label: 'Antenna', group: 'Style', default: true },

    { type: 'number', key: 'phoneAt', label: 'Phone at', group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'firstAt', label: 'First row at', group: 'Motion', default: 500, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Row stagger', group: 'Motion', default: 180, min: 0, max: 800, step: 10, unit: 'ms' },
  ],

  // Device language kept dry and retro: air as the handset arrives, ONE typewriter tick as the
  // menu starts filling — a tick per row would turn the build into a drum roll.
  sfx: (p) => [
    { atMs: p.phoneAt + 30, id: 'whoosh', gain: 0.45 },
    { atMs: p.firstAt + 120, id: 'tick', gain: 0.6 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const rows = p.rows.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_ROWS);

    const phoneInAt = (ms: number) => spring({
      frame: fr(ms - p.phoneAt), fps: FPS,
      config: { damping: 22, mass: 0.9, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(680))),
    });
    const phoneIn = phoneInAt(timeMs);

    // DEPTH: the candybar arrives as a physical object — deep 3D swing riding its existing
    // overshoot spring, approach smear that dies as it seats — then rests NEARLY still (0.9°
    // sway). The LCD contents drift at ~0.2 parallax against the body so the screen reads as
    // recessed behind glass, not printed on the shell.
    const pose = depthPose(timeMs, seed, { enter: phoneIn, rx: -16, ry: 10, z: -170, swayDeg: 0.9, periodMs: 5000 });
    const phoneSmear = smear(0, vel((ms: number) => (1 - phoneInAt(ms)) * width * 0.3, timeMs));
    const parLcd = parallax(timeMs, seed, 0.18, width * 0.008, 5000);

    const pad = width * 0.07;
    const screenH = height * 0.28;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0.22) 100%), ${p.body}`,
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: p.radius,
          padding: pad, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: pad * 0.6,
          fontFamily: ff,
          boxShadow: `0 ${width * 0.03}px ${width * 0.08}px ${rgba('#000000', 0.32)}, 0 ${width * 0.1}px ${width * 0.24}px ${rgba('#000000', 0.38)}, inset 0 1px 0 rgba(255,255,255,0.09)`,
          opacity: clamp01(phoneIn * 1.8),
          filter: phoneSmear.blurPx > 0.3 ? `blur(${phoneSmear.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} scale(${(interpolate(phoneIn, [0, 1], [0.9, 1]) * phoneSmear.sx).toFixed(4)}, ${(interpolate(phoneIn, [0, 1], [0.9, 1]) * phoneSmear.sy).toFixed(4)})`,
          transformOrigin: 'center center',
          ...el('phone'),
        }}
      >
        {p.antenna && (
          <div style={{ position: 'absolute', right: width * 0.12, top: -height * 0.06, width: 3, height: height * 0.06, background: p.body }} />
        )}

        <div
          style={{
            height: screenH,
            background: p.lcd,
            // Hard grain, not a smooth fill — this is what reads as an LCD.
            backgroundImage: `repeating-linear-gradient(0deg, ${rgba('#000000', p.grain)} 0 1px, transparent 1px 3px)`,
            borderRadius: width * 0.02,
            border: '1px solid rgba(0,0,0,0.4)',
            boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.3), inset 0 -1px 0 rgba(255,255,255,0.12)',
            padding: width * 0.04, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: p.size * 0.28,
            color: p.ink,
            ...el('screen'),
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: p.size * 0.7, opacity: clamp01(phoneIn), transform: `translate(${parLcd.x.toFixed(2)}px, ${parLcd.y.toFixed(2)}px)` }}>
            <span>▮▮▮</span>
            <span>{p.header}</span>
            <span>▮</span>
          </div>

          {rows.map((r, i) => {
            const s = spring({
              frame: fr(timeMs - p.firstAt - i * p.stagger), fps: FPS,
              config: { damping: 26, mass: 0.5, stiffness: 200 },
              durationInFrames: Math.max(1, Math.round(fr(320))),
            });
            return (
              <div
                key={i}
                style={{
                  fontSize: p.size, lineHeight: 1.2,
                  background: i === 0 ? rgba(p.ink, 0.18) : undefined,
                  padding: `${p.size * 0.06}px ${p.size * 0.16}px`,
                  opacity: clamp01(s * 2),
                  transform: `translate(${(parLcd.x + (1 - s) * width * 0.05).toFixed(2)}px, ${parLcd.y.toFixed(2)}px)`,
                  ...el(`row${i + 1}`),
                }}
              >
                {r}
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', ...el('keypad') }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: p.size * 0.62 }}>
            <span style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(0,0,0,0.18)), #3B7F4A', color: '#eaf3ea', borderRadius: width * 0.02, padding: `${p.size * 0.16}px ${p.size * 0.5}px`, boxShadow: '0 2px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2)' }}>{p.left}</span>
            <span style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(0,0,0,0.18)), #9C3A3A', color: '#f6eaea', borderRadius: width * 0.02, padding: `${p.size * 0.16}px ${p.size * 0.5}px`, boxShadow: '0 2px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2)' }}>{p.right}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: pad * 0.28 }}>
            {KEYS.map((row, r) => (
              <div key={r} style={{ display: 'flex', justifyContent: 'space-between', gap: pad * 0.28 }}>
                {row.map((k, c) => (
                  <span
                    key={c}
                    style={{
                      flex: 1,
                      background: `linear-gradient(180deg, rgba(255,255,255,0.09), rgba(0,0,0,0.2)), ${p.key}`,
                      color: rgba('#F4F1E8', 0.85),
                      border: '1px solid rgba(255,255,255,0.07)', boxSizing: 'border-box',
                      borderRadius: width * 0.024,
                      padding: `${p.size * 0.26}px 0`,
                      textAlign: 'center', fontSize: p.size * 0.6, lineHeight: 1,
                      boxShadow: '0 2px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
                      opacity: clamp01(phoneIn),
                    }}
                  >
                    {k}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
});
