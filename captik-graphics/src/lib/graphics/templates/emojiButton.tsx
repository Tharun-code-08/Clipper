// Reference: ui-elements/animated-emoji-button.mp4  (window 520-4280ms, entrance ~1800ms)
// A pill button with an emoji that keeps waving after the button has settled. Three independent
// motions: the pill springs up, the label fades in behind it, and the emoji runs a continuous
// wave that is a pure function of timeMs — a CSS keyframe here would freeze on export.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, inkOn, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

export const emojiButton = defineGraphicsTemplate({
  id: 'emoji_button',
  name: 'Emoji Button',
  category: 'cta',
  tags: ['Button', 'Emoji', 'Pill'],
  design: { w: 620, h: 250 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 46, yPercent: 50, widthPercent: 62 },
  fonts: ['inter'],

  elements: [
    { key: 'pill',  label: 'Button', hideable: false },
    { key: 'emoji', label: 'Emoji' },
    { key: 'label', label: 'Label' },
  ],

  params: [
    { type: 'text', key: 'emoji', label: 'Emoji', group: 'Content', default: '👋', maxLength: 4 },
    { type: 'text', key: 'label', label: 'Label', group: 'Content', default: 'Hey', maxLength: 24 },

    { type: 'color',  key: 'fill',   label: 'Button', group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',   label: 'Text size', group: 'Style', default: 100, min: 20, max: 140, step: 2, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow', group: 'Style', default: 0.22, min: 0, max: 0.5, step: 0.01 },

    { type: 'number',  key: 'popMs', label: 'Pop-in',    group: 'Motion', default: 520, min: 150, max: 1400, step: 20, unit: 'ms' },
    { type: 'boolean', key: 'wave',  label: 'Wave the emoji', group: 'Motion', default: true },
    { type: 'number',  key: 'waveDeg', label: 'Wave angle', group: 'Motion', default: 18, min: 4, max: 45, step: 1, unit: '°', showIf: { key: 'wave', equals: true } },
    { type: 'number',  key: 'wavePeriod', label: 'Wave period', group: 'Motion', default: 900, min: 300, max: 2500, step: 50, unit: 'ms', showIf: { key: 'wave', equals: true } },
  ],

  // A light swish as the pill leaves the floor, a glossy pop as it lands — both keyed to the
  // same popMs that drives the entrance spring, so a slower pop-in delays the landing cue too.
  sfx: (p) => [
    { atMs: 60, id: 'swish', gain: 0.5 },
    { atMs: Math.round(p.popMs * 0.75), id: 'pop', gain: 0.7 },
  ],

  render: ({ params: p, el, timeMs, height, seed }) => {
    const popAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 16, mass: 0.7, stiffness: 155 },
      durationInFrames: Math.max(1, Math.round(fr(p.popMs))),
    });
    const pop = popAt(timeMs);
    const labelIn = spring({
      frame: fr(timeMs - p.popMs * 0.3), fps: FPS,
      config: { damping: 26, mass: 0.5, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(320))),
    });

    // Continuous wave, damped in after the pill lands. Derived from timeMs so it is identical on
    // every surface and at any export fps.
    const settled = interpolate(timeMs, [p.popMs * 0.6, p.popMs * 1.1], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const waveDeg = p.wave
      ? Math.sin((timeMs / p.wavePeriod) * Math.PI * 2) * p.waveDeg * settled
      : 0;

    const ink = p.ink || inkOn(p.fill);
    const ff = fontStack(p.font);

    // DEPTH + BLUR: the pill swings in top-hinged on the same pop spring and keeps a gentle
    // ±1.5° sway after (the wave alone left the pill itself dead); its rise velocity in px/ms
    // smears it in flight and the blur dies the frame it lands.
    const yAt = (ms: number) => (1 - popAt(ms)) * height * 0.42;
    const pillSmear = smear(0, vel(yAt, timeMs), 1.1);
    const pose = depthPose(timeMs, seed, { enter: pop, rx: -16, z: -85, swayDeg: 1.5 });

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: Math.round(height * 0.1),
          // Glass pill: top-light over the fill, hairline border, inner top edge — the emoji is
          // the one saturated element and pops against the near-black.
          background: `linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 55%), ${p.fill}`,
          border: '1px solid rgba(255,255,255,0.13)',
          borderRadius: height / 2,
          fontFamily: ff,
          opacity: interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
          filter: pillSmear.blurPx > 0.3 ? `blur(${pillSmear.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} translateY(${yAt(timeMs).toFixed(3)}px) scale(${(interpolate(pop, [0, 1], [0.82, 1]) * pillSmear.sx).toFixed(4)}, ${(interpolate(pop, [0, 1], [0.82, 1]) * pillSmear.sy).toFixed(4)})`,
          transformOrigin: 'center center',
          boxShadow:
            `inset 0 1px 0 rgba(255,255,255,0.06)`
            + (p.shadow > 0
              ? `, 0 ${Math.round(height * 0.05)}px ${Math.round(height * 0.13)}px ${rgba('#000000', p.shadow)}, `
                + `0 ${Math.round(height * 0.16)}px ${Math.round(height * 0.38)}px ${rgba('#000000', Math.min(1, p.shadow * 1.2))}`
              : ''),
          ...el('pill'),
        }}
      >
        <span
          style={{
            fontSize: p.size * 1.02, lineHeight: 1,
            transform: `rotate(${waveDeg.toFixed(2)}deg)`,
            transformOrigin: '70% 80%',
            ...el('emoji'),
          }}
        >
          {p.emoji}
        </span>
        <span
          style={{
            fontSize: p.size, fontWeight: 700, color: ink, lineHeight: 1, whiteSpace: 'nowrap',
            opacity: interpolate(labelIn, [0, 0.7], [0, 1], { extrapolateRight: 'clamp' }),
            ...el('label'),
          }}
        >
          {p.label}
        </span>
      </div>
    );
  },
});
