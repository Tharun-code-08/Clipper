// Reference: text/energy-text.mp4  (window 920-4280ms, headline sharp by ~1400ms then disperses)
// An editorial layout — small tracked-out words pinned to the corners, one heavy headline in the
// middle — where the headline slowly turns to grain and blows away. The corner words never move,
// which is what makes the dispersion read.
//
// The grain is SEEDED particles, not a filter: a CSS/SVG turbulence would look right in the
// preview and cost a fortune per exported frame, and `random(seed)` gives the same specks on every
// surface for free.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { sway3d } from '../juice';

const MAX_SPECKS = 220;

export const energyText = defineGraphicsTemplate({
  id: 'energy_text',
  name: 'Energy Dissolve',
  category: 'title',
  tags: ['Text', 'Grain', 'Dissolve'],
  design: { w: 900, h: 1180 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat'],

  elements: [
    { key: 'headline', label: 'Headline', hideable: false },
    { key: 'grain',    label: 'Grain' },
    { key: 'topLeft',  label: 'Top left' },
    { key: 'topRight', label: 'Top right' },
    { key: 'footer',   label: 'Footer words' },
  ],

  params: [
    { type: 'text', key: 'text',     label: 'Headline',  group: 'Content', default: 'ENERGY', maxLength: 16 },
    { type: 'text', key: 'topLeft',  label: 'Top left',  group: 'Content', default: 'BE', maxLength: 18 },
    { type: 'text', key: 'topRight', label: 'Top right', group: 'Content', default: 'THE', maxLength: 18 },
    { type: 'text', key: 'footer',   label: 'Footer',    group: 'Content', default: 'YOU WANT TO ATTRACT', maxLength: 60,
      help: 'Words are spread evenly across the width.' },

    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'color',  key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'number', key: 'size',   label: 'Headline size', group: 'Style', default: 215, min: 40, max: 300, step: 4, unit: 'px' },
    { type: 'number', key: 'small',  label: 'Small size',    group: 'Style', default: 40, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'track',  label: 'Small tracking', group: 'Style', default: 7, min: 0, max: 20, step: 0.5, unit: 'px' },

    { type: 'number', key: 'startAt',  label: 'Dissolve at',  group: 'Motion', default: 1400, min: 0, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'overMs',   label: 'Dissolve over', group: 'Motion', default: 2400, min: 200, max: 6000, step: 100, unit: 'ms' },
    { type: 'number', key: 'specks',   label: 'Grain density', group: 'Motion', default: 220, min: 0, max: 220, step: 10 },
    { type: 'number', key: 'spread',   label: 'Grain spread',  group: 'Motion', default: 280, min: 10, max: 400, step: 10, unit: 'px' },
    { type: 'boolean', key: 'vanish',  label: 'Word disappears', group: 'Motion', default: false,
      help: 'Off (as in the reference) the word stays readable and just goes grainy.' },
    { type: 'boolean', key: 'reform',  label: 'Re-form at the end', group: 'Motion', default: false,
      help: 'Blows apart, then pulls back together instead of leaving.' },
  ],

  // Editorial dissolve: air as the headline racks in, then one long airy crescendo carrying the
  // whole dispersion — this template is wind, not impact.
  sfx: (p) => [
    { atMs: 80, id: 'whoosh', gain: 0.4 },
    { atMs: p.startAt, id: 'sweep', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, durationMs, seed, width }) => {
    const ff = fontStack(p.font);

    const entry = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 24, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });

    // 0 = intact, 1 = fully dispersed.
    const raw = interpolate(timeMs, [p.startAt, p.startAt + p.overMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const back = p.reform
      ? interpolate(timeMs, [durationMs - p.overMs * 0.55, durationMs], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        })
      : 0;
    const d = Math.max(0, raw - back);

    // Rate of the dissolve ramp in 1/ms — the analytic velocity every speck's smear rides.
    // Zero outside the ramps, so every streak collapses back to a crisp dot at rest.
    const dRate =
      (timeMs > p.startAt && timeMs < p.startAt + p.overMs ? 1 / Math.max(1, p.overMs) : 0)
      - (p.reform && timeMs > durationMs - p.overMs * 0.55 && timeMs < durationMs
        ? 1 / Math.max(1, p.overMs * 0.55) : 0);

    // The headline plane (glyphs + grain, SAME sway phase so they stay registered) keeps living
    // in 3D; the pinned corner words never move — that contrast is what makes the dispersion
    // read, so they stay pinned. Rack focus on entry; an erosion blur that breathes with the
    // ramp and dies at both resting states (d only rests at 0 or 1, where sin(πd) = 0).
    const sway = sway3d(timeMs, seed, 1.2, 4200);
    const headBlur = (1 - clamp01(entry)) * 5 + 2.2 * Math.sin(Math.PI * clamp01(d));

    const footerWords = p.footer.split(/\s+/).filter(Boolean);
    const bandW = width * 0.94;
    const bandH = p.size * 1.1;
    const n = Math.min(MAX_SPECKS, Math.round(p.specks));

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, color: p.ink }}>
        <div
          style={{
            position: 'absolute', left: '3%', top: '9%',
            fontSize: p.small, letterSpacing: p.track, fontWeight: 600, textTransform: 'uppercase',
            opacity: 0.6 * clamp01(entry * 1.5),
            ...el('topLeft'),
          }}
        >
          {p.topLeft}
        </div>
        <div
          style={{
            position: 'absolute', right: '3%', top: '9%',
            fontSize: p.small, letterSpacing: p.track, fontWeight: 600, textTransform: 'uppercase',
            opacity: 0.6 * clamp01(entry * 1.5),
            ...el('topRight'),
          }}
        >
          {p.topRight}
        </div>

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `${sway} translateY(-50%)`,
          }}
        >
          <span
            style={{
              fontSize: p.size, fontWeight: 800, letterSpacing: -p.size * 0.02, lineHeight: 1,
              whiteSpace: 'nowrap',
              // The reference never loses the word — it erodes to a grainy ghost and holds there.
              // Fading it out entirely was the first pass and read as a plain cross-dissolve.
              opacity: clamp01(entry) * (1 - Math.min(1, d * (p.vanish ? 1.35 : 0.62))),
              // Rack focus in, erosion breath while the ramp runs, crisp at every rest.
              filter: headBlur > 0.3 ? `blur(${headBlur.toFixed(2)}px)` : undefined,
              transform: `scale(${(0.97 + clamp01(entry) * 0.03).toFixed(4)})`,
              ...el('headline'),
            }}
          >
            {p.text}
          </span>
        </div>

        {/* Grain layer. Specks start inside the headline's band and drift out and up. */}
        <div
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: bandW, height: bandH,
            transform: `${sway} translate(-50%,-50%)`,
            opacity: d > 0.001 ? 1 : 0,
            ...el('grain'),
          }}
        >
          {Array.from({ length: n }).map((_, i) => {
            const bx = random(`${seed}x${i}`);
            const by = random(`${seed}y${i}`);
            const ang = random(`${seed}a${i}`) * Math.PI * 2;
            const dist = (0.25 + random(`${seed}s${i}`) * 0.75) * p.spread;
            // Specks nearer the trailing edge leave first, so the word erodes rather than
            // exploding all at once.
            const lead = clamp01((d - bx * 0.45) / 0.55);
            const size = p.size * 0.022 + random(`${seed}z${i}`) * p.size * 0.038;
            // MOTION BLUR: each speck's analytic velocity (its own radial ramp rate) turns the
            // dot into a streak ALONG its flight line while it moves — rotate to the flight
            // angle, stretch, blur — and back into a crisp dot the instant the ramp rests.
            const active = lead > 0 && lead < 1 ? Math.abs(dRate) / 0.55 : 0;
            const speed = dist * active;
            const stretch = Math.min(2.5, speed * 5);
            const speckBlur = Math.min(3, speed * 2);
            return (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: bx * bandW, top: by * bandH,
                  width: size, height: size,
                  background: p.ink,
                  opacity: clamp01(1 - lead) * 0.9,
                  filter: speckBlur > 0.3 ? `blur(${speckBlur.toFixed(2)}px)` : undefined,
                  transform:
                    `translate(${(Math.cos(ang) * dist * lead).toFixed(2)}px, `
                    + `${(Math.sin(ang) * dist * lead - lead * p.size * 0.3).toFixed(2)}px) `
                    + `rotate(${((ang * 180) / Math.PI).toFixed(1)}deg) `
                    + `scale(${(1 + stretch).toFixed(3)}, ${Math.max(0.55, 1 - stretch * 0.25).toFixed(3)})`,
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute', left: '3%', right: '3%', top: '87%',
            display: 'flex', justifyContent: 'space-between',
            fontSize: p.small, letterSpacing: p.track, fontWeight: 600, textTransform: 'uppercase',
            opacity: 0.6 * clamp01(entry * 1.5),
            ...el('footer'),
          }}
        >
          {footerWords.map((w, i) => <span key={i}>{w}</span>)}
        </div>
      </div>
    );
  },
});
