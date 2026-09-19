// Reference: general/goals.mp4  (window 2320-6400ms, third item ticks ~4700ms)
// A short list where each line arrives grey, then gets a drawn tick and turns bright.
//
// The tick STROKES on rather than fading in, and the text brightens on the same clock, so the two
// read as one event. Fading a finished tick in is the version that looks like a slideshow.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeLightLeak, luxeVignette } from '../luxe';
import { depthPose, swingIn } from '../juice';

const MAX_ROWS = 8;

export const checkList = defineGraphicsTemplate({
  id: 'check_list',
  name: 'Checklist',
  category: 'story',
  tags: ['List', 'Ticks', 'Goals', 'Luxury'],
  design: { w: 900, h: 900 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 90 },
  fonts: ['inter'],

  elements: [
    { key: 'field', label: 'Field', hideable: false },
    ...Array.from({ length: MAX_ROWS }, (_, i) => ({ key: `row${i + 1}`, label: `Row ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'items', label: 'Items', group: 'Content', multiline: true, maxLength: 240,
      default: 'New Year\nNew Goals\nNew Energy', help: 'One per line.' },

    { type: 'color',  key: 'bg',    label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'ink',   label: 'Done text', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'pend',  label: 'Pending text', group: 'Style', default: '#6B675C' },
    { type: 'color',  key: 'tick',  label: 'Tick',     group: 'Style', default: '#4ADE80' },
    { type: 'font',   key: 'font',  label: 'Font',     group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Text size', group: 'Style', default: 54, min: 12, max: 120, step: 2, unit: 'px' },
    { type: 'number', key: 'gap',   label: 'Row gap',  group: 'Style', default: 22, min: 0, max: 90, step: 2, unit: 'px' },
    { type: 'boolean', key: 'fill', label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First row at', group: 'Motion', default: 200, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Row stagger', group: 'Motion', default: 700, min: 60, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'tickMs',  label: 'Tick draws over', group: 'Motion', default: 340, min: 60, max: 1500, step: 20, unit: 'ms' },
  ],

  // Story whispers: a light pass as the first row arrives, ONE typewriter tick when the first
  // check strokes on (at + 260 in the render), a soft chime as the last tick completes.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_ROWS, p.items.split('\n').map((s) => s.trim()).filter(Boolean).length));
    return [
      { atMs: p.firstAt, id: 'swish', gain: 0.35 },
      { atMs: p.firstAt + 260, id: 'tick', gain: 0.5 },
      { atMs: p.firstAt + (n - 1) * p.stagger + 260 + p.tickMs, id: 'chime', gain: 0.4 },
    ];
  },

  render: ({ params: p, el, timeMs, durationMs, seed }) => {
    const ff = fontStack(p.font);
    const items = p.items.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_ROWS);

    // DOCU depth on the LIST, not the field: the painted backdrop stays glued to the frame
    // (rotating a full-bleed plate exposes its corners) while the row block lives in 3D on a
    // slow sway and pushes in Ken-Burns style over the window.
    const pose = depthPose(timeMs, seed, { swayDeg: 1.3, periodMs: 4200 });
    const push = 1 + Math.min(1, timeMs / Math.max(1, durationMs)) * 0.025;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? `linear-gradient(180deg, ${rgba('#ffffff', 0.03)} 0%, ${rgba('#000000', 0.4)} 100%), ${p.bg}` : 'transparent',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
          paddingLeft: '22%', gap: p.gap,
          fontFamily: ff,
          ...el('field'),
        }}
      >
        {p.fill && <div style={luxeLightLeak('80%', '0%', 0.1)} />}
        <div
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: p.gap,
            transform: `${pose} scale(${push.toFixed(4)})`,
          }}
        >
        {items.map((text, i) => {
          const at = p.firstAt + i * p.stagger;
          const arrive = spring({
            frame: fr(timeMs - at), fps: FPS,
            config: { damping: 24, mass: 0.6, stiffness: 180 },
            durationInFrames: Math.max(1, Math.round(fr(380))),
          });
          // Tick and brightening share ONE clock, so they land as a single event.
          const done = interpolate(timeMs, [at + 260, at + 260 + p.tickMs], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          // Z-STAGGER + rack focus: each row swings in as an object from its own angle and
          // sharpens as it lands — blur is gone the moment the spring settles.
          const rack = (1 - Math.min(1, arrive)) * 4;
          return (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: p.size * 0.4,
                opacity: clamp01(arrive * 2),
                filter: rack > 0.3 ? `blur(${rack.toFixed(2)}px)` : undefined,
                transform:
                  `${swingIn(arrive, { rx: -14 - (i % 2) * 4, z: -60 })} ` +
                  `translateY(${((1 - arrive) * p.size * 0.35).toFixed(2)}px)`,
                ...el(`row${i + 1}`),
              }}
            >
              <svg
                width={p.size * 0.62} height={p.size * 0.62} viewBox="0 0 40 40"
                style={{ flex: 'none', filter: `drop-shadow(0 0 ${Math.round(p.size * 0.12)}px ${rgba(p.tick, 0.4)})` }}
              >
                <path
                  d="M7 21 L16 30 L33 11"
                  fill="none" stroke={p.tick} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
                  pathLength={1} strokeDasharray={1} strokeDashoffset={1 - done}
                />
              </svg>
              <span
                style={{
                  fontSize: p.size, fontWeight: 700, letterSpacing: '-0.01em',
                  color: done > 0.5 ? p.ink : p.pend,
                  opacity: interpolate(done, [0, 1], [0.75, 1]),
                }}
              >
                {text}
              </span>
            </div>
          );
        })}
        </div>
        {p.fill && <div style={luxeVignette(0.4)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
