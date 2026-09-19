// Reference: graphics/apple-folder-open.mp4  (window 0-5440ms, fan settled ~2680ms)
// A dock at the foot of the frame; a cursor clicks the folder and a fan of cards spills upward out
// of it. Every card leaves from the FOLDER'S position, not from the middle of the frame, which is
// the whole reason it reads as opening rather than as cards appearing.

import { Easing, interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

const MAX_CARDS = 6;
const PLACEHOLDERS = [
  'linear-gradient(150deg,#F59E0B,#D97706)',
  'linear-gradient(150deg,#3E5871,#1A2634)',
  'linear-gradient(150deg,#8F8B80,#4A463E)',
  'linear-gradient(150deg,#1A1A20,#0B0B0D)',
  'linear-gradient(150deg,#F4F1E8,#C4BDAE)',
  'linear-gradient(150deg,#6E89A3,#31506B)',
];

export const dockSpill = defineGraphicsTemplate({
  id: 'dock_spill',
  name: 'Dock Spill',
  category: 'device',
  tags: ['Desktop', 'Folder', 'Photos'],
  design: { w: 900, h: 1600 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'scene',  label: 'Scene', hideable: false },
    { key: 'dock',   label: 'Dock' },
    { key: 'cursor', label: 'Cursor' },
    ...Array.from({ length: MAX_CARDS }, (_, i) => ({ key: `card${i + 1}`, label: `Card ${i + 1}` })),
  ],

  params: [
    { type: 'image', key: 'p1', label: 'Card 1', group: 'Cards', default: '' },
    { type: 'image', key: 'p2', label: 'Card 2', group: 'Cards', default: '' },
    { type: 'image', key: 'p3', label: 'Card 3', group: 'Cards', default: '' },
    { type: 'image', key: 'p4', label: 'Card 4', group: 'Cards', default: '' },
    { type: 'image', key: 'p5', label: 'Card 5', group: 'Cards', default: '' },
    { type: 'image', key: 'p6', label: 'Card 6', group: 'Cards', default: '' },
    { type: 'number', key: 'count', label: 'How many', group: 'Cards', default: 6, min: 1, max: 6, step: 1 },

    { type: 'color',  key: 'dock',   label: 'Dock',     group: 'Style', default: '#FBFAF6' },
    { type: 'color',  key: 'folder', label: 'Folder',   group: 'Style', default: '#3aa0f5' },
    { type: 'color',  key: 'ink',    label: 'Cursor',   group: 'Style', default: '#101014' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'inter' },
    { type: 'number', key: 'card',   label: 'Card size', group: 'Style', default: 300, min: 60, max: 400, step: 4, unit: 'px' },
    { type: 'number', key: 'icon',   label: 'Icon size', group: 'Style', default: 70, min: 24, max: 160, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Card corner', group: 'Style', default: 14, min: 0, max: 50, step: 1, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow',   group: 'Style', default: 0.24, min: 0, max: 0.6, step: 0.02 },
    { type: 'boolean', key: 'showCursor', label: 'Show the cursor', group: 'Style', default: true },

    { type: 'number', key: 'clickAt', label: 'Click at',  group: 'Motion', default: 700, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Card stagger', group: 'Motion', default: 330, min: 0, max: 600, step: 10, unit: 'ms' },
    { type: 'number', key: 'reach',   label: 'Fan reach', group: 'Motion', default: 1250, min: 60, max: 1400, step: 10, unit: 'px' },
    { type: 'number', key: 'fan',     label: 'Fan spread', group: 'Motion', default: 46, min: 0, max: 90, step: 2, unit: '°' },
  ],

  // A dry mouse click on the folder, a light pass as the cards spill, one soft pop when the
  // last card parks — all timed off the same click/stagger params as the motion.
  sfx: (p) => [
    { atMs: p.clickAt, id: 'snap', gain: 0.5 },
    { atMs: p.clickAt + 80, id: 'swish', gain: 0.5 },
    { atMs: p.clickAt + (p.count - 1) * p.stagger + 700, id: 'pop', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, durationMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const srcs = [p.p1, p.p2, p.p3, p.p4, p.p5, p.p6].slice(0, p.count);
    const n = srcs.length;

    // Everything leaves from here — the folder icon's centre in the dock.
    const dockY = height * 0.9;
    const originX = width / 2;

    const reach = spring({
      frame: fr(timeMs - p.clickAt + 620), fps: FPS,
      config: { damping: 28, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    const press = interpolate(timeMs, [p.clickAt - 60, p.clickAt, p.clickAt + 160], [0, 1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    // The reference closes the folder again at the end — every card retracts into it.
    const openAt = (ms: number) => interpolate(ms, [durationMs - 1050, durationMs - 450], [1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad),
    });

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, ...el('scene') }}>
        {srcs.map((src, i) => {
          // Full flight closure — spill spring x retract gate — so the card's real velocity can
          // drive its motion blur on BOTH the spill and the retract.
          const sAt = (ms: number) => spring({
            frame: fr(ms - p.clickAt - i * p.stagger), fps: FPS,
            config: { damping: 20, mass: 0.9, stiffness: 120 },
            durationInFrames: Math.max(1, Math.round(fr(1100))),
          }) * openAt(ms);
          const s = sAt(timeMs);
          // A vertical chain out of the folder: each card climbs higher than the last while the
          // sideways drift alternates, so the spill reads as a column rather than a starburst.
          const u = (i + 1) / Math.max(1, n);
          const side = (i % 2 === 0 ? 1 : -1) * (0.55 + random(`${seed}d${i}`) * 0.45);
          const ang = side * p.fan * (Math.PI / 180);
          const dist = p.reach * (0.18 + 0.82 * u);
          const x = originX + Math.sin(ang) * width * 0.22 * s;
          const y = dockY - dist * s;
          const tilt = (random(`${seed}r${i}`) - 0.5) * 2 * 22;
          // DEPTH: each card is a physical photo tossed out of the folder — it swings through
          // perspective as it flies (and folds back when the folder closes, since the pose is
          // driven by the same spill value), then keeps a light sway in the fan. Its true flight
          // velocity smears it mid-air; parked cards are crisp.
          const vx = vel((ms: number) => originX + Math.sin(ang) * width * 0.22 * sAt(ms), timeMs);
          const vy = vel((ms: number) => dockY - dist * sAt(ms), timeMs);
          const fly = smear(vx, vy);
          const cardPose = depthPose(timeMs, `${seed}-cd${i}`, { enter: s, rx: -18, ry: side * 14, z: -120, swayDeg: 1.5 });
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: x, top: y,
                width: p.card, height: p.card,
                borderRadius: p.radius, overflow: 'hidden',
                background: src ? '#FDFCF8' : PLACEHOLDERS[i % PLACEHOLDERS.length],
                border: `${Math.max(2, p.card * 0.03)}px solid #FDFCF8`,
                boxSizing: 'border-box',
                boxShadow: p.shadow > 0 ? `0 ${p.card * 0.04}px ${p.card * 0.1}px ${rgba('#000000', p.shadow * 0.75)}, 0 ${p.card * 0.14}px ${p.card * 0.32}px ${rgba('#000000', p.shadow)}` : undefined,
                zIndex: 2 + i,
                opacity: clamp01(s * 3),
                filter: fly.blurPx > 0.3 ? `blur(${fly.blurPx.toFixed(2)}px)` : undefined,
                transform:
                  `${cardPose} translate(-50%,-50%) rotate(${(tilt * s).toFixed(2)}deg) `
                  + `scale(${(interpolate(s, [0, 1], [0.25, 1]) * fly.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.25, 1]) * fly.sy).toFixed(4)})`,
                ...el(`card${i + 1}`),
              }}
            >
              {src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
          );
        })}

        <div
          style={{
            position: 'absolute', left: '50%', top: dockY,
            transform: 'translate(-50%,-50%)',
            display: 'flex', alignItems: 'center', gap: p.icon * 0.75,
            background: rgba(p.dock, 0.9),
            border: '1px solid rgba(255,255,255,0.6)',
            borderRadius: p.icon * 0.42,
            padding: `${p.icon * 0.18}px ${p.icon * 0.75}px`,
            boxShadow: `0 ${p.icon * 0.1}px ${p.icon * 0.26}px ${rgba('#000000', 0.14)}, 0 ${p.icon * 0.34}px ${p.icon * 0.8}px ${rgba('#000000', 0.2)}, inset 0 1px 0 rgba(255,255,255,0.7)`,
            zIndex: 20,
            ...el('dock'),
          }}
        >
          <div style={{ width: p.icon, height: p.icon, borderRadius: p.icon * 0.26, background: '#2b86f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: p.icon * 0.5 }}>🙂</div>
          <div
            style={{
              width: p.icon, height: p.icon, borderRadius: p.icon * 0.18,
              background: p.folder,
              transform: `scale(${(1 - press * 0.12).toFixed(3)})`,
            }}
          />
          <div style={{ width: p.icon, height: p.icon, borderRadius: p.icon * 0.2, border: `${p.icon * 0.06}px solid ${rgba('#101014', 0.25)}`, boxSizing: 'border-box' }} />
        </div>

        {p.showCursor && (
          <div
            style={{
              position: 'absolute', left: '50%', top: dockY - p.icon * 0.1,
              width: 0, height: 0,
              borderLeft: `${p.icon * 0.3}px solid ${p.ink}`,
              borderBottom: `${p.icon * 0.44}px solid transparent`,
              borderRight: `${p.icon * 0.14}px solid transparent`,
              zIndex: 30,
              opacity: clamp01(reach * 1.6),
              transform:
                `translate(${((1 - reach) * width * 0.22).toFixed(2)}px, ${((1 - reach) * height * 0.1).toFixed(2)}px) `
                + `scale(${(1 - press * 0.18).toFixed(3)})`,
              filter: `drop-shadow(0 ${width * 0.003}px ${width * 0.006}px ${rgba('#000000', 0.4)})`,
              ...el('cursor'),
            }}
          />
        )}
      </div>
    );
  },
});
