// SCENE 7 — the payoff cascade.
//
// Reference: the notification beat. Cards arrive one after another from different corners,
// each landing tilted and flattening, each carrying an icon chip — the visual argument that the
// work is done. They do not stack in a neat column: they scatter across the frame at
// deterministic positions, which is what makes it read as "everything happening at once"
// rather than a list.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, finishFor, glide, lerp, rows, sceneFade, sceneGrain, sceneGround, sceneVignette, win } from '../sceneKit';

export const sceneToastCascade = defineGraphicsTemplate({
  id: 'scene_toast_cascade',
  name: 'Scene · Payoff Cascade',
  category: 'story',
  tags: ['Scene', 'Notifications', 'Payoff', 'Toasts', 'Explainer'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'toasts', label: 'Cards', hideable: false },
    { key: 'kicker', label: 'Kicker' },
    { key: 'grain',  label: 'Grain' },
  ],

  params: [
    { type: 'text', key: 'kicker', label: 'Kicker', group: 'Content', default: 'One pass. Done.', maxLength: 40 },
    { type: 'text', key: 'toasts', label: 'Cards', group: 'Content', multiline: true, maxLength: 420,
      default: '✓|Hinglish detected|99% accurate transcript\n🎬|Style applied|Blockbuster\n⬆|4K export ready|watermark-free\n⚡|Done in 41s|no re-typing',
      help: 'One per line: glyph | title | subtitle. Up to 5.' },

    { type: 'color', key: 'bg',      label: 'Background', group: 'Style', default: '#0b0b0d' },
    { type: 'color', key: 'ink',     label: 'Title',      group: 'Style', default: '#ffffff' },
    { type: 'color', key: 'dim',     label: 'Subtitle',   group: 'Style', default: '#8f8f96' },
    { type: 'color', key: 'accent',  label: 'Icon chip',  group: 'Style', default: '#fe9a00' },
    { type: 'color', key: 'surface', label: 'Card',       group: 'Style', default: '#17171b' },
    { type: 'color', key: 'line',    label: 'Card edge',  group: 'Style', default: '#2c2c31' },
    { type: 'font',  key: 'font',    label: 'Font',       group: 'Style', default: 'clash' },

    { type: 'number', key: 'stagger', label: 'Card stagger', group: 'Motion', default: 300, min: 80, max: 700, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [
    { atMs: p.delay + 220, id: 'pop', gain: 0.3 },
    { atMs: p.delay + 220 + p.stagger, id: 'pop', gain: 0.3 },
    { atMs: p.delay + 220 + p.stagger * 2, id: 'chime', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const fin = finishFor(p.bg);
    const cards = rows(p.toasts, 5);
    if (!cards.length) return null;

    const kickIn = win(t, 40, durationMs, 240, 280);
    const out = glide(clamp01((t - (durationMs - 320)) / 320));
    const cardW = Math.round(width * 0.33);
    // deterministic scatter — corners first, so the frame fills outward
    const spots = [
      { x: 0.32, y: 0.36 }, { x: 0.68, y: 0.47 },
      { x: 0.36, y: 0.63 }, { x: 0.66, y: 0.74 },
      { x: 0.50, y: 0.55 },
    ];

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack('inter') }}>
        {sceneGround(p.bg, p.accent, t, width, height).map((st, i) => (
          <div key={`g${i}`} style={st} aria-hidden />
        ))}

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: '13%',
            textAlign: 'center',
            fontFamily: fontStack(p.font), fontWeight: 700,
            fontSize: Math.round(S * 0.06),
            color: p.accent,
            opacity: kickIn,
            transform: `translateY(${(1 - kickIn) * S * 0.028}px)`,
            ...el('kicker'),
          }}
        >
          {p.kicker}
        </div>

        <div style={{ position: 'absolute', inset: 0, ...el('toasts') }}>
          {cards.map((c, i) => {
            const at = 260 + i * p.stagger;
            const s = spring({
              frame: fr(t - at), fps: FPS,
              config: { damping: 15, mass: 0.65, stiffness: 160 },
              durationInFrames: Math.max(1, Math.round(fr(560))),
            });
            const e = glide(clamp01(s));
            const sp = spots[i % spots.length];
            const idle = Math.sin((t / 1000) * 1.5 + i) * S * 0.004;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: sp.x * width, top: sp.y * height,
                  width: cardW,
                  marginLeft: -cardW / 2,
                  padding: `${Math.round(S * 0.026)}px ${Math.round(S * 0.03)}px`,
                  borderRadius: Math.round(S * 0.02),
                  background: p.surface,
                  border: `2px solid ${p.line}`,
                  boxShadow: `0 ${Math.round(S * 0.026)}px ${Math.round(S * 0.055)}px rgba(0,0,0,.45)`,
                  display: 'flex', alignItems: 'center', gap: Math.round(S * 0.02),
                  opacity: e * (1 - out),
                  transform:
                    `translateY(${(1 - e) * S * 0.1 + idle - out * S * 0.05}px)`
                    + ` rotate(${lerp(i % 2 ? 4.5 : -4.5, 0, e)}deg) scale(${lerp(0.9, 1, e)})`,
                }}
              >
                <div style={{
                  width: Math.round(S * 0.055), height: Math.round(S * 0.055), flex: 'none',
                  borderRadius: Math.round(S * 0.013),
                  background: p.accent, color: p.bg,
                  display: 'grid', placeItems: 'center',
                  fontSize: Math.round(S * 0.03), fontWeight: 800,
                }}>{c[0]}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: fontStack(p.font), fontWeight: 700, fontSize: Math.round(S * 0.028), color: p.ink }}>
                    {c[1] ?? ''}
                  </div>
                  {c[2] && (
                    <div style={{ fontSize: Math.round(S * 0.021), color: p.dim, marginTop: Math.round(S * 0.004) }}>
                      {c[2]}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ ...sceneGrain(fin.grain), ...el('grain') }} aria-hidden />
        <div style={sceneVignette(fin.vig)} aria-hidden />
      </div>
    );
  },
});
