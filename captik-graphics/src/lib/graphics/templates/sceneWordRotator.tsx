// SCENE 10 — the audience rotator.
//
// Reference: the "Your [✓] Product / App / Agency" beat. A fixed lead word, a checkbox chip, and
// a column of options where ONE is live and the others sit ghosted above and below — the list
// scrolls so the live slot stays put, and the chip ticks each time it changes. It is the single
// clearest way to say "this is for you, whoever you are", which is why every SaaS promo has a
// version of it.
//
// For Captik the options are formats (Reels / Shorts / Podcasts); for anyone else they are
// audiences. Same choreography either way — that is what makes it a scene and not a one-off.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, finishFor, glide, lerp, lum, sceneFade, sceneGrain, sceneGround, sceneVignette, win } from '../sceneKit';

export const sceneWordRotator = defineGraphicsTemplate({
  id: 'scene_word_rotator',
  name: 'Scene · Audience Rotator',
  category: 'title',
  tags: ['Scene', 'Rotator', 'List', 'Audience', 'Promo', 'Teaser'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'lead',    label: 'Lead word' },
    { key: 'chip',    label: 'Check chip' },
    { key: 'options', label: 'Options', hideable: false },
    { key: 'grain',   label: 'Grain' },
  ],

  params: [
    { type: 'text', key: 'lead', label: 'Lead word', group: 'Content', default: 'Your', maxLength: 20 },
    { type: 'text', key: 'options', label: 'Options', group: 'Content', multiline: true, maxLength: 200,
      default: 'Reels\nShorts\nPodcasts\nCourses', help: 'One per line. Each takes the live slot in turn.' },
    { type: 'boolean', key: 'chip', label: 'Check chip', group: 'Content', default: true },

    { type: 'color', key: 'bg',     label: 'Background', group: 'Style', default: '#fdfdfd' },
    { type: 'color', key: 'ink',    label: 'Live option', group: 'Style', default: '#1a1614' },
    { type: 'color', key: 'accent', label: 'Lead + chip', group: 'Style', default: '#1e69f1' },
    { type: 'font',  key: 'font',   label: 'Font', group: 'Style', default: 'clash' },
    { type: 'number', key: 'size',  label: 'Size', group: 'Style', default: 132, min: 50, max: 240, step: 2, unit: 'px' },

    { type: 'number', key: 'holdMs', label: 'Each option holds', group: 'Motion', default: 900, min: 250, max: 2400, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [
    { atMs: p.delay + p.holdMs, id: 'tick', gain: 0.35 },
    { atMs: p.delay + p.holdMs * 2, id: 'tick', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const opts = String(p.options).split('\n').map((o) => o.trim()).filter(Boolean);
    if (!opts.length) return null;
    const fin = finishFor(p.bg);
    const light = lum(p.bg) > 0.5;

    const idx = Math.max(0, Math.floor(t / Math.max(1, p.holdMs)));
    const live = idx % opts.length;
    const local = t - idx * p.holdMs;
    // the column glides so the LIVE slot never moves — the list moves under it
    const slide = glide(clamp01(local / 260));
    const fs = Math.round(S * (p.size / 1080));
    const row = fs * 1.16;

    const chipS = spring({
      frame: fr(local), fps: FPS,
      config: { damping: 12, mass: 0.5, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(360))),
    });
    const tick = clamp01(1 - Math.abs(local) / 220);
    const blockIn = win(t, 0, durationMs, 200, 280);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack(p.font) }}>
        {sceneGround(p.bg, p.accent, t, width, height).map((st, i) => (
          <div key={`g${i}`} style={st} aria-hidden />
        ))}

        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: Math.round(S * 0.03),
          opacity: blockIn,
        }}>
          <div style={{
            fontWeight: 700, fontSize: fs, lineHeight: 1,
            letterSpacing: '-0.03em', color: p.accent,
            transform: `translateY(${(1 - blockIn) * S * 0.03}px)`,
            ...el('lead'),
          }}>{p.lead}</div>

          {p.chip && (
            <div style={{
              width: Math.round(fs * 0.62), height: Math.round(fs * 0.62),
              borderRadius: Math.round(fs * 0.17),
              background: p.accent, color: '#ffffff',
              display: 'grid', placeItems: 'center',
              fontSize: Math.round(fs * 0.38), fontWeight: 800,
              boxShadow: `0 ${Math.round(S * 0.014)}px ${Math.round(S * 0.035)}px ${alpha(p.accent, 0.35)}`,
              transform: `scale(${lerp(0.86, 1, glide(chipS)) * (1 + tick * 0.1)}) rotate(${lerp(-8, 0, glide(chipS))}deg)`,
              ...el('chip'),
            }}>✓</div>
          )}

          {/* the option column: live slot fixed, ghosts above and below */}
          <div style={{ position: 'relative', height: row * 3, minWidth: Math.round(S * 0.34), overflow: 'hidden', ...el('options') }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: row, transform: `translateY(${-slide * 0}px)` }}>
              {[-1, 0, 1].map((off) => {
                const oi = (live + off + opts.length * 2) % opts.length;
                const isLive = off === 0;
                // each row eases from the slot below toward its own — the live word arrives, the
                // one above it leaves, and nothing ever sits perfectly still
                const y = (off - (1 - slide)) * row + row * (1 - slide);
                return (
                  <div key={off} style={{
                    position: 'absolute', left: 0, right: 0, top: y - row,
                    fontWeight: 700, fontSize: fs, lineHeight: 1,
                    letterSpacing: '-0.03em',
                    color: isLive ? p.ink : alpha(light ? p.ink : '#ffffff', 0.22),
                    transform: `scale(${isLive ? lerp(0.94, 1, glide(clamp01(local / 240))) : 0.9})`,
                    transformOrigin: 'left center',
                  }}>{opts[oi]}</div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ ...sceneGrain(fin.grain), ...el('grain') }} aria-hidden />
        <div style={sceneVignette(fin.vig)} aria-hidden />
      </div>
    );
  },
});
