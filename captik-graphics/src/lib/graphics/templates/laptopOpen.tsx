// Reference: graphics/laptop-opening-1.mp4  (window 0-3800ms, lid up by ~600ms then holds)
// A laptop lid swinging up off the base, screen content fading in once it is past vertical.
//
// The lid is rotateX about its BOTTOM edge with a perspective on the parent. Both halves are drawn
// in the same stacking context so the hinge line stays welded — animating the lid on its own layer
// makes it detach from the base at steep angles.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, vel } from '../juice';

export const laptopOpen = defineGraphicsTemplate({
  id: 'laptop_open',
  name: 'Laptop Open',
  category: 'device',
  tags: ['Device', 'Laptop', 'Reveal'],
  design: { w: 900, h: 1150 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'laptop', label: 'Laptop', hideable: false },
    { key: 'lid',    label: 'Lid' },
    { key: 'screen', label: 'Screen' },
    { key: 'base',   label: 'Base' },
    { key: 'title',  label: 'Screen title' },
  ],

  params: [
    { type: 'text',  key: 'title', label: 'Screen text', group: 'Content', default: '', maxLength: 40,
      help: 'Optional line on the screen.' },
    { type: 'image', key: 'image', label: 'Screen image', group: 'Content', default: '' },

    { type: 'color',  key: 'body',  label: 'Body',   group: 'Style', default: '#1E1E24' },
    { type: 'color',  key: 'screen', label: 'Screen', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'ink',   label: 'Screen text', group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Text size', group: 'Style', default: 48, min: 8, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 22, min: 0, max: 50, step: 1, unit: 'px' },
    { type: 'number', key: 'bezel', label: 'Bezel',  group: 'Style', default: 14, min: 2, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow', group: 'Style', default: 0.4, min: 0, max: 0.6, step: 0.02 },

    { type: 'number', key: 'openAt', label: 'Opens at',  group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'openMs', label: 'Opens over', group: 'Motion', default: 900, min: 100, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'shut',   label: 'Closed angle', group: 'Motion', default: 88, min: 0, max: 90, step: 1, unit: '°',
      help: '90 is fully shut against the base.' },
    { type: 'number', key: 'screenAt', label: 'Screen wakes at', group: 'Motion', default: 800, min: 0, max: 5000, step: 20, unit: 'ms' },
  ],

  // Physical-object sound: air over the lid as it swings, a soft hinge stop when it reaches
  // open, a quiet chime as the screen wakes — timed off the same open/wake params.
  sfx: (p) => [
    { atMs: p.openAt, id: 'whoosh', gain: 0.4 },
    { atMs: p.openAt + p.openMs, id: 'snap', gain: 0.45 },
    { atMs: p.screenAt, id: 'chime', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);

    const openAt = (ms: number) => spring({
      frame: fr(ms - p.openAt), fps: FPS,
      config: { damping: 24, mass: 0.9, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(p.openMs))),
    });
    const open = openAt(timeMs);
    const wake = spring({
      frame: fr(timeMs - p.screenAt), fps: FPS,
      config: { damping: 26, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });

    // DEPTH: the laptop is a PHYSICAL OBJECT — the whole rig swings up into frame through house
    // perspective and keeps a full resting sway (1.7) so it never freezes into a sticker. The
    // lid's own hinge velocity (top-edge speed of the rotateX) drives a motion blur that dies
    // the moment the hinge stops, and the screen content parallaxes subtly inside the bezel.
    const rigIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.9, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });
    const rigPose = depthPose(timeMs, seed, { enter: rigIn, rx: -14, ry: 8, z: -130, swayDeg: 1.7 });
    const parScreen = parallax(timeMs, seed, 0.25, width * 0.008);

    const bodyW = width * 0.90;
    const lidH = bodyW * 0.62;
    // The base is a full keyboard deck in the reference, not a hinge sliver.
    const baseH = bodyW * 0.44;
    const cx = (width - bodyW) / 2;
    // The hinge sits where the lid's bottom meets the base's top.
    const hingeY = (height - (lidH + baseH)) * 0.62 + lidH;
    const tilt = interpolate(open, [0, 1], [p.shut, 0]);
    const vLid = Math.abs(vel((ms: number) => interpolate(openAt(ms), [0, 1], [p.shut, 0]), timeMs)) * (Math.PI / 180) * lidH;
    const lidBlur = Math.min(8, vLid * 1.8);
    const baseW = bodyW * 1.04;
    const baseX = cx - (baseW - bodyW) / 2;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          perspective: bodyW * 2.4,
          fontFamily: ff,
          opacity: clamp01(rigIn * 2),
          transform: `${rigPose} translateY(${((1 - rigIn) * height * 0.03).toFixed(2)}px)`,
          ...el('laptop'),
        }}
      >
        <div
          style={{
            position: 'absolute', left: cx, top: hingeY - lidH,
            width: bodyW, height: lidH,
            background: `linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(0,0,0,0.18) 100%), ${p.body}`,
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: `${p.radius}px ${p.radius}px ${p.radius * 0.3}px ${p.radius * 0.3}px`,
            padding: p.bezel, boxSizing: 'border-box',
            transformOrigin: '50% 100%',
            transform: `rotateX(${tilt.toFixed(2)}deg)`,
            filter: lidBlur > 0.3 ? `blur(${lidBlur.toFixed(2)}px)` : undefined,
            boxShadow: p.shadow > 0 ? `0 ${bodyW * 0.015}px ${bodyW * 0.06}px ${rgba('#000000', p.shadow * 0.6)}, 0 ${bodyW * 0.05}px ${bodyW * 0.22}px ${rgba('#000000', p.shadow * 0.85)}, inset 0 1px 0 rgba(255,255,255,0.1)` : undefined,
            ...el('lid'),
          }}
        >
          <div
            style={{
              width: '100%', height: '100%',
              background: `radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.06) 0%, transparent 60%), ${p.screen}`,
              borderRadius: Math.max(0, p.radius - p.bezel * 0.5),
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...el('screen'),
            }}
          >
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: clamp01(wake), transform: `translate(${parScreen.x.toFixed(2)}px, ${parScreen.y.toFixed(2)}px) scale(1.05)` }} />
            ) : (
              <span
                style={{
                  fontSize: p.size, color: p.ink, fontWeight: 600, letterSpacing: '0.04em',
                  textShadow: `0 0 ${p.size * 0.6}px ${rgba(p.ink, 0.25)}`,
                  opacity: clamp01(wake * 1.5),
                  transform: `translate(${parScreen.x.toFixed(2)}px, ${parScreen.y.toFixed(2)}px)`,
                  ...el('title'),
                }}
              >
                {p.title}
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            position: 'absolute', left: baseX, top: hingeY,
            width: baseW, height: baseH,
            background: `linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.22) 100%), ${p.body}`,
            border: '1px solid rgba(255,255,255,0.1)',
            boxSizing: 'border-box',
            borderRadius: `${p.radius * 0.2}px ${p.radius * 0.2}px ${p.radius * 0.9}px ${p.radius * 0.9}px`,
            boxShadow: p.shadow > 0 ? `0 ${bodyW * 0.02}px ${bodyW * 0.08}px ${rgba('#000000', p.shadow * 0.7)}, 0 ${bodyW * 0.06}px ${bodyW * 0.28}px ${rgba('#000000', p.shadow)}, inset 0 1px 0 rgba(255,255,255,0.09)` : undefined,
            ...el('base'),
          }}
        >
          {/* Keyboard well — the deck reads as a panel, which is what the reference shows. */}
          <div
            style={{
              position: 'absolute', left: baseW * 0.09, top: baseH * 0.24,
              width: baseW * 0.82, height: baseH * 0.50,
              background: p.screen, borderRadius: p.radius * 0.35,
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.55), inset 0 -1px 0 rgba(255,255,255,0.05)',
            }}
          />
          <div
            style={{
              position: 'absolute', left: '50%', top: baseH * 0.80,
              width: baseW * 0.34, height: baseH * 0.12, borderRadius: p.radius * 0.2,
              background: rgba('#ffffff', 0.05), border: '1px solid rgba(255,255,255,0.09)',
              boxSizing: 'border-box', transform: 'translateX(-50%)',
            }}
          />
        </div>
      </div>
    );
  },
});
