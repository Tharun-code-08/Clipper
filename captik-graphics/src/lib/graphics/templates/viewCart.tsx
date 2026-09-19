// Reference: social/view-cart-animation-1.mp4  (window 80-3400ms)
// A cart pill with concentric rings pulsing outward behind it, like a tap target advertising
// itself. The rings are staggered across a shared period so they read as one continuous wave
// rather than three synchronised circles, and each ring's radius and opacity come straight off
// timeMs — no state, no timers, exports frame-for-frame.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, inkOn, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

export const viewCart = defineGraphicsTemplate({
  id: 'view_cart',
  name: 'View Cart',
  category: 'cta',
  tags: ['Cart', 'Shop', 'Button'],
  design: { w: 1100, h: 340 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 92 },
  fonts: ['montserrat'],

  elements: [
    { key: 'pill',  label: 'Button', hideable: false },
    { key: 'icon',  label: 'Cart icon' },
    { key: 'label', label: 'Label' },
    { key: 'rings', label: 'Rings' },
  ],

  params: [
    { type: 'text',    key: 'label', label: 'Label', group: 'Content', default: 'View Cart', maxLength: 28 },
    { type: 'boolean', key: 'icon',  label: 'Cart icon', group: 'Content', default: true },
    { type: 'text',    key: 'badge', label: 'Badge', group: 'Content', default: '', maxLength: 4,
      help: 'Optional item count shown on the cart.' },

    { type: 'color',  key: 'fill',   label: 'Button', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Text',   group: 'Style', default: '#1F1808' },
    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Text size', group: 'Style', default: 47, min: 12, max: 90, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 99, min: 0, max: 99, step: 1, unit: 'px' },

    { type: 'number', key: 'rings',  label: 'Ring count',  group: 'Motion', default: 3, min: 0, max: 5, step: 1 },
    { type: 'number', key: 'period', label: 'Ring period', group: 'Motion', default: 3300, min: 600, max: 8000, step: 100, unit: 'ms' },
    { type: 'number', key: 'pulseAt', label: 'First pulse at', group: 'Motion', default: 1900, min: 0, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'lifeMs',  label: 'Ring lifetime', group: 'Motion', default: 900, min: 100, max: 3000, step: 50, unit: 'ms' },
    { type: 'number', key: 'ringGap', label: 'Ring stagger', group: 'Motion', default: 160, min: 0, max: 800, step: 20, unit: 'ms' },
    { type: 'number', key: 'spread', label: 'Ring spread', group: 'Motion', default: 75, min: 20, max: 260, step: 5, unit: '%' },
  ],

  // A glossy pop as the pill lands, then a bright coin ping on the FIRST ring pulse — the
  // visual wave re-fires every period; the cue marks the beat it starts advertising itself.
  sfx: (p) => [
    { atMs: 150, id: 'pop', gain: 0.6 },
    { atMs: p.pulseAt, id: 'coin', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const popAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 17, mass: 0.6, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const pop = popAt(timeMs);
    const labelIn = spring({
      frame: fr(timeMs - 140), fps: FPS,
      config: { damping: 26, mass: 0.5, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(300))),
    });

    const ink = p.ink || inkOn(p.fill);
    const fs = p.size;
    const pillW = width * 0.48;
    const pillH = fs * 2.4;
    const ringMax = pillW * (p.spread / 100);

    // DEPTH + BLUR: the pill swings in top-hinged on its existing pop spring, keeps a ±1.5°
    // sway (the tap target lives in space), and NUDGES with a tiny scale bump on the same
    // modulo clock the rings run on — the whole body advertises each wave. Total scale
    // velocity (entrance + nudge) smears it only while moving; icon and label sit at faint
    // parallax depths so the sway shears them.
    const scaleAt = (ms: number) => {
      const c = (((ms - p.pulseAt) % p.period) + p.period) % p.period;
      const b = ms >= p.pulseAt && c < 340 ? Math.sin((c / 340) * Math.PI) * 0.035 : 0;
      return interpolate(popAt(ms), [0, 1], [0.82, 1]) * (1 + b);
    };
    const pillSmear = smear(0, vel(scaleAt, timeMs) * pillH * 1.1);
    const pose = depthPose(timeMs, seed, { enter: pop, rx: -16, z: -90, swayDeg: 1.5 });
    const parIcon = parallax(timeMs, seed, 0.55, width * 0.006);
    const parLabel = parallax(timeMs, seed, 0.3, width * 0.006);

    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontStack(p.font) }}>
        {/* Rings, phase-shifted across one shared period. */}
        <div style={{ position: 'absolute', inset: 0, ...el('rings') }}>
          {Array.from({ length: p.rings }).map((_, i) => {
            // A BURST, not a continuous wave. The reference sits quiet on the bare pill most of
            // the time and pulses occasionally; a never-ending wave reads as a loading spinner and
            // leaves the rings on screen at every moment.
            const cyc = (((timeMs - p.pulseAt) % p.period) + p.period) % p.period;
            const local = cyc - i * p.ringGap;
            if (local < 0 || local > p.lifeMs) return null;
            const t = local / Math.max(1, p.lifeMs);
            const w = interpolate(t, [0, 1], [pillW, pillW + ringMax], { easing: Easing.out(Easing.quad) });
            // Flatter than the width growth: the wave reads as spreading across the tap target,
            // not ballooning into a circle around it.
            const h = interpolate(t, [0, 1], [pillH, pillH + ringMax * 0.44], { easing: Easing.out(Easing.quad) });
            const op = interpolate(t, [0, 0.10, 0.72, 1], [0, 0.55, 0.34, 0]) * Math.min(1, pop);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute', left: '50%', top: '50%',
                  width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2,
                  borderRadius: 99,
                  border: `${Math.max(2, width * 0.005)}px solid ${rgba(p.fill, op)}`,
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            width: pillW, height: pillH,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: fs * 0.4,
            // Metallic read: diagonal sheen over the fill, hairline light edge, and a shadow
            // stack of contact + ambient dark layers with a soft fill-coloured bloom.
            background: `linear-gradient(165deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 48%), ${p.fill}`,
            border: '1px solid rgba(255,255,255,0.28)',
            boxSizing: 'border-box',
            borderRadius: p.radius,
            boxShadow:
              `0 ${Math.round(pillH * 0.06)}px ${Math.round(pillH * 0.16)}px ${rgba('#000000', 0.28)}, `
              + `0 ${Math.round(pillH * 0.2)}px ${Math.round(pillH * 0.5)}px ${rgba('#000000', 0.2)}, `
              + `0 0 ${Math.round(pillH * 0.5)}px ${rgba(p.fill, 0.22)}`,
            opacity: interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
            filter: pillSmear.blurPx > 0.3 ? `blur(${pillSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} scale(${(scaleAt(timeMs) * pillSmear.sx).toFixed(4)}, ${(scaleAt(timeMs) * pillSmear.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('pill'),
          }}
        >
          {p.icon && (
            <span style={{ position: 'relative', display: 'flex', transform: `translate(${parIcon.x.toFixed(2)}px, ${parIcon.y.toFixed(2)}px)`, ...el('icon') }}>
              <svg width={fs * 1.05} height={fs * 1.05} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 3h2.2l2.1 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.55L20 7H5.2" />
                <circle cx="9.5" cy="20" r="1.4" />
                <circle cx="17" cy="20" r="1.4" />
              </svg>
              {p.badge && (
                <span
                  style={{
                    position: 'absolute', top: -fs * 0.22, right: -fs * 0.28,
                    minWidth: fs * 0.5, height: fs * 0.5, borderRadius: 99,
                    background: ink, color: p.fill,
                    fontSize: fs * 0.36, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: `0 ${fs * 0.1}px`,
                  }}
                >
                  {p.badge}
                </span>
              )}
            </span>
          )}
          <span
            style={{
              fontSize: fs, fontWeight: 700, color: ink, letterSpacing: '0.02em', whiteSpace: 'nowrap',
              opacity: interpolate(labelIn, [0, 0.7], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translate(${parLabel.x.toFixed(2)}px, ${parLabel.y.toFixed(2)}px)`,
              ...el('label'),
            }}
          >
            {p.label}
          </span>
        </div>
      </div>
    );
  },
});
