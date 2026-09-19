// SCENE 11 — the proof mosaic.
//
// Reference: the "Trusted by / Backed by real results" beats. A headline holds the centre while
// cards — reviews, stat tiles, avatars — fly in around it, each tilted, each landing on its own
// spring, filling the frame from the edges inward. The headline's last word takes the accent and
// arrives after the cards, so the eye reads the evidence first and the claim second.
//
// Deterministic scatter: positions come from index math, never random, so the composition is the
// same every render and can be nudged per card from the panel.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, finishFor, glide, lerp, lum, rows, sceneFade, sceneGrain, sceneGround, sceneVignette, win, words } from '../sceneKit';

export const sceneCardMosaic = defineGraphicsTemplate({
  id: 'scene_card_mosaic',
  name: 'Scene · Proof Mosaic',
  category: 'social',
  tags: ['Scene', 'Testimonials', 'Proof', 'Cards', 'Social', 'Promo'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 4600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'headline', label: 'Headline', hideable: false },
    { key: 'cards',    label: 'Cards' },
    { key: 'grain',    label: 'Grain' },
  ],

  params: [
    { type: 'text', key: 'headline', label: 'Headline', group: 'Content', default: 'Trusted by real creators', maxLength: 48 },
    { type: 'number', key: 'accentFrom', label: 'Accent from word', group: 'Content', default: 2, min: 0, max: 8, step: 1 },
    { type: 'text', key: 'cards', label: 'Cards', group: 'Content', multiline: true, maxLength: 420,
      default: '★★★★★|finally gets Hinglish|@rhea.edits\n★★★★★|4K export, no watermark|@studio.vk\n★★★★★|word-level fixes are unreal|@thecutguy\n★★★★★|22 languages, one click|@desi.reels\n★★★★★|my whole workflow now|@mira.makes\n★★★★★|captions in 40 seconds|@shortsdaily',
      help: 'One per line: badge | quote | handle. Up to 6.' },

    { type: 'color', key: 'bg',      label: 'Background', group: 'Style', default: '#fdfdfd' },
    { type: 'color', key: 'ink',     label: 'Headline',   group: 'Style', default: '#1a1614' },
    { type: 'color', key: 'dim',     label: 'Handles',    group: 'Style', default: '#8a8a90' },
    { type: 'color', key: 'accent',  label: 'Accent',     group: 'Style', default: '#1e69f1' },
    { type: 'color', key: 'surface', label: 'Card',       group: 'Style', default: '#ffffff' },
    { type: 'color', key: 'line',    label: 'Card edge',  group: 'Style', default: '#e6e6ea' },
    { type: 'font',  key: 'font',    label: 'Font',       group: 'Style', default: 'clash' },
    { type: 'number', key: 'size',   label: 'Headline size', group: 'Style', default: 96, min: 40, max: 180, step: 2, unit: 'px' },

    { type: 'number', key: 'stagger', label: 'Card stagger', group: 'Motion', default: 130, min: 40, max: 400, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [
    { atMs: p.delay + 160, id: 'swish', gain: 0.35 },
    { atMs: p.delay + 160 + p.stagger * 3, id: 'pop', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const cells = rows(p.cards, 6);
    const fin = finishFor(p.bg);
    const light = lum(p.bg) > 0.5;
    const ws = words(p.headline);

    // cards ring the headline: three a side, pushed to the frame edges
    const spots = [
      { x: 0.17, y: 0.22 }, { x: 0.83, y: 0.20 },
      { x: 0.13, y: 0.56 }, { x: 0.87, y: 0.54 },
      { x: 0.24, y: 0.85 }, { x: 0.77, y: 0.83 },
    ];
    const cardW = Math.round(width * 0.235);
    // the claim arrives AFTER the evidence
    const headAt = 160 + Math.min(cells.length, 6) * p.stagger * 0.6;
    const headIn = win(t, headAt, durationMs, 260, 300);
    const out = glide(clamp01((t - (durationMs - 320)) / 320));

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack('inter') }}>
        {sceneGround(p.bg, p.accent, t, width, height).map((st, i) => (
          <div key={`g${i}`} style={st} aria-hidden />
        ))}

        <div style={{ position: 'absolute', inset: 0, ...el('cards') }}>
          {cells.map((c, i) => {
            const at = 160 + i * p.stagger;
            const s = spring({
              frame: fr(t - at), fps: FPS,
              config: { damping: 15, mass: 0.6, stiffness: 165 },
              durationInFrames: Math.max(1, Math.round(fr(520))),
            });
            const e = glide(clamp01(s));
            const sp = spots[i % spots.length];
            const fromEdge = sp.x < 0.5 ? -1 : 1;
            const idle = Math.sin((t / 1000) * 1.4 + i * 1.1) * S * 0.0035;
            const rot = (i % 2 ? 4.5 : -4.5) + ((i * 37) % 5) - 2;
            return (
              <div key={i} style={{
                position: 'absolute',
                left: sp.x * width, top: sp.y * height,
                width: cardW, marginLeft: -cardW / 2,
                padding: `${Math.round(S * 0.024)}px ${Math.round(S * 0.026)}px`,
                borderRadius: Math.round(S * 0.017),
                background: p.surface,
                border: `2px solid ${p.line}`,
                boxShadow: `0 ${Math.round(S * 0.022)}px ${Math.round(S * 0.05)}px ${alpha('#000000', light ? 0.1 : 0.45)}`,
                opacity: e * (1 - out),
                transform:
                  `translate(${(1 - e) * fromEdge * width * 0.14}px, ${idle - out * S * 0.05}px)`
                  + ` rotate(${lerp(rot * 2.2, rot, e)}deg) scale(${lerp(0.86, 1, e)})`,
              }}>
                <div style={{ fontSize: Math.round(S * 0.022), color: p.accent, letterSpacing: '0.06em' }}>{c[0] ?? ''}</div>
                <div style={{
                  fontFamily: fontStack(p.font), fontWeight: 700,
                  fontSize: Math.round(S * 0.027), color: p.ink,
                  marginTop: Math.round(S * 0.008), lineHeight: 1.2,
                }}>{c[1] ?? ''}</div>
                {c[2] && (
                  <div style={{ fontSize: Math.round(S * 0.019), color: p.dim, marginTop: Math.round(S * 0.007) }}>{c[2]}</div>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute', left: '20%', right: '20%', top: '50%',
            textAlign: 'center',
            fontFamily: fontStack(p.font), fontWeight: 700,
            fontSize: Math.round(S * (p.size / 1080)),
            lineHeight: 1.05, letterSpacing: '-0.03em',
            color: p.ink,
            opacity: headIn,
            transform: `translateY(-50%) scale(${lerp(0.94, 1, headIn)})`,
            ...el('headline'),
          }}
        >
          {ws.map((w, i) => (
            <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', color: i >= p.accentFrom ? p.accent : p.ink }}>
              {w}{i < ws.length - 1 ? ' ' : ''}
            </span>
          ))}
        </div>

        <div style={{ ...sceneGrain(fin.grain), ...el('grain') }} aria-hidden />
        <div style={sceneVignette(fin.vig)} aria-hidden />
      </div>
    );
  },
});
