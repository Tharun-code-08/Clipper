// Reference: general/flight-progress.mp4  (window 480-4300ms, route in ~1200ms, bar fills ~2600ms)
// A live-activity flight card: origin, destination, times, and a progress bar with the aircraft
// riding its head.
//
// The aircraft marker is positioned FROM the bar's fill value, not on its own tween — two
// independent tweens for the same journey is how the plane ends up ahead of or behind the fill.

import { Easing, interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

export const flightCard = defineGraphicsTemplate({
  id: 'flight_card',
  name: 'Flight Card',
  category: 'device',
  tags: ['Flight', 'Progress', 'Live'],
  design: { w: 900, h: 420 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 86 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'card',  label: 'Card', hideable: false },
    { key: 'route', label: 'Route' },
    { key: 'meta',  label: 'Times' },
    { key: 'track', label: 'Progress' },
  ],

  params: [
    { type: 'text', key: 'from',    label: 'Origin',      group: 'Content', default: 'YYZ', maxLength: 6 },
    { type: 'text', key: 'to',      label: 'Destination', group: 'Content', default: 'HND', maxLength: 6 },
    { type: 'text', key: 'fromSub', label: 'Origin note', group: 'Content', default: 'Toronto', maxLength: 20 },
    { type: 'text', key: 'toSub',   label: 'Destination note', group: 'Content', default: 'Tokyo', maxLength: 20 },
    { type: 'text', key: 'status',  label: 'Status',      group: 'Content', default: 'ETA 5:14 PM', maxLength: 20 },
    { type: 'text', key: 'note',    label: 'Status note', group: 'Content', default: 'On time · Gate 22', maxLength: 28 },
    { type: 'number', key: 'progress', label: 'Progress', group: 'Content', default: 0.62, min: 0, max: 1, step: 0.01 },

    { type: 'color',  key: 'stage',  label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'card',   label: 'Card',     group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',    label: 'Text',     group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',    label: 'Secondary', group: 'Style', default: '#8F8B80' },
    { type: 'color',  key: 'accent', label: 'Destination + bar', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'alert',  label: 'Status',   group: 'Style', default: '#E5484D' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Route size', group: 'Style', default: 72, min: 12, max: 120, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',   group: 'Style', default: 34, min: 0, max: 70, step: 2, unit: 'px' },
    { type: 'number', key: 'bar',    label: 'Bar height', group: 'Style', default: 30, min: 4, max: 60, step: 2, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'cardAt', label: 'Card at',  group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'barAt',  label: 'Bar fills at', group: 'Motion', default: 900, min: 0, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'barMs',  label: 'Bar fills over', group: 'Motion', default: 1300, min: 100, max: 6000, step: 50, unit: 'ms' },
  ],

  // Live-activity language: air as the card arrives, a light pass as the aircraft pushes off,
  // and the milestone chime as the bar completes — all reading the same barAt/barMs the fill does.
  sfx: (p) => [
    { atMs: p.cardAt + 30, id: 'whoosh', gain: 0.45 },
    { atMs: p.barAt, id: 'swish', gain: 0.5 },
    { atMs: p.barAt + p.barMs, id: 'chime', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);

    const cardInAt = (ms: number) => spring({
      frame: fr(ms - p.cardAt), fps: FPS,
      config: { damping: 22, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const cardIn = cardInAt(timeMs);
    // ONE value drives the fill AND the marker. Two tweens desynchronise the plane from the bar.
    const fillAt = (ms: number) => clamp01(p.progress) * interpolate(ms, [p.barAt, p.barAt + p.barMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    });
    const fillPct = fillAt(timeMs);
    // DEPTH: the card arrives as a physical object — 3D swing with an approach smear that dies on
    // landing — then rests almost still (1°: it is a live-activity card, not a floating title).
    // Its inner layers parallax subtly, and the aircraft marker smears with the FILL velocity, so
    // the plane blurs while it flies and lands crisp with the bar.
    const pose = depthPose(timeMs, seed, { enter: cardIn, rx: -15, ry: -8, z: -130, swayDeg: 1, periodMs: 4600 });
    const cardSmear = smear(0, vel((ms: number) => (1 - cardInAt(ms)) * width * 0.16, timeMs));
    const parRoute = parallax(timeMs, seed, 0.24, width * 0.007, 4600);
    const parMeta = parallax(timeMs, seed, 0.32, width * 0.007, 4600);
    const parTrack = parallax(timeMs, seed, 0.18, width * 0.007, 4600);
    const planeSmear = smear(vel((ms: number) => fillAt(ms) * width * 0.66, timeMs), 0);

    const pad = width * 0.062;
    // The card lands first and its contents ARRIVE — the reference is still showing only the origin
    // code half a second in.
    const part = (delay: number) => clamp01(spring({
      frame: fr(timeMs - p.cardAt - delay), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(360))),
    }) * 1.8);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.stage : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
        }}
      >
        <div
          style={{
            width: '79%',
            background: `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.35) 100%), ${p.card}`,
            border: '1px solid rgba(255,255,255,0.13)',
            borderRadius: p.radius,
            boxShadow: `0 ${pad * 0.35}px ${pad * 1.1}px ${rgba('#000000', 0.5)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
            padding: pad, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: pad * 0.6,
            opacity: clamp01(cardIn * 1.8),
            filter: cardSmear.blurPx > 0.3 ? `blur(${cardSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} scale(${(interpolate(cardIn, [0, 1], [0.95, 1]) * cardSmear.sx).toFixed(4)}, ${(interpolate(cardIn, [0, 1], [0.95, 1]) * cardSmear.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('card'),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ transform: `translate(${parRoute.x.toFixed(2)}px, ${parRoute.y.toFixed(2)}px)`, ...el('route') }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: p.size * 0.3, fontSize: p.size, fontWeight: 700, letterSpacing: '0.03em' }}>
                <span style={{ color: p.ink }}>{p.from}</span>
                <span style={{ color: p.dim, fontSize: p.size * 0.5, fontWeight: 400, opacity: part(320) }}>›</span>
                <span style={{ color: p.accent, opacity: part(460) }}>{p.to}</span>
              </div>
              <div style={{ display: 'flex', gap: p.size * 0.9, fontSize: p.size * 0.26, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: p.dim, marginTop: p.size * 0.14, opacity: part(620) }}>
                <span>{p.fromSub}</span>
                <span>{p.toSub}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', opacity: part(760), transform: `translate(${parMeta.x.toFixed(2)}px, ${parMeta.y.toFixed(2)}px)`, ...el('meta') }}>
              <div style={{ fontSize: p.size * 0.34, color: p.alert, fontWeight: 600, letterSpacing: '0.02em' }}>{p.status}</div>
              <div style={{ fontSize: p.size * 0.26, color: p.dim, fontWeight: 500, letterSpacing: '0.06em', marginTop: p.size * 0.1 }}>{p.note}</div>
            </div>
          </div>

          <div style={{ position: 'relative', height: p.bar, opacity: part(880), transform: `translate(${parTrack.x.toFixed(2)}px, ${parTrack.y.toFixed(2)}px)`, ...el('track') }}>
            <div style={{ position: 'absolute', inset: 0, background: rgba(p.ink, 0.1), border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box', borderRadius: 999 }} />
            <div
              style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${(fillPct * 100).toFixed(2)}%`,
                background: `linear-gradient(90deg, ${rgba(p.accent, 0.75)}, ${p.accent})`, borderRadius: 999,
                boxShadow: `0 0 ${p.bar * 0.5}px ${rgba(p.accent, 0.4)}`,
              }}
            />
            <span
              style={{
                position: 'absolute', top: '50%',
                left: `${(fillPct * 100).toFixed(2)}%`,
                filter: planeSmear.blurPx > 0.3 ? `blur(${planeSmear.blurPx.toFixed(2)}px)` : undefined,
                transform: `translate(-50%, -50%) scale(${planeSmear.sx.toFixed(4)}, ${planeSmear.sy.toFixed(4)})`,
                width: p.bar * 1.35, height: p.bar * 1.35, borderRadius: '50%',
                background: p.card, border: `${Math.max(2, p.bar * 0.12)}px solid ${p.accent}`,
                boxSizing: 'border-box',
                boxShadow: `0 0 ${p.bar * 0.6}px ${rgba(p.accent, 0.45)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: p.bar * 0.7, color: p.accent, lineHeight: 1,
              }}
            >
              ✈
            </span>
          </div>
        </div>
      </div>
    );
  },
});
