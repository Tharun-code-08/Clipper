// Reference: general/ad-spend.mp4  (window 880-6000ms, bars land ~3100ms, tooltip ~2100ms)
// A dark spend card: figure at the top, a bar chart below, and ONE bar lit up with a tooltip.
//
// The highlighted bar grows LAST and overshoots slightly — in the reference it is the thing the
// whole card is about, and letting it come up in the same wave as the greys throws that away.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGrain, luxeLabel, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

const MAX_BARS = 12;

export const adSpendCard = defineGraphicsTemplate({
  id: 'ad_spend_card',
  name: 'Spend Card',
  category: 'money',
  tags: ['Dashboard', 'Bars', 'Highlight', 'Luxury'],
  design: { w: 900, h: 1200 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'card',    label: 'Card', hideable: false },
    { key: 'header',  label: 'Header' },
    { key: 'value',   label: 'Figure' },
    { key: 'bars',    label: 'Bars' },
    { key: 'tooltip', label: 'Tooltip' },
  ],

  params: [
    { type: 'text',   key: 'label',  label: 'Label',  group: 'Content', default: 'Ad spend', maxLength: 24 },
    { type: 'text',   key: 'value',  label: 'Figure', group: 'Content', default: 'MAD 60,000.00', maxLength: 24 },
    { type: 'text',   key: 'tabs',   label: 'Tabs',   group: 'Content', default: 'Daily,Monthly', maxLength: 40,
      help: 'Comma-separated. The LAST one is the active pill.' },
    { type: 'text',   key: 'bars',   label: 'Bars',   group: 'Content', maxLength: 160,
      default: 'Mon 42,Tue 30,Wed 55,Thu 38,May 96,Jun 60,Jul 47,Aug 34',
      help: 'Comma-separated "label height". Height is relative, 0-100.' },
    { type: 'number', key: 'hot',    label: 'Highlighted bar', group: 'Content', default: 5, min: 1, max: MAX_BARS, step: 1 },
    { type: 'text',   key: 'tip',    label: 'Tooltip', group: 'Content', default: 'Thursday · 60 Orders', maxLength: 32 },

    { type: 'color',  key: 'bg',     label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'card',   label: 'Card',     group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',    label: 'Figure',   group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',    label: 'Secondary', group: 'Style', default: '#8B8780' },
    { type: 'color',  key: 'bar',    label: 'Bars',     group: 'Style', default: '#26262C' },
    { type: 'color',  key: 'accent', label: 'Highlight', group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Figure size', group: 'Style', default: 54, min: 10, max: 110, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',   group: 'Style', default: 22, min: 0, max: 60, step: 2, unit: 'px' },
    { type: 'number', key: 'glow',   label: 'Highlight glow', group: 'Style', default: 0.5, min: 0, max: 1, step: 0.05 },
    { type: 'boolean', key: 'fill',  label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'cardAt',  label: 'Card at',    group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'firstAt', label: 'First bar at', group: 'Motion', default: 520, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Bar stagger', group: 'Motion', default: 90, min: 0, max: 500, step: 10, unit: 'ms' },
    { type: 'number', key: 'tipAt',   label: 'Tooltip at', group: 'Motion', default: 1700, min: 0, max: 8000, step: 50, unit: 'ms' },
  ],

  // Quiet DOCU dashboard: a glass ping as the card lands, a low sweep under the bar build, and
  // the coin exactly where the highlighted bar (the point of the card) settles — all timed off
  // the same firstAt/stagger the bars ride, so retiming the build retimes the sound.
  sfx: (p) => {
    const n = Math.max(1, p.bars.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_BARS).length);
    const hotAt = p.firstAt + n * p.stagger + 240;
    return [
      { atMs: p.cardAt + 60, id: 'glass', gain: 0.4 },
      { atMs: p.firstAt, id: 'sweep', gain: 0.3 },
      { atMs: hotAt + 200, id: 'coin', gain: 0.55 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const tabs = p.tabs.split(',').map((s) => s.trim()).filter(Boolean);
    const bars = p.bars.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_BARS)
      .map((s) => {
        const i = s.lastIndexOf(' ');
        return { label: i < 0 ? s : s.slice(0, i), h: Math.max(0, Math.min(100, Number(s.slice(i + 1)) || 0)) };
      });
    const hot = Math.round(p.hot) - 1;

    const cardIn = spring({
      frame: fr(timeMs - p.cardAt), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });
    const tip = spring({
      frame: fr(timeMs - p.tipAt), fps: FPS,
      config: { damping: 20, mass: 0.6, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    // Depth: the card swings in top-hinged on its existing entrance spring and holds a ±1.6°
    // sway; the figure and the tooltip sit at different parallax depths so the sway visibly
    // shears the dashboard's layers instead of tilting a flat screenshot.
    const pose = depthPose(timeMs, seed, { enter: cardIn, rx: -12, z: -80, swayDeg: 1.6 });
    const parVal = parallax(timeMs, seed, 0.3, height * 0.01);
    const parTip = parallax(timeMs, seed, 0.8, height * 0.01);

    const plotH = height * 0.48;
    const pad = width * 0.065;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
        }}
      >
        <div
          style={{
            width: '94%',
            position: 'relative', overflow: 'hidden',
            background: `linear-gradient(180deg, ${p.card} 0%, ${LUXE.bg0} 100%)`,
            border: `1px solid ${LUXE.hairline}`,
            borderRadius: p.radius,
            boxShadow: '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
            padding: pad, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: pad * 0.55,
            opacity: clamp01(cardIn * 1.6),
            transform: `${pose} scale(${interpolate(cardIn, [0, 1], [0.96, 1]).toFixed(4)})`,
            transformOrigin: '50% 30%',
            ...el('card'),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...el('header') }}>
            <span style={{ ...luxeLabel(p.size * 0.33, p.dim) }}>{p.label}</span>
            <span style={{ display: 'flex', gap: pad * 0.2 }}>
              {tabs.map((tab, i) => (
                <span
                  key={tab}
                  style={{
                    fontSize: p.size * 0.3, fontWeight: 600, letterSpacing: '0.04em',
                    padding: `${p.size * 0.14}px ${p.size * 0.32}px`, borderRadius: 999,
                    background: i === tabs.length - 1
                      ? `linear-gradient(180deg, ${p.accent}, ${rgba(p.accent, 0.82)})`
                      : 'transparent',
                    border: i === tabs.length - 1 ? undefined : '1px solid rgba(255,255,255,0.08)',
                    boxShadow: i === tabs.length - 1 ? `0 0 16px ${rgba(p.accent, 0.28)}` : undefined,
                    color: i === tabs.length - 1 ? '#171204' : p.dim,
                  }}
                >
                  {tab}
                </span>
              ))}
            </span>
          </div>

          <div style={{ fontSize: p.size, fontWeight: 700, color: p.ink, letterSpacing: '0.01em', fontVariantNumeric: 'tabular-nums', transform: `translate(${parVal.x.toFixed(2)}px, ${parVal.y.toFixed(2)}px)`, ...el('value') }}>{p.value}</div>

          <div style={{ position: 'relative', height: plotH, ...el('bars') }}>
            {/* dashed hairline baseline under the bars, documentary-chart style */}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: p.size * 0.36, borderTop: '1.5px dashed rgba(255,255,255,0.16)' }} />
            {/* tooltip rides above the highlighted bar, so retuning `hot` moves it too */}
            {hot >= 0 && hot < bars.length && (
              <div
                style={{
                  position: 'absolute', bottom: plotH * (bars[hot].h / 100) + plotH * 0.06,
                  left: `${((hot + 0.5) / bars.length) * 100}%`,
                  transform: `translateX(-50%) translate(${parTip.x.toFixed(2)}px, ${parTip.y.toFixed(2)}px) scale(${interpolate(tip, [0, 1], [0.85, 1]).toFixed(4)})`,
                  background: 'rgba(21,21,26,0.92)', border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 8, padding: `${p.size * 0.1}px ${p.size * 0.22}px`,
                  fontSize: p.size * 0.26, color: p.ink, whiteSpace: 'nowrap',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
                  opacity: clamp01(tip * 2),
                  ...el('tooltip'),
                }}
              >
                {p.tip}
              </div>
            )}

            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: `${60 / Math.max(1, bars.length)}%` }}>
              {bars.map((b, i) => {
                const isHot = i === hot;
                // The highlighted bar comes up LAST and overshoots — it is the point of the card.
                const at = p.firstAt + (isHot ? bars.length * p.stagger + 240 : i * p.stagger);
                const gAt = (ms: number) => spring({
                  frame: fr(ms - at), fps: FPS,
                  config: isHot
                    ? { damping: 13, mass: 0.7, stiffness: 190 }
                    : { damping: 200, mass: 0.6, stiffness: 170 },
                  durationInFrames: Math.max(1, Math.round(fr(isHot ? 620 : 420))),
                });
                const g = gAt(timeMs);
                // MOTION BLUR on the hero: the highlighted bar's tip velocity drives a smear +
                // squash-and-stretch that dies the frame its overshoot spring settles.
                const sm = isHot ? smear(0, vel((ms) => gAt(ms) * plotH * (b.h / 100), timeMs), 1.1) : null;
                return (
                  <span key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                    <span
                      style={{
                        height: `${(plotH * (b.h / 100) * g).toFixed(2)}px`,
                        background: isHot
                          ? `linear-gradient(180deg, ${p.accent}, ${rgba(p.accent, 0.55)})`
                          : p.bar,
                        borderRadius: 4,
                        boxShadow: isHot && p.glow > 0 ? `0 0 ${p.size * 0.9}px ${rgba(p.accent, 0.55 * p.glow)}` : undefined,
                        filter: sm && sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                        transform: sm ? `scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})` : undefined,
                        transformOrigin: 'bottom center',
                      }}
                    />
                    <span style={{ fontSize: p.size * 0.2, color: p.dim, textAlign: 'center', marginTop: p.size * 0.12 }}>
                      {b.label}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          <div style={luxeGrain(0.05)} />
        </div>

        {p.fill && <div style={luxeVignette(0.4)} />}
      </div>
    );
  },
});
