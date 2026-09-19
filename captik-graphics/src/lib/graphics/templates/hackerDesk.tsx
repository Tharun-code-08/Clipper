// Reference: graphics/working-on-a-computer.mp4  (window 0-6000ms, terminal fills throughout)
// A dim room, a monitor running a terminal, and hands on a keyboard that tap while text appears.
//
// The hands tap in time with the TYPING, not on a free-running loop: the bounce is keyed to the
// character index, so the hands stop when the text stops. Hands that keep drumming after the screen
// has finished is the tell that gives these away.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, pulse, smear, swingIn, vel } from '../juice';

const MAX_LINES = 10;

export const hackerDesk = defineGraphicsTemplate({
  id: 'hacker_desk',
  name: 'Hacker Desk',
  category: 'device',
  tags: ['Terminal', 'Desk', 'Typing'],
  design: { w: 900, h: 1200 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter', 'pixel'],

  elements: [
    { key: 'room',    label: 'Room', hideable: false },
    { key: 'monitor', label: 'Monitor' },
    { key: 'screen',  label: 'Screen' },
    { key: 'keyboard', label: 'Keyboard' },
    { key: 'hands',   label: 'Hands' },
  ],

  params: [
    { type: 'text', key: 'host',  label: 'Prompt', group: 'Content', default: 'root@localhost', maxLength: 28 },
    { type: 'text', key: 'lines', label: 'Lines', group: 'Content', multiline: true, maxLength: 400,
      default:
        '$ ssh root@192.168.1.1\n'
        + 'Password: ********\n'
        + 'Access granted...\n'
        + '$ cat /etc/shadow\n'
        + 'root:$6$xyz...\n'
        + '$ ./exploit.sh\n'
        + '[*] injecting payload...\n'
        + '[+] Success!',
      help: 'One per line.' },

    { type: 'color',  key: 'room',   label: 'Room',    group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'screen', label: 'Screen',  group: 'Style', default: '#050608' },
    { type: 'color',  key: 'text',   label: 'Terminal text', group: 'Style', default: '#4ADE80' },
    { type: 'color',  key: 'bezel',  label: 'Bezel',   group: 'Style', default: '#1A1A20' },
    { type: 'color',  key: 'keys',   label: 'Keyboard', group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'skin',   label: 'Hands',   group: 'Style', default: '#e0a878' },
    { type: 'color',  key: 'sleeve', label: 'Sleeves', group: 'Style', default: '#22222A' },
    { type: 'font',   key: 'font',   label: 'Font',    group: 'Style', default: 'pixel' },
    { type: 'number', key: 'size',   label: 'Text size', group: 'Style', default: 26, min: 6, max: 46, step: 1, unit: 'px' },
    { type: 'number', key: 'glow',   label: 'Screen glow', group: 'Style', default: 0.35, min: 0, max: 1, step: 0.05 },
    { type: 'boolean', key: 'hands', label: 'Hands',   group: 'Style', default: true },

    { type: 'number', key: 'startAt', label: 'Typing starts', group: 'Motion', default: 1100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'cps',     label: 'Characters / sec', group: 'Motion', default: 32, min: 2, max: 80, step: 1 },
  ],

  // Device language, no slams: air pass as the monitor plane swings up, a dry snap when it lands
  // on the desk, and ONE soft key burst covering the whole typing run (never per character) —
  // timed off the same startAt that drives the text.
  sfx: (p) => [
    { atMs: 0, id: 'whoosh', gain: 0.4 },
    { atMs: 700, id: 'snap', gain: 0.4 },
    { atMs: p.startAt, id: 'type', gain: 0.55 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const lines = p.lines.split('\n').slice(0, MAX_LINES);
    const full = lines.join('\n');

    const shown = Math.max(0, Math.floor(((timeMs - p.startAt) / 1000) * p.cps));
    const typed = full.slice(0, shown);
    const typing = shown > 0 && shown < full.length;

    const roomIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });

    // Keyed to the CHARACTER index, so the hands stop when the text does.
    const phase = ((timeMs - p.startAt) / 1000) * p.cps;
    const tap = typing ? Math.abs(Math.sin(phase * Math.PI)) : 0;

    // DEPTH: the room is the camera and stays put — the FURNITURE arrives in it. The monitor
    // swings up as a plane (top-hinged, through house perspective), the keyboard tips up onto the
    // desk a beat later, and the hands rise from the bottom edge last; each mover carries a
    // velocity smear that dies exactly on landing, and after settle the monitor keeps a ≤1.1°
    // sway while the screen text parallaxes subtly against the bezel.
    const monAt = (ms: number) => spring({
      frame: fr(ms - 140), fps: FPS,
      config: { damping: 21, mass: 0.9, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(640))),
    });
    const monIn = monAt(timeMs);
    const monPose = depthPose(timeMs, seed, { enter: monIn, rx: -15, z: -140, swayDeg: 1.1 });
    const monRise = (1 - monIn) * height * 0.045;
    const monSmear = smear(0, vel((ms: number) => (1 - monAt(ms)) * height * 0.045, timeMs));
    const parScreen = parallax(timeMs, seed, 0.25, width * 0.006);

    const kbAt = (ms: number) => spring({
      frame: fr(ms - 380), fps: FPS,
      config: { damping: 22, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const kbIn = kbAt(timeMs);
    const kbRise = (1 - kbIn) * height * 0.035;
    const kbSmear = smear(0, vel((ms: number) => (1 - kbAt(ms)) * height * 0.035, timeMs));

    const handAt = (ms: number) => spring({
      frame: fr(ms - 560), fps: FPS,
      config: { damping: 24, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });
    const handIn = handAt(timeMs);
    const handRise = (1 - handIn) * height * 0.12;
    const handSmear = smear(0, vel((ms: number) => (1 - handAt(ms)) * height * 0.12, timeMs));

    // The CRT glow breathes slowly — a lit screen in a dark room is never a constant.
    const breath = pulse(timeMs, 3400, 0.8, 1.2);

    const monW = width * 0.94;
    const monX = (width - monW) / 2;
    const monY = height * 0.10;
    const monH = monW * 0.62;
    const kbY = monY + monH + height * 0.055;
    const kbH = height * 0.09;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: `radial-gradient(90% 60% at 50% 30%, ${rgba(p.text, 0.06 * p.glow)}, ${p.room} 70%)`,
          opacity: clamp01(roomIn),
          ...el('room'),
        }}
      >
        <div
          style={{
            position: 'absolute', left: monX, top: monY, width: monW, height: monH,
            background: `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.3) 100%), ${p.bezel}`,
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: width * 0.014,
            padding: width * 0.012, boxSizing: 'border-box',
            boxShadow: `0 ${width * 0.02}px ${width * 0.06}px ${rgba('#000000', 0.5)}${p.glow > 0 ? `, 0 0 ${width * 0.1}px ${rgba(p.text, 0.14 * p.glow * breath)}, 0 0 ${width * 0.22}px ${rgba(p.text, 0.07 * p.glow * breath)}` : ''}`,
            opacity: clamp01(monIn * 2.2),
            filter: monSmear.blurPx > 0.3 ? `blur(${monSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${monPose} translateY(${monRise.toFixed(2)}px) scale(${monSmear.sx.toFixed(4)}, ${monSmear.sy.toFixed(4)})`,
            ...el('monitor'),
          }}
        >
          <div
            style={{
              width: '100%', height: '100%',
              background: p.screen, borderRadius: width * 0.008,
              padding: width * 0.02, boxSizing: 'border-box',
              overflow: 'hidden',
              fontFamily: ff, fontSize: p.size, color: p.text, lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              textShadow: p.glow > 0 ? `0 0 ${p.size * 0.5}px ${rgba(p.text, 0.55 * p.glow)}, 0 0 ${p.size * 1.6}px ${rgba(p.text, 0.25 * p.glow)}` : undefined,
              transform: `translate(${parScreen.x.toFixed(2)}px, ${parScreen.y.toFixed(2)}px)`,
              ...el('screen'),
            }}
          >
            <span style={{ opacity: 0.55 }}>{`● ● ●  ${p.host}\n`}</span>
            {typed}
            <span style={{ opacity: typing ? 1 : 0 }}>▌</span>
          </div>
        </div>

        <div
          style={{
            position: 'absolute', left: monX - width * 0.02, top: kbY,
            width: monW + width * 0.04, height: kbH,
            background: `linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.25) 100%), ${p.keys}`,
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: width * 0.012,
            boxSizing: 'border-box',
            boxShadow: `0 ${width * 0.012}px ${width * 0.03}px ${rgba('#000000', 0.45)}, 0 ${width * 0.04}px ${width * 0.09}px ${rgba('#000000', 0.35)}`,
            opacity: clamp01(kbIn * 2.2),
            filter: kbSmear.blurPx > 0.3 ? `blur(${kbSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${swingIn(kbIn, { rx: -18, z: -60 })} translateY(${(kbRise + tap * 2).toFixed(2)}px) scale(${kbSmear.sx.toFixed(4)}, ${kbSmear.sy.toFixed(4)})`,
            ...el('keyboard'),
          }}
        >
          <div style={{ position: 'absolute', inset: `${kbH * 0.15}px ${width * 0.02}px`, display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', gap: width * 0.004 }}>
            {Array.from({ length: 42 }).map((_, i) => (
              <span key={i} style={{ background: rgba('#ffffff', 0.07), borderRadius: 2 }} />
            ))}
          </div>
        </div>

        {/* Drawn, not emoji — an emoji hand next to a flat-vector monitor reads as a sticker.
            Forearms run off the bottom edge, which is where hands actually come from. */}
        {p.hands && (
          <div
            style={{
              position: 'absolute', inset: 0,
              opacity: clamp01(handIn * 2),
              filter: handSmear.blurPx > 0.3 ? `blur(${handSmear.blurPx.toFixed(2)}px)` : undefined,
              transform: `translateY(${handRise.toFixed(2)}px)`,
              ...el('hands'),
            }}
          >
            {[-1, 1].map((side) => {
              const cx = width * (0.5 + side * 0.17);
              const palmW = width * 0.15;
              const palmH = height * 0.075;
              const palmY = kbY + kbH * 0.42;
              return (
                <div key={side} style={{ position: 'absolute', left: cx - palmW / 2, top: palmY }}>
                  {/* Fingers reach up onto the keys, each on its own beat. Lengths are graded
                      index→pinky; four equal stubs read as a paw, not a hand. */}
                  {[0.86, 1, 0.94, 0.74].map((len, f) => {
                    const lift = Math.abs(Math.sin((phase + f * 0.37 + (side + 1) * 0.5) * Math.PI));
                    const fw = palmW * 0.17;
                    const fh = palmH * 0.4 * len;
                    return (
                      <span
                        key={f}
                        style={{
                          position: 'absolute',
                          left: palmW * 0.08 + f * palmW * 0.23,
                          top: -fh + palmH * 0.06 - (typing ? lift * palmH * 0.07 : 0),
                          width: fw, height: fh + palmH * 0.2,
                          background: p.skin, borderRadius: fw,
                        }}
                      />
                    );
                  })}
                  {/* thumb, tucked to the outside edge */}
                  <span
                    style={{
                      position: 'absolute',
                      left: side < 0 ? -palmW * 0.06 : palmW * 0.92,
                      top: palmH * 0.16,
                      width: palmW * 0.16, height: palmH * 0.42,
                      background: p.skin, borderRadius: palmW * 0.1,
                      transform: `rotate(${side * 22}deg)`,
                    }}
                  />
                  <div
                    style={{
                      width: palmW, height: palmH,
                      background: p.skin,
                      borderRadius: `${palmW * 0.3}px ${palmW * 0.3}px ${palmW * 0.12}px ${palmW * 0.12}px`,
                    }}
                  />
                  {/* forearm — deliberately runs past the frame edge */}
                  <div
                    style={{
                      position: 'absolute', left: palmW * 0.2, top: palmH * 0.8,
                      width: palmW * 0.6, height: height,
                      background: p.sleeve, borderRadius: palmW * 0.3,
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        <div style={luxeVignette(0.5)} />
        <div style={luxeGrain(0.05)} />
      </div>
    );
  },
});
