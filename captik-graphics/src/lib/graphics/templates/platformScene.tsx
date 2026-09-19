// Reference: social/mario-game.mp4  (window 1440-9000ms, loops; sprite crosses ~every 3s)
// A retro platformer playing on a TV in a room, with props on the floor and a sprite walking past.
//
// The sprite's hop is derived from its own x position, not from a separate clock — that way it
// always lands the same number of hops per crossing however the speed is retuned, which is what
// stops the walk from looking like it is sliding.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, swingIn } from '../juice';

const BRICKS = 14;
const PROPS = 4;

export const platformScene = defineGraphicsTemplate({
  id: 'platform_scene',
  name: 'Platform Scene',
  category: 'fx',
  tags: ['Retro', 'Game', 'Loop'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 7600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'room',   label: 'Room', hideable: false },
    { key: 'tv',     label: 'TV' },
    { key: 'level',  label: 'Level' },
    { key: 'props',  label: 'Floor props' },
    { key: 'sprite', label: 'Sprite' },
  ],

  params: [
    { type: 'number', key: 'blocks', label: 'Question blocks', group: 'Content', default: 2, min: 0, max: 5, step: 1 },
    { type: 'number', key: 'props',  label: 'Floor props', group: 'Content', default: 4, min: 0, max: PROPS, step: 1 },

    { type: 'color',  key: 'wall',   label: 'Wall',   group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'floor',  label: 'Floor',  group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'sky',    label: 'Level sky', group: 'Style', default: '#79d0ee' },
    { type: 'color',  key: 'ground', label: 'Level ground', group: 'Style', default: '#a35a25' },
    { type: 'color',  key: 'brick',  label: 'Bricks', group: 'Style', default: '#c8752e' },
    { type: 'color',  key: 'block',  label: 'Question block', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'bezel',  label: 'TV bezel', group: 'Style', default: '#16181F' },
    { type: 'color',  key: 'sprite', label: 'Sprite',  group: 'Style', default: '#e5484d' },
    { type: 'boolean', key: 'fill',  label: 'Paint the room', group: 'Style', default: true },

    { type: 'number', key: 'tvAt',   label: 'TV at', group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'crossMs', label: 'Sprite crossing', group: 'Motion', default: 3000, min: 400, max: 12000, step: 100, unit: 'ms' },
    { type: 'number', key: 'hops',   label: 'Hops per crossing', group: 'Motion', default: 6, min: 0, max: 20, step: 1 },
    { type: 'number', key: 'hop',    label: 'Hop height', group: 'Motion', default: 26, min: 0, max: 120, step: 2, unit: 'px' },
  ],

  // Gamified cues: the TV pops on, then a bright game-start ping as the level shows — both
  // timed off the same param that times the TV's entrance.
  sfx: (p) => [
    { atMs: p.tvAt + 120, id: 'pop', gain: 0.5 },
    { atMs: p.tvAt + 520, id: 'coin', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const tvIn = spring({
      frame: fr(timeMs - p.tvAt), fps: FPS,
      config: { damping: 24, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });

    // The ROOM is a scene card in 3D: a quiet swing-in, then a small resting sway so the held
    // scene never flattens into a web page. The sprite inside the TV stays sharp — pixel-art
    // motion is meant to be crisp, so the depth lives on the furniture, not the game.
    // scale(1.015) covers the sway's perspective excursion at the card edge.
    const roomIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.9, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const roomPose = depthPose(timeMs, seed, { enter: roomIn, rx: -8, z: -60, swayDeg: 1.1, periodMs: 4200 });
    const parProps = parallax(timeMs, seed, 0.6, width * 0.01, 4200);

    const tvW = width * 0.88;
    const tvX = (width - tvW) / 2;
    const tvY = height * 0.2;
    const tvH = tvW * 0.62;
    const screenPad = width * 0.022;
    const groundY = tvH * 0.7;

    // Modulo crossing — deterministic on any scrub, and it loops seamlessly.
    const u = ((timeMs % p.crossMs) / p.crossMs);
    // Hop derived from POSITION, so retuning the speed never changes the number of hops.
    const hopY = p.hops > 0 ? Math.abs(Math.sin(u * p.hops * Math.PI)) * p.hop : 0;

    const floorY = height * 0.62;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.wall : 'transparent',
          transform: `${roomPose} scale(1.015)`,
          transformOrigin: '50% 45%',
          ...el('room'),
        }}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, top: floorY, bottom: 0, background: p.floor }} />

        <div
          style={{
            position: 'absolute', left: tvX, top: tvY, width: tvW, height: tvH,
            background: p.bezel, borderRadius: width * 0.02,
            padding: screenPad, boxSizing: 'border-box',
            boxShadow: `0 ${width * 0.02}px ${width * 0.05}px ${rgba('#000000', 0.45)}`,
            opacity: clamp01(tvIn * 1.8),
            // The TV arrives through 3D space — a top-hinged swing on its existing spring —
            // instead of a flat fade-and-scale. It rests glued to the room, which sways for it.
            transform: `${swingIn(tvIn, { rx: -16, z: -120 })} scale(${interpolate(tvIn, [0, 1], [0.95, 1]).toFixed(4)})`,
            transformOrigin: '50% 20%',
            ...el('tv'),
          }}
        >
          <div
            style={{
              position: 'relative', width: '100%', height: '100%',
              background: p.sky, borderRadius: width * 0.01, overflow: 'hidden',
              ...el('level'),
            }}
          >
            {/* clouds — static, the reference's parallax is far slower than this window */}
            {[0.16, 0.46].map((cu, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute', left: `${cu * 100}%`, top: `${16 + i * 4}%`,
                  width: tvW * 0.1, height: tvW * 0.032, borderRadius: 999,
                  background: rgba('#ffffff', 0.9),
                }}
              />
            ))}

            {Array.from({ length: Math.round(p.blocks) }).map((_, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: `${26 + i * 22}%`, top: `${groundY / tvH * 100 - 26}%`,
                  width: tvW * 0.055, height: tvW * 0.055,
                  background: p.block, borderRadius: 3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: tvW * 0.04, fontWeight: 800, color: '#7A5B21', lineHeight: 1,
                }}
              >
                ?
              </span>
            ))}

            <div style={{ position: 'absolute', left: 0, right: 0, top: groundY, bottom: 0, background: p.ground }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: tvW * 0.05, display: 'flex' }}>
                {Array.from({ length: BRICKS }).map((_, i) => (
                  <span key={i} style={{ flex: 1, background: p.brick, borderRight: `2px solid ${rgba('#000000', 0.18)}` }} />
                ))}
              </div>
            </div>

            <span
              style={{
                position: 'absolute',
                left: `${(u * 116 - 8).toFixed(2)}%`,
                top: groundY - tvW * 0.055 - hopY,
                width: tvW * 0.045, height: tvW * 0.055,
                background: p.sprite, borderRadius: 3,
                ...el('sprite'),
              }}
            />
          </div>
        </div>

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: floorY - height * 0.055,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: width * 0.03,
            // Foreground layer: the props shear against the room's sway — instant depth.
            transform: `translate(${parProps.x.toFixed(2)}px, ${parProps.y.toFixed(2)}px)`,
            ...el('props'),
          }}
        >
          {Array.from({ length: Math.round(p.props) }).map((_, i) => {
            const w = width * (0.07 + random(`${seed}pw${i}`) * 0.06);
            const h = height * (0.045 + random(`${seed}ph${i}`) * 0.04);
            const tints = ['#1A1A20', '#F4F1E8', '#F59E0B', '#D97706'];
            return (
              <span
                key={i}
                style={{
                  width: w, height: h,
                  background: tints[i % tints.length],
                  borderRadius: 4,
                  boxShadow: `0 3px 6px ${rgba('#000000', 0.35)}`,
                }}
              />
            );
          })}
        </div>
      </div>
    );
  },
});
