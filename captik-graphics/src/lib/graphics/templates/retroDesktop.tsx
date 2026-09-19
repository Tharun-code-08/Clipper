// Reference: graphics/windows-98-style.mp4  (window 0-6440ms, window open ~1640ms)
// A 90s desktop: teal field, a column of icons, a taskbar, and a beveled window opening.
//
// The bevel is the whole look, and it is four borders rather than a box-shadow: light on the top
// and left, dark on the bottom and right, with the reverse on anything pressed. A modern soft
// shadow instantly reads as the wrong decade.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_ICONS = 6;

export const retroDesktop = defineGraphicsTemplate({
  id: 'retro_desktop',
  name: 'Retro Desktop',
  category: 'device',
  tags: ['Retro', 'Desktop', 'Windows'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter', 'pixel'],

  elements: [
    { key: 'desktop', label: 'Desktop', hideable: false },
    { key: 'icons',   label: 'Icons' },
    { key: 'window',  label: 'Window' },
    { key: 'titlebar', label: 'Title bar' },
    { key: 'taskbar', label: 'Taskbar' },
  ],

  params: [
    { type: 'text', key: 'icons', label: 'Desktop icons', group: 'Content', multiline: true, maxLength: 160,
      default: '🖥|My PC\n🗑|Recycle\n📁|Documents\n📷|Camera\n🌐|Internet', help: 'One per line: glyph | label.' },
    { type: 'text', key: 'title', label: 'Window title', group: 'Content', default: 'Camera', maxLength: 28 },
    { type: 'text', key: 'body',  label: 'Window text',  group: 'Content', default: '', maxLength: 60 },
    { type: 'text', key: 'clock', label: 'Clock',        group: 'Content', default: '4:41 PM', maxLength: 12 },

    { type: 'color',  key: 'bg',     label: 'Desktop',   group: 'Style', default: '#0D7F79' },
    { type: 'color',  key: 'chrome', label: 'Window',    group: 'Style', default: '#c8c8c8' },
    { type: 'color',  key: 'bar',    label: 'Title bar', group: 'Style', default: '#000a80' },
    { type: 'color',  key: 'screen', label: 'Window content', group: 'Style', default: '#0a0a0a' },
    { type: 'color',  key: 'accent', label: 'Content ink', group: 'Style', default: '#3FD96A' },
    { type: 'font',   key: 'font',   label: 'Font',      group: 'Style', default: 'pixel' },
    { type: 'number', key: 'size',   label: 'Text size', group: 'Style', default: 22, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'bevel',  label: 'Bevel',     group: 'Style', default: 4, min: 1, max: 12, step: 1, unit: 'px' },
    { type: 'boolean', key: 'scan',  label: 'Scanlines', group: 'Style', default: true },

    { type: 'number', key: 'iconAt', label: 'Icons at',  group: 'Motion', default: 120, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'iconGap', label: 'Icon stagger', group: 'Motion', default: 110, min: 0, max: 500, step: 10, unit: 'ms' },
    { type: 'number', key: 'winAt',  label: 'Window at', group: 'Motion', default: 800, min: 0, max: 5000, step: 20, unit: 'ms' },
    { type: 'number', key: 'contentAt', label: 'Content at', group: 'Motion', default: 1500, min: 0, max: 6000, step: 20, unit: 'ms' },
  ],

  // 90s machine noises, politely: a glossy pop as the icon column starts, the classic rounded
  // alert when the window opens, a dry snap as the CRT content lights — same params as the motion.
  sfx: (p) => [
    { atMs: p.iconAt, id: 'pop', gain: 0.4 },
    { atMs: p.winAt, id: 'blip', gain: 0.5 },
    { atMs: p.contentAt, id: 'snap', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const icons = p.icons.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_ICONS)
      .map((l) => { const [g = '▪', t = ''] = l.split('|').map((s) => s.trim()); return { g, t }; });

    const winAt = (ms: number) => spring({
      frame: fr(ms - p.winAt), fps: FPS,
      config: { damping: 22, mass: 0.7, stiffness: 175 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const win = winAt(timeMs);
    const content = spring({
      frame: fr(timeMs - p.contentAt), fps: FPS,
      config: { damping: 26, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });

    const b = p.bevel;
    // Light top/left, dark bottom/right — the 90s raised look.
    const raised = {
      borderTop: `${b}px solid #ffffff`,
      borderLeft: `${b}px solid #ffffff`,
      borderRight: `${b}px solid #5a5a5a`,
      borderBottom: `${b}px solid #5a5a5a`,
    };
    const sunken = {
      borderTop: `${b}px solid #5a5a5a`,
      borderLeft: `${b}px solid #5a5a5a`,
      borderRight: `${b}px solid #ffffff`,
      borderBottom: `${b}px solid #ffffff`,
    };

    const winW = width * 0.78;
    const winH = height * 0.38;
    const barH = p.size * 1.5;

    // DEPTH: the desktop is a SCREEN — the whole field swings in as a plane and rests nearly
    // still (sway 1.0), the beveled window arrives as its own deeper plane whose zoom velocity
    // smears it, and the icon column parallaxes over the teal field. Icons fold in one at a
    // time from the side (z-stagger) instead of fading up in place.
    const deskIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const deskPose = depthPose(timeMs, seed, { enter: deskIn, ry: 12, rx: -7, z: -110, swayDeg: 1.0 });
    const winPose = depthPose(timeMs, `${seed}-w`, { enter: win, rx: -12, ry: 14, z: -90, swayDeg: 0.7 });
    const vWin = vel((ms: number) => interpolate(winAt(ms), [0, 1], [0.86, 1]), timeMs) * winW * 0.5;
    const wSm = smear(0, vWin, 2.2);
    const parIcons = parallax(timeMs, seed, 0.3, width * 0.008);
    const parWin = parallax(timeMs, seed, 0.15, width * 0.008);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.bg, fontFamily: ff,
          opacity: clamp01(deskIn * 2.2),
          transform: deskPose,
          ...el('desktop'),
        }}
      >
        {p.scan && (
          <div
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `repeating-linear-gradient(0deg, ${rgba('#000000', 0.07)} 0 1px, transparent 1px 3px)`,
            }}
          />
        )}

        <div
          style={{
            position: 'absolute', left: width * 0.03, top: height * 0.03,
            display: 'flex', flexDirection: 'column', gap: height * 0.022,
            transform: `translate(${parIcons.x.toFixed(2)}px, ${parIcons.y.toFixed(2)}px)`,
            ...el('icons'),
          }}
        >
          {icons.map((ic, i) => {
            const s = spring({
              frame: fr(timeMs - p.iconAt - i * p.iconGap), fps: FPS,
              config: { damping: 24, mass: 0.5, stiffness: 200 },
              durationInFrames: Math.max(1, Math.round(fr(340))),
            });
            return (
              <div
                key={i}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: p.size * 0.15,
                  width: width * 0.11,
                  opacity: clamp01(s * 2),
                  transform: `${swingIn(s, { ry: -16, z: -50 })} translateY(${((1 - s) * height * 0.008).toFixed(2)}px)`,
                }}
              >
                <span style={{ fontSize: p.size * 1.5, lineHeight: 1 }}>{ic.g}</span>
                <span style={{ fontSize: p.size * 0.56, color: '#ffffff', textAlign: 'center', lineHeight: 1.15, textShadow: '1px 1px 0 rgba(0,0,0,0.6)' }}>{ic.t}</span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute', left: (width - winW) / 2, top: height * 0.34,
            width: winW, height: winH,
            background: p.chrome,
            ...raised,
            boxSizing: 'border-box',
            padding: b,
            opacity: clamp01(win * 2),
            filter: wSm.blurPx > 0.3 ? `blur(${wSm.blurPx.toFixed(2)}px)` : undefined,
            transform: `${winPose} translate(${parWin.x.toFixed(2)}px, ${parWin.y.toFixed(2)}px) scale(${(interpolate(win, [0, 1], [0.86, 1]) * wSm.sx).toFixed(4)}, ${(interpolate(win, [0, 1], [0.86, 1]) * wSm.sy).toFixed(4)})`,
            ...el('window'),
          }}
        >
          <div
            style={{
              height: barH, background: p.bar, color: '#ffffff',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: `0 ${p.size * 0.3}px`, fontSize: p.size * 0.66,
              ...el('titlebar'),
            }}
          >
            <span>{p.title}</span>
            <span style={{ display: 'flex', gap: p.size * 0.18 }}>
              {['_', '□', '✕'].map((g) => (
                <span key={g} style={{ background: p.chrome, color: '#101014', ...raised, borderWidth: 2, width: p.size * 0.9, textAlign: 'center', lineHeight: 1.1 }}>{g}</span>
              ))}
            </span>
          </div>

          <div
            style={{
              margin: b * 1.5, height: `calc(100% - ${barH + b * 5}px)`,
              background: p.screen, ...sunken, boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: p.accent, fontSize: p.size,
              textShadow: `0 0 ${p.size * 0.5}px ${rgba(p.accent, 0.5)}, 0 0 ${p.size * 1.4}px ${rgba(p.accent, 0.22)}`,
              opacity: clamp01(content * 1.6),
            }}
          >
            <div style={{ border: `2px dashed ${rgba(p.accent, 0.7)}`, padding: `${p.size}px ${p.size * 2}px`, textAlign: 'center' }}>
              {p.body || '☻'}
            </div>
          </div>
        </div>

        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: p.size * 1.9, background: p.chrome,
            borderTop: `${b}px solid #ffffff`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: `0 ${p.size * 0.3}px`, fontSize: p.size * 0.64, color: '#101014',
            ...el('taskbar'),
          }}
        >
          <span style={{ background: p.chrome, ...raised, borderWidth: 2, padding: `${p.size * 0.14}px ${p.size * 0.5}px`, fontWeight: 700 }}>▤ Start</span>
          <span style={{ background: p.chrome, ...sunken, borderWidth: 2, padding: `${p.size * 0.14}px ${p.size * 0.5}px` }}>{p.clock}</span>
        </div>
      </div>
    );
  },
});
