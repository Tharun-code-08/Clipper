// SCENE 9 — the word rhythm.
//
// Reference: high-impact SaaS teaser. Its spine is not a headline, it is a SEQUENCE of giant
// single words, each owning the frame for well under a second, with the GROUND flipping between
// them: near-white, near-black, and a blue-to-warm mesh gradient. Each word lands from slightly
// oversized under a whisper of blur, holds, and is gone — the cut IS the transition, and the
// ground flip is what stops a string of words reading as one long title card.
//
// One instance plays a whole run of words, so the rhythm lives in one editable row rather than
// six. That is the difference between a scene and a stack of overlays.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, finishFor, glide, lerp, lum, sceneFade, sceneGrain, sceneVignette } from '../sceneKit';

export const sceneWordFlash = defineGraphicsTemplate({
  id: 'scene_word_flash',
  name: 'Scene · Word Rhythm',
  category: 'title',
  tags: ['Scene', 'Kinetic', 'Words', 'Teaser', 'Gradient', 'Promo'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'word',  label: 'Word', hideable: false },
    { key: 'ground', label: 'Ground' },
    { key: 'grid',  label: 'Grid lines' },
    { key: 'grain', label: 'Grain' },
  ],

  params: [
    { type: 'text', key: 'words', label: 'Words', group: 'Content', multiline: true, maxLength: 220,
      default: 'Ready\nto go\nbig?', help: 'One per line. Each gets the frame for `holdMs`.' },
    { type: 'text', key: 'grounds', label: 'Grounds', group: 'Content', maxLength: 60, default: 'light|mesh|dark',
      help: 'Pipe separated, cycled: light · dark · mesh · accent.' },

    { type: 'color', key: 'bg',      label: 'Light ground', group: 'Style', default: '#fdfdfd' },
    { type: 'color', key: 'dark',    label: 'Dark ground',  group: 'Style', default: '#1a1614' },
    { type: 'color', key: 'accent',  label: 'Accent',       group: 'Style', default: '#1e69f1' },
    { type: 'color', key: 'accent2', label: 'Mesh warm',    group: 'Style', default: '#f2542d' },
    { type: 'font',  key: 'font',    label: 'Font',         group: 'Style', default: 'clash' },
    { type: 'number', key: 'size',   label: 'Word size',    group: 'Style', default: 210, min: 60, max: 400, step: 4, unit: 'px' },
    { type: 'boolean', key: 'grid',  label: 'Grid lines on gradients', group: 'Style', default: true },

    { type: 'number', key: 'holdMs', label: 'Each word holds', group: 'Motion', default: 1200, min: 300, max: 3000, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [
    { atMs: p.delay + 60, id: 'slam', gain: 0.45 },
    { atMs: p.delay + p.holdMs, id: 'slam', gain: 0.4 },
    { atMs: p.delay + p.holdMs * 2, id: 'slam', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const list = String(p.words).split('\n').map((w) => w.trim()).filter(Boolean);
    if (!list.length) return null;
    const grounds = String(p.grounds).split('|').map((g) => g.trim().toLowerCase()).filter(Boolean);

    const i = Math.min(list.length - 1, Math.max(0, Math.floor(t / Math.max(1, p.holdMs))));
    const local = t - i * p.holdMs;
    const word = list[i];
    const ground = grounds.length ? grounds[i % grounds.length] : 'light';

    // each word lands from oversized under a whisper of blur and is gone — the cut is the move
    const s = spring({
      frame: fr(local), fps: FPS,
      config: { damping: 16, mass: 0.6, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const e = glide(clamp01(s));
    const outT = glide(clamp01((local - (p.holdMs - 140)) / 140));
    const scale = lerp(1.22, 1, e) * lerp(1, 0.94, outT);
    const blur = (1 - e) * S * 0.012;

    const isDark = ground === 'dark';
    const isMesh = ground === 'mesh';
    const isAccent = ground === 'accent';
    const groundBg = isDark ? p.dark
      : isAccent ? p.accent
      : isMesh
        ? `radial-gradient(120% 130% at 12% 18%, ${p.accent} 0%, ${alpha(p.accent, 0.75)} 32%, ${alpha(p.accent2, 0.7)} 68%, ${p.accent2} 100%)`
        : p.bg;
    // ink must read on whichever ground this word landed on
    const groundLight = isMesh || isAccent ? false : !isDark && lum(p.bg) > 0.5;
    const ink = isMesh || isAccent ? '#ffffff' : groundLight ? p.accent : '#ffffff';
    const fin = finishFor(isDark || isMesh || isAccent ? p.dark : p.bg);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack(p.font) }}>
        <div style={{ position: 'absolute', inset: 0, background: groundBg, ...el('ground') }} aria-hidden />

        {/* the reference rules its gradient frames with a faint grid — it reads as "product", not poster */}
        {p.grid && (isMesh || isAccent) && (
          <div style={{ position: 'absolute', inset: 0, opacity: 0.5, ...el('grid') }} aria-hidden>
            {[0.22, 0.5, 0.78].map((x) => (
              <div key={`v${x}`} style={{ position: 'absolute', left: `${x * 100}%`, top: 0, bottom: 0,
                width: 1, background: alpha('#ffffff', 0.35) }} />
            ))}
            {[0.28, 0.72].map((y) => (
              <div key={`h${y}`} style={{ position: 'absolute', top: `${y * 100}%`, left: 0, right: 0,
                height: 1, background: alpha('#ffffff', 0.35) }} />
            ))}
            {[[0.22, 0.28], [0.5, 0.28], [0.78, 0.28], [0.22, 0.72], [0.5, 0.72], [0.78, 0.72]].map(([x, y], k) => (
              <div key={`d${k}`} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`,
                width: Math.round(S * 0.009), height: Math.round(S * 0.009), marginLeft: -Math.round(S * 0.0045),
                marginTop: -Math.round(S * 0.0045), borderRadius: 2, background: alpha('#ffffff', 0.9) }} />
            ))}
          </div>
        )}

        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'grid', placeItems: 'center',
            padding: '0 6%',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: Math.round(S * (p.size / 1080)),
            lineHeight: 1,
            letterSpacing: '-0.035em',
            color: ink,
            opacity: clamp01(e * 1.4) * (1 - outT * 0.85),
            filter: blur > 0.4 ? `blur(${blur.toFixed(2)}px)` : 'none',
            transform: `scale(${scale})`,
            ...el('word'),
          }}
        >
          {word}
        </div>

        <div style={{ ...sceneGrain(fin.grain), ...el('grain') }} aria-hidden />
        <div style={sceneVignette(fin.vig * 0.6)} aria-hidden />
      </div>
    );
  },
});
