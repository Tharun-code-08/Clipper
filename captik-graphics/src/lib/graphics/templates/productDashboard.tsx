// Reference: graphics/terminal-showcase.mp4  (window 0-4480ms, cards settled ~3680ms)
// A dark SaaS dashboard assembling: brand, a bar-chart card with a counting figure, an insights
// card with a sparkline, a metrics list, and a CTA tile. Cards arrive on a diagonal — top-left
// first, bottom-right last — which is what makes the grid feel laid out rather than switched on.

import type { CSSProperties, ReactNode } from 'react';
import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const BARS = 6;
const SPARK = 22;

/** 49200 -> "49.2K" */
function compact(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return Math.round(n).toString();
}

export const productDashboard = defineGraphicsTemplate({
  id: 'product_dashboard',
  name: 'Product Dashboard',
  category: 'device',
  tags: ['SaaS', 'Dashboard', 'Product', 'Luxury'],
  design: { w: 900, h: 1250 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 94 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'board',   label: 'Board', hideable: false },
    { key: 'brand',   label: 'Brand' },
    { key: 'metrics', label: 'Metrics card' },
    { key: 'insights', label: 'Insights card' },
    { key: 'stats',   label: 'Stats card' },
    { key: 'cta',     label: 'CTA tile' },
  ],

  params: [
    { type: 'text',   key: 'brand',  label: 'Brand',   group: 'Content', default: 'NEXA AI', maxLength: 24 },
    { type: 'text',   key: 'title',  label: 'Card title', group: 'Content', default: 'Launch Metrics', maxLength: 28 },
    { type: 'text',   key: 'sub',    label: 'Card subtitle', group: 'Content', default: 'Realtime performance', maxLength: 32 },
    { type: 'text',   key: 'metric', label: 'Metric label', group: 'Content', default: 'Active Nodes', maxLength: 24 },
    { type: 'number', key: 'value',  label: 'Metric value', group: 'Content', default: 49200, min: 1, max: 100000000, step: 100 },
    { type: 'text',   key: 'delta',  label: 'Growth',  group: 'Content', default: '+18.4%', maxLength: 12 },
    { type: 'text',   key: 'rows',   label: 'Stat rows', group: 'Content', multiline: true, maxLength: 200,
      default: 'Uptime|99.98%\nLatency|120ms\nErrors|0.02%', help: 'One per line: label | value.' },
    { type: 'text',   key: 'cta',    label: 'CTA',     group: 'Content', default: 'Request Access', maxLength: 28 },

    { type: 'color',  key: 'bg',     label: 'Background', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'card',   label: 'Cards',      group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'accent', label: 'Accent',     group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Text',       group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',    label: 'Secondary',  group: 'Style', default: '#8B8779' },
    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Base size',  group: 'Style', default: 22, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Card corner', group: 'Style', default: 16, min: 0, max: 50, step: 2, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the background', group: 'Style', default: true },

    { type: 'number', key: 'brandAt', label: 'Brand at', group: 'Motion', default: 120, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'firstAt', label: 'First card at', group: 'Motion', default: 420, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Card stagger', group: 'Motion', default: 260, min: 0, max: 1200, step: 20, unit: 'ms' },
    { type: 'number', key: 'countMs', label: 'Counter runs', group: 'Motion', default: 2200, min: 200, max: 6000, step: 50, unit: 'ms' },
  ],

  // SaaS-luxe accents at low gains: a light pass for the brand, a glass ping as the first card
  // lands, a soft pop for the last tile on the diagonal, a quiet chime when the counter tops out.
  sfx: (p) => [
    { atMs: p.brandAt, id: 'swish', gain: 0.4 },
    { atMs: p.firstAt + 150, id: 'glass', gain: 0.45 },
    { atMs: p.firstAt + 3 * p.stagger + 150, id: 'pop', gain: 0.35 },
    { atMs: p.firstAt + p.countMs, id: 'chime', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const rows = p.rows.split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => { const [k = '', v = ''] = l.split('|').map((s) => s.trim()); return { k, v }; });

    const atAt = (k: number, ms: number) => spring({
      frame: fr(ms - p.firstAt - k * p.stagger), fps: FPS,
      config: { damping: 24, mass: 0.7, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const at = (k: number) => atAt(k, timeMs);
    const brandIn = spring({
      frame: fr(timeMs - p.brandAt), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const count = interpolate(timeMs, [p.firstAt, p.firstAt + p.countMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    const pad = width * 0.05;
    const gap = width * 0.028;
    const S = p.size;

    // DEPTH: the board is a SCREEN — it swings in as a plane and rests nearly still (sway 1.0);
    // each card folds in with its own 3D angle along the diagonal (z-stagger), smears with its
    // arrival velocity, and holds a slightly different parallax depth so the grid keeps
    // shearing gently instead of freezing into a flat mock.
    const boardIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const boardPose = depthPose(timeMs, seed, { enter: boardIn, ry: 13, rx: -8, z: -110, swayDeg: 1.0 });
    const parBrand = parallax(timeMs, seed, 0.35, width * 0.007);

    /** Shared card chrome; `k` is its slot on the diagonal. */
    const card = (k: number, style: CSSProperties, extra: CSSProperties, children: ReactNode) => {
      const s = at(k);
      const vy = vel((ms: number) => (1 - atAt(k, ms)) * height * 0.02, timeMs);
      const cSm = smear(0, vy, 2);
      const par = parallax(timeMs, seed, 0.15 + k * 0.07, width * 0.007);
      return (
        <div
          style={{
            background: `linear-gradient(180deg, ${p.card} 0%, ${LUXE.bg0} 100%)`,
            borderRadius: p.radius,
            border: `1px solid ${LUXE.hairline}`,
            boxShadow: `0 ${S * 0.8}px ${S * 2.4}px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)`,
            padding: S * 0.8, boxSizing: 'border-box',
            opacity: clamp01(s * 1.8),
            filter: cSm.blurPx > 0.3 ? `blur(${cSm.blurPx.toFixed(2)}px)` : undefined,
            transform: `${swingIn(s, { rx: -14, ry: k % 2 === 0 ? -10 : 10, z: -70 })} translate(${par.x.toFixed(2)}px, ${(par.y + (1 - s) * height * 0.02).toFixed(2)}px) scale(${(interpolate(s, [0, 1], [0.95, 1]) * cSm.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.95, 1]) * cSm.sy).toFixed(4)})`,
            ...style, ...extra,
          }}
        >
          {children}
        </div>
      );
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          padding: pad, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap,
          fontFamily: ff, color: p.ink,
          opacity: clamp01(boardIn * 2.2),
          transform: boardPose,
          ...el('board'),
        }}
      >
        <div
          style={{
            fontSize: S * 1.5, fontWeight: 700, letterSpacing: S * 0.02,
            opacity: clamp01(brandIn * 1.6),
            transform: `translate(${parBrand.x.toFixed(2)}px, ${(parBrand.y + (1 - brandIn) * height * 0.01).toFixed(2)}px)`,
            ...el('brand'),
          }}
        >
          {p.brand}
        </div>

        <div style={{ display: 'flex', gap, flex: 1.35, minHeight: 0 }}>
          {card(0, { flex: 1.7, display: 'flex', flexDirection: 'column' }, el('metrics'), (
            <>
              <span style={{ fontSize: S * 0.9, fontWeight: 600 }}>{p.title}</span>
              <span style={{ fontSize: S * 0.6, color: p.dim, marginTop: S * 0.1 }}>{p.sub}</span>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: S * 0.4, marginTop: S * 0.6 }}>
                {Array.from({ length: BARS }).map((_, i) => {
                  const h = (0.3 + random(`${seed}b${i}`) * 0.7) * (0.5 + (i / BARS) * 0.7);
                  return (
                    <div
                      key={i}
                      style={{
                        flex: 1, height: `${(h * 100 * clamp01(at(0))).toFixed(1)}%`,
                        background: i === BARS - 1 ? p.accent : rgba(p.accent, 0.45),
                        borderRadius: S * 0.16,
                      }}
                    />
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: S * 0.5 }}>
                <span style={{ fontSize: S * 0.6, color: p.dim }}>{p.metric}</span>
                <span style={{ fontSize: S * 1.1, fontWeight: 700 }}>{compact(p.value * count)}</span>
              </div>
            </>
          ))}

          {card(1, { flex: 1, display: 'flex', flexDirection: 'column' }, el('insights'), (
            <>
              <span style={{ fontSize: S * 0.8, fontWeight: 600 }}>Insights</span>
              <span style={{ fontSize: S * 0.55, color: p.dim, marginTop: S * 0.4 }}>Growth</span>
              <span style={{ fontSize: S * 0.85, fontWeight: 700, color: p.accent }}>{p.delta}</span>
              <svg viewBox="0 0 100 40" style={{ width: '100%', height: S * 2.2, marginTop: S * 0.3 }}>
                <polyline
                  points={Array.from({ length: SPARK }, (_, i) =>
                    `${(i / (SPARK - 1)) * 100},${34 - (i / (SPARK - 1)) * 22 - random(`${seed}s${i}`) * 6}`).join(' ')}
                  fill="none" stroke={p.accent} strokeWidth={2}
                  pathLength={1} strokeDasharray={1} strokeDashoffset={1 - clamp01(at(1))}
                />
              </svg>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: S * 0.5, color: p.dim }}>Auto-Sync</span>
                <span style={{ width: S * 1.5, height: S * 0.8, borderRadius: 999, background: rgba(p.accent, 0.3), display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: 2, boxSizing: 'border-box' }}>
                  <span style={{ width: S * 0.62, height: S * 0.62, borderRadius: '50%', background: p.ink }} />
                </span>
              </div>
            </>
          ))}
        </div>

        <div style={{ display: 'flex', gap, flex: 1, minHeight: 0 }}>
          {card(2, { flex: 1.7, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: S * 0.45 }, el('stats'), (
            rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: S * 0.62 }}>
                <span style={{ color: p.dim }}>{r.k}</span>
                <span style={{ fontWeight: 600 }}>{r.v}</span>
              </div>
            ))
          ))}

          {card(3, {
            flex: 1,
            background: `linear-gradient(150deg, ${rgba(p.accent, 0.35)}, ${rgba(p.card, 1)} 70%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          }, el('cta'), (
            <span style={{ fontSize: S * 0.72, fontWeight: 600 }}>{p.cta}</span>
          ))}
        </div>
      </div>
    );
  },
});
