// Reference: social/tech-youtube-1.mp4  (window 520-3280ms, subscribed state by ~2200ms)
// A channel lockup — round play badge, channel name, subscribe button — where a cursor travels in,
// clicks, and the button flips to its subscribed state. The cursor is what makes it read as a
// demonstration rather than a graphic, so it gets its own travel and a press dip on contact.
//
// Distinct from subscribe_button, which is the bare button. This is the whole channel card.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

export const channelCard = defineGraphicsTemplate({
  id: 'channel_card',
  name: 'Channel Card',
  category: 'cta',
  tags: ['YouTube', 'Subscribe', 'Cursor'],
  design: { w: 900, h: 520 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['inter'],

  elements: [
    { key: 'card',   label: 'Card', hideable: false },
    { key: 'badge',  label: 'Play badge' },
    { key: 'name',   label: 'Channel name' },
    { key: 'button', label: 'Button' },
    { key: 'cursor', label: 'Cursor' },
  ],

  params: [
    { type: 'text', key: 'name',  label: 'Channel',   group: 'Content', default: 'YOUR NAME', maxLength: 28 },
    { type: 'image', key: 'avatarImg', label: 'Channel photo', group: 'Content', default: '', help: 'Optional — the play badge is drawn when empty.' },
    { type: 'text', key: 'before', label: 'Before',   group: 'Content', default: 'Subscribe', maxLength: 20 },
    { type: 'text', key: 'after',  label: 'After',    group: 'Content', default: 'Subscribed', maxLength: 20 },

    { type: 'color',  key: 'brand', label: 'Brand',   group: 'Style', default: '#ff0033' },
    { type: 'color',  key: 'done',  label: 'Subscribed', group: 'Style', default: '#0f0f0f' },
    { type: 'color',  key: 'ink',   label: 'Name',    group: 'Style', default: '#0f0f0f' },
    { type: 'font',   key: 'font',  label: 'Font',    group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Name size', group: 'Style', default: 76, min: 12, max: 110, step: 2, unit: 'px' },
    { type: 'number', key: 'badge', label: 'Badge size', group: 'Style', default: 210, min: 30, max: 260, step: 4, unit: 'px' },
    { type: 'boolean', key: 'showCursor', label: 'Show the cursor', group: 'Style', default: true },

    { type: 'number', key: 'inAt',   label: 'Card in at', group: 'Motion', default: 100, min: 0, max: 2500, step: 20, unit: 'ms' },
    { type: 'number', key: 'clickAt', label: 'Click at',  group: 'Motion', default: 1500, min: 200, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'travel',  label: 'Cursor travel', group: 'Motion', default: 200, min: 0, max: 800, step: 10, unit: 'px' },
  ],

  // A soft pop as the lockup lands (keyed to the same inAt as its spring), a dry snap AT the
  // click, then a quieter pop as the subscribed swap settles.
  sfx: (p) => [
    { atMs: p.inAt + 150, id: 'pop', gain: 0.45 },
    { atMs: p.clickAt, id: 'snap', gain: 0.8 },
    { atMs: p.clickAt + 200, id: 'pop', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);

    const cardAt = (ms: number) => spring({
      frame: fr(ms - p.inAt), fps: FPS,
      config: { damping: 20, mass: 0.7, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const card = cardAt(timeMs);

    // DEPTH, restrained: this mimics platform UI, so the lockup swings IN through a shallow
    // top hinge on its existing spring but rests NEARLY still (0.6° sway). The badge — the big
    // mover — smears with its own entrance velocity, and the name / button rows sit at faint
    // parallax depths so the sway shears them by a hair.
    const pose = depthPose(timeMs, seed, { enter: card, rx: -12, z: -70, swayDeg: 0.6 });
    const badgeScaleAt = (ms: number) => interpolate(cardAt(ms), [0, 1], [0.55, 1]);
    const badgeSmear = smear(0, vel(badgeScaleAt, timeMs) * p.badge * 0.8);
    const parName = parallax(timeMs, seed, 0.35, width * 0.006);
    const parBtn = parallax(timeMs, seed, 0.6, width * 0.006);
    // The cursor arrives just before the click and dips on contact.
    const reach = spring({
      frame: fr(timeMs - p.clickAt + 620), fps: FPS,
      config: { damping: 28, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    const press = interpolate(timeMs, [p.clickAt - 60, p.clickAt, p.clickAt + 140], [0, 1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const subscribed = timeMs >= p.clickAt;
    // The label swap happens under a quick squash, so it does not simply pop.
    const swap = spring({
      frame: fr(timeMs - p.clickAt), fps: FPS,
      config: { damping: 16, mass: 0.5, stiffness: 230 },
      durationInFrames: Math.max(1, Math.round(fr(340))),
    });

    const btnH = p.size * 1.5;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: p.size * 0.4, fontFamily: ff,
          opacity: clamp01(card * 1.6),
          transform: pose,
          transformOrigin: '50% 30%',
          ...el('card'),
        }}
      >
        <div
          style={{
            width: p.badge, height: p.badge, borderRadius: '50%',
            background: p.avatarImg ? undefined : p.brand,
            overflow: p.avatarImg ? 'hidden' : undefined,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // Layered soft shadows instead of sitting flat on the footage.
            boxShadow:
              `0 ${Math.round(p.badge * 0.055)}px ${Math.round(p.badge * 0.14)}px ${rgba('#000000', 0.16)}, `
              + `0 ${Math.round(p.badge * 0.18)}px ${Math.round(p.badge * 0.42)}px ${rgba('#000000', 0.18)}`,
            filter: badgeSmear.blurPx > 0.3 ? `blur(${badgeSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `scale(${(badgeScaleAt(timeMs) * badgeSmear.sx).toFixed(4)}, ${(badgeScaleAt(timeMs) * badgeSmear.sy).toFixed(4)})`,
            ...el('badge'),
          }}
        >
          {p.avatarImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatarImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div
              style={{
                width: 0, height: 0,
                borderTop: `${p.badge * 0.16}px solid transparent`,
                borderBottom: `${p.badge * 0.16}px solid transparent`,
                borderLeft: `${p.badge * 0.26}px solid #ffffff`,
                marginLeft: p.badge * 0.06,
              }}
            />
          )}
        </div>

        <div
          style={{
            fontSize: p.size, fontWeight: 700, color: p.ink, letterSpacing: p.size * 0.02,
            opacity: clamp01(card * 1.4),
            transform: `translate(${parName.x.toFixed(2)}px, ${(parName.y + (1 - card) * p.size * 0.3).toFixed(2)}px)`,
            ...el('name'),
          }}
        >
          {p.name}
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', transform: `translate(${parBtn.x.toFixed(2)}px, ${parBtn.y.toFixed(2)}px)` }}>
          <div
            style={{
              height: btnH, borderRadius: 999,
              padding: `0 ${btnH * 0.55}px`,
              background: subscribed ? p.done : p.brand,
              color: '#ffffff',
              display: 'flex', alignItems: 'center', gap: btnH * 0.24,
              fontSize: p.size * 0.62, fontWeight: 700, whiteSpace: 'nowrap',
              boxShadow:
                `0 ${Math.round(btnH * 0.07)}px ${Math.round(btnH * 0.18)}px ${rgba('#000000', 0.14)}, `
                + `0 ${Math.round(btnH * 0.24)}px ${Math.round(btnH * 0.5)}px ${rgba('#000000', 0.16)}`,
              opacity: clamp01(card * 1.4),
              transform: `scale(${(1 - press * 0.07) * (subscribed ? interpolate(swap, [0, 1], [1.1, 1]) : 1)})`,
              ...el('button'),
            }}
          >
            <span
              style={{
                width: btnH * 0.42, height: btnH * 0.3, borderRadius: 3,
                background: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span style={{ width: 0, height: 0, borderTop: `${btnH * 0.07}px solid transparent`, borderBottom: `${btnH * 0.07}px solid transparent`, borderLeft: `${btnH * 0.11}px solid ${subscribed ? p.done : p.brand}` }} />
            </span>
            {subscribed ? p.after : p.before}
            {subscribed && <span style={{ fontSize: p.size * 0.5 }}>✓</span>}
          </div>

          {p.showCursor && (
            <div
              style={{
                position: 'absolute', left: '62%', top: '58%',
                width: 0, height: 0,
                borderLeft: `${p.size * 0.6}px solid ${p.ink}`,
                borderBottom: `${p.size * 0.88}px solid transparent`,
                borderRight: `${p.size * 0.28}px solid transparent`,
                opacity: clamp01((reach - 0.45) * 2.5),
                transform:
                  `translate(${((1 - reach) * p.travel).toFixed(2)}px, ${((1 - reach) * p.travel * 0.55).toFixed(2)}px) `
                  + `scale(${(1 - press * 0.16).toFixed(3)})`,
                filter: `drop-shadow(0 ${width * 0.003}px ${width * 0.006}px ${rgba('#000000', 0.35)})`,
                ...el('cursor'),
              }}
            />
          )}
        </div>
      </div>
    );
  },
});
