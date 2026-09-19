// Reference: text/terminal-typing.mp4  (window 480-4300ms, line resolves ~2500ms)
// A code window on a flat colour field, typing one line out under a traffic-light title bar.
//
// The CSS-animation trap, made a teaching example.
//
// The obvious way to build this is `animation: blink 1s steps(2) infinite` for the caret and a
// CSS typing effect for the text. Both animate beautifully in the editor and render as a SINGLE
// FROZEN FRAME in the export, because every export frame is an independent DOM snapshot and CSS
// animations only advance on the browser's wall clock.
//
// Everything below is instead derived arithmetically from `timeMs`: the visible character count
// is a floor() of elapsed time, and the caret's on/off state is a modulo of it. Same input ms,
// same output pixels, on every surface.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

const DOTS = ['#ff5f57', '#febc2e', '#28c840'];

export const terminalTyping = defineGraphicsTemplate({
  id: 'terminal_typing',
  name: 'Terminal Typing',
  category: 'device',
  tags: ['Code', 'Terminal', 'Dev'],
  design: { w: 900, h: 175 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 88 },
  fonts: ['pixel', 'inter'],

  elements: [
    { key: 'window', label: 'Window', hideable: false },
    { key: 'chrome', label: 'Title bar', hideable: false },
    { key: 'text',   label: 'Text' },
    { key: 'dots',   label: 'Traffic lights' },
    ...Array.from({ length: 6 }, (_, i) => ({ key: `line${i + 1}`, label: `Line ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'prompt', label: 'Prompt', group: 'Content', default: '~ $', maxLength: 16 },
    { type: 'text', key: 'body',   label: 'Command output', group: 'Content', default: 'npx captik render\nbuilding scene graph...\ndone in 2.4s', maxLength: 400, multiline: true,
      help: 'One line per newline. Types out across the clip.' },
    { type: 'text', key: 'title',  label: 'Window title', group: 'Content', default: 'bash', maxLength: 24 },
    { type: 'boolean', key: 'chrome', label: 'Window chrome', group: 'Content', default: true },

    { type: 'font',   key: 'font',  label: 'Font',       group: 'Style', default: 'pixel' },
    { type: 'color',  key: 'bg',    label: 'Background', group: 'Style', default: '#111116' },
    { type: 'color',  key: 'ink',   label: 'Text',       group: 'Style', default: '#4ADE80' },
    { type: 'color',  key: 'dim',   label: 'Prompt',     group: 'Style', default: '#8F8B80' },
    { type: 'number', key: 'size',  label: 'Text size',  group: 'Style', default: 14, min: 14, max: 64, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',    group: 'Style', default: 14, min: 0, max: 48, step: 2, unit: 'px' },

    { type: 'number',  key: 'cps',   label: 'Typing speed', group: 'Motion', default: 22, min: 4, max: 80, step: 1, unit: 'ch/s' },
    { type: 'boolean', key: 'caret', label: 'Blinking caret', group: 'Motion', default: true },
  ],

  // Device language: a fast light pass as the window plane swings in, ONE soft key burst for the
  // whole typing run (never per character), a dry snap when the last character lands. The end-of-
  // typing cue mirrors the render's budget math — newlines cost no characters.
  sfx: (p) => [
    { atMs: 0, id: 'swish', gain: 0.4 },
    { atMs: 260, id: 'type', gain: 0.5 },
    { atMs: (p.body.split('\n').join('').length / Math.max(1, p.cps)) * 1000, id: 'snap', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    // Spring rather than a plain ramp so the window arrives with weight and settles.
    const openAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 24, mass: 0.7, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const open = openAt(timeMs);
    const opened = interpolate(open, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });

    // DEPTH: the strip is wide and shallow, so it swings in SIDE-hinged as a plane and rests at a
    // ≤1° sway (a window mimic, not a floating card). Its rise velocity smears the glass and dies
    // exactly on landing; the title bar and body parallax at different depths against the sway.
    const pose = depthPose(timeMs, seed, { enter: open, ry: 16, rx: -7, z: -110, swayDeg: 1 });
    const rise = (1 - open) * height * 0.16;
    const winSmear = smear(0, vel((ms: number) => (1 - openAt(ms)) * height * 0.16, timeMs));
    const parChrome = parallax(timeMs, seed, 0.3, width * 0.005);
    const parText = parallax(timeMs, seed, 0.2, width * 0.005);
    // The title bar and its lights land a beat after the window itself.
    const chromeIn = spring({
      frame: fr(timeMs - 150), fps: FPS,
      config: { damping: 26, mass: 0.5, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(300))),
    });

    // Characters revealed so far — a pure floor() of elapsed time, not a CSS width animation.
    const shownChars = Math.max(0, Math.floor((timeMs / 1000) * p.cps));
    const lines = p.body.split('\n');

    let budget = shownChars;
    const visible: string[] = [];
    let typingLine = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (budget <= 0) break;
      const take = Math.min(lines[i].length, budget);
      visible.push(lines[i].slice(0, take));
      if (take < lines[i].length) { typingLine = i; budget = 0; break; }
      budget -= take;
      typingLine = i;
    }

    // Caret blink: 2Hz square wave off the millisecond clock. Deterministic per frame.
    const caretOn = p.caret ? (timeMs % 1000) < 500 : false;
    const barH = p.chrome ? Math.round(p.size * 1.5) : 0;
    const pad = Math.round(p.size * 0.8);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          transform: `${pose} translateY(${rise.toFixed(2)}px) scale(${(interpolate(open, [0, 1], [0.92, 1]) * winSmear.sx).toFixed(4)}, ${(interpolate(open, [0, 1], [0.92, 1]) * winSmear.sy).toFixed(4)})`,
          transformOrigin: 'center center',
          opacity: opened,
          filter: winSmear.blurPx > 0.3 ? `blur(${winSmear.blurPx.toFixed(2)}px)` : undefined,
          background: `linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.3) 100%), ${p.bg}`,
          borderRadius: p.radius,
          overflow: 'hidden',
          fontFamily: fontStack(p.font),
          boxShadow: `0 10px 26px ${rgba('#000000', 0.4)}, 0 24px 70px ${rgba('#000000', 0.5)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
          border: `1px solid ${rgba('#ffffff', 0.13)}`,
          display: 'flex', flexDirection: 'column',
          ...el('window'),
        }}
      >
        {p.chrome && (
          <div
            style={{
              height: barH, flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: barH * 0.22, paddingLeft: barH * 0.42,
              background: rgba('#ffffff', 0.05),
              borderBottom: `1px solid ${rgba('#ffffff', 0.08)}`,
              transform: `translate(${parChrome.x.toFixed(2)}px, ${parChrome.y.toFixed(2)}px)`,
              ...el('chrome'),
            }}
          >
            {DOTS.map((c, di) => (
              <div
                key={c}
                style={{
                  width: barH * 0.28, height: barH * 0.28, borderRadius: '50%', background: c,
                  opacity: interpolate(chromeIn, [di * 0.12, di * 0.12 + 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                  transform: `scale(${interpolate(chromeIn, [di * 0.12, 1], [0.4, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }).toFixed(3)})`,
                  ...el('dots'),
                }}
              />
            ))}
            <span style={{ marginLeft: 'auto', marginRight: barH * 0.6, fontSize: p.size * 0.62, letterSpacing: '0.1em', color: p.dim }}>{p.title}</span>
          </div>
        )}

        <div style={{ flex: 1, padding: pad, display: 'flex', flexDirection: 'column', gap: p.size * 0.32, overflow: 'hidden', maxHeight: height, transform: `translate(${parText.x.toFixed(2)}px, ${parText.y.toFixed(2)}px)`, ...el('text') }}>
          {visible.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: p.size * 0.45, alignItems: 'baseline', ...el(`line${i + 1}`) }}>
              <span style={{ fontSize: p.size, color: p.dim, whiteSpace: 'pre' }}>{i === 0 ? p.prompt : ' '.repeat(p.prompt.length)}</span>
              <span style={{ fontSize: p.size, color: p.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word', textShadow: `0 0 ${Math.round(p.size * 0.5)}px ${rgba(p.ink, 0.35)}, 0 0 ${Math.round(p.size * 1.4)}px ${rgba(p.ink, 0.14)}` }}>
                {line}
                {i === typingLine && caretOn && (
                  <span style={{ display: 'inline-block', width: p.size * 0.55, height: p.size * 1.05, background: p.ink, verticalAlign: 'text-bottom', marginLeft: p.size * 0.1 }} />
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  },
});
