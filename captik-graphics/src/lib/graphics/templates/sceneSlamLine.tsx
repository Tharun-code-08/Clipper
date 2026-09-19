// SCENE 6 — the slam.
//
// Reference: the payoff line. The words come THROUGH the frame from ~1.9x under blur and settle
// (a zoom, not a fade), the frame flashes accent on the hit, speed lines rake outward from the
// centre for a few frames, and the line breathes rather than freezing. Short by design: this is
// a punctuation mark between two scenes.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, finishFor, glide, lerp, sceneFade, sceneGrain, sceneGround, sceneVignette, win, words } from '../sceneKit';

export const sceneSlamLine = defineGraphicsTemplate({
  id: 'scene_slam_line',
  name: 'Scene · Slam Line',
  category: 'story',
  tags: ['Scene', 'Slam', 'Payoff', 'Punch', 'Explainer'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 2600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'line',   label: 'Line', hideable: false },
    { key: 'attrib', label: 'Attribution' },
    { key: 'lines',  label: 'Speed lines' },
    { key: 'flash',  label: 'Impact flash' },
  ],

  params: [
    { type: 'text', key: 'line', label: 'Line', group: 'Content', default: 'No more chaos.', maxLength: 48 },
    { type: 'number', key: 'accentFrom', label: 'Accent from word', group: 'Content', default: 2, min: 0, max: 8, step: 1 },
    { type: 'text', key: 'attrib', label: 'Attribution', group: 'Content', default: 'CAPTIK', maxLength: 24 },

    { type: 'color', key: 'bg',     label: 'Background', group: 'Style', default: '#0b0b0d' },
    { type: 'color', key: 'ink',    label: 'Line',       group: 'Style', default: '#ffffff' },
    { type: 'color', key: 'accent', label: 'Accent',     group: 'Style', default: '#fe9a00' },
    { type: 'font',  key: 'font',   label: 'Font',       group: 'Style', default: 'clash' },
    { type: 'number', key: 'size',  label: 'Size',       group: 'Style', default: 130, min: 50, max: 240, step: 2, unit: 'px' },
    { type: 'boolean', key: 'caps', label: 'All caps',   group: 'Style', default: true },
    { type: 'boolean', key: 'rake', label: 'Speed lines', group: 'Style', default: true },

    { type: 'number', key: 'hitMs', label: 'Hit at', group: 'Motion', default: 320, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [{ atMs: p.delay + p.hitMs, id: 'slam', gain: 0.6 }],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const fin = finishFor(p.bg);
    const ws = words(p.line);

    const s = spring({
      frame: fr(t - p.hitMs + 260), fps: FPS,
      config: { damping: 15, mass: 0.8, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    const e = glide(clamp01(s));
    // comes THROUGH the frame under blur, then settles and keeps breathing
    const scale = lerp(1.9, 1, e) * (1 + 0.012 * Math.sin((t / 1000) * 2.4));
    const blur = (1 - e) * S * 0.022;
    const flash = clamp01(1 - Math.abs(t - p.hitMs) / 190);
    const shake = flash * S * 0.004 * Math.sin((t / 1000) * 90);
    const blockIn = win(t, 0, durationMs, 120, 260);
    const attribIn = win(t, p.hitMs + 260, durationMs, 240, 240);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack(p.font) }}>
        {sceneGround(p.bg, p.accent, t, width, height).map((st, i) => (
          <div key={`g${i}`} style={st} aria-hidden />
        ))}

        {p.rake && (
          <div style={{ position: 'absolute', inset: 0, opacity: flash * 0.55, ...el('lines') }} aria-hidden>
            {Array.from({ length: 18 }, (_, i) => {
              const a = (i / 18) * 360;
              return (
                <div key={i} style={{
                  position: 'absolute', left: '50%', top: '50%',
                  width: S * 1.4, height: Math.max(2, S * 0.004),
                  background: `linear-gradient(90deg, transparent 0%, ${alpha(p.accent, 0.9)} 60%, transparent 100%)`,
                  transformOrigin: '0 50%',
                  transform: `rotate(${a}deg) translateX(${lerp(S * 0.16, S * 0.42, flash)}px)`,
                }} />
              );
            })}
          </div>
        )}

        <div style={{ position: 'absolute', inset: 0, background: p.accent, opacity: flash * 0.22, ...el('flash') }} aria-hidden />

        <div
          style={{
            position: 'absolute', left: '6%', right: '6%', top: '47%',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: Math.round(S * (p.size / 1080)),
            lineHeight: 1.02,
            letterSpacing: '-0.025em',
            textTransform: p.caps ? 'uppercase' : 'none',
            color: p.ink,
            opacity: blockIn,
            filter: blur > 0.4 ? `blur(${blur.toFixed(2)}px)` : 'none',
            transform: `translateY(-50%) translateX(${shake}px) scale(${scale})`,
            ...el('line'),
          }}
        >
          {ws.map((w, i) => (
            <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', color: i >= p.accentFrom ? p.accent : p.ink }}>
              {w}{i < ws.length - 1 ? ' ' : ''}
            </span>
          ))}
        </div>

        {p.attrib && (
          <div
            style={{
              position: 'absolute', left: 0, right: 0, top: '64%',
              textAlign: 'center',
              fontFamily: fontStack('inter'),
              fontSize: Math.round(S * 0.024),
              letterSpacing: '0.34em', textTransform: 'uppercase',
              color: alpha(p.ink, 0.55),
              opacity: attribIn,
              ...el('attrib'),
            }}
          >
            — {p.attrib}
          </div>
        )}

        <div style={sceneGrain(fin.grain)} aria-hidden />
        <div style={sceneVignette(fin.vig)} aria-hidden />
      </div>
    );
  },
});
