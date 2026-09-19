// Reference: graphics/saas-security.mp4  (window 480-12200ms, headline 480ms, panel through ~9000ms)
// A security panel that scans: a sweep line crosses the map area, threat rows appear by severity,
// a risk score counts up, and the status flips from Scanning to Scan Complete.
//
// The status, the sweep and the score all read the SAME progress value, so the panel can never say
// "complete" while the bar is still moving.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_ROWS = 5;
const BLIPS = 7;

export const securityScan = defineGraphicsTemplate({
  id: 'security_scan',
  name: 'Security Scan',
  category: 'device',
  tags: ['Security', 'Dashboard', 'Scan'],
  design: { w: 900, h: 1250 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 11700,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['inter'],

  elements: [
    { key: 'panel',  label: 'Panel', hideable: false },
    { key: 'title',  label: 'Headline' },
    { key: 'status', label: 'Status' },
    { key: 'radar',  label: 'Scan area' },
    { key: 'rows',   label: 'Threat rows' },
    { key: 'score',  label: 'Risk score' },
  ],

  params: [
    { type: 'text',   key: 'title',  label: 'Headline', group: 'Content', default: 'Continuous Attack Surface Monitoring', maxLength: 60 },
    { type: 'text',   key: 'busy',   label: 'While scanning', group: 'Content', default: 'Scanning...', maxLength: 28 },
    { type: 'text',   key: 'doneLabel', label: 'When complete', group: 'Content', default: 'Scan Complete', maxLength: 28 },
    { type: 'text',   key: 'rows',   label: 'Threat rows', group: 'Content', multiline: true, maxLength: 200,
      default: 'CRITICAL|3|#E5484D\nHIGH|9|#E8873B\nMEDIUM|17|#D9B84A\nLOW|27|#7A93B2',
      help: 'One per line: label | count | colour.' },
    { type: 'text',   key: 'scoreLabel', label: 'Score label', group: 'Content', default: 'Risk Score', maxLength: 24 },
    { type: 'number', key: 'score',  label: 'Final score', group: 'Content', default: 73, min: 0, max: 100, step: 1 },

    { type: 'color',  key: 'bg',     label: 'Background', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'card',   label: 'Panel',      group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'accent', label: 'Accent',     group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Text',       group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',    label: 'Secondary',  group: 'Style', default: '#8F8B80' },
    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',   label: 'Base size',  group: 'Style', default: 22, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',     group: 'Style', default: 16, min: 0, max: 50, step: 2, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the background', group: 'Style', default: true },

    { type: 'number', key: 'titleAt', label: 'Headline at', group: 'Motion', default: 150, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'panelAt', label: 'Panel at',    group: 'Motion', default: 700, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'scanMs',  label: 'Scan runs',   group: 'Motion', default: 4200, min: 300, max: 12000, step: 100, unit: 'ms' },
  ],

  // DOCU-quiet tech: soft air under the headline, a rounded blip as the first threats surface,
  // ONE tick mid-count, and the chime when the scan completes — all reading the same scan clock.
  sfx: (p) => [
    { atMs: p.titleAt + 20, id: 'whoosh', gain: 0.35 },
    { atMs: p.panelAt + 500, id: 'blip', gain: 0.4 },
    { atMs: p.panelAt + p.scanMs * 0.5, id: 'tick', gain: 0.35 },
    { atMs: p.panelAt + p.scanMs, id: 'chime', gain: 0.55 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const rows = p.rows.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_ROWS)
      .map((l) => { const [label = '', n = '0', colour = '#888'] = l.split('|').map((s) => s.trim()); return { label, n, colour }; });

    const titleIn = spring({
      frame: fr(timeMs - p.titleAt), fps: FPS,
      config: { damping: 26, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const panelInAt = (ms: number) => spring({
      frame: fr(ms - p.panelAt), fps: FPS,
      config: { damping: 24, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });
    const panelIn = panelInAt(timeMs);
    // ONE progress value: status, sweep and score all read this.
    const scan = interpolate(timeMs, [p.panelAt, p.panelAt + p.scanMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const complete = scan >= 1;

    // DEPTH: the dashboard card swings in as a plane (top hinge, arrival smear that dies as it
    // seats) and then rests nearly still — 0.9°, it is a monitoring panel, not a floating title.
    // Its regions parallax at 0.2-0.35 depths so the long scan never reads as a flat print.
    const cardPose = depthPose(timeMs, seed, { enter: panelIn, rx: -14, z: -120, swayDeg: 0.9, periodMs: 5200 });
    const cardSmear = smear(0, vel((ms: number) => (1 - panelInAt(ms)) * height * 0.08, timeMs));
    const parStatus = parallax(timeMs, seed, 0.2, width * 0.006, 5200);
    const parRadar = parallax(timeMs, seed, 0.3, width * 0.006, 5200);
    const parRows = parallax(timeMs, seed, 0.24, width * 0.006, 5200);
    const parScore = parallax(timeMs, seed, 0.35, width * 0.006, 5200);

    const S = p.size;
    const pad = width * 0.05;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? `radial-gradient(110% 70% at 50% 40%, ${rgba(p.accent, 0.1)}, ${p.bg} 70%)` : 'transparent',
          padding: pad, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: S,
          fontFamily: ff, color: p.ink,
          ...el('panel'),
        }}
      >
        <div
          style={{
            fontSize: S * 1.25, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em',
            opacity: clamp01(titleIn * 1.6),
            transform: `translateY(${((1 - titleIn) * height * 0.012).toFixed(2)}px)`,
            ...el('title'),
          }}
        >
          {p.title}
        </div>

        <div
          style={{
            flex: 1, minHeight: 0,
            background: `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.3) 100%), ${p.card}`,
            borderRadius: p.radius,
            border: `1px solid ${rgba(p.accent, 0.16)}`,
            boxShadow: `0 ${S * 0.8}px ${S * 2.4}px ${rgba('#000000', 0.45)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
            padding: S * 0.9, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: S * 0.7,
            opacity: clamp01(panelIn * 1.8),
            filter: cardSmear.blurPx > 0.3 ? `blur(${cardSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${cardPose} translateY(${((1 - panelIn) * height * 0.018).toFixed(2)}px) scale(${cardSmear.sx.toFixed(4)}, ${cardSmear.sy.toFixed(4)})`,
            transformOrigin: 'top center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: S * 0.4, fontSize: S * 0.7, transform: `translate(${parStatus.x.toFixed(2)}px, ${parStatus.y.toFixed(2)}px)`, ...el('status') }}>
            <span style={{ width: S * 0.4, height: S * 0.4, borderRadius: '50%', background: complete ? '#4ADE80' : p.accent, boxShadow: `0 0 ${S * 0.6}px ${rgba(complete ? '#4ADE80' : p.accent, 0.55)}` }} />
            <span style={{ color: complete ? '#4ADE80' : p.accent, fontWeight: 600, letterSpacing: '0.06em' }}>
              {complete ? p.doneLabel : p.busy}
            </span>
            <span style={{ marginLeft: 'auto', color: p.dim }}>{Math.round(scan * 100)}%</span>
          </div>

          <div
            style={{
              position: 'relative', height: height * 0.16,
              background: rgba('#000000', 0.3), borderRadius: p.radius * 0.6,
              border: '1px solid rgba(255,255,255,0.07)', boxSizing: 'border-box',
              overflow: 'hidden',
              transform: `translate(${parRadar.x.toFixed(2)}px, ${parRadar.y.toFixed(2)}px)`,
              ...el('radar'),
            }}
          >
            {Array.from({ length: BLIPS }).map((_, i) => {
              const bx = random(`${seed}bx${i}`);
              const by = random(`${seed}by${i}`);
              // A blip lights only once the sweep has passed its column.
              const lit = scan > bx ? 1 : 0;
              return (
                <span
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${bx * 100}%`, top: `${10 + by * 78}%`,
                    width: S * 0.28, height: S * 0.28, borderRadius: '50%',
                    background: p.accent,
                    opacity: lit * (0.5 + 0.5 * Math.sin(timeMs / 400 + i)),
                    boxShadow: `0 0 ${S}px ${rgba(p.accent, 0.7 * lit)}`,
                  }}
                />
              );
            })}
            <span
              style={{
                position: 'absolute', top: 0, bottom: 0, left: `${scan * 100}%`,
                width: 2, background: p.accent,
                opacity: complete ? 0 : 1,
                boxShadow: `0 0 ${S * 1.2}px ${rgba(p.accent, 0.9)}`,
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: S * 0.42, transform: `translate(${parRows.x.toFixed(2)}px, ${parRows.y.toFixed(2)}px)`, ...el('rows') }}>
            {rows.map((r, i) => {
              const s = spring({
                frame: fr(timeMs - p.panelAt - 400 - i * 420), fps: FPS,
                config: { damping: 26, mass: 0.6, stiffness: 180 },
                durationInFrames: Math.max(1, Math.round(fr(420))),
              });
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: S * 0.5, fontSize: S * 0.62,
                    opacity: clamp01(s * 1.8),
                    // Z-STAGGER: each severity row hinges in from the side at its own angle.
                    transform: `${swingIn(s, { ry: -12 - (i % 3) * 4, z: -50 })} translateX(${((1 - s) * width * 0.02).toFixed(2)}px)`,
                    transformOrigin: 'left center',
                  }}
                >
                  <span style={{ background: r.colour, color: '#0F0E0B', borderRadius: 4, padding: `${S * 0.1}px ${S * 0.32}px`, fontWeight: 700, letterSpacing: '0.08em', minWidth: S * 3.4, textAlign: 'center' }}>
                    {r.label}
                  </span>
                  <span style={{ flex: 1, height: 4, borderRadius: 999, background: rgba(p.dim, 0.25), overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${(clamp01(s) * 100).toFixed(0)}%`, background: r.colour }} />
                  </span>
                  <span style={{ color: p.dim, minWidth: S * 1.6, textAlign: 'right' }}>{r.n}</span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 'auto', transform: `translate(${parScore.x.toFixed(2)}px, ${parScore.y.toFixed(2)}px)`, ...el('score') }}>
            <div style={{ fontSize: S * 0.52, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: p.dim }}>{p.scoreLabel}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: S * 0.3 }}>
              <span style={{ fontSize: S * 1.6, fontWeight: 700, color: p.accent, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 ${S * 0.7}px ${rgba(p.accent, 0.45)}, 0 0 ${S * 2.1}px ${rgba(p.accent, 0.2)}` }}>{Math.round(p.score * scan)}</span>
              <span style={{ fontSize: S * 0.6, color: p.dim }}>/ 100</span>
            </div>
            <div style={{ marginTop: S * 0.3, height: 5, borderRadius: 999, background: rgba(p.dim, 0.22), overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(scan * (p.score / 100) * 100).toFixed(1)}%`, background: `linear-gradient(90deg, ${p.accent}, #E5484D)`, boxShadow: `0 0 8px ${rgba(p.accent, 0.4)}` }} />
            </div>
          </div>
        </div>

        {p.fill && <div style={luxeVignette(0.4)} />}
        {p.fill && <div style={luxeGrain(0.045)} />}
      </div>
    );
  },
});
