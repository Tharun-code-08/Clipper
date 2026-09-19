// SCENE 8 — the endcard.
//
// Reference: the closing lockup. A monogram chip springs in and settles, the wordmark's tracking
// closes behind it, a tagline fades under, and the CTA pill arrives last with a soft pulse that
// never stops. The whole lockup keeps a slow breath to the final frame — a film that freezes on
// its last beat reads as a crash, not an ending.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, finishFor, glide, lerp, sceneFade, sceneGrain, sceneGround, sceneVignette, win } from '../sceneKit';

export const sceneEndcard = defineGraphicsTemplate({
  id: 'scene_endcard',
  name: 'Scene · Endcard',
  category: 'story',
  tags: ['Scene', 'Endcard', 'Logo', 'CTA', 'Outro', 'Explainer'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 3400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'mark',    label: 'Monogram' },
    { key: 'word',    label: 'Wordmark', hideable: false },
    { key: 'tagline', label: 'Tagline' },
    { key: 'cta',     label: 'CTA pill' },
  ],

  params: [
    { type: 'text', key: 'word',    label: 'Wordmark', group: 'Content', default: 'Captik', maxLength: 24 },
    { type: 'text', key: 'mark',    label: 'Monogram', group: 'Content', default: 'C', maxLength: 2 },
    { type: 'text', key: 'tagline', label: 'Tagline',  group: 'Content', default: 'Captions that get Hinglish right.', maxLength: 80 },
    { type: 'text', key: 'cta',     label: 'CTA',      group: 'Content', default: 'Try it free at captik.in', maxLength: 40 },

    { type: 'color', key: 'bg',     label: 'Background', group: 'Style', default: '#0b0b0d' },
    { type: 'color', key: 'ink',    label: 'Wordmark',   group: 'Style', default: '#ffffff' },
    { type: 'color', key: 'dim',    label: 'Tagline',    group: 'Style', default: '#9a9aa0' },
    { type: 'color', key: 'accent', label: 'Accent',     group: 'Style', default: '#fe9a00' },
    { type: 'font',  key: 'font',   label: 'Font',       group: 'Style', default: 'clash' },
    { type: 'number', key: 'size',  label: 'Wordmark size', group: 'Style', default: 132, min: 50, max: 240, step: 2, unit: 'px' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [
    { atMs: p.delay + 120, id: 'chime', gain: 0.4 },
    { atMs: p.delay + 900, id: 'pop', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const fin = finishFor(p.bg);

    const markS = spring({
      frame: fr(t - 60), fps: FPS,
      config: { damping: 13, mass: 0.6, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    const m = glide(clamp01(markS));
    const wordIn = win(t, 280, durationMs, 300, 1);
    const track = lerp(0.16, -0.03, glide(clamp01((t - 300) / 700)));
    const tagIn = win(t, 620, durationMs, 300, 1);
    const ctaIn = win(t, 940, durationMs, 300, 1);
    // never freezes on the last frame
    const breath = 1 + 0.011 * Math.sin((t / 1000) * 1.9);
    const markPx = Math.round(S * 0.155);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack('inter') }}>
        {sceneGround(p.bg, p.accent, t, width, height).map((st, i) => (
          <div key={`g${i}`} style={st} aria-hidden />
        ))}

        <div style={{
          position: 'absolute', inset: 0,
          display: 'grid', placeItems: 'center',
          transform: `scale(${breath})`,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: markPx, height: markPx, margin: '0 auto',
                borderRadius: Math.round(markPx * 0.28),
                background: p.accent, color: p.bg,
                display: 'grid', placeItems: 'center',
                fontFamily: fontStack(p.font), fontWeight: 700,
                fontSize: Math.round(markPx * 0.6),
                boxShadow: `0 ${Math.round(S * 0.03)}px ${Math.round(S * 0.07)}px ${alpha(p.accent, 0.3)}`,
                opacity: m,
                transform: `translateY(${(1 - m) * S * 0.05}px) scale(${lerp(0.7, 1, m)}) rotate(${lerp(-9, 0, m)}deg)`,
                ...el('mark'),
              }}
            >
              {p.mark}
            </div>

            <div
              style={{
                marginTop: Math.round(S * 0.045),
                fontFamily: fontStack(p.font), fontWeight: 700,
                fontSize: Math.round(S * (p.size / 1080)),
                letterSpacing: `${track}em`,
                lineHeight: 1,
                color: p.ink,
                opacity: wordIn,
                transform: `translateY(${(1 - wordIn) * S * 0.03}px)`,
                ...el('word'),
              }}
            >
              {p.word}
            </div>

            {p.tagline && (
              <div
                style={{
                  marginTop: Math.round(S * 0.028),
                  fontSize: Math.round(S * 0.03), color: p.dim,
                  opacity: tagIn,
                  transform: `translateY(${(1 - tagIn) * S * 0.02}px)`,
                  ...el('tagline'),
                }}
              >
                {p.tagline}
              </div>
            )}

            {p.cta && (
              <div
                style={{
                  display: 'inline-block',
                  marginTop: Math.round(S * 0.055),
                  padding: `${Math.round(S * 0.024)}px ${Math.round(S * 0.055)}px`,
                  borderRadius: 999,
                  background: p.accent, color: p.bg,
                  fontFamily: fontStack(p.font), fontWeight: 700,
                  fontSize: Math.round(S * 0.032),
                  boxShadow: `0 ${Math.round(S * 0.02)}px ${Math.round(S * 0.05)}px ${alpha(p.accent, 0.35)}`,
                  opacity: ctaIn,
                  transform: `translateY(${(1 - ctaIn) * S * 0.025}px) scale(${1 + 0.018 * Math.sin(((t - 940) / 1000) * 3.2)})`,
                  ...el('cta'),
                }}
              >
                {p.cta}
              </div>
            )}
          </div>
        </div>

        <div style={sceneGrain(fin.grain)} aria-hidden />
        <div style={sceneVignette(fin.vig)} aria-hidden />
      </div>
    );
  },
});
