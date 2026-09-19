// Reference: general/card.mp4  (window 480-5300ms, cards merge ~2400ms, sparkle ring ~4200ms)
// Blurred cards tumbling in, converging into one glowing card, then a ring of sparks around it.
//
// The blur is tied to how far a card still has to travel, not to a clock. Blurring on a timer keeps
// the arrived card soft while a late one is already sharp, which is the giveaway.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, swingIn } from '../juice';

const GHOSTS = 5;
const SPARKS = 28;

export const cardForge = defineGraphicsTemplate({
  id: 'card_forge',
  name: 'Card Forge',
  category: 'cta',
  tags: ['Card', 'Merge', 'Sparkle', 'Luxury'],
  design: { w: 900, h: 1200 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'field',  label: 'Field', hideable: false },
    { key: 'ghosts', label: 'Incoming cards' },
    { key: 'card',   label: 'Card' },
    { key: 'sparks', label: 'Sparks' },
  ],

  params: [
    { type: 'text', key: 'title', label: 'Card title', group: 'Content', default: 'MEMBER', maxLength: 20 },
    { type: 'text', key: 'sub',   label: 'Card line',  group: 'Content', default: '•••• 4821', maxLength: 20 },

    { type: 'color',  key: 'bg',     label: 'Backdrop', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'card',   label: 'Card',     group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Card text', group: 'Style', default: '#241B0A' },
    { type: 'color',  key: 'spark',  label: 'Sparks',   group: 'Style', default: '#F4E7C0' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Card width', group: 'Style', default: 330, min: 80, max: 800, step: 10, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',   group: 'Style', default: 22, min: 0, max: 60, step: 2, unit: 'px' },
    { type: 'number', key: 'text',   label: 'Text size', group: 'Style', default: 30, min: 8, max: 80, step: 1, unit: 'px' },
    { type: 'number', key: 'glow',   label: 'Glow',     group: 'Style', default: 0.8, min: 0, max: 1, step: 0.05 },
    { type: 'number', key: 'ring',   label: 'Spark radius', group: 'Style', default: 320, min: 40, max: 700, step: 10, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'mergeAt', label: 'Cards merge at', group: 'Motion', default: 1400, min: 0, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'mergeMs', label: 'Merge over', group: 'Motion', default: 900, min: 100, max: 4000, step: 50, unit: 'ms' },
    { type: 'number', key: 'sparkAt', label: 'Sparks at', group: 'Motion', default: 2650, min: 0, max: 10000, step: 50, unit: 'ms' },
    { type: 'number', key: 'sparkMs', label: 'Sparks over', group: 'Motion', default: 1250, min: 100, max: 4000, step: 50, unit: 'ms' },
  ],

  // Air as the shards converge on the forge beat, a produced slam as the card sets, then the
  // sparkle ring shimmers in — every cue keyed to the same mergeAt/mergeMs/sparkAt the motion
  // runs on, so retiming the forge retimes the sound.
  sfx: (p) => [
    { atMs: Math.max(0, p.mergeAt - 120), id: 'whoosh', gain: 0.6 },
    { atMs: p.mergeAt + Math.round(p.mergeMs * 0.65), id: 'slam', gain: 0.8 },
    { atMs: p.sparkAt + 150, id: 'chime', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const cardH = p.size * 0.62;
    const cx = width / 2;
    const cy = height / 2;

    const merge = spring({
      frame: fr(timeMs - p.mergeAt), fps: FPS,
      config: { damping: 26, mass: 0.9, stiffness: 120 },
      durationInFrames: Math.max(1, Math.round(fr(p.mergeMs))),
    });
    const spark = interpolate(timeMs, [p.sparkAt, p.sparkAt + p.sparkMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    // DEPTH: the forged card ARRIVES through 3D — a swing keyed to the merge spring — and then
    // never flattens back into a web page (±2° resting sway). The spark ring floats at its own
    // parallax depth so the sway shears it over the card; blur on the incoming ghosts already
    // tracks their remaining travel (see above), which is the honest motion blur here.
    const cardPose = depthPose(timeMs, seed, { enter: merge, rx: -16, ry: 9, z: -120, swayDeg: 2 });
    const parSparks = parallax(timeMs, seed, 0.5, p.size * 0.035);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          fontFamily: ff,
          ...el('field'),
        }}
      >
        <div style={{ position: 'absolute', inset: 0, ...el('ghosts') }}>
          {Array.from({ length: GHOSTS }).map((_, i) => {
            const dx = (random(`${seed}gx${i}`) - 0.5) * p.size * 1.35;
            const dy = (random(`${seed}gy${i}`) - 0.5) * p.size * 4.4;
            const rot = (random(`${seed}gr${i}`) - 0.5) * 30;
            const away = 1 - merge;
            // Blur tracks the REMAINING distance, not the clock.
            const dist = Math.hypot(dx * away, dy * away);
            // Z-STAGGER: every shard tumbles in from its OWN 3D angle (per-ghost rx/ry that
            // unwind with the same merge spring), so the convergence reads as objects flying
            // through space, not rectangles sliding on glass.
            const grx = (random(`${seed}g3x${i}`) - 0.5) * 44;
            const gry = (random(`${seed}g3y${i}`) - 0.5) * 44;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: cx - p.size / 2 + dx * away,
                  top: cy - cardH / 2 + dy * away,
                  width: p.size, height: cardH,
                  background: rgba(p.card, 0.3),
                  borderRadius: p.radius,
                  transform: `${swingIn(merge, { rx: grx, ry: gry, z: -160 })} rotate(${(rot * away).toFixed(2)}deg)`,
                  filter: `blur(${(dist * 0.06).toFixed(2)}px)`,
                  opacity: clamp01(1 - merge) * 0.85,
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute',
            left: cx - p.size / 2, top: cy - cardH / 2,
            width: p.size, height: cardH,
            // Foiled surface: a diagonal white sheen over the card colour, which deepens toward
            // the far corner (the rgba layer lets the dark backdrop bleed through).
            background:
              `linear-gradient(150deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 45%), `
              + `linear-gradient(150deg, ${p.card}, ${rgba(p.card, 0.72)})`,
            border: '1px solid rgba(255,255,255,0.22)',
            borderRadius: p.radius,
            padding: p.text * 0.7, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            color: p.ink, fontWeight: 700,
            boxShadow:
              `0 ${Math.round(p.size * 0.07)}px ${Math.round(p.size * 0.2)}px rgba(0,0,0,0.45), `
              + `inset 0 1px 0 rgba(255,255,255,0.28)`
              + (p.glow > 0 ? `, 0 0 ${p.size * 0.16 * merge}px ${rgba(p.card, 0.6 * p.glow)}` : ''),
            opacity: clamp01(merge * 1.6),
            transform: `${cardPose} scale(${interpolate(merge, [0, 1], [0.9, 1]).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('card'),
          }}
        >
          <span style={{ fontSize: p.text * 0.6, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{p.title}</span>
          <span style={{ fontSize: p.text, letterSpacing: '0.14em', fontVariantNumeric: 'tabular-nums' }}>{p.sub}</span>
        </div>

        {spark > 0 && (
          <div style={{ position: 'absolute', inset: 0, transform: `translate(${parSparks.x.toFixed(2)}px, ${parSparks.y.toFixed(2)}px)`, ...el('sparks') }}>
            {Array.from({ length: SPARKS }).map((_, i) => {
              const a = (i / SPARKS) * Math.PI * 2 + random(`${seed}sa${i}`) * 0.2;
              const r = p.ring * (0.55 + random(`${seed}sr${i}`) * 0.55) * Math.sqrt(spark);
              // Each spark has its own life inside the burst, so they do not bloom together; once
              // bloomed a spark stays lit (the reference ring persists to the end of the clip).
              const life = clamp01((spark - random(`${seed}sd${i}`) * 0.22) / 0.78);
              const size = 3 + random(`${seed}ss${i}`) * 5;
              return (
                <span
                  key={i}
                  style={{
                    position: 'absolute',
                    left: cx + Math.cos(a) * r - size / 2,
                    // The ring blooms wide first and only then fills out vertically, as in the
                    // reference, so the vertical radius trails the burst progress.
                    top: cy + Math.sin(a) * r * interpolate(spark, [0, 1], [0.4, 1.15]) - size / 2,
                    width: size, height: size, borderRadius: '50%',
                    background: p.spark,
                    opacity: clamp01(life * 3) * (0.6 + 0.4 * Math.sin(life * Math.PI)),
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Full-bleed finish — only when the backdrop is painted; the grain's blend mode has
            nothing sane to mix with over transparency. */}
        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
