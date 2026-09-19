// Reference: ui-elements/notifications-1.mp4
// A stack of light notification cards that arrive one after another from below, each on its own
// spring. Measured content box: 90.3% of frame width, 63.7% tall, centred at 67.4% height.
// Each row is independent — icon, title and subtitle fade with a small internal offset — so the
// stack never reads as one block sliding up.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { parallax, smear, swingIn, vel } from '../juice';

/** "✓|Payment received|$2,400 from Sarah|#e6f6ec" — glyph, title, subtitle, optional tint. */
function parseRows(raw: string) {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((line) => {
      const [glyph = '•', title = '', sub = '', tint = ''] = line.split('|').map((s) => s.trim());
      return { glyph, title, sub, tint };
    });
}

export const notificationStack = defineGraphicsTemplate({
  id: 'notification_stack',
  name: 'Notification Stack',
  category: 'notify',
  tags: ['Notifications', 'Alerts', 'Phone'],
  design: { w: 900, h: 640 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 67, widthPercent: 90 },
  fonts: ['inter'],

  elements: [
    { key: 'cards', label: 'Cards', hideable: false },
    { key: 'icons', label: 'Icons' },
    { key: 'times', label: 'Timestamps' },
    ...Array.from({ length: 5 }, (_, i) => ({ key: `card${i + 1}`, label: `Card ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'rows', label: 'Notifications', group: 'Content', multiline: true, maxLength: 420,
      default: '✓|Payment received|$2,400 from Sarah|#e8f6ed\n📦|Order shipped|Package on the way|#f1eee9\n🎉|New milestone!|1000 followers|#f7ece6',
      help: 'One per line: glyph | title | subtitle | tint. Up to 5.' },
    { type: 'text',    key: 'time',  label: 'Timestamp',      group: 'Content', default: 'now', maxLength: 10 },
    { type: 'boolean', key: 'showTime', label: 'Show timestamps', group: 'Content', default: true },
    { type: 'image', key: 'icon1', label: 'Icon 1', group: 'Content', default: '', help: 'Optional — the glyph chip is drawn when empty.' },
    { type: 'image', key: 'icon2', label: 'Icon 2', group: 'Content', default: '', help: 'Optional — the glyph chip is drawn when empty.' },
    { type: 'image', key: 'icon3', label: 'Icon 3', group: 'Content', default: '', help: 'Optional — the glyph chip is drawn when empty.' },
    { type: 'image', key: 'icon4', label: 'Icon 4', group: 'Content', default: '', help: 'Optional — the glyph chip is drawn when empty.' },
    { type: 'image', key: 'icon5', label: 'Icon 5', group: 'Content', default: '', help: 'Optional — the glyph chip is drawn when empty.' },

    { type: 'color',  key: 'card',   label: 'Card',      group: 'Style', default: '#ffffff' },
    { type: 'color',  key: 'ink',    label: 'Title',     group: 'Style', default: '#15161a' },
    { type: 'color',  key: 'sub',    label: 'Subtitle',  group: 'Style', default: '#8f8c85' },
    { type: 'font',   key: 'font',   label: 'Font',      group: 'Style', default: 'inter' },
    { type: 'number', key: 'radius', label: 'Corner',    group: 'Style', default: 26, min: 4, max: 70, step: 2, unit: 'px' },
    { type: 'number', key: 'gap',    label: 'Row gap',   group: 'Style', default: 22, min: 0, max: 90, step: 2, unit: 'px' },
    { type: 'boolean', key: 'tinted', label: 'Tinted icon chips', group: 'Style', default: true },

    { type: 'number', key: 'stagger', label: 'Row stagger', group: 'Motion', default: 260, min: 40, max: 900, step: 20, unit: 'ms' },
    { type: 'number', key: 'riseMs',  label: 'Rise time',   group: 'Motion', default: 480, min: 150, max: 1400, step: 20, unit: 'ms' },
  ],

  // One cue per arriving card, timed off the same stagger/rise that drive the springs — the first
  // is the alert blip, the rest land as lighter UI pops.
  sfx: (p) => parseRows(p.rows).slice(0, 4).map((_, i) => ({
    atMs: i * p.stagger + p.riseMs * 0.55,
    id: (i === 0 ? 'blip' : 'pop') as 'blip' | 'pop',
    gain: i === 0 ? 0.6 : 0.45,
  })),

  render: ({ params: p, el, timeMs, height, seed }) => {
    const rows = parseRows(p.rows);
    if (!rows.length) return null;

    const ff = fontStack(p.font);
    const iconSrcs = [p.icon1, p.icon2, p.icon3, p.icon4, p.icon5];
    const rowH = (height - p.gap * (rows.length - 1)) / rows.length;
    const pad = Math.round(rowH * 0.2);
    const chip = Math.round(rowH * 0.46);
    const fsTitle = Math.round(rowH * 0.235);
    const fsSub = Math.round(rowH * 0.2);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', gap: p.gap,
          fontFamily: ff,
          ...el('cards'),
        }}
      >
        {rows.map((r, i) => {
          // Each card has its own spring, offset by the stagger. Overlapping, not queued.
          const sAt = (ms: number) => spring({
            frame: fr(ms - i * p.stagger), fps: FPS,
            config: { damping: 24, mass: 0.7, stiffness: 150 },
            durationInFrames: Math.max(1, Math.round(fr(p.riseMs))),
          });
          const s = sAt(timeMs);
          const op = interpolate(s, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
          const rise = (1 - s) * rowH * 0.85;
          // Z-STAGGER: every card swings in off its own slightly different hinge (alternating ry)
          // so the stack reads as objects arriving in space, and its rise velocity drives a smear
          // that dies the moment the card seats. Device cards get NO resting sway — a per-depth
          // parallax drift is what keeps each one alive after landing.
          const cardSmear = smear(0, vel((ms: number) => (1 - sAt(ms)) * rowH * 0.85, timeMs));
          const par = parallax(timeMs, `${seed}-card${i}`, 0.15 + i * 0.07, rowH * 0.045, 3600);
          // Contents settle a touch after their card lands.
          const inner = interpolate(timeMs - i * p.stagger - p.riseMs * 0.3, [0, 320], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
          });

          return (
            <div
              key={`${r.title}-${i}`}
              style={{
                height: rowH, flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: pad,
                padding: `0 ${pad}px`, boxSizing: 'border-box',
                background: p.card,
                borderRadius: p.radius,
                border: '1px solid rgba(0,0,0,0.05)',
                // Layered soft shadows — a tight contact layer plus a deep ambient one.
                boxShadow:
                  `0 ${Math.round(rowH * 0.035)}px ${Math.round(rowH * 0.1)}px ${rgba('#000000', 0.06)}, `
                  + `0 ${Math.round(rowH * 0.14)}px ${Math.round(rowH * 0.36)}px ${rgba('#000000', 0.1)}`,
                opacity: op,
                filter: cardSmear.blurPx > 0.3 ? `blur(${cardSmear.blurPx.toFixed(2)}px)` : undefined,
                transform:
                  `${swingIn(s, { rx: 12, ry: i % 2 ? -8 : 8, z: -80 })} `
                  + `translate(${par.x.toFixed(2)}px, ${(par.y + rise).toFixed(3)}px) `
                  + `scale(${(interpolate(s, [0, 1], [0.965, 1]) * cardSmear.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.965, 1]) * cardSmear.sy).toFixed(4)})`,
                transformOrigin: '50% 85%',
                ...el(`card${i + 1}`),
              }}
            >
              <div
                style={{
                  width: chip, height: chip, borderRadius: chip * 0.32, flexShrink: 0,
                  overflow: iconSrcs[i] ? 'hidden' : undefined,
                  background: iconSrcs[i] ? undefined : (p.tinted && r.tint ? r.tint : rgba(p.sub, 0.12)),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: chip * 0.52, lineHeight: 1,
                  opacity: inner,
                  transform: `scale(${interpolate(inner, [0, 1], [0.7, 1]).toFixed(4)})`,
                  ...el('icons'),
                }}
              >
                {iconSrcs[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconSrcs[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  r.glyph
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: rowH * 0.04, opacity: inner }}>
                <span style={{ fontSize: fsTitle, fontWeight: 700, color: p.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.title}
                </span>
                <span style={{ fontSize: fsSub, fontWeight: 400, color: p.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.sub}
                </span>
              </div>

              {p.showTime && (
                <span style={{ fontSize: fsSub, color: p.sub, flexShrink: 0, opacity: inner, ...el('times') }}>
                  {p.time}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  },
});
