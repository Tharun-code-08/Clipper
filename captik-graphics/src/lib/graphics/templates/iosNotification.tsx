// Measured against the reference recording rather than eyeballed. From ui-elements/ios-notification.mp4
// (422x752 @ 25fps), sampling real pixels:
//   card    379 x 93 px  -> aspect 4.075, 89.8% of frame width, centre at 18.1% height, PURE WHITE
//   icon    19 x 19 px at (16,16) from the card's top-left — small, inline with the app label
//   entrance  card unfurls VERTICALLY (height 78% -> 100%) over ~200ms; width barely moves (2.7%)
//   content   fades in from ~40ms after the card lands, ramping over ~480ms (i.e. staggered, not
//             one block) — the measured ink coverage climbs 1 -> 34 -> 123 -> 245 -> 254
// The reference also sits empty for its first 440ms; that is recording lead-in, so `delay` defaults
// to 0 here (in an editor the user positions the graphic in time themselves) and can be dialled up.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { idleFloat, parallax, smear, swingIn, vel } from '../juice';

export const iosNotification = defineGraphicsTemplate({
  id: 'ios_notification',
  name: 'iOS Notification',
  category: 'notify',
  tags: ['iOS', 'Phone', 'Alert'],
  badge: 'New',
  design: { w: 900, h: 248 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 18, widthPercent: 92 },
  fonts: ['inter'],

  elements: [
    { key: 'card',  label: 'Card', hideable: false },
    { key: 'icon',  label: 'App icon' },
    { key: 'app',   label: 'App name' },
    { key: 'time',  label: 'Timestamp' },
    { key: 'title', label: 'Title' },
    { key: 'body',  label: 'Message' },
  ],

  params: [
    { type: 'text',  key: 'app',   label: 'App',       group: 'Content', default: 'MESSAGES', maxLength: 24 },
    { type: 'text',  key: 'title', label: 'Title',     group: 'Content', default: 'Reminder', maxLength: 40 },
    { type: 'text',  key: 'body',  label: 'Message',   group: 'Content', default: 'Have a good day! 🌞', maxLength: 140, multiline: true },
    { type: 'text',  key: 'time',  label: 'Timestamp', group: 'Content', default: 'now', maxLength: 12 },
    { type: 'image', key: 'iconSrc', label: 'App icon', group: 'Content', default: '', help: 'Optional — a coloured tile is drawn if empty.' },

    { type: 'boolean', key: 'dark',   label: 'Dark mode',   group: 'Style', default: false },
    { type: 'color',   key: 'iconBg', label: 'Icon colour', group: 'Style', default: '#3fc45f' },
    { type: 'color',   key: 'ink',    label: 'Text colour', group: 'Style', default: '#161618', showIf: { key: 'dark', equals: false } },
    { type: 'font',    key: 'font',   label: 'Font',        group: 'Style', default: 'inter' },
    { type: 'number',  key: 'radius', label: 'Corner',      group: 'Style', default: 44, min: 8, max: 110, step: 1, unit: 'px' },
    { type: 'number',  key: 'shadow', label: 'Shadow',      group: 'Style', default: 0.14, min: 0, max: 0.5, step: 0.01 },

    { type: 'number',  key: 'delay',   label: 'Delay',        group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number',  key: 'openMs',  label: 'Card unfurl',  group: 'Motion', default: 260, min: 80, max: 900, step: 10, unit: 'ms' },
    { type: 'number',  key: 'stagger', label: 'Row stagger',  group: 'Motion', default: 70, min: 0, max: 300, step: 5, unit: 'ms' },
    { type: 'boolean', key: 'exit',    label: 'Slide away at the end', group: 'Motion', default: false },
  ],

  // Device language: a light air pass as the banner drops, the rounded alert blip as it lands —
  // timed off the same delay/openMs that drive the unfurl.
  sfx: (p) => [
    { atMs: p.delay + 30, id: 'swish', gain: 0.35 },
    { atMs: p.delay + p.openMs, id: 'blip', gain: 0.65 },
  ],

  render: ({ params: p, el, timeMs, durationMs, height, seed }) => {
    const t = timeMs - p.delay;

    // ── Card: unfurls vertically. Spring on scaleY, a whisper of scaleX — matching the measured
    //    28% height growth against 2.7% width growth. Sub-pixel throughout, no rounding.
    const openAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 200, mass: 0.9, stiffness: 120 },   // damping 200 = no overshoot on the box
      durationInFrames: Math.max(1, Math.round(fr(p.openMs))),
    });
    const open = openAt(t);
    const sy = interpolate(open, [0, 1], [0.76, 1]);
    const sx = interpolate(open, [0, 1], [0.972, 1]);
    const cardOp = interpolate(open, [0, 0.22], [0, 1], { extrapolateRight: 'clamp' });

    const leavingAt = (ms: number) => p.exit
      ? interpolate(durationMs - p.delay - ms, [0, 300], [1, 0], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic),
        })
      : 0;
    const leaving = leavingAt(t);

    // DEPTH: the banner tips down from a top hinge as it unfurls — a device mimic gets NO resting
    // sway, so after landing only a whisper of idleFloat keeps the pose alive. The MOTION BLUR
    // samples one travel proxy (unfurl edge + hinge swing + exit fly-away) so the card smears on
    // the way in AND on the way out, and lands dead crisp in between.
    const travelAt = (ms: number) => (1 - openAt(ms)) * height * 0.55 + leavingAt(ms) * (height + 60);
    const cardSmear = smear(0, vel(travelAt, t));
    const drift = idleFloat(t, seed, height * 0.006, 3400);

    // ── Rows: each element gets its OWN spring, overlapping rather than sequential. Overlap is
    //    what reads as smooth — a strict queue reads as mechanical.
    const rowIn = (i: number) => {
      const local = t - p.openMs * 0.55 - i * p.stagger;
      const s = spring({
        frame: fr(local), fps: FPS,
        config: { damping: 26, mass: 0.55, stiffness: 190 },
        durationInFrames: Math.max(1, Math.round(fr(300))),
      });
      // Screen-content parallax at ~0.2 — each row a slightly different depth, so the banner's
      // drift shears its contents subtly instead of moving one flat sticker.
      const par = parallax(t, `${seed}-row${i}`, 0.14 + i * 0.06, height * 0.02, 3400);
      return {
        opacity: interpolate(s, [0, 0.55], [0, 1], { extrapolateRight: 'clamp' }),
        // translate/scale here would fight el()'s CSS properties, so rows move via transform.
        transform: `translate(${par.x.toFixed(2)}px, ${(par.y + (1 - s) * height * 0.055).toFixed(3)}px)`,
      };
    };

    const dark = p.dark;
    const cardBg = dark ? '#1c1c1e' : '#ffffff';
    const ink = dark ? '#ffffff' : p.ink;
    const dim = dark ? rgba('#ffffff', 0.52) : rgba(p.ink, 0.46);
    const ff = fontStack(p.font);

    const pad = Math.round(height * 0.172);        // 16/93 of card height
    const ic = Math.round(height * 0.204);         // 19/93
    const fsApp = Math.round(height * 0.113);
    const fsTitle = Math.round(height * 0.163);
    const fsBody = Math.round(height * 0.150);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          transform:
            `${swingIn(open, { rx: -17, z: -70 })} `
            + `translate(${drift.x.toFixed(2)}px, ${(drift.y - leaving * (height + 60)).toFixed(3)}px) `
            + `scale(${(sx * cardSmear.sx).toFixed(4)}, ${(sy * cardSmear.sy).toFixed(4)})`,
          transformOrigin: 'top center',
          filter: cardSmear.blurPx > 0.3 ? `blur(${cardSmear.blurPx.toFixed(2)}px)` : undefined,
          opacity: cardOp,
          background: cardBg,
          borderRadius: p.radius,
          fontFamily: ff,
          border: `1px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)'}`,
          // Two soft layers instead of one hard drop — the banner floats rather than sits.
          boxShadow:
            `0 ${Math.round(height * 0.045)}px ${Math.round(height * 0.12)}px ${rgba('#000000', p.shadow)}, `
            + `0 ${Math.round(height * 0.16)}px ${Math.round(height * 0.38)}px ${rgba('#000000', Math.min(1, p.shadow * 1.3))}`,
          padding: pad,
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
          // Counter-scale the contents so the card's vertical unfurl doesn't squash the text —
          // the reference keeps its type upright while the box grows.
          ...el('card'),
        }}
      >
        <div style={{ transform: `scale(${(1 / sx).toFixed(4)}, ${(1 / sy).toFixed(4)})`, transformOrigin: 'top center', display: 'flex', flexDirection: 'column', gap: Math.round(height * 0.032) }}>
          {/* Row 1 — icon, app name, timestamp */}
          <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(height * 0.14), ...rowIn(0) }}>
            <div
              style={{
                width: ic, height: ic, borderRadius: Math.round(ic * 0.28), flexShrink: 0,
                overflow: 'hidden', background: p.iconSrc ? undefined : p.iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                ...el('icon'),
              }}
            >
              {p.iconSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.iconSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: ic * 0.52, height: ic * 0.44, borderRadius: ic * 0.1, background: rgba('#ffffff', 0.95) }} />
              )}
            </div>
            <span style={{ fontSize: fsApp, fontWeight: 600, color: dim, letterSpacing: '0.055em', whiteSpace: 'nowrap', ...el('app') }}>
              {p.app}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: fsApp, fontWeight: 400, color: dim, whiteSpace: 'nowrap', ...el('time') }}>
              {p.time}
            </span>
          </div>

          {/* Row 2 — title */}
          <span style={{ fontSize: fsTitle, fontWeight: 700, color: ink, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...rowIn(1), ...el('title') }}>
            {p.title}
          </span>

          {/* Row 3 — body */}
          <span
            style={{
              fontSize: fsBody, fontWeight: 400, color: ink, lineHeight: 1.2,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              ...rowIn(2), ...el('body'),
            }}
          >
            {p.body}
          </span>
        </div>
      </div>
    );
  },
});
