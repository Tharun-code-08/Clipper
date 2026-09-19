// Reference: graphics/folder-gallery-1.mp4  (window 4120-6240ms, grid settled ~5200ms)
// A folder that a cursor opens: sheets pop out of it, then a window slides up carrying a grid of
// thumbnails.
//
// Distinct from dock_spill, which fans cards out of a dock icon and stops there. Here the fan is
// the SETUP and the window is the payoff, so the two phases have to overlap slightly — the sheets
// are still settling as the window starts rising.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_TILES = 6;
const SHEETS = 4;
const LIGHTS = ['#ff5f57', '#febc2e', '#28c840'];

export const folderGallery = defineGraphicsTemplate({
  id: 'folder_gallery',
  name: 'Folder Gallery',
  category: 'device',
  tags: ['Folder', 'Gallery', 'Desktop'],
  design: { w: 900, h: 1100 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 3200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 92 },
  fonts: ['inter'],

  elements: [
    { key: 'scene',  label: 'Scene', hideable: false },
    { key: 'folder', label: 'Folder' },
    { key: 'cursor', label: 'Cursor' },
    { key: 'window', label: 'Window' },
    ...Array.from({ length: MAX_TILES }, (_, i) => ({ key: `tile${i + 1}`, label: `Tile ${i + 1}` })),
  ],

  params: [
    { type: 'text',  key: 'label', label: 'Folder name', group: 'Content', default: 'untitled', maxLength: 24 },
    { type: 'image', key: 'p1', label: 'Tile 1', group: 'Content', default: '' },
    { type: 'image', key: 'p2', label: 'Tile 2', group: 'Content', default: '' },
    { type: 'image', key: 'p3', label: 'Tile 3', group: 'Content', default: '' },
    { type: 'image', key: 'p4', label: 'Tile 4', group: 'Content', default: '' },
    { type: 'number', key: 'count', label: 'How many', group: 'Content', default: 4, min: 1, max: 6, step: 1 },
    { type: 'number', key: 'cols',  label: 'Columns',  group: 'Content', default: 2, min: 1, max: 3, step: 1 },

    { type: 'color',  key: 'bg',     label: 'Background', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'folder', label: 'Folder',     group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'window', label: 'Window',     group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'tile',   label: 'Tiles',      group: 'Style', default: '#1C1C22' },
    { type: 'color',  key: 'ink',    label: 'Text',       group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',   label: 'Folder size', group: 'Style', default: 160, min: 50, max: 340, step: 4, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',     group: 'Style', default: 16, min: 0, max: 50, step: 2, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the background', group: 'Style', default: true },
    { type: 'boolean', key: 'showCursor', label: 'Show the cursor', group: 'Style', default: true },

    { type: 'number', key: 'popAt',  label: 'Sheets pop at', group: 'Motion', default: 0, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'winAt',  label: 'Window at',     group: 'Motion', default: 0, min: 0, max: 6000, step: 20, unit: 'ms' },
    { type: 'number', key: 'tileGap', label: 'Tile stagger', group: 'Motion', default: 150, min: 0, max: 600, step: 10, unit: 'ms' },
  ],

  // Desktop language: the paper flick as the sheets burst out, air as the window rises, a dry
  // snap when it lands — timed off the same popAt/winAt that drive the motion.
  sfx: (p) => [
    { atMs: p.popAt + 120, id: 'paper', gain: 0.5 },
    { atMs: p.winAt + 30, id: 'whoosh', gain: 0.4 },
    { atMs: p.winAt + 360, id: 'snap', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const srcs = [p.p1, p.p2, p.p3, p.p4, '', ''].slice(0, p.count);

    const popAtMs = (ms: number) => spring({
      frame: fr(ms - p.popAt), fps: FPS,
      config: { damping: 16, mass: 0.7, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    const pop = popAtMs(timeMs);
    const winAtMs = (ms: number) => spring({
      frame: fr(ms - p.winAt), fps: FPS,
      config: { damping: 22, mass: 0.85, stiffness: 145 },
      durationInFrames: Math.max(1, Math.round(fr(340))),
    });
    const win = winAtMs(timeMs);
    // DEPTH: the window arrives as a plane — top-hinged swing through house perspective, rise
    // velocity smearing it until the landing — then rests nearly still (0.9°: a screen mimic).
    // The grid parallaxes subtly against the chrome, and each flying sheet carries its own smear.
    const winPose = depthPose(timeMs, seed, { enter: win, rx: -12, z: -130, swayDeg: 0.9, periodMs: 4800 });
    const winSmear = smear(0, vel((ms: number) => (1 - winAtMs(ms)) * height * 0.06, timeMs));
    const parGrid = parallax(timeMs, seed, 0.22, width * 0.007, 4800);
    const vPop = vel(popAtMs, timeMs);
    const reach = spring({
      frame: fr(timeMs - p.popAt + 500), fps: FPS,
      config: { damping: 28, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });

    const F = p.size;
    const cx = width / 2;
    const fy = height * 0.42;
    const winW = width * 0.95;
    const winH = height * 0.66;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          fontFamily: ff,
          ...el('scene'),
        }}
      >
        <div style={{ position: 'absolute', left: cx, top: fy, width: 0, height: 0, ...el('folder') }}>
          {Array.from({ length: SHEETS }).map((_, i) => {
            const a = (-0.55 + (i / (SHEETS - 1)) * 1.1) - Math.PI / 2;
            const reachF = 0.55 + random(`${seed}d${i}`) * 0.4;
            const dist = F * reachF * pop;
            const rot = (random(`${seed}r${i}`) - 0.5) * 2 * 26;
            // Each sheet smears along its own flight direction and tumbles in off its own hinge —
            // paper tossed out of the folder, not divs sliding. Blur dies as the burst settles.
            const shSmear = smear(Math.cos(a) * vPop * F * reachF, Math.sin(a) * vPop * F * reachF);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: Math.cos(a) * dist, top: Math.sin(a) * dist,
                  width: F * 0.52, height: F * 0.62,
                  marginLeft: -F * 0.26, marginTop: -F * 0.31,
                  background: '#F4F1E8', borderRadius: F * 0.03,
                  boxShadow: `0 ${F * 0.03}px ${F * 0.08}px ${rgba('#000000', 0.28)}, 0 ${F * 0.1}px ${F * 0.24}px ${rgba('#000000', 0.3)}`,
                  opacity: clamp01(pop * 3) * (1 - clamp01(win * 1.4)),
                  filter: shSmear.blurPx > 0.3 ? `blur(${shSmear.blurPx.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(pop, { rx: -12 - i * 4, z: -60 })} rotate(${(rot * pop).toFixed(2)}deg) scale(${shSmear.sx.toFixed(4)}, ${shSmear.sy.toFixed(4)})`,
                }}
              />
            );
          })}

          <div
            style={{
              position: 'absolute', left: -F / 2, top: -F * 0.36,
              width: F, height: F * 0.72,
              background: `linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(0,0,0,0.14) 100%), ${p.folder}`,
              borderRadius: F * 0.08,
              boxShadow: `0 ${F * 0.05}px ${F * 0.12}px ${rgba('#000000', 0.35)}, 0 ${F * 0.16}px ${F * 0.36}px ${rgba('#000000', 0.3)}, inset 0 1px 0 rgba(255,255,255,0.35)`,
            }}
          >
            <div style={{ position: 'absolute', left: 0, top: -F * 0.1, width: F * 0.42, height: F * 0.14, background: p.folder, borderRadius: `${F * 0.05}px ${F * 0.05}px 0 0` }} />
          </div>
          <div
            style={{
              position: 'absolute', left: -F, top: F * 0.42, width: F * 2,
              textAlign: 'center', fontSize: F * 0.13, color: p.ink,
            }}
          >
            {p.label}
          </div>
        </div>

        <div
          style={{
            position: 'absolute', left: (width - winW) / 2, top: (height - winH) / 2,
            width: winW, height: winH,
            background: `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.3) 100%), ${p.window}`,
            border: '1px solid rgba(255,255,255,0.13)',
            borderRadius: p.radius,
            boxShadow: `0 ${width * 0.025}px ${width * 0.07}px ${rgba('#000000', 0.45)}, 0 ${width * 0.07}px ${width * 0.16}px ${rgba('#000000', 0.4)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
            padding: width * 0.03, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: width * 0.026,
            opacity: clamp01(win * 3),
            filter: winSmear.blurPx > 0.3 ? `blur(${winSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${winPose} translateY(${((1 - win) * height * 0.06).toFixed(2)}px) scale(${(interpolate(win, [0, 1], [0.94, 1]) * winSmear.sx).toFixed(4)}, ${(interpolate(win, [0, 1], [0.94, 1]) * winSmear.sy).toFixed(4)})`,
            transformOrigin: 'top center',
            ...el('window'),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: width * 0.014, paddingBottom: width * 0.012 }}>
            {LIGHTS.map((c) => (
              <span key={c} style={{ width: width * 0.022, height: width * 0.022, borderRadius: '50%', background: c }} />
            ))}
            <span style={{ marginLeft: width * 0.04, fontSize: width * 0.036, fontWeight: 600, letterSpacing: '0.02em', color: rgba('#F4F1E8', 0.92) }}>{p.label}</span>
          </div>

          <div
            style={{
              flex: 1, display: 'grid',
              gridTemplateColumns: `repeat(${Math.round(p.cols)}, 1fr)`,
              gap: width * 0.03,
              transform: `translate(${parGrid.x.toFixed(2)}px, ${parGrid.y.toFixed(2)}px)`,
            }}
          >
            {srcs.map((src, i) => {
              const s = spring({
                frame: fr(timeMs - p.winAt - 30 - i * p.tileGap), fps: FPS,
                config: { damping: 22, mass: 0.6, stiffness: 190 },
                durationInFrames: Math.max(1, Math.round(fr(300))),
              });
              return (
                <div
                  key={i}
                  style={{
                    background: p.tile, borderRadius: p.radius * 0.5, overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.08)', boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: width * 0.09, color: rgba(p.ink, 0.35),
                    opacity: clamp01(s * 2),
                    // Z-STAGGER: tiles hinge in alternately from left and right, so the grid
                    // assembles as objects arriving in space rather than thumbnails fading up.
                    transform: `${swingIn(s, { rx: -8, ry: i % 2 === 0 ? -14 : 14, z: -50 })} scale(${interpolate(s, [0, 1], [0.86, 1]).toFixed(4)})`,
                    ...el(`tile${i + 1}`),
                  }}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : '🖼'}
                </div>
              );
            })}
          </div>
        </div>

        {p.showCursor && (
          <div
            style={{
              position: 'absolute', left: cx + F * 0.1, top: fy + F * 0.1,
              width: 0, height: 0,
              borderLeft: `${F * 0.16}px solid ${p.ink}`,
              borderBottom: `${F * 0.24}px solid transparent`,
              borderRight: `${F * 0.07}px solid transparent`,
              opacity: clamp01(reach * 1.6),
              transform: `translate(${((1 - reach) * width * 0.18).toFixed(2)}px, ${((1 - reach) * height * 0.08).toFixed(2)}px)`,
              filter: `drop-shadow(0 ${width * 0.003}px ${width * 0.006}px ${rgba('#000000', 0.35)})`,
              ...el('cursor'),
            }}
          />
        )}
      </div>
    );
  },
});
