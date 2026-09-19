// Reference: graphics/audio-visualizer-1.mp4  (window 0-4840ms, spectrum full ~4040ms)
// A dense mirrored spectrum under a NOW PLAYING label, with the track details underneath.
//
// The bars mirror about the vertical centre — each one grows up AND down from the middle — which is
// what separates this from voice_card's bottom-anchored equaliser. Bar heights come from two
// out-of-phase sines per bar rather than one, so neighbouring bars never march in step the way a
// single shared wave makes them.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

const MAX_BARS = 64;

export const musicVisualizer = defineGraphicsTemplate({
  id: 'music_visualizer',
  name: 'Music Visualizer',
  category: 'device',
  tags: ['Audio', 'Spectrum', 'Player', 'Luxury'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'scene',  label: 'Scene', hideable: false },
    { key: 'kicker', label: 'Kicker' },
    { key: 'bars',   label: 'Spectrum' },
    { key: 'title',  label: 'Track title' },
    { key: 'artist', label: 'Artist' },
  ],

  params: [
    { type: 'text', key: 'kicker', label: 'Kicker', group: 'Content', default: 'NOW PLAYING', maxLength: 24 },
    { type: 'text', key: 'title',  label: 'Track',  group: 'Content', default: 'Midnight Dreams', maxLength: 36 },
    { type: 'text', key: 'artist', label: 'Artist', group: 'Content', default: 'Electronic Vibes', maxLength: 36 },

    { type: 'color',  key: 'bg',     label: 'Background', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'accent', label: 'Bars',       group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Track',      group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',    label: 'Secondary',  group: 'Style', default: '#8B8779' },
    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'bars',   label: 'Bars',       group: 'Style', default: 28, min: 8, max: 64, step: 1 },
    { type: 'number', key: 'height', label: 'Spectrum height', group: 'Style', default: 620, min: 60, max: 900, step: 10, unit: 'px' },
    { type: 'number', key: 'gapPx',  label: 'Bar gap',    group: 'Style', default: 9, min: 0, max: 30, step: 1, unit: 'px' },
    { type: 'number', key: 'size',   label: 'Track size', group: 'Style', default: 62, min: 12, max: 120, step: 2, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the background', group: 'Style', default: true },

    { type: 'number', key: 'openMs', label: 'Spectrum opens over', group: 'Motion', default: 700, min: 100, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'speed',  label: 'Bar speed', group: 'Motion', default: 1.7, min: 0.1, max: 8, step: 0.1 },
    { type: 'number', key: 'titleAt', label: 'Track at', group: 'Motion', default: 620, min: 0, max: 4000, step: 20, unit: 'ms' },
  ],

  // NO sfx — this template depicts MUSIC the user supplies; any bank sound would fight the
  // track, and nothing physical happens here. Silence beats a wrong sound.

  render: ({ params: p, el, timeMs, seed, height }) => {
    const ff = fontStack(p.font);
    const n = Math.min(MAX_BARS, Math.round(p.bars));

    const openAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 24, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(p.openMs))),
    });
    const open = openAt(timeMs);
    const copy = (k: number) => spring({
      frame: fr(timeMs - p.titleAt - k * 200), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });

    // DEPTH: the player is a SCREEN — it swings in as a plane, then rests nearly still (sway
    // 1.1) while the kicker and track copy parallax subtly against the anchored spectrum. The
    // spectrum's opening velocity (bar tips racing outward from the hairline) drives a vertical
    // smear that dies exactly when the bars reach full height — dancing bars stay crisp.
    const pose = depthPose(timeMs, seed, { enter: open, ry: 14, rx: -8, z: -110, swayDeg: 1.1 });
    const vOpen = vel((ms: number) => clamp01(openAt(ms)), timeMs) * p.height * 0.4;
    const barSmear = smear(0, vOpen);
    const parKick = parallax(timeMs, seed, 0.3, height * 0.006);
    const parCopy = parallax(timeMs, seed, 0.35, height * 0.006);

    const t = timeMs / 1000;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? `radial-gradient(30% 34% at 50% 50%, ${rgba(p.accent, 0.1)}, ${p.bg} 75%)` : 'transparent',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          transform: pose,
          ...el('scene'),
        }}
      >
        <div
          style={{
            position: 'absolute', top: '12%',
            fontSize: p.size * 0.42, letterSpacing: p.size * 0.16, color: p.dim, fontWeight: 600,
            textTransform: 'uppercase',
            opacity: clamp01(open * 1.5),
            transform: `translate(${parKick.x.toFixed(2)}px, ${parKick.y.toFixed(2)}px)`,
            ...el('kicker'),
          }}
        >
          {p.kicker}
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: p.gapPx, height: p.height, width: '62%',
            filter: barSmear.blurPx > 0.3 ? `blur(${barSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `scale(${barSmear.sx.toFixed(4)}, ${barSmear.sy.toFixed(4)})`,
            ...el('bars'),
          }}
        >
          {Array.from({ length: n }).map((_, i) => {
            const u = i / (n - 1);
            // Envelope is widest at the centre; two out-of-phase sines keep neighbours out of step.
            const env = 0.2 + 0.8 * Math.pow(Math.sin(u * Math.PI), 0.55);
            const ph = random(`${seed}p${i}`) * Math.PI * 2;
            const a = Math.sin(t * p.speed * Math.PI * 2 + ph);
            const b = Math.sin(t * p.speed * 1.7 * Math.PI + ph * 2.3);
            const amp = (0.45 + 0.55 * ((a + b) / 2 * 0.5 + 0.5));
            // Bars open from a hairline at the centre outwards.
            const h = Math.max(3, p.height * env * amp * clamp01(open));
            return (
              <div
                key={i}
                style={{
                  flex: 1, height: h, borderRadius: 999,
                  background: p.accent,
                  opacity: 0.55 + 0.45 * amp,
                  boxShadow: `0 0 12px ${rgba(p.accent, 0.3 * amp)}`,
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute', top: '78%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: p.size * 0.16,
            transform: `translate(${parCopy.x.toFixed(2)}px, ${parCopy.y.toFixed(2)}px)`,
          }}
        >
          <span
            style={{
              fontSize: p.size, fontWeight: 700, color: p.ink, lineHeight: 1.1,
              opacity: clamp01(copy(0) * 1.6),
              transform: `translateY(${((1 - copy(0)) * height * 0.012).toFixed(2)}px)`,
              ...el('title'),
            }}
          >
            {p.title}
          </span>
          <span
            style={{
              fontSize: p.size * 0.44, color: p.dim,
              opacity: clamp01(copy(1) * 1.6),
              transform: `translateY(${((1 - copy(1)) * height * 0.01).toFixed(2)}px)`,
              ...el('artist'),
            }}
          >
            {p.artist}
          </span>
        </div>

        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
