// Reference: ui-elements/phone-notification-pop-up.mp4  (window 520-3280ms, banner settled ~1440ms)
// A phone lock screen — clock, date, and a notification banner dropping onto it. Distinct from
// ios_notification, which is the bare banner: this is the whole handset, so the banner has a screen
// to land on and the phone itself gets its own arrival.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

export const lockScreen = defineGraphicsTemplate({
  id: 'lock_screen',
  name: 'Lock Screen',
  category: 'notify',
  tags: ['Phone', 'Notification', 'Lock'],
  design: { w: 620, h: 1290 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 3400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 62 },
  fonts: ['inter'],

  elements: [
    { key: 'phone',  label: 'Phone', hideable: false },
    { key: 'clock',  label: 'Clock' },
    { key: 'date',   label: 'Date' },
    { key: 'banner', label: 'Notification' },
    { key: 'icon',   label: 'App icon' },
  ],

  params: [
    { type: 'text', key: 'clock', label: 'Clock', group: 'Content', default: '9:41', maxLength: 8 },
    { type: 'text', key: 'date',  label: 'Date',  group: 'Content', default: 'Monday, January 15', maxLength: 32 },
    { type: 'text', key: 'app',   label: 'App',   group: 'Content', default: 'MESSAGES', maxLength: 20 },
    { type: 'text', key: 'title', label: 'Sender', group: 'Content', default: 'Sarah', maxLength: 24 },
    { type: 'text', key: 'body',  label: 'Message', group: 'Content', default: 'Hi! How are you', maxLength: 80 },
    { type: 'image', key: 'wall',  label: 'Wallpaper', group: 'Content', default: '', help: 'Optional — a flat screen colour is drawn when empty.' },

    { type: 'color',  key: 'screen', label: 'Screen',   group: 'Style', default: '#151a2b' },
    { type: 'color',  key: 'card',   label: 'Banner',   group: 'Style', default: '#ffffff' },
    { type: 'color',  key: 'icon',   label: 'App icon', group: 'Style', default: '#3fd0f0' },
    { type: 'color',  key: 'ink',    label: 'Banner text', group: 'Style', default: '#101014' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'inter' },
    { type: 'number', key: 'radius', label: 'Banner corner', group: 'Style', default: 22, min: 0, max: 60, step: 2, unit: 'px' },
    { type: 'boolean', key: 'chrome', label: 'Phone frame', group: 'Style', default: true },

    { type: 'number', key: 'phoneAt',  label: 'Phone in at', group: 'Motion', default: 80, min: 0, max: 2500, step: 20, unit: 'ms' },
    { type: 'number', key: 'bannerAt', label: 'Banner at',   group: 'Motion', default: 720, min: 0, max: 5000, step: 20, unit: 'ms' },
  ],

  // Air as the handset arrives, the rounded alert blip as the banner lands on the glass — the
  // notification is the payoff, so it carries the louder cue.
  sfx: (p) => [
    { atMs: p.phoneAt + 30, id: 'whoosh', gain: 0.4 },
    { atMs: p.bannerAt + 180, id: 'blip', gain: 0.7 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);

    const phoneInAt = (ms: number) => spring({
      frame: fr(ms - p.phoneAt), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const phoneIn = phoneInAt(timeMs);
    const bannerAt = (ms: number) => spring({
      frame: fr(ms - p.bannerAt), fps: FPS,
      config: { damping: 19, mass: 0.7, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });
    const banner = bannerAt(timeMs);

    // DEPTH: the handset arrives as a physical object — deep 3D swing, approach smear — then
    // rests NEARLY still (0.8° sway; it is a phone, not a floating card). The banner drops onto
    // the glass off its own top hinge with its own drop-velocity smear, and the screen layers
    // (clock, date, banner) parallax at ~0.2-0.3 so the lock screen reads as glass, not print.
    const pose = depthPose(timeMs, seed, { enter: phoneIn, rx: -14, ry: -8, z: -160, swayDeg: 0.8, periodMs: 5200 });
    const phoneSmear = smear(0, vel((ms: number) => (1 - phoneInAt(ms)) * width * 0.25, timeMs));
    const bannerSmear = smear(0, vel((ms: number) => (1 - bannerAt(ms)) * height * 0.09, timeMs));
    const parClock = parallax(timeMs, seed, 0.18, width * 0.01, 5200);
    const parDate = parallax(timeMs, seed, 0.22, width * 0.01, 5200);
    const parBanner = parallax(timeMs, seed, 0.3, width * 0.01, 5200);

    const bezel = p.chrome ? Math.round(width * 0.026) : 0;
    const radius = Math.round(width * 0.11);
    const pad = Math.round(width * 0.055);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.chrome ? '#0f0f10' : 'transparent',
          borderRadius: radius, padding: bezel, boxSizing: 'border-box',
          fontFamily: ff,
          opacity: clamp01(phoneIn),
          filter: phoneSmear.blurPx > 0.3 ? `blur(${phoneSmear.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} scale(${(interpolate(phoneIn, [0, 1], [0.955, 1]) * phoneSmear.sx).toFixed(4)}, ${(interpolate(phoneIn, [0, 1], [0.955, 1]) * phoneSmear.sy).toFixed(4)})`,
          transformOrigin: 'center center',
          border: p.chrome ? '1px solid rgba(255,255,255,0.10)' : undefined,
          // Layered soft shadows — contact plus ambient — so the handset floats instead of
          // sitting on one hard drop.
          boxShadow: p.chrome
            ? `0 ${width * 0.028}px ${width * 0.07}px ${rgba('#000000', 0.28)}, `
              + `0 ${width * 0.1}px ${width * 0.22}px ${rgba('#000000', 0.3)}`
            : undefined,
          ...el('phone'),
        }}
      >
        <div
          style={{
            position: 'relative', width: '100%', height: '100%',
            // Gentle top-light over the wallpaper colour — flat hex screens read like plastic.
            background: `radial-gradient(ellipse 130% 70% at 50% 0%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 60%), ${p.screen}`,
            borderRadius: Math.max(0, radius - bezel), overflow: 'hidden',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingTop: height * 0.09, boxSizing: 'border-box',
          }}
        >
          {/* Wallpaper photo — bottom of the screen's stacking order; clock, banner and chrome stay on top. */}
          {p.wall && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.wall} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          )}
          {p.chrome && (
            <div style={{ position: 'absolute', top: bezel * 0.6, left: '50%', transform: 'translateX(-50%)', width: width * 0.34, height: height * 0.022, borderRadius: 99, background: '#0f0f10' }} />
          )}

          <div
            style={{
              position: 'relative',
              fontSize: width * 0.15, fontWeight: 300, color: '#ffffff', lineHeight: 1,
              opacity: clamp01(phoneIn),
              transform: `translate(${parClock.x.toFixed(2)}px, ${parClock.y.toFixed(2)}px)`,
              ...el('clock'),
            }}
          >
            {p.clock}
          </div>
          <div
            style={{
              position: 'relative',
              marginTop: height * 0.008,
              fontSize: width * 0.038, color: rgba('#ffffff', 0.72),
              opacity: clamp01(phoneIn),
              transform: `translate(${parDate.x.toFixed(2)}px, ${parDate.y.toFixed(2)}px)`,
              ...el('date'),
            }}
          >
            {p.date}
          </div>

          <div
            style={{
              marginTop: height * 0.045,
              width: '88%', background: p.card, borderRadius: p.radius,
              padding: pad * 0.55, boxSizing: 'border-box',
              display: 'flex', flexDirection: 'column', gap: pad * 0.18,
              boxShadow:
                `0 ${width * 0.012}px ${width * 0.035}px ${rgba('#000000', 0.18)}, `
                + `0 ${width * 0.05}px ${width * 0.11}px ${rgba('#000000', 0.24)}`,
              opacity: clamp01(banner * 2),
              filter: bannerSmear.blurPx > 0.3 ? `blur(${bannerSmear.blurPx.toFixed(2)}px)` : undefined,
              transform:
                `${swingIn(banner, { rx: -18, z: -60 })} `
                + `translate(${parBanner.x.toFixed(2)}px, ${(parBanner.y + (1 - banner) * -height * 0.09).toFixed(2)}px) `
                + `scale(${(interpolate(banner, [0, 1], [0.93, 1]) * bannerSmear.sx).toFixed(4)}, ${(interpolate(banner, [0, 1], [0.93, 1]) * bannerSmear.sy).toFixed(4)})`,
              transformOrigin: 'top center',
              ...el('banner'),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: pad * 0.3 }}>
              <div style={{ width: width * 0.062, height: width * 0.062, borderRadius: width * 0.016, background: p.icon, flexShrink: 0, ...el('icon') }} />
              <span style={{ fontSize: width * 0.032, color: rgba(p.ink, 0.55), letterSpacing: width * 0.001, fontWeight: 600 }}>{p.app}</span>
              <span style={{ marginLeft: 'auto', fontSize: width * 0.03, color: rgba(p.ink, 0.35) }}>now</span>
            </div>
            <span style={{ fontSize: width * 0.045, fontWeight: 700, color: p.ink }}>{p.title}</span>
            <span style={{ fontSize: width * 0.04, color: rgba(p.ink, 0.7) }}>{p.body}</span>
          </div>

          <div style={{ flex: 1 }} />
          {p.chrome && (
            <div style={{ position: 'relative', width: width * 0.36, height: height * 0.005, borderRadius: 99, background: rgba('#ffffff', 0.5), marginBottom: height * 0.018 }} />
          )}
        </div>
      </div>
    );
  },
});
