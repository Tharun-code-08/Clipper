// Reference: graphics/car-racing.mp4  (window 520-4280ms, moving from ~1320ms)
// A car holding frame centre on a night road while the world moves past it — dashed centre line,
// roadside markers and speed streaks all scrolling right to left.
//
// Everything that scrolls uses `(t * speed) % pitch` so the loop is seamless at any duration and
// scrubbing lands on the same frame. The car itself only bobs; moving the car instead of the world
// is what makes these read as a slideshow.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { luxeGrain, luxeVignette } from '../luxe';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear } from '../juice';

const DASHES = 14;
const STREAKS = 10;

export const nightDrive = defineGraphicsTemplate({
  id: 'night_drive',
  name: 'Night Drive',
  category: 'fx',
  tags: ['Road', 'Night', 'Loop'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'scene',  label: 'Scene', hideable: false },
    { key: 'moon',   label: 'Moon' },
    { key: 'road',   label: 'Road' },
    { key: 'car',    label: 'Car' },
    { key: 'streaks', label: 'Speed streaks' },
  ],

  params: [
    { type: 'color',  key: 'sky',   label: 'Sky top',    group: 'Style', default: '#131826' },
    { type: 'color',  key: 'skyLow', label: 'Sky horizon', group: 'Style', default: '#0C0F17' },
    { type: 'color',  key: 'ground', label: 'Ground',    group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'road',  label: 'Road marks', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'car',   label: 'Car',        group: 'Style', default: '#2A3342' },
    { type: 'color',  key: 'moon',  label: 'Moon',       group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'horizon', label: 'Horizon',  group: 'Style', default: 56, min: 20, max: 85, step: 1, unit: '%' },
    { type: 'number', key: 'carSize', label: 'Car size', group: 'Style', default: 270, min: 60, max: 460, step: 10, unit: 'px' },
    { type: 'number', key: 'moonSize', label: 'Moon size', group: 'Style', default: 116, min: 20, max: 260, step: 4, unit: 'px' },
    { type: 'boolean', key: 'showMoon', label: 'Moon',   group: 'Style', default: true },

    { type: 'number', key: 'speed',  label: 'Scroll speed', group: 'Motion', default: 520, min: 40, max: 2000, step: 20, unit: 'px/s' },
    { type: 'number', key: 'bob',    label: 'Car bob',   group: 'Motion', default: 6, min: 0, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'streakOn', label: 'Speed streaks', group: 'Motion', default: 0.7, min: 0, max: 1, step: 0.05 },
  ],

  // One low cinematic air pass as the scene card swings in — the drive itself is ambience.
  sfx: () => [
    { atMs: 80, id: 'whoosh', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const t = timeMs / 1000;
    const horizonY = (p.horizon / 100) * height;
    const roadY = horizonY + (height - horizonY) * 0.12;

    const enter = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });

    const dashPitch = width / (DASHES / 2);
    const scroll = (t * p.speed) % dashPitch;
    const C = p.carSize;
    const bob = Math.sin(t * 7) * p.bob;

    // The scene CARD lives in 3D: a gentle top-hinged swing-in on the existing entrance spring,
    // then a small resting sway so it never flattens back into a web page. scale(1.015) covers
    // the sway's perspective excursion so footage never peeks past the card edge at rest.
    const pose = depthPose(timeMs, seed, { enter, rx: -10, z: -70, swayDeg: 1.2 });
    const parMoon = parallax(timeMs, seed, 0.35, height * 0.008);

    // The WORLD moves, the car doesn't — so the motion blur belongs to the world. The scroll is
    // a constant-speed loop that genuinely never rests, so its smear is constant and honest;
    // the car is the tracked subject and stays crisp, exactly like a panned camera would render.
    const vx = p.speed / 1000; // px/ms
    const dashSm = smear(vx, 0, 0.9);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: `linear-gradient(180deg, ${p.sky} 0%, ${p.skyLow} ${p.horizon}%, ${p.ground} ${p.horizon + 1}%)`,
          opacity: clamp01(enter),
          transform: `${pose} scale(1.015)`,
          transformOrigin: '50% 45%',
          ...el('scene'),
        }}
      >
        {p.showMoon && (
          <div
            style={{
              position: 'absolute', right: '18%', top: '16%',
              width: p.moonSize, height: p.moonSize, borderRadius: '50%',
              background: p.moon,
              boxShadow: `0 0 ${p.moonSize * 0.6}px ${rgba(p.moon, 0.55)}, 0 0 ${p.moonSize * 1.6}px ${rgba(p.moon, 0.32)}, 0 0 ${p.moonSize * 3.2}px ${rgba(p.moon, 0.16)}`,
              // Far layer: the moon shears against the card's sway — instant depth.
              transform: `translate(${parMoon.x.toFixed(2)}px, ${parMoon.y.toFixed(2)}px)`,
              ...el('moon'),
            }}
          />
        )}

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: roadY, height: 4,
            // Constant velocity smear — these dashes never rest, so the blur never dies.
            filter: dashSm.blurPx > 0.3 ? `blur(${(dashSm.blurPx * 0.6).toFixed(2)}px)` : undefined,
            ...el('road'),
          }}
        >
          {Array.from({ length: DASHES }).map((_, i) => (
            <span
              key={i}
              style={{
                position: 'absolute', top: 0,
                // Modulo scroll — seamless at any duration, identical on any scrub.
                left: i * dashPitch - scroll,
                width: dashPitch * 0.42, height: 4,
                background: rgba(p.road, 0.85),
                transform: `scaleX(${dashSm.sx.toFixed(3)})`,
              }}
            />
          ))}
        </div>

        {p.streakOn > 0 && (
          <div
            style={{
              position: 'absolute', inset: 0,
              // Streaks ride 1.2-2x the road speed — a touch more smear than the dashes.
              filter: `blur(${Math.min(2, vx * 1.4).toFixed(2)}px)`,
              ...el('streaks'),
            }}
          >
            {Array.from({ length: STREAKS }).map((_, i) => {
              const lane = random(`${seed}l${i}`);
              const len = width * (0.06 + random(`${seed}w${i}`) * 0.14);
              const pitch = width * 1.4;
              const x = ((t * p.speed * (1.2 + random(`${seed}s${i}`) * 0.8) + random(`${seed}o${i}`) * pitch) % pitch);
              const y = roadY - (height - roadY) * 0.02 - lane * (height * 0.08);
              return (
                <span
                  key={i}
                  style={{
                    position: 'absolute',
                    left: width - x, top: y,
                    width: len, height: 2, borderRadius: 2,
                    background: rgba('#F4F1E8', 0.24 * p.streakOn),
                  }}
                />
              );
            })}
          </div>
        )}

        <div
          style={{
            position: 'absolute', left: '44%', top: roadY,
            width: C, height: C * 0.44,
            marginLeft: -C / 2, marginTop: -C * 0.42,
            transform: `translateY(${bob.toFixed(2)}px) scale(${interpolate(enter, [0, 1], [0.9, 1]).toFixed(4)})`,
            ...el('car'),
          }}
        >
          <div style={{ position: 'absolute', left: 0, bottom: C * 0.06, width: C, height: C * 0.2, borderRadius: C * 0.06, background: p.car }} />
          <div style={{ position: 'absolute', left: C * 0.2, bottom: C * 0.24, width: C * 0.56, height: C * 0.18, borderRadius: `${C * 0.09}px ${C * 0.09}px 0 0`, background: p.car }} />
          <div style={{ position: 'absolute', left: C * 0.26, bottom: C * 0.27, width: C * 0.2, height: C * 0.1, background: rgba('#0b1220', 0.55), borderRadius: 3 }} />
          <div style={{ position: 'absolute', left: C * 0.52, bottom: C * 0.27, width: C * 0.2, height: C * 0.1, background: rgba('#0b1220', 0.55), borderRadius: 3 }} />
          {[0.16, 0.7].map((u) => (
            <span
              key={u}
              style={{
                position: 'absolute', left: C * u, bottom: 0,
                width: C * 0.16, height: C * 0.16, borderRadius: '50%',
                background: '#12161f', border: `${C * 0.03}px solid #2b3242`, boxSizing: 'border-box',
              }}
            />
          ))}
          <span style={{ position: 'absolute', right: -C * 0.02, bottom: C * 0.14, width: C * 0.06, height: C * 0.05, borderRadius: 2, background: '#ffe9a8', boxShadow: `0 0 ${C * 0.18}px ${rgba('#ffe9a8', 0.8)}` }} />
        </div>

        <div style={luxeVignette(0.45)} />
        <div style={luxeGrain(0.05)} />
      </div>
    );
  },
});
