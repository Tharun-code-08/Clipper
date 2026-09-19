// Reference: general/app-animation.mp4  (window 800-4000ms, screen complete ~1500ms)
// A full-bleed app screen that builds itself: status bar, greeting, a feature card, then two stat
// tiles. The reference lands the whole screen inside ~700ms — it is an app opening, not a
// presentation, so the stagger has to stay tight or it reads as a slideshow.

import type { ReactNode } from 'react';
import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGlow, luxeGrain, luxeVignette } from '../luxe';
import { parallax, smear, swingIn, vel } from '../juice';

export const dailyDigest = defineGraphicsTemplate({
  id: 'daily_digest',
  name: 'Daily Digest',
  category: 'device',
  tags: ['App', 'Screen', 'Card'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter', 'playfair'],

  elements: [
    { key: 'screen',   label: 'Screen', hideable: false },
    { key: 'status',   label: 'Status bar' },
    { key: 'greeting', label: 'Greeting' },
    { key: 'feature',  label: 'Feature card' },
    { key: 'statA',    label: 'Stat 1' },
    { key: 'statB',    label: 'Stat 2' },
  ],

  params: [
    { type: 'text', key: 'date',     label: 'Date',     group: 'Content', default: 'FRI, FEB 20', maxLength: 20 },
    { type: 'text', key: 'greeting', label: 'Greeting', group: 'Content', default: 'Good Afternoon, Olivia', maxLength: 40 },
    { type: 'image', key: 'avatar',  label: 'Profile photo', group: 'Content', default: '', help: 'Optional — a tinted circle is drawn when empty.' },
    { type: 'text', key: 'kicker',   label: 'Card kicker', group: 'Content', default: 'VERSE OF THE DAY', maxLength: 28 },
    { type: 'text', key: 'body',     label: 'Card body', group: 'Content', multiline: true, maxLength: 200,
      default: 'The Lord is near to the brokenhearted and saves the crushed in spirit.' },
    { type: 'text', key: 'cite',     label: 'Citation', group: 'Content', default: 'Psalm 34:18', maxLength: 24 },
    { type: 'text', key: 'action',   label: 'Card button', group: 'Content', default: 'Share', maxLength: 16 },
    { type: 'text', key: 'statA',    label: 'Stat 1', group: 'Content', default: 'Streak|6|days', maxLength: 40, help: 'title | figure | unit' },
    { type: 'text', key: 'statB',    label: 'Stat 2', group: 'Content', default: 'This Week|6/7|', maxLength: 40 },
    { type: 'number', key: 'progA',  label: 'Stat 1 progress', group: 'Content', default: 0.8, min: 0, max: 1, step: 0.05 },
    { type: 'number', key: 'dots',   label: 'Stat 2 dots filled', group: 'Content', default: 6, min: 0, max: 10, step: 1 },

    { type: 'color',  key: 'screen', label: 'Screen',  group: 'Style', default: '#0E0E11' },
    { type: 'color',  key: 'ink',    label: 'Text',    group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',    label: 'Secondary', group: 'Style', default: '#8F8B80' },
    { type: 'color',  key: 'card',   label: 'Feature card', group: 'Style', default: '#212030' },
    { type: 'color',  key: 'warm',   label: 'Stat 1 accent', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'cool',   label: 'Stat 2 accent', group: 'Style', default: '#4ADE80' },
    { type: 'font',   key: 'font',   label: 'Font',    group: 'Style', default: 'inter' },
    { type: 'font',   key: 'serif',  label: 'Card font', group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size',   label: 'Base size', group: 'Style', default: 66, min: 12, max: 120, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',  group: 'Style', default: 20, min: 0, max: 60, step: 2, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the screen', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First row at', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Row stagger', group: 'Motion', default: 70, min: 0, max: 600, step: 10, unit: 'ms' },
  ],

  // Device language at app-opening pace: a soft air pass as the screen builds, the luxe glass
  // ping when the verse card seats, one pop as the trailing stat tiles land.
  sfx: (p) => [
    { atMs: p.firstAt, id: 'whoosh', gain: 0.35 },
    { atMs: p.firstAt + p.stagger * 2 + 260, id: 'glass', gain: 0.45 },
    { atMs: p.firstAt + p.stagger * 4 + 680, id: 'pop', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const serif = fontStack(p.serif);
    const [aTitle = '', aFig = '', aUnit = ''] = p.statA.split('|');
    const [bTitle = '', bFig = '', bUnit = ''] = p.statB.split('|');

    // Status/greeting/card land almost together (an app opening); the stat tiles trail by an
    // extra beat — the reference shows the card settled well before the tiles arrive.
    const rowAt = (i: number) => (ms: number) => spring({
      frame: fr(ms - p.firstAt - i * p.stagger - (i > 2 ? 480 : 0)), fps: FPS,
      config: { damping: 24, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const row = (i: number) => rowAt(i)(timeMs);
    // DEPTH: the screen itself is a full-bleed device mimic, so it never sways — but each row
    // swings in off its own top hinge (slightly different angles = objects, not divs) and the
    // layers keep drifting at 0.2-0.35 parallax depths, so the pose never goes dead.
    const parStatus = parallax(timeMs, seed, 0.2, width * 0.008);
    const parGreet = parallax(timeMs, seed, 0.24, width * 0.008);
    const parCard = parallax(timeMs, seed, 0.28, width * 0.008);
    const parStats = parallax(timeMs, seed, 0.35, width * 0.008);
    const lift = (s: number, par: { x: number; y: number }, rx = -12) => ({
      opacity: clamp01(s * 2),
      transform: `${swingIn(s, { rx, z: -60 })} translate(${par.x.toFixed(2)}px, ${(par.y + (1 - s) * height * 0.018).toFixed(2)}px)`,
    });
    // The verse card is the hero mover — its 3D approach carries a velocity smear that dies
    // exactly as it seats, so it ARRIVES rather than fades.
    const cardSmear = smear(0, vel((ms: number) => (1 - rowAt(2)(ms)) * height * 0.1, timeMs));

    const pad = width * 0.06;
    const stat = (title: string, fig: string, unit: string, s: number, rx: number, meter: ReactNode) => (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: p.size * 0.2, ...lift(s, parStats, rx) }}>
        <span style={{ fontSize: p.size * 0.42, color: p.dim, fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: p.size * 0.16 }}>
          <span style={{ fontSize: p.size * 0.95, fontWeight: 700, color: p.ink }}>{fig}</span>
          <span style={{ fontSize: p.size * 0.42, color: p.dim }}>{unit}</span>
        </span>
        {meter}
      </div>
    );

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.screen : 'transparent',
          padding: `${pad * 2}px ${pad}px ${pad}px`, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: pad * 1.5,
          fontFamily: ff,
          ...el('screen'),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...lift(row(0), parStatus, -9), ...el('status') }}>
          <span style={{ fontSize: p.size * 0.4, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: p.ink }}>{p.date}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: p.size * 0.34, color: p.dim, fontSize: p.size * 0.5 }}>
            <span>⟳</span><span>⌕</span><span>♡</span>
            <span style={{ width: p.size * 0.9, height: p.size * 0.9, borderRadius: '50%', overflow: p.avatar ? 'hidden' : undefined, background: p.avatar ? undefined : rgba(p.warm, 0.35) }}>
              {p.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )}
            </span>
          </span>
        </div>

        <div style={{ fontSize: p.size * 0.86, fontWeight: 700, color: p.ink, ...lift(row(1), parGreet, -13), ...el('greeting') }}>
          {p.greeting}
        </div>

        <div
          style={{
            background: `linear-gradient(165deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.32) 100%), ${p.card}`,
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: p.radius, padding: pad * 0.75, boxSizing: 'border-box',
            boxShadow: `0 ${p.size * 0.28}px ${p.size * 0.8}px ${rgba('#000000', 0.45)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
            display: 'flex', flexDirection: 'column', gap: p.size * 0.4,
            opacity: clamp01(row(2) * 2),
            filter: cardSmear.blurPx > 0.3 ? `blur(${cardSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${swingIn(row(2), { rx: -16, z: -110 })} translate(${parCard.x.toFixed(2)}px, ${(parCard.y + (1 - row(2)) * height * 0.018).toFixed(2)}px) scale(${(interpolate(row(2), [0, 1], [0.97, 1]) * cardSmear.sx).toFixed(4)}, ${(interpolate(row(2), [0, 1], [0.97, 1]) * cardSmear.sy).toFixed(4)})`,
            transformOrigin: 'top center',
            ...el('feature'),
          }}
        >
          <span style={{ fontSize: p.size * 0.34, letterSpacing: '0.18em', textTransform: 'uppercase', color: LUXE.gold, fontWeight: 600, textShadow: luxeGlow(LUXE.gold, 0.5) }}>
            ✦ {p.kicker}
          </span>
          <span style={{ fontFamily: serif, fontSize: p.size * 0.82, lineHeight: 1.4, color: LUXE.ink }}>{p.body}</span>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: p.size * 0.36, color: rgba(LUXE.ink, 0.75), fontWeight: 600 }}>{p.cite}</span>
            <span
              style={{
                fontSize: p.size * 0.34, color: LUXE.ink, fontWeight: 600,
                background: rgba(LUXE.ink, 0.14), borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.12)',
                padding: `${p.size * 0.14}px ${p.size * 0.36}px`,
              }}
            >
              ⤴ {p.action}
            </span>
          </span>
        </div>

        <div style={{ display: 'flex', gap: pad * 0.8, paddingTop: pad * 0.4 }}>
          <div style={{ flex: 1, background: p.fill ? `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%), ${p.screen}` : 'transparent', border: '1px solid rgba(255,255,255,0.09)', borderRadius: p.radius, padding: pad * 0.55, boxSizing: 'border-box', boxShadow: `0 ${p.size * 0.18}px ${p.size * 0.6}px ${rgba('#000000', 0.35)}`, ...el('statA') }}>
            {stat(aTitle, aFig, aUnit, row(3), -12, (
              <span style={{ height: p.size * 0.14, background: rgba(p.warm, 0.2), borderRadius: 999, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${clamp01(p.progA) * 100}%`, background: p.warm }} />
              </span>
            ))}
          </div>
          <div style={{ flex: 1, background: p.fill ? `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%), ${p.screen}` : 'transparent', border: '1px solid rgba(255,255,255,0.09)', borderRadius: p.radius, padding: pad * 0.55, boxSizing: 'border-box', boxShadow: `0 ${p.size * 0.18}px ${p.size * 0.6}px ${rgba('#000000', 0.35)}`, ...el('statB') }}>
            {stat(bTitle, bFig, bUnit, row(4), -17, (
              <span style={{ display: 'flex', gap: p.size * 0.12 }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      flex: 1, height: p.size * 0.14, borderRadius: 999,
                      background: i < p.dots ? p.cool : rgba(p.cool, 0.2),
                    }}
                  />
                ))}
              </span>
            ))}
          </div>
        </div>

        {p.fill && <div style={luxeVignette(0.4)} />}
        {p.fill && <div style={luxeGrain(0.045)} />}
      </div>
    );
  },
});
