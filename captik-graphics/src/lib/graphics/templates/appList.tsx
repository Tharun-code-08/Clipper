// Reference: social/animated-app-list.mp4  (window 480-5240ms, list fills ~2840ms)
// A phone list where each row slides in on its own spring and the list scrolls up as it fills, so
// later rows push earlier ones off the top. Six rows, each an individually addressable element,
// with icon / title / subtitle / chevron all inside it.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_ROWS = 8;

/** "🗨|Messages|3 new conversations|#5b9bf8" — glyph, title, subtitle, tint. */
function parseRows(raw: string) {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_ROWS).map((l) => {
    const [glyph = '•', title = '', sub = '', tint = ''] = l.split('|').map((s) => s.trim());
    return { glyph, title, sub, tint };
  });
}

export const appList = defineGraphicsTemplate({
  id: 'app_list',
  name: 'App List',
  category: 'device',
  tags: ['List', 'Phone', 'Menu'],
  design: { w: 620, h: 1180 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 74 },
  fonts: ['inter'],

  elements: [
    { key: 'phone',  label: 'Phone', hideable: false },
    { key: 'title',  label: 'Heading' },
    { key: 'avatar', label: 'Avatar' },
    { key: 'list',   label: 'List', hideable: false },
    ...Array.from({ length: MAX_ROWS }, (_, i) => ({ key: `row${i + 1}`, label: `Row ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'title', label: 'Heading', group: 'Content', default: 'Apps', maxLength: 24 },
    { type: 'text', key: 'clock', label: 'Clock',   group: 'Content', default: '9:41', maxLength: 8 },
    { type: 'image', key: 'avatar', label: 'Avatar', group: 'Content', default: '' },
    { type: 'text', key: 'rows',  label: 'Rows',    group: 'Content', multiline: true, maxLength: 500,
      default: '💬|Messages|3 new conversations|#232E3D\n📅|Calendar|2 upcoming events|#20303F\n🖼|Photos|128 memories|#2E2838\n🎵|Music|Now playing|#3A2830\n🏃|Fitness|Goal: 10,000 steps|#24352B\n☀️|Weather|Sunny, 72°F|#3D3524',
      help: 'One per line: glyph | title | subtitle | tint.' },

    { type: 'color',  key: 'screen', label: 'Screen', group: 'Style', default: '#101014' },
    { type: 'color',  key: 'ink',    label: 'Title',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'sub',    label: 'Subtitle', group: 'Style', default: '#989387' },
    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'inter' },
    { type: 'number', key: 'radius', label: 'Row corner', group: 'Style', default: 18, min: 0, max: 50, step: 2, unit: 'px' },
    { type: 'boolean', key: 'chrome', label: 'Phone frame', group: 'Style', default: true },

    { type: 'number',  key: 'firstAt', label: 'First row at', group: 'Motion', default: 420, min: 0, max: 2500, step: 20, unit: 'ms' },
    { type: 'number',  key: 'stagger', label: 'Row stagger',  group: 'Motion', default: 380, min: 60, max: 1200, step: 20, unit: 'ms' },
    { type: 'boolean', key: 'scroll',  label: 'List scrolls up as it fills', group: 'Motion', default: true },
  ],

  // Device language, no slams: air as the handset arrives, one glossy pop when the first row
  // lands, and a dry snap as the default list finishes filling — all off the row-timing params.
  sfx: (p) => [
    { atMs: 30, id: 'whoosh', gain: 0.4 },
    { atMs: p.firstAt + 140, id: 'pop', gain: 0.5 },
    { atMs: p.firstAt + p.stagger * 5 + 200, id: 'snap', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const rows = parseRows(p.rows);

    const chromeInAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });
    const chromeIn = chromeInAt(timeMs);
    // DEPTH: the handset arrives as a physical object — 3D swing with an approach smear that
    // dies on landing — then rests NEARLY still (0.8° sway; it is a phone, not a floating card).
    // The screen layers (avatar, heading, list) parallax at 0.2-0.35 so the UI reads as glass.
    const pose = depthPose(timeMs, seed, { enter: chromeIn, rx: -13, ry: -7, z: -150, swayDeg: 0.8, periodMs: 5200 });
    const phoneSmear = smear(0, vel((ms: number) => (1 - chromeInAt(ms)) * width * 0.22, timeMs));
    const parTitle = parallax(timeMs, seed, 0.2, width * 0.01, 5200);
    const parAvatar = parallax(timeMs, seed, 0.26, width * 0.01, 5200);
    const parList = parallax(timeMs, seed, 0.32, width * 0.01, 5200);
    const titleIn = spring({
      frame: fr(timeMs - 180), fps: FPS,
      config: { damping: 26, mass: 0.55, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(340))),
    });

    const bezel = p.chrome ? Math.round(width * 0.026) : 0;
    const radius = Math.round(width * 0.11);
    const pad = Math.round(width * 0.055);
    const rowH = Math.round(height * 0.072);
    const gap = Math.round(rowH * 0.16);
    const chip = Math.round(rowH * 0.56);
    const fsTitle = Math.round(width * 0.072);
    const fsRow = Math.round(width * 0.038);
    const fsSub = Math.round(width * 0.028);

    // Smooth count of arrived rows drives the scroll, so it glides rather than stepping.
    const arrived = Math.max(0, (timeMs - p.firstAt) / Math.max(1, p.stagger));
    const visibleRows = (height * 0.56) / (rowH + gap);
    const scroll = p.scroll ? Math.max(0, arrived - visibleRows) * (rowH + gap) : 0;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.chrome ? '#0f0f10' : 'transparent',
          borderRadius: radius, padding: bezel, boxSizing: 'border-box',
          fontFamily: ff,
          opacity: interpolate(chromeIn, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
          filter: phoneSmear.blurPx > 0.3 ? `blur(${phoneSmear.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} scale(${(interpolate(chromeIn, [0, 1], [0.965, 1]) * phoneSmear.sx).toFixed(4)}, ${(interpolate(chromeIn, [0, 1], [0.965, 1]) * phoneSmear.sy).toFixed(4)})`,
          transformOrigin: 'center center',
          border: p.chrome ? '1px solid rgba(255,255,255,0.12)' : undefined,
          boxShadow: p.chrome ? `0 ${width * 0.04}px ${width * 0.1}px ${rgba('#000000', 0.35)}, 0 ${width * 0.13}px ${width * 0.3}px ${rgba('#000000', 0.4)}` : undefined,
          ...el('phone'),
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', background: p.screen, borderRadius: Math.max(0, radius - bezel), overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: pad, boxSizing: 'border-box' }}>
          {p.chrome && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: width * 0.032, color: p.ink, marginBottom: pad * 0.4 }}>
              <span style={{ fontWeight: 600 }}>{p.clock}</span>
              <div style={{ width: width * 0.06, height: width * 0.03, border: `2px solid ${p.ink}`, borderRadius: 3 }} />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: pad * 0.3 }}>
            <div
              style={{
                width: width * 0.13, height: width * 0.13, borderRadius: '50%', overflow: 'hidden',
                background: rgba(p.ink, 0.12),
                opacity: interpolate(titleIn, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
                transform: `translate(${parAvatar.x.toFixed(2)}px, ${parAvatar.y.toFixed(2)}px) scale(${interpolate(titleIn, [0, 1], [0.7, 1]).toFixed(3)})`,
                ...el('avatar'),
              }}
            >
              {p.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
          </div>

          <span
            style={{
              fontSize: fsTitle, fontWeight: 800, color: p.ink, marginBottom: pad * 0.5,
              opacity: interpolate(titleIn, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translate(${parTitle.x.toFixed(2)}px, ${(parTitle.y + (1 - titleIn) * height * 0.012).toFixed(2)}px)`,
              ...el('title'),
            }}
          >
            {p.title}
          </span>

          <div style={{ flex: 1, overflow: 'hidden', transform: `translate(${parList.x.toFixed(2)}px, ${parList.y.toFixed(2)}px)`, ...el('list') }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap, transform: `translateY(${(-scroll).toFixed(2)}px)` }}>
              {rows.map((r, i) => {
                const sAt = (ms: number) => spring({
                  frame: fr(ms - p.firstAt - i * p.stagger), fps: FPS,
                  config: { damping: 22, mass: 0.65, stiffness: 165 },
                  durationInFrames: Math.max(1, Math.round(fr(420))),
                });
                const s = sAt(timeMs);
                // Z-STAGGER: each row swings in off a side hinge at its own angle, its slide
                // velocity smearing it mid-flight — objects arriving in space, not divs appearing.
                const rowSmear = smear(vel((ms: number) => (1 - sAt(ms)) * width * 0.16, timeMs), 0);
                return (
                  <div
                    key={`${r.title}-${i}`}
                    style={{
                      height: rowH, flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: pad * 0.45,
                      padding: `0 ${pad * 0.5}px`, boxSizing: 'border-box',
                      background: 'linear-gradient(180deg, #1C1C22 0%, #141419 100%)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: p.radius,
                      boxShadow: `0 ${rowH * 0.08}px ${rowH * 0.28}px ${rgba('#000000', 0.35)}, inset 0 1px 0 rgba(255,255,255,0.05)`,
                      opacity: interpolate(s, [0, 0.45], [0, 1], { extrapolateRight: 'clamp' }),
                      filter: rowSmear.blurPx > 0.3 ? `blur(${rowSmear.blurPx.toFixed(2)}px)` : undefined,
                      transform: `${swingIn(s, { ry: 16 + (i % 3) * 4, rx: -4, z: -70 })} translateX(${((1 - s) * width * 0.16).toFixed(2)}px) scale(${(interpolate(s, [0, 1], [0.97, 1]) * rowSmear.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.97, 1]) * rowSmear.sy).toFixed(4)})`,
                      ...el(`row${i + 1}`),
                    }}
                  >
                    <div style={{ width: chip, height: chip, borderRadius: chip * 0.28, flexShrink: 0, background: r.tint || rgba(p.sub, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: chip * 0.5 }}>
                      {r.glyph}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: fsRow, fontWeight: 700, color: p.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                      <span style={{ fontSize: fsSub, color: p.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span>
                    </div>
                    <span style={{ color: rgba(p.sub, 0.7), fontSize: fsRow, flexShrink: 0 }}>›</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  },
});
