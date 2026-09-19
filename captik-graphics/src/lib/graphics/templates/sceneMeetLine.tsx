// SCENE 2 — the promise line.
//
// Reference: the "meet your new ___" beat. One headline owns the frame: words rise from below
// on a stagger while the line's tracking closes, one word carries the accent, a subline fades up
// under it, and the whole block LEAVES upward under motion rather than cutting. A rule bar wipes
// in beneath the line to give the type something to sit on.
//
// This is the scene that must never look like a title card sitting still — the exit is animated
// and the block keeps a slow push the whole way through.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, finishFor, glide, lerp, sceneFade, sceneGrain, sceneGround, sceneVignette, win, words } from '../sceneKit';

export const sceneMeetLine = defineGraphicsTemplate({
  id: 'scene_meet_line',
  name: 'Scene · Promise Line',
  category: 'story',
  tags: ['Scene', 'Headline', 'Promise', 'Explainer', 'Kinetic'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 3600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'headline', label: 'Headline', hideable: false },
    { key: 'sub',      label: 'Subline' },
    { key: 'rule',     label: 'Rule bar' },
    { key: 'grain',    label: 'Grain' },
  ],

  params: [
    { type: 'text', key: 'headline', label: 'Headline', group: 'Content', multiline: true, maxLength: 90,
      default: 'Captions that get Hinglish right' },
    { type: 'number', key: 'accentFrom', label: 'Accent from word', group: 'Content', default: 3, min: 0, max: 12, step: 1 },
    { type: 'text', key: 'sub', label: 'Subline', group: 'Content', maxLength: 120,
      default: 'Most caption tools mangle code-mixed speech.' },

    { type: 'color', key: 'bg',     label: 'Background', group: 'Style', default: '#0b0b0d' },
    { type: 'color', key: 'ink',    label: 'Headline',   group: 'Style', default: '#ffffff' },
    { type: 'color', key: 'accent', label: 'Accent',     group: 'Style', default: '#fe9a00' },
    { type: 'color', key: 'dim',    label: 'Subline',    group: 'Style', default: '#9a9aa0' },
    { type: 'font',  key: 'font',   label: 'Font',       group: 'Style', default: 'clash' },
    { type: 'number', key: 'size',  label: 'Headline size', group: 'Style', default: 108, min: 40, max: 200, step: 2, unit: 'px' },
    { type: 'boolean', key: 'rule', label: 'Rule bar',   group: 'Style', default: true },

    { type: 'number', key: 'wordMs', label: 'Word stagger', group: 'Motion', default: 80, min: 20, max: 260, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [{ atMs: p.delay + 120, id: 'whoosh', gain: 0.4 }],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const fin = finishFor(p.bg);
    const ws = words(p.headline);

    const blockIn = win(t, 60, durationMs, 30, 300);
    // the whole block keeps a slow push and leaves upward — never a static card
    const push = lerp(0.985, 1.015, glide(clamp01(t / Math.max(1, durationMs))));
    const exit = glide(clamp01((t - (durationMs - 300)) / 300));
    const track = lerp(0.08, -0.022, glide(clamp01((t - 100) / 620)));

    const ruleS = spring({
      frame: fr(t - 260), fps: FPS,
      config: { damping: 18, mass: 0.6, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const subIn = win(t, 420, durationMs, 220, 260);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack(p.font) }}>
        {sceneGround(p.bg, p.accent, t, width, height).map((st, i) => (
          <div key={`g${i}`} style={st} aria-hidden />
        ))}

        <div
          style={{
            position: 'absolute', left: '7%', right: '7%', top: '50%',
            textAlign: 'center',
            opacity: blockIn,
            transform: `translateY(${-50 - exit * 7}%) scale(${push})`,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: Math.round(S * (p.size / 1080)),
              letterSpacing: `${track}em`,
              lineHeight: 1.05,
              color: p.ink,
              ...el('headline'),
            }}
          >
            {ws.map((w, i) => {
              const wt = glide(clamp01((t - 120 - i * p.wordMs) / 320));
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block', whiteSpace: 'pre',
                    color: i >= p.accentFrom ? p.accent : p.ink,
                    opacity: wt,
                    transform: `translateY(${(1 - wt) * S * 0.06}px) scale(${lerp(0.9, 1, wt)})`,
                  }}
                >
                  {w}{i < ws.length - 1 ? ' ' : ''}
                </span>
              );
            })}
          </div>

          {p.rule && (
            <div
              style={{
                height: Math.max(3, Math.round(S * 0.006)),
                width: `${glide(clamp01(ruleS)) * 46}%`,
                margin: `${Math.round(S * 0.035)}px auto 0`,
                borderRadius: 999,
                background: p.accent,
                boxShadow: `0 0 ${Math.round(S * 0.03)}px ${alpha(p.accent, 0.55)}`,
                ...el('rule'),
              }}
              aria-hidden
            />
          )}

          {p.sub && (
            <div
              style={{
                fontFamily: fontStack('inter'),
                fontSize: Math.round(S * 0.03),
                color: p.dim,
                marginTop: Math.round(S * 0.032),
                opacity: subIn,
                transform: `translateY(${(1 - subIn) * S * 0.022}px)`,
                ...el('sub'),
              }}
            >
              {p.sub}
            </div>
          )}
        </div>

        <div style={{ ...sceneGrain(fin.grain), ...el('grain') }} aria-hidden />
        <div style={sceneVignette(fin.vig)} aria-hidden />
      </div>
    );
  },
});
