// Reference: social/wedding-announcement.mp4  (window 40-4840ms, names land ~1600ms)
// Gold serif names over a night skyline. Everything below the type is generated from the seed
// rather than drawn by hand: building heights and widths, which windows are lit, and the star
// field. That is what makes it a template — change the seed and you get a different city, with no
// new assets.
//
// Independent motions: the two names rise separately with the ampersand between them, the rules
// draw outward from the centre, windows flicker on their own offsets, and the stars twinkle.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

export const weddingAnnounce = defineGraphicsTemplate({
  id: 'wedding_announce',
  name: 'Wedding Announcement',
  category: 'title',
  tags: ['Wedding', 'Skyline', 'Elegant', 'Luxury'],
  design: { w: 620, h: 1100 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 92 },
  fonts: ['playfair', 'inter'],

  elements: [
    { key: 'names',   label: 'Names', hideable: false },
    { key: 'rules',   label: 'Rules' },
    { key: 'skyline', label: 'Skyline' },
    { key: 'stars',   label: 'Stars' },
  ],

  params: [
    { type: 'text', key: 'first',  label: 'First name',  group: 'Content', default: 'Claudia', maxLength: 24 },
    { type: 'text', key: 'second', label: 'Second name', group: 'Content', default: 'Ernesto', maxLength: 24 },
    { type: 'text', key: 'amp',    label: 'Joiner',      group: 'Content', default: '&', maxLength: 6 },

    { type: 'color',  key: 'gold',  label: 'Type',       group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'sky',   label: 'Sky top',    group: 'Style', default: '#06070C' },
    { type: 'color',  key: 'sky2',  label: 'Sky bottom', group: 'Style', default: '#131A2C' },
    { type: 'color',  key: 'city',  label: 'Buildings',  group: 'Style', default: '#04050A' },
    { type: 'color',  key: 'lit',   label: 'Windows',    group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',  label: 'Font',       group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size',  label: 'Name size',  group: 'Style', default: 92, min: 24, max: 190, step: 2, unit: 'px' },
    { type: 'number', key: 'buildings', label: 'Buildings', group: 'Style', default: 14, min: 4, max: 26, step: 1 },
    { type: 'number', key: 'stars', label: 'Stars',      group: 'Style', default: 16, min: 0, max: 50, step: 1 },

    { type: 'number', key: 'stagger', label: 'Name stagger', group: 'Motion', default: 260, min: 0, max: 900, step: 20, unit: 'ms' },
    { type: 'number', key: 'twinkle', label: 'Twinkle period', group: 'Motion', default: 2200, min: 600, max: 6000, step: 100, unit: 'ms' },
  ],

  // Elegant, never loud: an airy crescendo as the city rises, a breath as the first name lifts,
  // and one bell when the second name locks the couple in — off the same 200ms + stagger beats.
  sfx: (p) => [
    { atMs: 0, id: 'sweep', gain: 0.28 },
    { atMs: 200, id: 'whoosh', gain: 0.3 },
    { atMs: 200 + p.stagger, id: 'chime', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);

    const riseSpring = (delay: number) => (ms: number) => spring({
      frame: fr(ms - delay), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 145 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    const rise = (delay: number) => {
      const sAt = riseSpring(delay);
      const s = sAt(timeMs);
      // The lift is ~38px of real travel, so it carries an honest smear that dies as the name
      // seats — gold serif must land dead sharp or it reads as a cheap glow.
      const yAt = (ms: number) => (1 - sAt(ms)) * height * 0.035;
      const sm = smear(0, -vel(yAt, timeMs), 1.4);
      return {
        opacity: interpolate(s, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
        filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
        transform: `translateY(${yAt(timeMs).toFixed(3)}px) scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
      };
    };

    // Rules draw outward from the centre.
    const ruleW = interpolate(timeMs, [200, 900], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const skyIn = interpolate(timeMs, [0, 700], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    const cityTop = height * 0.70;
    const cityH = height - cityTop;

    // The type block lives in space over the city — it turns in with the first name and then
    // breathes at ±1.3° on a slow 5.6s period. Stars sit furthest back, the skyline just behind
    // the type and shifts LATERALLY only (a vertical nudge would open a sliver of sky under the
    // buildings), and the gold rules ride proud in front.
    const pose = depthPose(timeMs, seed, { enter: riseSpring(200)(timeMs), rx: -7, ry: 5, z: -70, swayDeg: 1.3, periodMs: 5600 });
    const parStars = parallax(timeMs, seed, 0.12, width * 0.02, 5600);
    const parCity = parallax(timeMs, seed, 0.28, width * 0.02, 5600);
    const parRules = parallax(timeMs, seed, 0.65, width * 0.02, 5600);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: `linear-gradient(180deg, ${p.sky} 0%, ${p.sky2} 100%)`,
          fontFamily: ff,
        }}
      >
        {/* Stars — each twinkles on its own phase. */}
        <div
          style={{
            position: 'absolute', inset: 0,
            transform: `translate(${parStars.x.toFixed(2)}px, ${parStars.y.toFixed(2)}px)`,
            ...el('stars'),
          }}
        >
          {Array.from({ length: p.stars }).map((_, i) => {
            const sx = random(`${seed}sx${i}`) * width;
            const sy = height * 0.15 + random(`${seed}sy${i}`) * (cityTop * 0.95 - height * 0.15);
            const sz = width * (0.004 + random(`${seed}sz${i}`) * 0.008);
            const ph = random(`${seed}sp${i}`);
            const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(((timeMs / p.twinkle) + ph) * Math.PI * 2));
            return (
              <div
                key={i}
                style={{
                  position: 'absolute', left: sx, top: sy,
                  width: sz, height: sz, borderRadius: '50%',
                  background: p.gold,
                  opacity: tw * skyIn,
                  boxShadow: `0 0 ${sz * 3}px ${rgba(p.lit, 0.7 * tw)}`,
                }}
              />
            );
          })}
        </div>

        {/* Names */}
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: height * 0.2,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: height * 0.005,
            color: p.gold, textAlign: 'center',
            textShadow: `0 0 ${Math.round(p.size * 0.4)}px ${rgba(p.gold, 0.25)}`,
            transform: pose,
            ...el('names'),
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: width * 0.05, marginBottom: height * 0.012,
              transform: `translate(${parRules.x.toFixed(2)}px, ${parRules.y.toFixed(2)}px)`,
              ...el('rules'),
            }}
          >
            <div style={{ width: width * 0.14 * ruleW, height: 2, background: p.gold, opacity: 0.85, boxShadow: `0 0 10px ${rgba(p.gold, 0.45)}` }} />
            <div style={{ width: width * 0.14 * ruleW, height: 2, background: p.gold, opacity: 0.85, boxShadow: `0 0 10px ${rgba(p.gold, 0.45)}` }} />
          </div>
          <span style={{ fontSize: p.size, fontStyle: 'italic', lineHeight: 1.06, ...rise(200) }}>{p.first}</span>
          <span style={{ fontSize: p.size * 0.62, fontStyle: 'italic', lineHeight: 1.1, ...rise(200 + p.stagger * 0.5) }}>{p.amp}</span>
          <span style={{ fontSize: p.size, fontStyle: 'italic', lineHeight: 1.06, ...rise(200 + p.stagger) }}>{p.second}</span>
        </div>

        {/* Skyline — heights, widths and lit windows all from the seed. */}
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: cityTop, height: cityH,
            display: 'flex', alignItems: 'flex-end',
            transform: `translateX(${parCity.x.toFixed(2)}px)`,
            ...el('skyline'),
          }}
        >
          {Array.from({ length: p.buildings }).map((_, i) => {
            const bw = width / p.buildings * (0.8 + random(`${seed}bw${i}`) * 0.5);
            const bh = cityH * (0.34 + random(`${seed}bh${i}`) * 0.62);
            const cols = Math.max(1, Math.round(bw / (width * 0.035)));
            const rows = Math.max(2, Math.round(bh / (cityH * 0.09)));
            return (
              <div
                key={i}
                style={{
                  width: bw, height: bh, flexShrink: 0, background: p.city,
                  marginLeft: i === 0 ? 0 : -width * 0.004,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  gridAutoRows: `${(bh / rows).toFixed(2)}px`,
                  padding: bw * 0.16, boxSizing: 'border-box',
                  gap: bw * 0.1,
                  transform: `translateY(${((1 - skyIn) * cityH * 0.25).toFixed(2)}px)`,
                  opacity: skyIn,
                }}
              >
                {Array.from({ length: cols * rows }).map((__, k) => {
                  const on = random(`${seed}w${i}_${k}`) > 0.55;
                  if (!on) return <span key={k} />;
                  // Each lit window breathes on its own offset.
                  const ph = random(`${seed}wp${i}_${k}`);
                  const flick = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(((timeMs / (p.twinkle * 1.7)) + ph) * Math.PI * 2));
                  return <span key={k} style={{ background: p.lit, opacity: flick * 0.9, borderRadius: 1 }} />;
                })}
              </div>
            );
          })}
        </div>

        <div style={luxeVignette(0.35)} />
        <div style={luxeGrain(0.04)} />
      </div>
    );
  },
});
