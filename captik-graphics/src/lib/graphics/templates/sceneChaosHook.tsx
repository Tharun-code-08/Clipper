// SCENE 1 — the chaos hook.
//
// Reference: SaaS explainer opener (message pills raining and piling over a headline, then a
// full-frame scheme flip). Decoded frame-by-frame: pills arrive on a stagger, fall with real
// weight (accelerate, land PAST the mark, rebound, settle) and keep drifting once landed; the
// headline rises word-by-word from below while its letter-spacing closes from loose to tight —
// that closing-up is the single most-missed detail in this kind of opener; then the whole
// palette FLIPS to accent for ~half a second and back, which is the cut the reference uses
// instead of a dissolve.
//
// Owns the frame (fullBleed): the pile is placed against the real frame edges and the flip
// floods it. Every string, colour and beat is a param, so the same choreography carries any
// brand — that is the point of a scene vs an overlay.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, drop, finishFor, glide, lerp, sceneFade, sceneGrain, sceneGround, sceneVignette, win, words } from '../sceneKit';

export const sceneChaosHook = defineGraphicsTemplate({
  id: 'scene_chaos_hook',
  name: 'Scene · Chaos Hook',
  category: 'story',
  tags: ['Scene', 'Hook', 'Chaos', 'Opener', 'Pills', 'Explainer'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 5600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'pile',     label: 'Message pile', hideable: false },
    { key: 'headline', label: 'Headline', hideable: false },
    { key: 'flip',     label: 'Colour flip' },
    { key: 'grain',    label: 'Grain' },
  ],

  params: [
    { type: 'text', key: 'headline', label: 'Headline', group: 'Content', default: 'Captions ka chaos?', maxLength: 60 },
    { type: 'number', key: 'accentFrom', label: 'Accent from word', group: 'Content', default: 2, min: 0, max: 10, step: 1,
      help: 'Words from this index on take the accent colour.' },
    { type: 'text', key: 'msgs', label: 'Messages', group: 'Content', multiline: true, maxLength: 400,
      default: 'captions kahan hai??\nbhai deadline aaj hai\nsubtitles garbled again\nHinglish samajh nahi aaya\nexport mein font toot gaya\nek aur baar likhna padega',
      help: 'One per line. Cycled to fill the pile.' },
    { type: 'number', key: 'count', label: 'How many pills', group: 'Content', default: 8, min: 3, max: 14, step: 1 },

    { type: 'color', key: 'bg',      label: 'Background', group: 'Style', default: '#0b0b0d' },
    { type: 'color', key: 'ink',     label: 'Headline',   group: 'Style', default: '#ffffff' },
    { type: 'color', key: 'accent',  label: 'Accent',     group: 'Style', default: '#fe9a00' },
    { type: 'color', key: 'surface', label: 'Alt pill',   group: 'Style', default: '#1c1c20' },
    { type: 'font',  key: 'font',    label: 'Headline font', group: 'Style', default: 'clash' },
    { type: 'number', key: 'size',   label: 'Headline size', group: 'Style', default: 100, min: 40, max: 180, step: 2, unit: 'px' },

    { type: 'boolean', key: 'flip',   label: 'Colour flip at the end', group: 'Motion', default: true },
    { type: 'number', key: 'flipMs',  label: 'Flip at', group: 'Motion', default: 4600, min: 500, max: 12000, step: 50, unit: 'ms',
      showIf: { key: 'flip', equals: true } },
    { type: 'number', key: 'stagger', label: 'Pill stagger', group: 'Motion', default: 210, min: 60, max: 600, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [
    { atMs: p.delay + 120, id: 'pop', gain: 0.35 },
    { atMs: p.delay + p.flipMs, id: 'slam', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const fin = finishFor(p.bg);          // scale everything off the SHORT edge so the
    const lines = String(p.msgs).split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return null;             // scene reads identically on 16:9 and 9:16

    // ---- the FLIP: accent floods the frame, headline inverts, and it recedes. A cut, not a fade.
    const flipT = p.flip ? win(t, p.flipMs, p.flipMs + 900, 190, 260) : 0;

    // ---- pills: deterministic pile, staggered gravity, perpetual drift once landed ----
    const pills = [];
    for (let i = 0; i < p.count; i++) {
      const text = lines[i % lines.length];
      const t0 = 180 + i * p.stagger;
      const s = spring({                         // the landing itself is sprung, not eased
        frame: fr(t - t0), fps: FPS,
        config: { damping: 14, mass: 0.7, stiffness: 150 },
        durationInFrames: Math.max(1, Math.round(fr(520))),
      });
      const d = drop(clamp01((t - t0) / 620));
      // column-major pile hugging the top third; index math only — never random
      const cols = Math.ceil(p.count / 2);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = width * (0.21 + (col / Math.max(1, cols - 1)) * 0.58) + ((i * 67) % 70) - 35;
      const y = height * 0.13 + row * S * 0.155 + (((i * 41) % 40) - 20);
      const rot = ((i * 53) % 22) - 11;
      // once landed it keeps breathing — a frozen pile reads as a screenshot
      const idle = Math.sin((t / 1000) * 1.6 + i * 0.9) * S * 0.004;
      const on = t >= t0 ? 1 : 0;
      const outv = p.flip ? glide(clamp01((t - p.flipMs) / 260)) : 0;
      pills.push({ i, text, on, s, d, x, y, rot, idle, outv,
        acc: i % 3 !== 1 });
    }

    // ---- headline: words rise from below as the tracking closes ----
    const ws = words(p.headline);
    const headIn = win(t, 300, Math.max(700, durationMs - 60), 40, 240);
    const track = lerp(0.09, -0.02, glide(clamp01((t - 340) / 620)));
    const inkNow = flipT > 0.5 ? p.bg : p.ink;

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack(p.font) }}>
        {sceneGround(p.bg, p.accent, t, width, height).map((st, i) => (
          <div key={`g${i}`} style={st} aria-hidden />
        ))}

        {/* the pile */}
        <div style={{ position: 'absolute', inset: 0, ...el('pile') }}>
          {pills.map((q) => (
            <div
              key={q.i}
              style={{
                position: 'absolute', left: 0, top: 0,
                padding: `${Math.round(S * 0.019)}px ${Math.round(S * 0.036)}px`,
                borderRadius: 999,
                fontFamily: fontStack('inter'),
                fontSize: Math.round(S * 0.031),
                fontWeight: 700,
                whiteSpace: 'nowrap',
                maxWidth: '38%', overflow: 'hidden', textOverflow: 'ellipsis',
                color: q.acc ? p.bg : p.ink,
                background: q.acc ? p.accent : p.surface,
                border: q.acc ? 'none' : `2px solid ${alpha(p.ink, 0.14)}`,
                boxShadow: `0 ${Math.round(S * 0.018)}px ${Math.round(S * 0.045)}px rgba(0,0,0,.28)`,
                opacity: q.on * (1 - q.outv),
                transform:
                  `translate(${q.x}px, ${lerp(-height * 0.22, q.y, q.d) + q.idle - q.outv * S * 0.12}px)`
                  + ` translateX(-50%) rotate(${lerp(q.rot * 2.1, q.rot, glide(q.s))}deg)`
                  + ` scale(${lerp(0.9, 1, glide(q.s)) * (1 - q.outv * 0.1)})`,
              }}
            >
              {q.text}
            </div>
          ))}
        </div>

        {/* the flip layer sits under the type so the headline inverts against it */}
        {p.flip && (
          <div style={{ position: 'absolute', inset: 0, background: p.accent, opacity: flipT, ...el('flip') }} aria-hidden />
        )}

        {/* headline */}
        <div
          style={{
            position: 'absolute', left: '6%', right: '6%', top: '52%',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: Math.round(S * (p.size / 1080)),
            letterSpacing: `${track}em`,
            lineHeight: 1.06,
            color: inkNow,
            opacity: headIn,
            transform: `scale(${lerp(1, 1.05, flipT)})`,
            ...el('headline'),
          }}
        >
          {ws.map((w, i) => {
            const wt = glide(clamp01((t - 340 - i * 70) / 300));
            const hot = i >= p.accentFrom && flipT < 0.5;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  whiteSpace: 'pre',
                  color: hot ? p.accent : inkNow,
                  opacity: wt,
                  transform: `translateY(${(1 - wt) * S * 0.055}px) scale(${lerp(0.92, 1, wt)})`,
                }}
              >
                {w}{i < ws.length - 1 ? ' ' : ''}
              </span>
            );
          })}
        </div>

        <div style={{ ...sceneGrain(fin.grain), ...el('grain') }} aria-hidden />
        <div style={sceneVignette(fin.vig)} aria-hidden />
      </div>
    );
  },
});
