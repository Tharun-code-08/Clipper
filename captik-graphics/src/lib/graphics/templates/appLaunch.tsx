// Reference: logos/logo-spin.mp4  (window 40-3800ms, lockup set ~1320ms)
// A splash screen: an app tile spins in carrying a dot-grid mark, then the greeting and its
// subtitle. The dots land one at a time from the centre outwards, so the mark assembles inside the
// tile rather than arriving printed on it.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE } from '../luxe';
import { depthPose, parallax, swingIn, vel } from '../juice';

export const appLaunch = defineGraphicsTemplate({
  id: 'app_launch',
  name: 'App Launch',
  category: 'device',
  tags: ['Splash', 'App', 'Logo'],
  design: { w: 900, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 78 },
  fonts: ['inter'],

  elements: [
    { key: 'splash', label: 'Splash', hideable: false },
    { key: 'tile',   label: 'App tile' },
    { key: 'grid',   label: 'Dot grid' },
    { key: 'title',  label: 'Greeting' },
    { key: 'sub',    label: 'Subtitle' },
  ],

  params: [
    { type: 'text',   key: 'title', label: 'Greeting', group: 'Content', default: 'Welcome', maxLength: 28 },
    { type: 'text',   key: 'sub',   label: 'Subtitle', group: 'Content', default: 'Crafted with precision', maxLength: 44 },
    { type: 'image',  key: 'icon',  label: 'App icon', group: 'Content', default: '', help: 'Optional — a dot-grid mark is drawn when empty.' },
    { type: 'number', key: 'grid',  label: 'Grid size', group: 'Content', default: 4, min: 2, max: 6, step: 1 },

    { type: 'color',  key: 'tile',  label: 'Tile',   group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dot',   label: 'Dots',   group: 'Style', default: '#101014' },
    { type: 'color',  key: 'ink',   label: 'Greeting', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Subtitle', group: 'Style', default: '#A29D8F' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Tile size', group: 'Style', default: 340, min: 60, max: 520, step: 4, unit: 'px' },
    { type: 'number', key: 'titleSize', label: 'Greeting size', group: 'Style', default: 104, min: 12, max: 160, step: 2, unit: 'px' },
    { type: 'number', key: 'subSize', label: 'Subtitle size', group: 'Style', default: 40, min: 8, max: 70, step: 1, unit: 'px' },
    { type: 'number', key: 'gap',   label: 'Gap',    group: 'Style', default: 64, min: 0, max: 200, step: 4, unit: 'px' },
    { type: 'number', key: 'glow',  label: 'Tile glow', group: 'Style', default: 56, min: 0, max: 140, step: 4, unit: 'px' },

    { type: 'number', key: 'tileAt', label: 'Tile at',  group: 'Motion', default: 80, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'spin',   label: 'Entry spin', group: 'Motion', default: 180, min: 0, max: 720, step: 10, unit: '°' },
    { type: 'number', key: 'dotAt',  label: 'Dots at',  group: 'Motion', default: 260, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'dotGap', label: 'Dot stagger', group: 'Motion', default: 32, min: 0, max: 200, step: 2, unit: 'ms' },
    { type: 'number', key: 'textAt', label: 'Greeting at', group: 'Motion', default: 950, min: 0, max: 6000, step: 20, unit: 'ms' },
    { type: 'number', key: 'subGap', label: 'Subtitle after', group: 'Motion', default: 240, min: 0, max: 1200, step: 20, unit: 'ms' },
  ],

  // Air pass as the tile spins in, a glossy pop when the dot mark finishes assembling (same
  // centre-out rank math as the motion), a soft chime for the greeting — splash, not slam.
  sfx: (p) => [
    { atMs: p.tileAt, id: 'whoosh', gain: 0.55 },
    { atMs: p.dotAt + Math.round(Math.hypot((p.grid - 1) / 2, (p.grid - 1) / 2) * 2) * p.dotGap + 200, id: 'pop', gain: 0.45 },
    { atMs: p.textAt, id: 'chime', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);
    const n = Math.max(2, Math.round(p.grid));

    const tileAt = (ms: number) => spring({
      frame: fr(ms - p.tileAt), fps: FPS,
      config: { damping: 20, mass: 0.9, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(760))),
    });
    const tile = tileAt(timeMs);
    const title = spring({
      frame: fr(timeMs - p.textAt), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const sub = spring({
      frame: fr(timeMs - p.textAt - p.subGap), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });

    // DEPTH: the tile is a physical object — it swings in through perspective ON TOP of its 2D
    // entry spin and keeps a full resting sway; its spin + zoom velocity at the tile edge drives
    // a motion blur that dies the moment it parks. The greeting and subtitle fold in top-hinged
    // and parallax at different depths against the swaying tile.
    const pose = depthPose(timeMs, seed, { enter: tile, rx: -16, ry: 10, z: -110, swayDeg: 1.8 });
    const vSpinEdge = Math.abs(vel((ms: number) => (1 - tileAt(ms)) * p.spin, timeMs)) * (Math.PI / 180) * p.size * 0.5;
    const vZoomEdge = Math.abs(vel((ms: number) => interpolate(tileAt(ms), [0, 1], [0.3, 1]), timeMs)) * p.size * 0.5;
    const tileBlur = Math.min(8, (vSpinEdge + vZoomEdge) * 1.6);
    const parTitle = parallax(timeMs, seed, 0.3, width * 0.008);
    const parSub = parallax(timeMs, seed, 0.45, width * 0.008);

    const pad = p.size * 0.17;
    const cell = (p.size - pad * 2) / n;
    const mid = (n - 1) / 2;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: p.gap, fontFamily: ff,
          ...el('splash'),
        }}
      >
        <div
          style={{
            width: p.size, height: p.size, borderRadius: p.size * 0.24,
            background: p.tile,
            padding: pad, boxSizing: 'border-box',
            boxShadow: p.glow > 0 ? `0 0 ${p.glow}px ${rgba(LUXE.gold, 0.28)}, 0 ${p.size * 0.05}px ${p.size * 0.14}px ${rgba('#000000', 0.45)}, 0 ${p.size * 0.14}px ${p.size * 0.32}px ${rgba('#000000', 0.32)}` : undefined,
            opacity: clamp01(tile * 2),
            filter: tileBlur > 0.3 ? `blur(${tileBlur.toFixed(2)}px)` : undefined,
            transform:
              `${pose} rotate(${((1 - tile) * p.spin).toFixed(2)}deg) `
              + `scale(${interpolate(tile, [0, 1], [0.3, 1]).toFixed(4)})`,
            ...el('tile'),
          }}
        >
          {p.icon ? (
            // The tile's transform makes it the containing block, so inset 0 spans the full tile
            // (past the padding) — the photo fills it edge-to-edge like real icon artwork.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.icon} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: p.size * 0.24 }} />
          ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%', ...el('grid') }}>
            {Array.from({ length: n * n }).map((_, i) => {
              const r = Math.floor(i / n);
              const c = i % n;
              // Order by distance from the centre, so the mark grows outwards.
              const rank = Math.round(Math.hypot(r - mid, c - mid) * 2);
              const s = spring({
                frame: fr(timeMs - p.dotAt - rank * p.dotGap), fps: FPS,
                config: { damping: 15, mass: 0.5, stiffness: 220 },
                durationInFrames: Math.max(1, Math.round(fr(380))),
              });
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: c * cell + cell * 0.5, top: r * cell + cell * 0.5,
                    width: cell * 0.72, height: cell * 0.72, borderRadius: '50%',
                    background: p.dot,
                    opacity: clamp01(s * 2),
                    transform: `translate(-50%,-50%) scale(${interpolate(s, [0, 1], [0.2, 1]).toFixed(4)})`,
                  }}
                />
              );
            })}
          </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: p.subSize * 0.4 }}>
          <span
            style={{
              fontSize: p.titleSize, fontWeight: 700, color: p.ink, lineHeight: 1.1,
              letterSpacing: -p.titleSize * 0.015,
              opacity: clamp01(title * 1.6),
              transform: `${swingIn(title, { rx: -13, z: -60 })} translate(${parTitle.x.toFixed(2)}px, ${(parTitle.y + (1 - title) * width * 0.02).toFixed(2)}px)`,
              ...el('title'),
            }}
          >
            {p.title}
          </span>
          <span
            style={{
              fontSize: p.subSize, color: p.dim, lineHeight: 1.3,
              fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
              opacity: clamp01(sub * 1.6),
              transform: `${swingIn(sub, { rx: -9, z: -40 })} translate(${parSub.x.toFixed(2)}px, ${(parSub.y + (1 - sub) * width * 0.014).toFixed(2)}px)`,
              ...el('sub'),
            }}
          >
            {p.sub}
          </span>
        </div>
      </div>
    );
  },
});
