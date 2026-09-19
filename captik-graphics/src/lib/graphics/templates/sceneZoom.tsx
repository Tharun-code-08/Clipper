// Reference: launch-videos/car-crash-story.mp4  (window 0-6000ms, frame fills by ~3200ms)
// A city scene that starts as a small window in the middle of the frame and pushes out to
// full-bleed, with a caption arriving once it has opened.
//
// The skyline is GENERATED from `random(seed)` — a seeded run of buildings with windows — rather
// than being one drawn picture. That is what makes it a template: the user gets a different city
// per placed instance, and it still renders identically every time that instance is drawn.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { luxeGrain, luxeVignette } from '../luxe';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear } from '../juice';

const MAX_BUILDINGS = 16;

export const sceneZoom = defineGraphicsTemplate({
  id: 'scene_zoom',
  name: 'Scene Zoom',
  category: 'fx',
  tags: ['Scene', 'City', 'Cinematic'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat'],

  elements: [
    { key: 'frame',  label: 'Frame', hideable: false },
    { key: 'sky',    label: 'Sky' },
    { key: 'city',   label: 'Skyline' },
    { key: 'road',   label: 'Road' },
    { key: 'caption', label: 'Caption' },
  ],

  params: [
    { type: 'text', key: 'caption', label: 'Caption', group: 'Content', default: 'A MOMENT IN TIME', maxLength: 40 },
    { type: 'number', key: 'buildings', label: 'Buildings', group: 'Content', default: 12, min: 3, max: 16, step: 1 },

    { type: 'color',  key: 'skyTop', label: 'Sky top',    group: 'Style', default: '#10131D' },
    { type: 'color',  key: 'skyLow', label: 'Sky horizon', group: 'Style', default: '#B98A3C' },
    { type: 'color',  key: 'city',   label: 'Buildings',  group: 'Style', default: '#0B0D14' },
    { type: 'color',  key: 'lit',    label: 'Windows',    group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'road',   label: 'Road',       group: 'Style', default: '#151923' },
    { type: 'color',  key: 'ink',    label: 'Caption',    group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Caption size', group: 'Style', default: 30, min: 8, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'track',  label: 'Caption tracking', group: 'Style', default: 7, min: 0, max: 30, step: 1, unit: 'px' },
    { type: 'number', key: 'horizon', label: 'Horizon',   group: 'Style', default: 62, min: 20, max: 90, step: 1, unit: '%' },

    { type: 'number', key: 'startPct', label: 'Opens from', group: 'Motion', default: 18, min: 4, max: 100, step: 2, unit: '%',
      help: 'How large the window starts, as a share of the frame.' },
    { type: 'number', key: 'openMs',   label: 'Opens over', group: 'Motion', default: 2600, min: 200, max: 8000, step: 100, unit: 'ms' },
    { type: 'number', key: 'capAt',    label: 'Caption at', group: 'Motion', default: 3200, min: 0, max: 9000, step: 50, unit: 'ms' },
    { type: 'number', key: 'drift',    label: 'Car drift',  group: 'Motion', default: 220, min: 0, max: 900, step: 10, unit: 'px/s' },
  ],

  // DOCU cues at low gain: a long airy crescendo under the open, a luxe ping as the caption
  // lands — timed off the same param that times the caption.
  sfx: (p) => [
    { atMs: 0, id: 'sweep', gain: 0.5 },
    { atMs: p.capAt, id: 'glass', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);

    const open = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 30, mass: 1, stiffness: 90 },
      durationInFrames: Math.max(1, Math.round(fr(p.openMs))),
    });
    const cap = spring({
      frame: fr(timeMs - p.capAt), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });

    const scale = interpolate(open, [0, 1], [p.startPct / 100, 1]);
    const horizonY = (p.horizon / 100) * height;
    const n = Math.min(MAX_BUILDINGS, Math.round(p.buildings));
    const bw = width / n;
    const carX = ((timeMs / 1000) * p.drift) % (width + 200) - 100;

    // While it is a small WINDOW it is a card in 3D — tilted in, swaying gently. Both the tilt
    // and the sway are scaled by (1 - open): as the window swallows the frame it BECOMES the
    // camera, and a camera must be still. No compensation scale needed — at full-bleed the
    // pose is exactly identity.
    const pose = depthPose(timeMs, seed, { enter: open, rx: -10, z: -80, swayDeg: 2.2 * (1 - open) });

    // The car crosses at constant speed and never rests — it carries a constant, honest smear.
    const carSm = smear(p.drift / 1000, 0, 1);

    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'relative',
            width: '100%', height: '100%',
            overflow: 'hidden',
            borderRadius: interpolate(open, [0, 1], [width * 0.02, 0]),
            transform: `${pose} scale(${scale.toFixed(4)})`,
            boxShadow: open < 0.98
              ? `0 ${width * 0.015}px ${width * 0.04}px ${rgba('#000000', 0.38)}, 0 ${width * 0.05}px ${width * 0.12}px ${rgba('#000000', 0.42)}`
              : undefined,
            ...el('frame'),
          }}
        >
          <div
            style={{
              position: 'absolute', inset: 0,
              background: `linear-gradient(180deg, ${p.skyTop} 0%, ${p.skyTop} ${(p.horizon * 0.5).toFixed(0)}%, ${p.skyLow} ${p.horizon}%)`,
              ...el('sky'),
            }}
          />

          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, ...el('city') }}>
            {Array.from({ length: n }).map((_, i) => {
              const h = (0.18 + random(`${seed}bh${i}`) * 0.42) * height;
              const w = bw * (0.7 + random(`${seed}bw${i}`) * 0.28);
              const x = i * bw + (bw - w) / 2;
              const rows = Math.max(2, Math.floor(h / (height * 0.045)));
              const cols = Math.max(2, Math.floor(w / (width * 0.035)));
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: x, top: horizonY - h, width: w, height: h,
                    background: p.city,
                  }}
                >
                  {Array.from({ length: rows * cols }).map((__, k) => {
                    const on = random(`${seed}w${i}_${k}`) > 0.55;
                    if (!on) return null;
                    const r = Math.floor(k / cols);
                    const c = k % cols;
                    return (
                      <div
                        key={k}
                        style={{
                          position: 'absolute',
                          left: `${((c + 0.5) / cols) * 100}%`, top: `${((r + 0.6) / rows) * 100}%`,
                          width: w / cols * 0.34, height: h / rows * 0.3,
                          background: rgba(p.lit, 0.8),
                          transform: 'translate(-50%,-50%)',
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div
            style={{
              position: 'absolute', left: 0, right: 0, top: horizonY, bottom: 0,
              background: p.road,
              ...el('road'),
            }}
          >
            <div style={{ position: 'absolute', left: 0, right: 0, top: '22%', height: 3, background: rgba('#F4F1E8', 0.22) }} />
            <div
              style={{
                position: 'absolute', left: carX, top: '8%',
                width: width * 0.11, height: height * 0.022, borderRadius: height * 0.006,
                background: '#1C2534',
                filter: carSm.blurPx > 0.3 ? `blur(${(carSm.blurPx * 0.7).toFixed(2)}px)` : undefined,
                transform: `scaleX(${carSm.sx.toFixed(3)})`,
              }}
            />
          </div>

          <div
            style={{
              position: 'absolute', left: 0, right: 0, bottom: '9%',
              textAlign: 'center',
              fontFamily: ff, fontSize: p.size, color: p.ink,
              letterSpacing: p.track, fontWeight: 600, textTransform: 'uppercase',
              textShadow: `0 2px 14px ${rgba('#000000', 0.4)}`,
              opacity: clamp01(cap * 1.6),
              transform: `translateY(${((1 - cap) * height * 0.012).toFixed(2)}px)`,
              ...el('caption'),
            }}
          >
            {p.caption}
          </div>

          <div style={luxeVignette(0.45)} />
          <div style={luxeGrain(0.05)} />
        </div>
      </div>
    );
  },
});
