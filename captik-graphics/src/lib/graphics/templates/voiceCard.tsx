// Reference: text/generate-ai-voice-animation.mp4  (window 0-4800ms, copy set by ~2680ms)
// A dark product panel — headline, one line of copy, a small pill, and a live equaliser along the
// bottom. The bars are the piece: a symmetric envelope (tall in the middle, short at the ends)
// modulated per bar by its own seeded phase, so it reads as audio rather than a sine wave.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MAX_BARS = 40;

export const voiceCard = defineGraphicsTemplate({
  id: 'voice_card',
  name: 'Voice Panel',
  category: 'device',
  tags: ['Audio', 'Product', 'Waveform'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'panel', label: 'Panel', hideable: false },
    { key: 'glow',  label: 'Glow' },
    { key: 'title', label: 'Headline' },
    { key: 'sub',   label: 'Subtitle' },
    { key: 'cta',   label: 'Pill' },
    { key: 'wave',  label: 'Waveform' },
  ],

  params: [
    { type: 'text', key: 'title', label: 'Headline', group: 'Content', default: 'Generate AI Voice', maxLength: 40 },
    { type: 'text', key: 'sub',   label: 'Subtitle', group: 'Content', default: 'Instant speech from any script', maxLength: 60 },
    { type: 'text', key: 'cta',   label: 'Pill',     group: 'Content', default: 'Try it now', maxLength: 24 },

    { type: 'color',  key: 'bg',    label: 'Panel',    group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'accent', label: 'Accent',  group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',   label: 'Headline', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Subtitle', group: 'Style', default: '#8F8B80' },
    { type: 'font',   key: 'font',  label: 'Font',     group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Headline size', group: 'Style', default: 74, min: 16, max: 140, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',  group: 'Style', default: 0, min: 0, max: 80, step: 2, unit: 'px' },
    { type: 'boolean', key: 'glow', label: 'Corner glow', group: 'Style', default: true },

    { type: 'number', key: 'bars',   label: 'Bars',      group: 'Waveform', default: 30, min: 6, max: 40, step: 1 },
    { type: 'number', key: 'waveH',  label: 'Bar height', group: 'Waveform', default: 130, min: 20, max: 400, step: 5, unit: 'px' },
    { type: 'number', key: 'speed',  label: 'Bar speed',  group: 'Waveform', default: 1.5, min: 0.1, max: 6, step: 0.1 },

    { type: 'number', key: 'titleAt', label: 'Headline at', group: 'Motion', default: 220, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Copy stagger', group: 'Motion', default: 260, min: 0, max: 900, step: 20, unit: 'ms' },
  ],

  // PHYSICAL cues only. This panel depicts a voice being generated — scoring the waveform would
  // be putting words in a mouth we cannot provide, so the equaliser stays silent and only the two
  // real UI events are voiced: the panel arriving, and the pill landing. Both off titleAt/stagger.
  sfx: (p) => [
    { atMs: p.titleAt, id: 'whoosh', gain: 0.4 },
    { atMs: p.titleAt + p.stagger * 2, id: 'pop', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const n = Math.min(MAX_BARS, Math.round(p.bars));

    const stepAt = (k: number) => (ms: number) => spring({
      frame: fr(ms - p.titleAt - k * p.stagger), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const step = (k: number) => stepAt(k)(timeMs);
    const panelIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    // The panel is a DEVICE SCREEN filling its box, so it swings in through space and then lands
    // DEAD FLAT — swayDeg 0 means the pose resolves to an exact identity at rest, which is the
    // only way a full-bleed screen can be posed without a hairline of footage showing at an edge.
    // All of the panel's life at rest comes from its content parallaxing instead.
    const panelPose = depthPose(timeMs, seed, { enter: panelIn, rx: -8, ry: 6, z: -90, swayDeg: 0 });
    // Screen-content depths, deliberately shallow: light source furthest back, pill proudest.
    const parGlow = parallax(timeMs, seed, 0.4, height * 0.005, 5200);
    const parTitle = parallax(timeMs, seed, 0.12, height * 0.005, 5200);
    const parSub = parallax(timeMs, seed, 0.18, height * 0.005, 5200);
    const parPill = parallax(timeMs, seed, 0.35, height * 0.005, 5200);
    const parWave = parallax(timeMs, seed, 0.22, height * 0.005, 5200);
    // Honest arrival smear on the copy: it travels ~20px, so this is a whisper that is gone the
    // frame each line seats — a product panel must read razor-sharp when it holds.
    const riseAt = (k: number, amt: number) => (ms: number) => (1 - stepAt(k)(ms)) * amt;
    const titleSm = smear(0, -vel(riseAt(0, height * 0.014), timeMs), 1.4);
    const subSm = smear(0, -vel(riseAt(1, height * 0.012), timeMs), 1.4);
    const pillScaleAt = (ms: number) => interpolate(stepAt(2)(ms), [0, 1], [0.8, 1]);
    const pillSm = smear(vel(pillScaleAt, timeMs) * p.size * 1.6, 0, 1.3);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.bg, borderRadius: p.radius,
          fontFamily: ff, boxSizing: 'border-box',
          // Deep symmetric padding: the reference's block sits in the MIDDLE of the frame, not
          // pinned under the top edge.
          padding: `${width * 0.371}px ${width * 0.06}px`,
          display: 'flex', flexDirection: 'column',
          opacity: clamp01(panelIn),
          transform: panelPose,
          ...el('panel'),
        }}
      >
        {p.glow && (
          <div
            style={{
              position: 'absolute', left: '20%', top: '30%',
              width: width * 0.5, height: width * 0.5, borderRadius: '50%',
              background: `radial-gradient(circle, ${rgba('#F59E0B', 0.18)}, ${rgba('#F59E0B', 0)} 68%)`,
              transform: `translate(${parGlow.x.toFixed(2)}px, ${parGlow.y.toFixed(2)}px)`,
              ...el('glow'),
            }}
          />
        )}

        <div
          style={{
            position: 'relative',
            fontSize: p.size, fontWeight: 700, color: p.ink, lineHeight: 1.12,
            letterSpacing: -p.size * 0.02,
            opacity: clamp01(step(0) * 1.6),
            filter: titleSm.blurPx > 0.3 ? `blur(${titleSm.blurPx.toFixed(2)}px)` : undefined,
            transform: `${swingIn(step(0), { rx: -9, ry: 15, z: -60 })} translate(${parTitle.x.toFixed(2)}px, ${(parTitle.y + (1 - step(0)) * height * 0.014).toFixed(2)}px) scale(${titleSm.sx.toFixed(4)}, ${titleSm.sy.toFixed(4)})`,
            transformOrigin: 'left center',
            ...el('title'),
          }}
        >
          {p.title}
        </div>

        <div
          style={{
            position: 'relative', marginTop: p.size * 0.32,
            fontSize: p.size * 0.36, color: p.dim, lineHeight: 1.4,
            opacity: clamp01(step(1) * 1.6),
            filter: subSm.blurPx > 0.3 ? `blur(${subSm.blurPx.toFixed(2)}px)` : undefined,
            transform: `${swingIn(step(1), { rx: -7, ry: 13, z: -50 })} translate(${parSub.x.toFixed(2)}px, ${(parSub.y + (1 - step(1)) * height * 0.012).toFixed(2)}px) scale(${subSm.sx.toFixed(4)}, ${subSm.sy.toFixed(4)})`,
            transformOrigin: 'left center',
            ...el('sub'),
          }}
        >
          {p.sub}
        </div>

        <div
          style={{
            position: 'relative', marginTop: p.size * 0.5, alignSelf: 'flex-start',
            background: `linear-gradient(160deg, rgba(255,255,255,0.16) 0%, rgba(0,0,0,0.14) 100%), ${p.accent}`,
            color: '#171307',
            borderRadius: 999, padding: `${p.size * 0.16}px ${p.size * 0.42}px`,
            fontSize: p.size * 0.3, fontWeight: 700, letterSpacing: '0.02em',
            boxShadow: `0 0 ${p.size * 0.4}px ${rgba(p.accent, 0.3)}, inset 0 1px 0 rgba(255,255,255,0.3)`,
            opacity: clamp01(step(2) * 1.6),
            filter: pillSm.blurPx > 0.3 ? `blur(${pillSm.blurPx.toFixed(2)}px)` : undefined,
            transform: `${swingIn(step(2), { rx: -12, ry: 18, z: -70 })} translate(${parPill.x.toFixed(2)}px, ${parPill.y.toFixed(2)}px) scale(${(pillScaleAt(timeMs) * pillSm.sx).toFixed(4)}, ${(pillScaleAt(timeMs) * pillSm.sy).toFixed(4)})`,
            transformOrigin: 'left center',
            ...el('cta'),
          }}
        >
          {p.cta}
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            position: 'relative', alignSelf: 'center', width: '52%',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            height: p.waveH, gap: width * 0.004,
            filter: `drop-shadow(0 0 ${Math.round(p.waveH * 0.08)}px ${rgba(p.accent, 0.4)})`,
            opacity: clamp01(step(1)),
            transform: `translate(${parWave.x.toFixed(2)}px, ${parWave.y.toFixed(2)}px)`,
            ...el('wave'),
          }}
        >
          {Array.from({ length: n }).map((_, i) => {
            const u = i / (n - 1);
            // Envelope: tall in the middle, short at the ends — the shape of a spoken burst.
            const env = 0.25 + 0.75 * Math.pow(Math.sin(u * Math.PI), 0.7);
            const ph = random(`${seed}w${i}`) * Math.PI * 2;
            const wob = 0.78 + 0.22 * Math.sin((timeMs / 1000) * p.speed * Math.PI * 2 + ph);
            const h = Math.max(3, p.waveH * env * wob);
            return (
              <div
                key={i}
                style={{
                  flex: 1, height: h, borderRadius: 999,
                  background: p.accent,
                  opacity: 0.55 + 0.45 * wob,
                }}
              />
            );
          })}
        </div>

        <div style={luxeVignette(0.45)} />
        <div style={luxeGrain(0.05)} />
      </div>
    );
  },
});
