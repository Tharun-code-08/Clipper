// Reference: graphics/wins-vs-losses.mp4  (usable window 7880-12440ms — the capture's first phase
// is off the front of the loop)
// Two bar charts in sequence: gainers growing UP off a baseline, a caption card between them, then
// losers growing DOWN. The baseline stays put across both phases, which is what makes the second
// set read as the mirror of the first rather than a new chart.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGlow, luxeLabel } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_BARS = 6;

/** "Flame Tree Group|5.93" -> label + value. */
function parse(raw: string) {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_BARS).map((l) => {
    const [label = '', v = '0'] = l.split('|').map((s) => s.trim());
    return { label, value: Math.abs(parseFloat(v) || 0) };
  });
}

export const gainersLosers = defineGraphicsTemplate({
  id: 'gainers_losers',
  name: 'Gainers & Losers',
  category: 'money',
  tags: ['Chart', 'Finance', 'Comparison', 'Luxury'],
  design: { w: 900, h: 1250 },
  defaultDurationMs: 8000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 98 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'chart',   label: 'Chart', hideable: false },
    { key: 'caption', label: 'Caption' },
    { key: 'bridge',  label: 'Bridge card' },
    ...Array.from({ length: MAX_BARS }, (_, i) => ({ key: `bar${i + 1}`, label: `Bar ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'gainers', label: 'Gainers', group: 'Content', multiline: true, maxLength: 300,
      default: 'Flame Tree Group|5.93\nAfrica Mega Agricorp|4.99\nKenya Airways|3.00\nUnihorn Supermarket|1.49\nNairobi Ventures|1.33',
      help: 'One per line: label | percent.' },
    { type: 'text', key: 'losers', label: 'Losers', group: 'Content', multiline: true, maxLength: 300,
      default: 'CIC Insurance|4.54\nKenya Re|1.85\nEveready East Africa|1.61\nStanchart Kenya|1.48\nBritam Holdings|1.18' },
    { type: 'text', key: 'upTitle', label: 'Gainers caption', group: 'Content', default: 'Top Gainers', maxLength: 28 },
    { type: 'text', key: 'downTitle', label: 'Losers caption', group: 'Content', default: 'Top Losers', maxLength: 28 },
    { type: 'text', key: 'bridge',  label: 'Bridge card', group: 'Content', default: 'Now the Declines', maxLength: 32 },

    { type: 'color',  key: 'up',   label: 'Gainers',  group: 'Style', default: '#4ADE80' },
    { type: 'color',  key: 'down', label: 'Losers',   group: 'Style', default: '#E5484D' },
    { type: 'color',  key: 'ink',  label: 'Text',     group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',  label: 'Labels',   group: 'Style', default: '#B8B4A9' },
    { type: 'font',   key: 'font', label: 'Font',     group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size', label: 'Caption size', group: 'Style', default: 42, min: 10, max: 80, step: 2, unit: 'px' },
    { type: 'number', key: 'label', label: 'Bar label size', group: 'Style', default: 20, min: 6, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'gap',  label: 'Bar gap',  group: 'Style', default: 18, min: 0, max: 80, step: 2, unit: 'px' },

    { type: 'number', key: 'upAt',    label: 'Gainers at', group: 'Motion', default: 6400, min: 0, max: 12000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Bar stagger', group: 'Motion', default: 70, min: 0, max: 700, step: 10, unit: 'ms' },
    { type: 'number', key: 'bridgeAt', label: 'Bridge at', group: 'Motion', default: 5200, min: 0, max: 9000, step: 50, unit: 'ms' },
    { type: 'number', key: 'downAt',  label: 'Losers at',  group: 'Motion', default: 100, min: 0, max: 12000, step: 50, unit: 'ms' },
  ],

  // Two swishes for the two bar waves, a glass ping on the bridge card between them, and the
  // coin exactly where the LAST gainer bar lands — the win is the one beat you hear paid off.
  sfx: (p) => {
    const nUp = Math.max(1, parse(p.gainers).length);
    return [
      { atMs: p.downAt, id: 'swish', gain: 0.45 },
      { atMs: p.bridgeAt, id: 'glass', gain: 0.4 },
      { atMs: p.upAt, id: 'swish', gain: 0.45 },
      { atMs: p.upAt + (nUp - 1) * p.stagger + 300, id: 'coin', gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const ups = parse(p.gainers);
    const downs = parse(p.losers);

    // The reference opens on the DECLINES and turns to the gainers afterwards. The bridge card owns
    // the middle of the timeline; before it we show losers, after it gainers.
    const bridge = interpolate(timeMs, [p.bridgeAt, p.bridgeAt + 400, p.upAt - 300, p.upAt], [0, 1, 1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const phaseDown = timeMs < (p.bridgeAt + p.upAt) / 2;
    const rows = phaseDown ? downs : ups;
    const colour = phaseDown ? p.down : p.up;
    const startAt = phaseDown ? p.downAt : p.upAt;
    const caption = phaseDown ? p.downTitle : p.upTitle;

    const peak = Math.max(1e-6, ...rows.map((r) => r.value));
    // Baseline is fixed for BOTH phases — that is what makes the second set read as a mirror.
    const baseY = height * 0.38;
    const maxH = height * 0.34;

    const capIn = spring({
      frame: fr(timeMs - startAt), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 175 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });

    // Depth: the whole chart floats in 3D over the footage — a gentle swing at the open and a
    // ±1.5° sway it never flattens out of; the caption shears over the bars at its own depth.
    const rootIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 30, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const pose = depthPose(timeMs, seed, { enter: rootIn, rx: -8, z: -50, swayDeg: 1.5, periodMs: 4200 });
    const parCap = parallax(timeMs, seed, 0.5, height * 0.008, 4200);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: ff, transform: pose, transformOrigin: '50% 40%', ...el('chart') }}>
        {/* the shared baseline both phases grow off — a dashed hairline, documentary-chart style */}
        <div style={{ position: 'absolute', left: '6%', right: '6%', top: baseY - 1, borderTop: '1.5px dashed rgba(255,255,255,0.2)' }} />
        <div
          style={{
            position: 'absolute', left: '6%', right: '6%', top: baseY - (phaseDown ? 0 : maxH),
            height: maxH,
            display: 'flex', alignItems: phaseDown ? 'flex-start' : 'flex-end',
            justifyContent: 'center', gap: p.gap,
            opacity: 1 - bridge,
          }}
        >
          {rows.map((r, i) => {
            const sAt = (ms: number) => spring({
              frame: fr(ms - startAt - i * p.stagger), fps: FPS,
              config: { damping: 26, mass: 0.8, stiffness: 150 },
              durationInFrames: Math.max(1, Math.round(fr(560))),
            });
            const s = sAt(timeMs);
            const h = (r.value / peak) * maxH * s;
            // Z-STAGGER: each bar swings up (or down) off the baseline at its own slightly
            // different hinge angle, so the wave reads as objects arriving in space; the tip
            // velocity drives a smear that dies the frame the bar settles.
            const sm = smear(0, vel((ms) => sAt(ms) * (r.value / peak) * maxH, timeMs));
            return (
              <div
                key={i}
                style={{
                  flex: 1, height: h,
                  // bright at the tip, fading toward the shared baseline
                  background: `linear-gradient(${phaseDown ? 0 : 180}deg, ${colour} 0%, ${rgba(colour, 0.45)} 100%)`,
                  boxShadow: `0 0 ${Math.round(p.label * 0.9)}px ${rgba(colour, 0.28)}`,
                  borderRadius: phaseDown ? `0 0 ${width * 0.006}px ${width * 0.006}px` : `${width * 0.006}px ${width * 0.006}px 0 0`,
                  position: 'relative',
                  filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(s, { rx: (phaseDown ? 1 : -1) * (14 + (i % 3) * 3), z: -70 })} scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
                  transformOrigin: phaseDown ? 'top center' : 'bottom center',
                  ...el(`bar${i + 1}`),
                }}
              >
                <span
                  style={{
                    position: 'absolute', left: 0, right: 0,
                    [phaseDown ? 'top' : 'bottom']: `calc(100% + ${p.label * 0.4}px)`,
                    textAlign: 'center', fontSize: p.label * 0.9, color: p.dim, lineHeight: 1.2,
                    textShadow: '0 1px 10px rgba(0,0,0,0.5)',
                    opacity: clamp01(s * 1.6),
                  }}
                >
                  {r.label}
                </span>
                <span
                  style={{
                    position: 'absolute', left: 0, right: 0,
                    [phaseDown ? 'bottom' : 'top']: `calc(100% + ${p.label * 0.3}px)`,
                    textAlign: 'center', fontSize: p.label, color: colour, fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    textShadow: `0 1px 10px rgba(0,0,0,0.5), 0 0 16px ${rgba(colour, 0.35)}`,
                    opacity: clamp01(s * 1.6),
                  }}
                >
                  {phaseDown ? '-' : '+'}{r.value.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            // Caption always sits on the empty side of the baseline, so it never lands on the bars.
            position: 'absolute', left: 0, right: 0,
            top: phaseDown ? baseY - maxH * 0.55 - p.size * 1.5 : baseY + maxH * 0.55,
            textAlign: 'center',
            fontSize: p.size, fontWeight: 700, color: p.ink,
            letterSpacing: '0.01em',
            textShadow: '0 2px 18px rgba(0,0,0,0.45)',
            opacity: clamp01(capIn * 1.6) * (1 - bridge),
            transform: `translate(${parCap.x.toFixed(2)}px, ${(parCap.y + (1 - capIn) * height * 0.015).toFixed(2)}px)`,
            ...el('caption'),
          }}
        >
          {caption}
        </div>

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: '46%',
            textAlign: 'center',
            ...luxeLabel(p.size * 0.85, LUXE.gold),
            textShadow: luxeGlow(LUXE.gold, 0.8),
            opacity: bridge,
            // The bridge card swings through the same 3D space on its own ramp — in on the way
            // up, back out as the gainers take over.
            transform: `${swingIn(bridge, { rx: -14, z: -80 })} translateY(${((1 - bridge) * height * 0.02).toFixed(2)}px)`,
            transformOrigin: 'center center',
            ...el('bridge'),
          }}
        >
          {p.bridge}
        </div>
      </div>
    );
  },
});
