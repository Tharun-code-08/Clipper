// Reference: ui-elements/phone-messages-1.mp4  (window 0-5480ms, bubbles land by ~2480ms)
// A phone frame with an iMessage-style thread filling in. Every bubble arrives on its own spring
// with a small scale-from-origin, so the conversation types itself out rather than appearing as a
// block. The phone chrome (notch, status bar, home indicator, header) fades in ahead of the thread.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

/** "< Hey!" incoming, "> Hi there!" outgoing. Anything else defaults to incoming. */
function parseThread(raw: string) {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((l) => ({
      out: l.startsWith('>'),
      text: l.replace(/^[<>]\s*/, ''),
    }));
}

export const phoneMessages = defineGraphicsTemplate({
  id: 'phone_messages',
  name: 'Phone Messages',
  category: 'device',
  tags: ['iMessage', 'Chat', 'Phone'],
  design: { w: 620, h: 1260 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5500,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 66 },
  fonts: ['inter'],

  elements: [
    { key: 'phone',  label: 'Phone', hideable: false },
    { key: 'header', label: 'Header' },
    { key: 'thread', label: 'Messages', hideable: false },
    ...Array.from({ length: 8 }, (_, i) => ({ key: `msg${i + 1}`, label: `Message ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'name',   label: 'Contact',  group: 'Content', default: 'John', maxLength: 24 },
    { type: 'image', key: 'avatar', label: 'Contact photo', group: 'Content', default: '', help: 'Optional — a coloured circle with the contact initial is drawn when empty.' },
    { type: 'text', key: 'sub',    label: 'Subtitle', group: 'Content', default: 'iMessage', maxLength: 24 },
    { type: 'text', key: 'clock',  label: 'Clock',    group: 'Content', default: '9:41', maxLength: 8 },
    { type: 'text', key: 'thread', label: 'Thread',   group: 'Content', multiline: true, maxLength: 500,
      default: '< Hey!\n> Hi there!\n< How are you?\n> Doing great!',
      help: 'One message per line. Start with > for outgoing, < for incoming.' },

    { type: 'color',  key: 'screen', label: 'Screen',   group: 'Style', default: '#f2f2f7' },
    { type: 'color',  key: 'frame',  label: 'Frame',    group: 'Style', default: '#0f0f10' },
    { type: 'color',  key: 'outCol', label: 'Outgoing', group: 'Style', default: '#2f7cf6' },
    { type: 'color',  key: 'inCol',  label: 'Incoming', group: 'Style', default: '#e6e6eb' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'inter' },
    { type: 'boolean', key: 'chrome', label: 'Show phone frame', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First message at', group: 'Motion', default: 420, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Message stagger', group: 'Motion', default: 480, min: 80, max: 1500, step: 20, unit: 'ms' },
  ],

  // A quiet air pass as the handset arrives, then the thread's own beats: a soft key thock for
  // every outgoing bubble, the rounded alert blip for incoming — first three messages only, so a
  // long thread never turns into a drum kit.
  sfx: (p) => [
    { atMs: 60, id: 'whoosh' as const, gain: 0.4 },
    ...parseThread(p.thread).slice(0, 3).map((m, i) => ({
      atMs: p.firstAt + i * p.stagger + 140,
      id: (m.out ? 'type' : 'blip') as 'type' | 'blip',
      gain: m.out ? 0.55 : 0.5,
    })),
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const msgs = parseThread(p.thread);
    const ff = fontStack(p.font);

    const bezel = p.chrome ? Math.round(width * 0.028) : 0;
    const radius = Math.round(width * 0.115);
    const screenR = Math.max(0, radius - bezel);
    const notchW = Math.round(width * 0.34);
    const notchH = Math.round(width * 0.085);
    const fsStatus = Math.round(width * 0.042);
    const fsName = Math.round(width * 0.055);
    const fsSub = Math.round(width * 0.036);
    const fsMsg = Math.round(width * 0.05);
    const pad = Math.round(width * 0.05);

    const chromeInAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(360))),
    });
    const chromeIn = chromeInAt(timeMs);

    // DEPTH: the handset arrives as a physical object — a deeper 3D swing than a mere card —
    // then rests NEARLY still (sway 0.8°, a phone is not a floating graphic). Its approach
    // velocity drives a smear that dies the moment it seats; the screen layers (header, thread)
    // parallax at ~0.2 against the frame so the glass reads as glass.
    const pose = depthPose(timeMs, seed, { enter: chromeIn, rx: -13, ry: 9, z: -150, swayDeg: 0.8, periodMs: 5200 });
    const phoneSmear = smear(0, vel((ms: number) => (1 - chromeInAt(ms)) * width * 0.3, timeMs));
    const parHeader = parallax(timeMs, seed, 0.12, width * 0.012, 5200);
    const parThread = parallax(timeMs, seed, 0.2, width * 0.012, 5200);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.chrome ? p.frame : 'transparent',
          borderRadius: radius,
          padding: bezel, boxSizing: 'border-box',
          fontFamily: ff,
          opacity: interpolate(chromeIn, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
          filter: phoneSmear.blurPx > 0.3 ? `blur(${phoneSmear.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} scale(${(interpolate(chromeIn, [0, 1], [0.965, 1]) * phoneSmear.sx).toFixed(4)}, ${(interpolate(chromeIn, [0, 1], [0.965, 1]) * phoneSmear.sy).toFixed(4)})`,
          transformOrigin: 'center center',
          boxShadow: p.chrome
            ? `0 ${Math.round(width * 0.03)}px ${Math.round(width * 0.08)}px ${rgba('#000000', 0.18)}, 0 ${Math.round(width * 0.1)}px ${Math.round(width * 0.22)}px ${rgba('#000000', 0.22)}, inset 0 0 0 1px rgba(255,255,255,0.08)`
            : undefined,
          ...el('phone'),
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', background: p.screen, borderRadius: screenR, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* status bar + notch */}
          {p.chrome && (
            <div style={{ position: 'relative', height: Math.round(width * 0.11), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${pad}px` }}>
              <span style={{ fontSize: fsStatus, fontWeight: 600, color: '#111' }}>{p.clock}</span>
              <div style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', width: notchW, height: notchH, background: p.frame, borderRadius: notchH }} />
              <div style={{ display: 'flex', gap: width * 0.012, alignItems: 'center' }}>
                <div style={{ width: fsStatus * 0.85, height: fsStatus * 0.5, border: `2px solid #111`, borderRadius: 3 }} />
              </div>
            </div>
          )}

          {/* header */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: pad * 0.55,
              padding: `${pad * 0.35}px ${pad}px`,
              borderBottom: `1.5px solid ${rgba('#000000', 0.08)}`,
              opacity: interpolate(chromeIn, [0.3, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              transform: `translate(${parHeader.x.toFixed(2)}px, ${parHeader.y.toFixed(2)}px)`,
              ...el('header'),
            }}
          >
            <div style={{ width: fsName * 1.5, height: fsName * 1.5, borderRadius: '50%', overflow: p.avatar ? 'hidden' : undefined, background: p.avatar ? undefined : p.outCol, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: fsName * 0.8, fontWeight: 700 }}>
              {p.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                (p.name.trim()[0] ?? 'J').toUpperCase()
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: fsName, fontWeight: 700, color: '#111', lineHeight: 1.15 }}>{p.name}</span>
              <span style={{ fontSize: fsSub, color: rgba('#000000', 0.45), lineHeight: 1.15 }}>{p.sub}</span>
            </div>
          </div>

          {/* thread */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: pad * 0.45, padding: pad, overflow: 'hidden', transform: `translate(${parThread.x.toFixed(2)}px, ${parThread.y.toFixed(2)}px)`, ...el('thread') }}>
            {msgs.map((m, i) => {
              const sAt = (ms: number) => spring({
                frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
                config: { damping: 20, mass: 0.55, stiffness: 195 },
                durationInFrames: Math.max(1, Math.round(fr(360))),
              });
              const s = sAt(timeMs);
              // Each bubble swings in off its OWN side-hinge (outgoing from the right, incoming
              // from the left) and smears with its rise velocity — objects landing on the glass,
              // not divs fading in.
              const bubSmear = smear(0, vel((ms: number) => (1 - sAt(ms)) * fsMsg * 0.9, timeMs), 1.6);
              return (
                <div
                  key={`${m.text}-${i}`}
                  style={{
                    alignSelf: m.out ? 'flex-end' : 'flex-start',
                    maxWidth: '76%',
                    padding: `${pad * 0.32}px ${pad * 0.5}px`,
                    borderRadius: fsMsg * 1.25,
                    background: m.out ? p.outCol : p.inCol,
                    color: m.out ? '#ffffff' : '#111114',
                    fontSize: fsMsg,
                    lineHeight: 1.25,
                    opacity: interpolate(s, [0, 0.45], [0, 1], { extrapolateRight: 'clamp' }),
                    filter: bubSmear.blurPx > 0.3 ? `blur(${bubSmear.blurPx.toFixed(2)}px)` : undefined,
                    transform:
                      `${swingIn(s, { rx: -8, ry: m.out ? 12 : -12, z: -40 })} `
                      + `translateY(${((1 - s) * fsMsg * 0.9).toFixed(3)}px) `
                      + `scale(${(interpolate(s, [0, 1], [0.86, 1]) * bubSmear.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.86, 1]) * bubSmear.sy).toFixed(4)})`,
                    transformOrigin: m.out ? 'right bottom' : 'left bottom',
                    ...el(`msg${i + 1}`),
                  }}
                >
                  {m.text}
                </div>
              );
            })}
          </div>

          {p.chrome && (
            <div style={{ height: Math.round(height * 0.022), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '32%', height: Math.max(2, Math.round(width * 0.008)), borderRadius: 99, background: rgba('#000000', 0.3) }} />
            </div>
          )}
        </div>
      </div>
    );
  },
});
