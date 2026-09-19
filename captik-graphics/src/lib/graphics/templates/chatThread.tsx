// Reference: general/whatsapp-convo.mp4  (window 960-5400ms, reply lands ~3400ms)
// A full-bleed chat screen on a papered wallpaper: sent bubbles with ticks, and a reply that shows
// a typing placeholder before it resolves into text.
//
// Distinct from phone_messages, which is an iMessage-style thread inside a phone frame. The typing
// placeholder is the whole point here — a reply that simply appears loses the beat of waiting.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, pulse, smear, swingIn, vel } from '../juice';

const MAX_MSGS = 8;

export const chatThread = defineGraphicsTemplate({
  id: 'chat_thread',
  name: 'Chat Thread',
  category: 'device',
  tags: ['Chat', 'Messages', 'Reply'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'screen', label: 'Screen', hideable: false },
    { key: 'bar',    label: 'Top bar' },
    ...Array.from({ length: MAX_MSGS }, (_, i) => ({ key: `msg${i + 1}`, label: `Message ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'msgs', label: 'Messages', group: 'Content', multiline: true, maxLength: 400,
      default: 'out|ready to do you?|10:22 PM\nin|on my way 🚗|10:23 PM',
      help: 'One per line: out|in · text · time. "out" is yours, "in" is theirs.' },
    { type: 'number', key: 'typingFor', label: 'Typing placeholder', group: 'Content', default: 900, min: 0, max: 4000, step: 50, unit: 'ms',
      help: 'How long an incoming bubble sits empty before its text resolves.' },

    { type: 'color',  key: 'wall',  label: 'Wallpaper', group: 'Style', default: '#e6e0d6' },
    { type: 'color',  key: 'bar',   label: 'Top bar',   group: 'Style', default: '#ded7cb' },
    { type: 'color',  key: 'out',   label: 'Your bubbles', group: 'Style', default: '#d6f6c8' },
    { type: 'color',  key: 'in',    label: 'Their bubbles', group: 'Style', default: '#FDFCF8' },
    { type: 'color',  key: 'ink',   label: 'Text',      group: 'Style', default: '#14161a' },
    { type: 'color',  key: 'dim',   label: 'Timestamps', group: 'Style', default: '#8b8d92' },
    { type: 'color',  key: 'tick',  label: 'Read ticks', group: 'Style', default: '#3ba2e0' },
    { type: 'font',   key: 'font',  label: 'Font',      group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Text size', group: 'Style', default: 54, min: 10, max: 90, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Bubble corner', group: 'Style', default: 24, min: 0, max: 50, step: 2, unit: 'px' },
    { type: 'number', key: 'gap',   label: 'Bubble gap', group: 'Style', default: 150, min: 0, max: 240, step: 2, unit: 'px' },
    { type: 'boolean', key: 'chrome', label: 'Top bar', group: 'Style', default: true },
    { type: 'boolean', key: 'fill',  label: 'Paint the wallpaper', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First message at', group: 'Motion', default: 300, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Message stagger', group: 'Motion', default: 1300, min: 100, max: 6000, step: 50, unit: 'ms' },
  ],

  // Device language: quiet air pass as the screen plane arrives, a glossy pop for the first sent
  // bubble, and a rounded alert when the reply's typing placeholder resolves — all timed off the
  // same firstAt / stagger / typingFor that drive the bubbles.
  sfx: (p) => [
    { atMs: 0, id: 'whoosh', gain: 0.35 },
    { atMs: p.firstAt, id: 'pop', gain: 0.55 },
    { atMs: p.firstAt + p.stagger + p.typingFor, id: 'blip', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const msgs = p.msgs.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_MSGS)
      .map((l) => {
        const [side = 'out', text = '', time = ''] = l.split('|').map((s) => s.trim());
        return { mine: side !== 'in', text, time };
      });

    const pad = width * 0.05;
    // The reference clears the screen and starts the exchange over — loop on a modulo of timeMs so
    // any frame renders correctly in isolation.
    const cycle = p.firstAt + msgs.length * p.stagger + p.typingFor;
    const t = timeMs % Math.max(1, cycle);

    // DEPTH: the screen swings in ONCE as a side-hinged plane (off timeMs, not the cycled clock —
    // the conversation loops, the glass does not re-arrive) and then rests nearly still: 0.7°
    // sway, it is a screen mimic. Its rise velocity smears and dies on landing, and the top bar /
    // message column parallax subtly against the wallpaper.
    const screenAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 23, mass: 0.9, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    const screenIn = screenAt(timeMs);
    const pose = depthPose(timeMs, seed, { enter: screenIn, ry: 12, rx: -6, z: -130, swayDeg: 0.7 });
    const rise = (1 - screenIn) * height * 0.03;
    const scrSmear = smear(0, vel((ms: number) => (1 - screenAt(ms)) * height * 0.03, timeMs));
    const parBar = parallax(timeMs, seed, 0.3, width * 0.006);
    const parCol = parallax(timeMs, seed, 0.2, width * 0.006);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.wall : 'transparent',
          display: 'flex', flexDirection: 'column',
          fontFamily: ff,
          opacity: clamp01(screenIn * 2.5),
          filter: scrSmear.blurPx > 0.3 ? `blur(${scrSmear.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} translateY(${rise.toFixed(2)}px) scale(${scrSmear.sx.toFixed(4)}, ${scrSmear.sy.toFixed(4)})`,
          ...el('screen'),
        }}
      >
        {p.chrome && (
          <div
            style={{
              height: height * 0.085, background: p.bar,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: `0 ${pad}px`, fontSize: p.size * 0.7, color: p.dim, flex: 'none',
              transform: `translate(${parBar.x.toFixed(2)}px, ${parBar.y.toFixed(2)}px)`,
              ...el('bar'),
            }}
          >
            <span>←</span>
            <span style={{ display: 'flex', gap: pad * 0.5 }}><span>▦</span><span>✎</span></span>
          </div>
        )}

        {/* the reference leaves a clear band of wallpaper between the bar and the first bubble */}
        <div style={{ flex: 1, padding: `${height * 0.075}px ${pad}px ${pad}px`, display: 'flex', flexDirection: 'column', gap: p.gap, transform: `translate(${parCol.x.toFixed(2)}px, ${parCol.y.toFixed(2)}px)` }}>
          {msgs.map((m, i) => {
            const at = p.firstAt + i * p.stagger;
            const popAt = (ms: number) => spring({
              frame: fr(ms - at), fps: FPS,
              config: { damping: 20, mass: 0.6, stiffness: 200 },
              durationInFrames: Math.max(1, Math.round(fr(340))),
            });
            const pop = popAt(t);
            if (pop <= 0.001) return null;
            // Each bubble is an OBJECT arriving in space: it swings up hinged at its tail corner
            // (sent from the right, received from the left — mirrored angles), rises a touch and
            // smears with its own velocity, landing crisp.
            const lift = (1 - pop) * height * 0.022;
            const bubSmear = smear(0, vel((ms: number) => (1 - popAt(ms)) * height * 0.022, t));
            // Every bubble arrives EMPTY and fills a beat later — that pause is the reference's
            // rhythm; a message that simply appears loses it.
            const resolved = interpolate(t, [at + p.typingFor, at + p.typingFor + 160], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
            return (
              <div
                key={i}
                style={{
                  alignSelf: m.mine ? 'flex-end' : 'flex-start',
                  maxWidth: '72%',
                  background: m.mine ? p.out : p.in,
                  borderRadius: p.radius,
                  padding: `${p.size * 0.4}px ${p.size * 0.5}px`,
                  border: `1px solid ${rgba('#000000', 0.04)}`,
                  boxShadow: `0 2px 6px ${rgba('#000000', 0.08)}, 0 12px 28px ${rgba('#000000', 0.08)}`,
                  display: 'flex', flexDirection: 'column', gap: p.size * 0.1,
                  alignItems: m.mine ? 'flex-end' : 'flex-start',
                  minWidth: resolved < 1 ? '34%' : undefined,
                  minHeight: resolved < 1 ? p.size * 3 : undefined,
                  opacity: clamp01(pop * 2),
                  filter: bubSmear.blurPx > 0.3 ? `blur(${bubSmear.blurPx.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(pop, { rx: -18, ry: m.mine ? 12 : -12, z: -80 })} translateY(${lift.toFixed(2)}px) scale(${(interpolate(pop, [0, 1], [0.85, 1]) * bubSmear.sx).toFixed(4)}, ${(interpolate(pop, [0, 1], [0.85, 1]) * bubSmear.sy).toFixed(4)})`,
                  transformOrigin: m.mine ? 'bottom right' : 'bottom left',
                  ...el(`msg${i + 1}`),
                }}
              >
                {/* The waiting dots BREATHE — a dead placeholder loses the "someone is typing" read. */}
                <span style={{ fontSize: p.size, color: p.ink, opacity: resolved > 0 ? resolved : pulse(t, 640, 0.3, 0.75) }}>
                  {resolved > 0 ? m.text : '· · ·'}
                </span>
                <span
                  style={{
                    fontSize: p.size * 0.55, color: p.dim, whiteSpace: 'nowrap', flex: 'none',
                    opacity: resolved,
                  }}
                >
                  {m.time}
                  {m.mine && <span style={{ color: p.tick, marginLeft: p.size * 0.14 }}>✓✓</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
