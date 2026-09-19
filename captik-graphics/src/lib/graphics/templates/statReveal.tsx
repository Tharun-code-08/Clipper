// Reference: social/upwork-ad.mp4  (window 1080-4280ms, settles ~2600ms)
// A statistic that counts up over a gradient that rises from the bottom. Four separate clocks: the
// glow floods up, the brand label fades, the number counts AND springs its scale on each tick, and
// the two support lines arrive last. The number is floor()'d off timeMs so every frame at the same
// millisecond shows the same digits.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeLabel, luxeVignette } from '../luxe';
import { depthPose, parallax } from '../juice';

export const statReveal = defineGraphicsTemplate({
  id: 'stat_reveal',
  name: 'Stat Reveal',
  category: 'money',
  tags: ['Stat', 'Counter', 'Ad', 'Luxury'],
  design: { w: 620, h: 1100 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'glow',   label: 'Gradient glow' },
    { key: 'brand',  label: 'Brand label' },
    { key: 'number', label: 'Number', hideable: false },
    { key: 'sub',    label: 'Caption' },
    { key: 'claim',  label: 'Claim' },
  ],

  params: [
    { type: 'text',   key: 'brand', label: 'Brand',   group: 'Content', default: 'Upwork', maxLength: 30 },
    { type: 'number', key: 'to',    label: 'Count to', group: 'Content', default: 41, min: 0, max: 100, step: 1 },
    { type: 'text',   key: 'suffix', label: 'Suffix', group: 'Content', default: '%', maxLength: 6 },
    { type: 'text',   key: 'sub',   label: 'Caption', group: 'Content', default: 'of top companies agree', maxLength: 60 },
    { type: 'text',   key: 'claim', label: 'Claim',   group: 'Content', default: 'AI works best when humans lead.', maxLength: 80 },

    { type: 'color',  key: 'bg',     label: 'Background', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'accent', label: 'Accent',     group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Text',       group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Number size', group: 'Style', default: 150, min: 40, max: 300, step: 2, unit: 'px' },
    { type: 'number', key: 'glow',   label: 'Glow height', group: 'Style', default: 62, min: 0, max: 100, step: 2, unit: '%' },
    { type: 'boolean', key: 'panel', label: 'Draw background', group: 'Style', default: true },

    { type: 'number', key: 'countMs', label: 'Count time',  group: 'Motion', default: 1500, min: 200, max: 4000, step: 50, unit: 'ms' },
    { type: 'number', key: 'startAt', label: 'Start at',    group: 'Motion', default: 380, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Line stagger', group: 'Motion', default: 260, min: 0, max: 900, step: 20, unit: 'ms' },
  ],

  // Counter palette: an air pass as the glow floods up, ONE tick as the count starts, and the
  // coin exactly where the stat lands — timed off the same startAt/countMs as the digits.
  sfx: (p) => [
    { atMs: 40, id: 'whoosh', gain: 0.4 },
    { atMs: p.startAt, id: 'tick', gain: 0.4 },
    { atMs: p.startAt + p.countMs, id: 'coin', gain: 0.55 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);

    // Returns the pieces rather than a style object, so a caller that also needs its own
    // transform (the counting number does) can COMPOSE instead of silently clobbering one.
    const beat = (delay: number) => {
      const s = spring({
        frame: fr(timeMs - delay), fps: FPS,
        config: { damping: 26, mass: 0.6, stiffness: 175 },
        durationInFrames: Math.max(1, Math.round(fr(420))),
      });
      return {
        opacity: interpolate(s, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
        shift: `translateY(${((1 - s) * height * 0.02).toFixed(3)}px)`,
      };
    };
    const styleOf = (b: { opacity: number; shift: string }) => ({ opacity: b.opacity, transform: b.shift });

    // Glow floods up from the bottom before anything else.
    const flood = interpolate(timeMs, [0, 900], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    });

    // Count: floor()'d so digits are stable per frame; scale kicks on each new value.
    const prog = clamp01((timeMs - p.startAt) / Math.max(1, p.countMs));
    const eased = interpolate(prog, [0, 1], [0, 1], { easing: Easing.out(Easing.cubic) });
    const value = Math.round(p.to * eased);
    const tickPhase = (p.to * eased) % 1;
    const kick = 1 + (1 - Math.min(1, tickPhase * 6)) * 0.035 * (prog < 1 ? 1 : 0);
    // MOTION BLUR on the roll: the cubic-out count is fastest at the start, so the blur rides
    // (1-prog)^2 — the remaining count velocity — and the stat is CRISP the frame it lands.
    const countBlur = prog > 0 && prog < 1 ? Math.pow(1 - prog, 2) * 5 : 0;

    // Depth: the whole stat block swings in over the glow and holds a ±1.8° sway; the glow
    // (backplate), brand and claim shear at their own parallax depths — the BACKGROUND panel
    // stays put (it is the frame, not a card).
    const colIn = spring({
      frame: fr(timeMs - 60), fps: FPS,
      config: { damping: 26, mass: 0.7, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const pose = depthPose(timeMs, seed, { enter: colIn, rx: -14, z: -80, swayDeg: 1.8 });
    const parGlow = parallax(timeMs, seed, 0.3, height * 0.008);
    const parBrand = parallax(timeMs, seed, 0.5, height * 0.008);
    const parClaim = parallax(timeMs, seed, 0.7, height * 0.008);

    const numIn = beat(p.startAt + p.stagger * 0.4);
    const fsBrand = Math.round(width * 0.055);
    const fsSub = Math.round(width * 0.036);
    const fsClaim = Math.round(width * 0.038);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: p.panel ? p.bg : 'transparent', fontFamily: ff }}>
        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: `${p.glow}%`,
            background: `linear-gradient(to top, ${rgba(p.accent, 0.9)} 0%, ${rgba(p.accent, 0.42)} 30%, ${rgba(p.accent, 0)} 100%)`,
            transform: `translate(${parGlow.x.toFixed(2)}px, ${(parGlow.y + (1 - flood) * height * 0.35).toFixed(2)}px)`,
            opacity: flood,
            ...el('glow'),
          }}
        />

        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: height * 0.012, color: p.ink, textAlign: 'center', padding: width * 0.06, boxSizing: 'border-box', transform: pose }}>
          <span style={{ ...luxeLabel(Math.round(fsBrand * 0.82), rgba(p.ink, 0.75)), opacity: beat(p.startAt).opacity, transform: `translate(${parBrand.x.toFixed(2)}px, ${parBrand.y.toFixed(2)}px) ${beat(p.startAt).shift}`, ...el('brand') }}>{p.brand}</span>

          <span
            style={{
              fontSize: p.size, fontWeight: 800, color: p.accent, lineHeight: 1.02,
              fontVariantNumeric: 'tabular-nums',
              // Compose the entrance shift WITH the per-tick scale kick; spreading a style that
              // also carries `transform` here would drop the kick entirely.
              transform: `${numIn.shift} scale(${kick.toFixed(4)})`,
              transformOrigin: 'center center',
              opacity: numIn.opacity,
              filter: countBlur > 0.3 ? `blur(${countBlur.toFixed(2)}px)` : undefined,
              textShadow: `0 0 ${Math.round(p.size * 0.1)}px ${rgba(p.accent, 0.4)}, 0 0 ${Math.round(p.size * 0.32)}px ${rgba(p.accent, 0.22)}`,
              ...el('number'),
            }}
          >
            {value}{p.suffix}
          </span>

          <span style={{ fontSize: fsSub, color: rgba(p.ink, 0.7), letterSpacing: '0.02em', ...styleOf(beat(p.startAt + p.stagger)), ...el('sub') }}>{p.sub}</span>
          <span style={{ fontSize: fsClaim, fontWeight: 700, letterSpacing: '0.01em', marginTop: height * 0.008, opacity: beat(p.startAt + p.stagger * 2).opacity, transform: `translate(${parClaim.x.toFixed(2)}px, ${parClaim.y.toFixed(2)}px) ${beat(p.startAt + p.stagger * 2).shift}`, ...el('claim') }}>{p.claim}</span>
        </div>

        {p.panel && <div style={luxeVignette(0.45)} />}
        {p.panel && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
