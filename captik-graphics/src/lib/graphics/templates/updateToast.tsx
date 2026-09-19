// Reference: overlays/instagram-update-notification-animation.mp4
//   (window 520-4320ms, toast settled ~1920ms)
// A dark app toast that slides up, widens into its copy, and pops a count badge. The reference is
// shot on a chroma key because it is meant to be keyed over footage — here it just draws on
// transparency, which is what an overlay template should do anyway.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { idleFloat, parallax, smear, swingIn, vel } from '../juice';

export const updateToast = defineGraphicsTemplate({
  id: 'update_toast',
  name: 'Update Toast',
  category: 'notify',
  tags: ['Notification', 'App', 'Toast'],
  design: { w: 900, h: 340 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 84 },
  fonts: ['inter'],

  elements: [
    { key: 'toast', label: 'Toast', hideable: false },
    { key: 'icon',  label: 'App icon' },
    { key: 'title', label: 'Title' },
    { key: 'sub',   label: 'Subtitle' },
    { key: 'badge', label: 'Count badge' },
  ],

  params: [
    { type: 'text',  key: 'title', label: 'Title',    group: 'Content', default: 'Instagram', maxLength: 28 },
    { type: 'text',  key: 'sub',   label: 'Subtitle', group: 'Content', default: 'Update available', maxLength: 40 },
    { type: 'text',  key: 'count', label: 'Badge',    group: 'Content', default: '1', maxLength: 4,
      help: 'Leave empty to hide the badge.' },
    { type: 'image', key: 'image', label: 'App icon', group: 'Content', default: '' },

    { type: 'color',  key: 'bg',    label: 'Toast',   group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',   label: 'Title',   group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Subtitle', group: 'Style', default: '#A5A198' },
    { type: 'color',  key: 'badge', label: 'Badge',   group: 'Style', default: '#E5484D' },
    { type: 'color',  key: 'icon',  label: 'Icon tint', group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',  label: 'Font',    group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Title size', group: 'Style', default: 66, min: 12, max: 110, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 34, min: 0, max: 80, step: 2, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow', group: 'Style', default: 0.34, min: 0, max: 0.7, step: 0.02 },

    { type: 'number', key: 'inAt',    label: 'Toast at', group: 'Motion', default: 120, min: 0, max: 3000, step: 20, unit: 'ms' },
    // The pill arrives EMPTY and fills afterwards, which is the beat the reference lands on.
    { type: 'number', key: 'copyAt',  label: 'Copy at',  group: 'Motion', default: 900, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'badgeAt', label: 'Badge at', group: 'Motion', default: 1500, min: 0, max: 5000, step: 20, unit: 'ms' },
    { type: 'number', key: 'rise',    label: 'Rise',     group: 'Motion', default: 60, min: 0, max: 260, step: 4, unit: 'px' },
  ],

  // Alert language on the toast's own three beats: air as the pill arrives, a light pop as the
  // copy fills it, and the rounded alert blip when the count badge stamps in.
  sfx: (p) => [
    { atMs: p.inAt + 40, id: 'swish', gain: 0.4 },
    { atMs: p.copyAt + 120, id: 'pop', gain: 0.4 },
    { atMs: p.badgeAt + 160, id: 'blip', gain: 0.65 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);

    const inAt = (ms: number) => spring({
      frame: fr(ms - p.inAt), fps: FPS,
      config: { damping: 19, mass: 0.7, stiffness: 175 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });
    const inS = inAt(timeMs);
    const copy = spring({
      frame: fr(timeMs - p.copyAt), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 185 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const badgeAt = (ms: number) => spring({
      frame: fr(ms - p.badgeAt), fps: FPS,
      config: { damping: 12, mass: 0.5, stiffness: 240 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const badge = badgeAt(timeMs);

    const icon = p.size * 1.25;

    // DEPTH: the toast tips up off a low hinge as it rises — an app-UI mimic gets NO resting
    // sway, so after landing only a whisper of idleFloat plus icon/badge parallax keeps the pose
    // alive. One travel proxy (rise + scale-edge motion) drives the entrance smear; the badge
    // gets its own smear off its stamp overshoot.
    const toastSmear = smear(0, vel((ms: number) => (1 - inAt(ms)) * (p.rise + 90), timeMs));
    const badgeSmear = smear(0, vel((ms: number) => (1 - badgeAt(ms)) * p.size * 0.8, timeMs), 1.2);
    const drift = idleFloat(timeMs, seed, 2.2, 3500);
    const parIcon = parallax(timeMs, seed, 0.25, p.size * 0.1);
    const parBadge = parallax(timeMs, seed, 0.45, p.size * 0.1);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: p.size * 0.42,
            // Near-black glass: vertical top-light over the fill, hairline border, layered depth.
            background: `linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 55%), ${p.bg}`,
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: p.radius,
            padding: `${p.size * 0.44}px ${p.size * 0.6}px`,
            boxShadow:
              `inset 0 1px 0 rgba(255,255,255,0.06)`
              + (p.shadow > 0
                ? `, 0 ${width * 0.012}px ${width * 0.03}px ${rgba('#000000', p.shadow * 0.8)}, `
                  + `0 ${width * 0.05}px ${width * 0.11}px ${rgba('#000000', p.shadow)}`
                : ''),
            opacity: clamp01(inS * 2),
            filter: toastSmear.blurPx > 0.3 ? `blur(${toastSmear.blurPx.toFixed(2)}px)` : undefined,
            transform:
              `${swingIn(inS, { rx: 12, z: -90 })} `
              + `translate(${drift.x.toFixed(2)}px, ${(drift.y + (1 - inS) * p.rise).toFixed(2)}px) `
              + `scale(${(interpolate(inS, [0, 1], [0.86, 1]) * toastSmear.sx).toFixed(4)}, ${(interpolate(inS, [0, 1], [0.86, 1]) * toastSmear.sy).toFixed(4)})`,
            transformOrigin: '50% 80%',
            ...el('toast'),
          }}
        >
          <div
            style={{
              width: icon, height: icon, borderRadius: icon * 0.28, flexShrink: 0,
              background: p.image ? undefined : `linear-gradient(140deg, #F1DCA6 0%, ${p.icon} 55%, #8A6A32 100%)`,
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transform: `translate(${parIcon.x.toFixed(2)}px, ${parIcon.y.toFixed(2)}px) scale(${interpolate(inS, [0, 1], [0.7, 1]).toFixed(4)})`,
              ...el('icon'),
            }}
          >
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: icon * 0.5, height: icon * 0.5, border: `${icon * 0.075}px solid #ffffff`, borderRadius: icon * 0.16 }} />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: p.size * 0.1, minWidth: 0 }}>
            <span
              style={{
                fontSize: p.size, fontWeight: 700, color: p.ink, whiteSpace: 'nowrap',
                opacity: clamp01(copy * 1.7),
                transform: `translateX(${((1 - copy) * -p.size * 0.3).toFixed(2)}px)`,
                ...el('title'),
              }}
            >
              {p.title}
            </span>
            <span
              style={{
                fontSize: p.size * 0.5, color: p.dim, whiteSpace: 'nowrap',
                opacity: clamp01(copy * 1.4),
                transform: `translateX(${((1 - copy) * -p.size * 0.24).toFixed(2)}px)`,
                ...el('sub'),
              }}
            >
              {p.sub}
            </span>
          </div>

          {p.count.trim() && (
            <div
              style={{
                marginLeft: p.size * 0.4,
                minWidth: p.size * 0.86, height: p.size * 0.86, borderRadius: 999,
                background: p.badge, color: '#ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: p.size * 0.46, fontWeight: 700, padding: `0 ${p.size * 0.16}px`,
                boxSizing: 'border-box', flexShrink: 0,
                opacity: clamp01(badge * 2),
                filter: badgeSmear.blurPx > 0.3 ? `blur(${badgeSmear.blurPx.toFixed(2)}px)` : undefined,
                transform: `translate(${parBadge.x.toFixed(2)}px, ${parBadge.y.toFixed(2)}px) scale(${(interpolate(badge, [0, 1], [0.2, 1]) * badgeSmear.sx).toFixed(4)}, ${(interpolate(badge, [0, 1], [0.2, 1]) * badgeSmear.sy).toFixed(4)})`,
                ...el('badge'),
              }}
            >
              {p.count}
            </div>
          )}
        </div>
      </div>
    );
  },
});
