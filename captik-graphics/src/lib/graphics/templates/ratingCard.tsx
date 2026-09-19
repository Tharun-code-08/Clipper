// App-store style review card: five stars fill one by one with a tiny overshoot pop, then the
// quote fades up, then reviewer + green VERIFIED pill. All five outlines render from frame one
// and only the FILL + a scale bump animate per star — the row never reflows as stars land.
// Quote sits in Playfair italic (the PAPER citation-serif moment); chrome stays Montserrat.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, parallax } from '../juice';

const STAR = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

export const ratingCard = defineGraphicsTemplate({
  id: 'rating_card',
  name: 'Rating Card',
  category: 'social',
  tags: ['Stars', 'Review', 'Verified', 'Card', 'Quote'],
  badge: 'New',
  design: { w: 900, h: 450 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 32, widthPercent: 60 },
  fonts: ['montserrat', 'playfair'],

  elements: [
    { key: 'card',     label: 'Card', hideable: false },
    { key: 'stars',    label: 'Stars' },
    { key: 'quote',    label: 'Quote' },
    { key: 'reviewer', label: 'Reviewer' },
  ],

  params: [
    { type: 'text',   key: 'quote', label: 'Quote', group: 'Content', default: '“This paid for itself in a week.”', maxLength: 90, multiline: true },
    { type: 'text',   key: 'name',  label: 'Reviewer', group: 'Content', default: 'Arjun M.', maxLength: 26 },
    { type: 'image',  key: 'avatarImg', label: 'Reviewer photo', group: 'Content', default: '', help: 'Optional — nothing is drawn when empty.' },
    { type: 'number', key: 'stars', label: 'Stars', group: 'Content', default: 5, min: 1, max: 5, step: 1 },

    { type: 'color', key: 'starCol',  label: 'Star colour', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'badgeCol', label: 'Badge colour', group: 'Style', default: '#4ADE80' },
    { type: 'font',  key: 'font',     label: 'Font', group: 'Style', default: 'montserrat' },

    { type: 'number', key: 'stagger', label: 'Star stagger', group: 'Motion', default: 180, min: 80, max: 400, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // UI-card language: a glossy pop as the card lands, ONE tick as the star run starts, a chime
  // when the VERIFIED pill stamps — stars/stagger/delay retime the cues with the motion.
  sfx: (p) => [
    { atMs: p.delay + 80, id: 'pop' as const, gain: 0.45 },
    { atMs: p.delay + 440, id: 'tick' as const, gain: 0.5 },
    { atMs: p.delay + 380 + Math.round(p.stars) * p.stagger + 240 + 480 + 160, id: 'chime' as const, gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);
    const filled = Math.round(p.stars);

    // Card entrance: one friendly spring, small overshoot.
    const pop = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 19, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    const cardOp = interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

    const starStart = 380;
    const tQuote = starStart + filled * p.stagger + 240;
    const tRev = tQuote + 480;

    const quoteIn = easeOutQuint(clamp01((t - tQuote) / 480));
    const revIn = easeOutQuint(clamp01((t - tRev) / 420));
    const pillPop = spring({
      frame: fr(t - tRev - 120), fps: FPS,
      config: { damping: 15, mass: 0.6, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(450))),
    });

    const starSz = Math.round(height * 0.15);
    const fsQuote = Math.round(height * 0.095);
    const fsName = Math.round(height * 0.062);
    const fsPill = Math.round(height * 0.048);

    // UI-card mimic: the card SWINGS in through 3D on its existing spring, then rests on a very
    // restrained ≤1.2° sway; the inner layers sit at shallow depths (0.2-0.4) so the sway shears
    // them subtly without breaking the flat-UI read.
    const pose = depthPose(t, seed, { enter: pop, rx: -13, z: -90, swayDeg: 1.1 });
    const parStars = parallax(t, seed, 0.35, height * 0.012);
    const parQuote = parallax(t, seed, 0.2, height * 0.012);
    const parRev = parallax(t, seed, 0.4, height * 0.012);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: '#ffffff',
          borderRadius: Math.round(height * 0.065),
          border: '1px solid rgba(0,0,0,0.05)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          opacity: cardOp,
          transform: `${pose} translateY(${((1 - pop) * height * 0.05).toFixed(2)}px) scale(${(0.9 + pop * 0.1).toFixed(4)})`,
          transformOrigin: 'center center',
          fontFamily: ff,
          padding: `${Math.round(height * 0.1)}px ${Math.round(width * 0.06)}px`,
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: Math.round(height * 0.06),
          ...el('card'),
        }}
      >
        {/* Stars — outlines always present, fill lands one by one */}
        <div style={{ display: 'flex', gap: Math.round(width * 0.014), transform: `translate(${parStars.x.toFixed(2)}px, ${parStars.y.toFixed(2)}px)`, ...el('stars') }}>
          {Array.from({ length: 5 }).map((_, i) => {
            const ti = t - starStart - i * p.stagger;
            const on = i < filled;
            const bump = on ? Math.sin(Math.PI * clamp01(ti / 320)) : 0;
            const fillOp = on ? clamp01(ti / 160) : 0;
            return (
              <svg
                key={i}
                viewBox="0 0 24 24"
                width={starSz} height={starSz}
                style={{
                  transform: `scale(${(1 + bump * 0.28).toFixed(3)})`,
                  transformOrigin: 'center center',
                }}
              >
                <path d={STAR} fill="rgba(22,22,24,0.14)" />
                <path
                  d={STAR}
                  fill={p.starCol}
                  opacity={fillOp}
                  style={fillOp > 0.5 ? { filter: `drop-shadow(0 2px 8px ${rgba(p.starCol, 0.45)})` } : undefined}
                />
              </svg>
            );
          })}
        </div>

        {/* Quote */}
        <span
          style={{
            fontFamily: fontStack('playfair'), fontStyle: 'italic',
            fontSize: fsQuote, fontWeight: 500, color: '#22201B', lineHeight: 1.3,
            opacity: quoteIn,
            transform: `translate(${parQuote.x.toFixed(2)}px, ${(parQuote.y + (1 - quoteIn) * height * 0.05).toFixed(2)}px)`,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            ...el('quote'),
          }}
        >
          {p.quote}
        </span>

        {/* Reviewer + VERIFIED pill */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: Math.round(width * 0.024),
            opacity: revIn,
            transform: `translate(${parRev.x.toFixed(2)}px, ${(parRev.y + (1 - revIn) * height * 0.04).toFixed(2)}px)`,
            ...el('reviewer'),
          }}
        >
          {p.avatarImg && (
            <div style={{ width: Math.round(height * 0.095), height: Math.round(height * 0.095), borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.avatarImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )}
          <span style={{ fontSize: fsName, fontWeight: 700, color: '#22201B', whiteSpace: 'nowrap' }}>
            {p.name}
          </span>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: Math.round(fsPill * 0.35),
              fontSize: fsPill, fontWeight: 800, letterSpacing: '0.08em',
              color: '#08150C', background: p.badgeCol, borderRadius: 999,
              padding: `${Math.round(height * 0.018)}px ${Math.round(height * 0.04)}px`,
              transform: `scale(${clamp01(pillPop).toFixed(3)})`,
              transformOrigin: 'left center',
              boxShadow: `0 0 16px ${rgba(p.badgeCol, 0.35)}`,
            }}
          >
            <svg viewBox="0 0 24 24" width={fsPill} height={fsPill}>
              <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="#08150C" />
            </svg>
            VERIFIED
          </span>
        </div>
      </div>
    );
  },
});
