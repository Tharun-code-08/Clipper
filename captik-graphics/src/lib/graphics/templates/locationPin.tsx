// Reference: social/location-pop-up.mp4  (window 440-4280ms, card lands ~3000ms)
// A map pin drops, lands with a squash, emits expanding ripple rings from the impact, and only
// then does the place card appear above it. Four independent clocks — the drop, the squash, the
// ripples (staggered so they read as concentric waves) and the card.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { parallax, smear, sway3d, swingIn, vel } from '../juice';

export const locationPin = defineGraphicsTemplate({
  id: 'location_pin',
  name: 'Location Pin',
  category: 'social',
  tags: ['Map', 'Pin', 'Place'],
  design: { w: 560, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 60 },
  fonts: ['inter'],

  elements: [
    { key: 'pin',     label: 'Pin', hideable: false },
    { key: 'ripples', label: 'Ripples' },
    { key: 'card',    label: 'Place card' },
  ],

  params: [
    { type: 'text',    key: 'place',    label: 'Place',    group: 'Content', default: 'San Francisco', maxLength: 40 },
    { type: 'text',    key: 'region',   label: 'Region',   group: 'Content', default: 'California, USA', maxLength: 40 },
    { type: 'boolean', key: 'showCard', label: 'Show card', group: 'Content', default: true },

    { type: 'color',  key: 'pinCol', label: 'Pin',   group: 'Style', default: '#E5484D' },
    { type: 'color',  key: 'card',   label: 'Card',  group: 'Style', default: '#FDFCFA' },
    { type: 'color',  key: 'ink',    label: 'Title', group: 'Style', default: '#15161a' },
    { type: 'color',  key: 'sub',    label: 'Region', group: 'Style', default: '#8B8A85' },
    { type: 'font',   key: 'font',   label: 'Font',  group: 'Style', default: 'inter' },

    { type: 'number', key: 'dropMs',  label: 'Drop time',  group: 'Motion', default: 620, min: 200, max: 1600, step: 20, unit: 'ms' },
    { type: 'number', key: 'cardAt',  label: 'Card at',    group: 'Motion', default: 2100, min: 200, max: 5000, step: 50, unit: 'ms' },
    { type: 'number', key: 'ripples', label: 'Ripple count', group: 'Motion', default: 3, min: 0, max: 5, step: 1 },
    { type: 'number', key: 'ripplePeriod', label: 'Ripple period', group: 'Motion', default: 1800, min: 600, max: 4000, step: 100, unit: 'ms' },
  ],

  // Air on the way down, a produced thud on the landing, a soft pop as the card arrives —
  // dropMs / cardAt retime the cues with the motion.
  sfx: (p) => [
    { atMs: Math.max(0, p.dropMs - 260), id: 'whoosh', gain: 0.5 },
    { atMs: p.dropMs, id: 'slam', gain: 0.6 },
    { atMs: p.cardAt + 120, id: 'pop', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);

    const dropAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 15, mass: 0.9, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(p.dropMs))),
    });
    const drop = dropAt(timeMs);
    // Squash on landing, easing back out — separate from the drop so it reads as weight.
    const land = interpolate(timeMs, [p.dropMs * 0.8, p.dropMs, p.dropMs * 1.5], [0, 1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad),
    });

    const pinW = width * 0.2;
    const pinH = pinW * 1.45;
    const cx = width / 2;
    const groundY = height * 0.62;
    const rippleMax = pinW * 1.2;

    const cardIn = spring({
      frame: fr(timeMs - p.cardAt), fps: FPS,
      config: { damping: 24, mass: 0.6, stiffness: 175 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    // DEPTH + BLUR: the whole scene floats on a slow ±1.2° camera sway so the pose is never
    // dead; the pin's fall velocity smears it vertically (crisp the instant it lands, squash
    // takes over); the place card swings in bottom-hinged and shears over the pin on a shallow
    // parallax as the scene sways.
    const scenePose = sway3d(timeMs, seed, 1.2, 4200);
    const vPin = vel((ms: number) => interpolate(dropAt(ms), [0, 1], [-height * 0.5, 0]), timeMs);
    const pinSmear = smear(0, vPin);
    const parCard = parallax(timeMs, seed, 0.3, width * 0.012, 4200);

    const fsTitle = Math.round(width * 0.114);
    const fsSub = Math.round(width * 0.075);

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, transform: scenePose, transformOrigin: '50% 55%' }}>
        {/* Ripples, staggered thirds of a shared period so they read as concentric waves. */}
        <div style={{ position: 'absolute', inset: 0, ...el('ripples') }}>
          {Array.from({ length: p.ripples }).map((_, i) => {
            const t = (((timeMs - p.dropMs) / p.ripplePeriod) + i / Math.max(1, p.ripples)) % 1;
            if (timeMs < p.dropMs) return null;
            const r = interpolate(t, [0, 1], [pinW * 0.3, rippleMax], { easing: Easing.out(Easing.quad) });
            const op = interpolate(t, [0, 0.15, 1], [0, 0.62, 0]);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: cx - r, top: groundY - r * 0.6,
                  width: r * 2, height: r * 1.2,
                  borderRadius: '50%',
                  border: `${Math.max(1, width * 0.011)}px solid ${rgba(p.pinCol, op)}`,
                }}
              />
            );
          })}
        </div>

        {/* Pin */}
        <svg
          width={pinW} height={pinH} viewBox="0 0 24 32" aria-hidden="true"
          style={{
            position: 'absolute',
            left: cx - pinW / 2,
            top: groundY - pinH + interpolate(drop, [0, 1], [-height * 0.5, 0]),
            transform: `scale(${((1 + land * 0.12) * pinSmear.sx).toFixed(3)}, ${((1 - land * 0.14) * pinSmear.sy).toFixed(3)})`,
            transformOrigin: 'center bottom',
            opacity: interpolate(drop, [0, 0.2], [0, 1], { extrapolateRight: 'clamp' }),
            filter: `drop-shadow(0 ${(pinW * 0.04).toFixed(1)}px ${(pinW * 0.09).toFixed(1)}px ${rgba('#000000', 0.28)}) drop-shadow(0 ${(pinW * 0.14).toFixed(1)}px ${(pinW * 0.32).toFixed(1)}px ${rgba('#000000', 0.18)})${pinSmear.blurPx > 0.3 ? ` blur(${pinSmear.blurPx.toFixed(2)}px)` : ''}`,
            ...el('pin'),
          }}
        >
          <path d="M12 0C5.9 0 1 4.9 1 11c0 8 11 21 11 21s11-13 11-21c0-6.1-4.9-11-11-11Z" fill={p.pinCol} />
          <circle cx="12" cy="11" r="4.1" fill={rgba('#F4F1E8', 0.95)} />
        </svg>

        {/* Place card */}
        {p.showCard && (
          <div
            style={{
              position: 'absolute',
              left: '50%', top: height * 0.12,
              transform:
                `${swingIn(cardIn, { rx: -14, z: -70 })} ` +
                `translateX(-50%) translate(${parCard.x.toFixed(2)}px, ${(parCard.y + (1 - cardIn) * height * 0.05).toFixed(3)}px) ` +
                `scale(${interpolate(cardIn, [0, 1], [0.9, 1]).toFixed(4)})`,
              transformOrigin: 'center bottom',
              opacity: interpolate(cardIn, [0, 0.45], [0, 1], { extrapolateRight: 'clamp' }),
              background: p.card,
              borderRadius: width * 0.05,
              padding: `${width * 0.045}px ${width * 0.055}px`,
              display: 'flex', flexDirection: 'row', alignItems: 'center', gap: width * 0.03,
              boxShadow: `0 0 0 1px ${rgba('#000000', 0.05)}, 0 ${(width * 0.012).toFixed(1)}px ${(width * 0.035).toFixed(1)}px ${rgba('#000000', 0.1)}, 0 ${(width * 0.05).toFixed(1)}px ${(width * 0.12).toFixed(1)}px ${rgba('#000000', 0.16)}`,
              whiteSpace: 'nowrap',
              ...el('card'),
            }}
          >
            {/* Blue location glyph — the reference card leads with one. */}
            <svg width={width * 0.09} height={width * 0.09} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M12 1.5C7.6 1.5 4 5.1 4 9.5c0 5.9 8 13 8 13s8-7.1 8-13c0-4.4-3.6-8-8-8Z" fill="#2f6bf3" />
              <circle cx="12" cy="9.4" r="3" fill={p.card} />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: width * 0.008 }}>
              <span style={{ fontSize: fsTitle, fontWeight: 700, color: p.ink, lineHeight: 1.15 }}>{p.place}</span>
              <span style={{ fontSize: fsSub, fontWeight: 400, color: p.sub, lineHeight: 1.15 }}>{p.region}</span>
            </div>
          </div>
        )}
      </div>
    );
  },
});
