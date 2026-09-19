// SCENE 12 — the close.
//
// Reference: the final beat. The line assembles word by word, a gradient pill lands under it,
// and a cursor travels in and CLICKS — the button dents, a ring pulses out, and the frame holds
// on the action rather than on a logo. Ending on a click instead of a lockup is the whole
// difference between "nice video" and "do this next".
//
// The cursor is drawn, not an asset, so it renders identically everywhere.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, finishFor, glide, lerp, ramp, sceneFade, sceneGrain, sceneGround, sceneVignette, win, words } from '../sceneKit';

export const sceneCtaClick = defineGraphicsTemplate({
  id: 'scene_cta_click',
  name: 'Scene · Click Close',
  category: 'cta',
  tags: ['Scene', 'CTA', 'Button', 'Cursor', 'Close', 'Promo'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'line',   label: 'Line', hideable: false },
    { key: 'button', label: 'Button' },
    { key: 'cursor', label: 'Cursor' },
    { key: 'ring',   label: 'Click ring' },
  ],

  params: [
    { type: 'text', key: 'line', label: 'Line', group: 'Content', default: "Let's make it happen", maxLength: 48 },
    { type: 'number', key: 'accentFrom', label: 'Accent from word', group: 'Content', default: 9, min: 0, max: 10, step: 1 },
    { type: 'text', key: 'button', label: 'Button', group: 'Content', default: 'Try it free', maxLength: 28 },
    { type: 'text', key: 'note', label: 'Note under button', group: 'Content', default: 'captik.in', maxLength: 40 },

    { type: 'color', key: 'bg',      label: 'Background', group: 'Style', default: '#fdfdfd' },
    { type: 'color', key: 'ink',     label: 'Line',       group: 'Style', default: '#1a1614' },
    { type: 'color', key: 'dim',     label: 'Note',       group: 'Style', default: '#8a8a90' },
    { type: 'color', key: 'accent',  label: 'Button',     group: 'Style', default: '#1e69f1' },
    { type: 'color', key: 'accent2', label: 'Button end', group: 'Style', default: '#f2542d' },
    { type: 'font',  key: 'font',    label: 'Font',       group: 'Style', default: 'clash' },
    { type: 'number', key: 'size',   label: 'Line size',  group: 'Style', default: 116, min: 40, max: 200, step: 2, unit: 'px' },

    { type: 'number', key: 'clickAt', label: 'Click at', group: 'Motion', default: 2400, min: 600, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [
    { atMs: p.delay + 140, id: 'whoosh', gain: 0.35 },
    { atMs: p.delay + p.clickAt, id: 'button_1', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const fin = finishFor(p.bg);
    const ws = words(p.line);

    const btnS = spring({
      frame: fr(t - 700), fps: FPS,
      config: { damping: 14, mass: 0.6, stiffness: 175 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const b = glide(clamp01(btnS));
    // cursor travels on a speed ramp, presses, and eases off — the press is the payoff
    const travel = ramp(clamp01((t - 1200) / Math.max(1, p.clickAt - 1200)));
    const press = clamp01(1 - Math.abs(t - p.clickAt) / 130);
    const ring = clamp01((t - p.clickAt) / 620);
    const ringOn = t >= p.clickAt && ring < 1;
    const lineIn = win(t, 60, durationMs, 60, 1);
    const noteIn = win(t, 1050, durationMs, 280, 1);

    const btnW = Math.round(S * 0.33);
    const btnH = Math.round(S * 0.105);
    const cx = width / 2;
    const cy = height * 0.62;

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack('inter') }}>
        {sceneGround(p.bg, p.accent, t, width, height).map((st, i) => (
          <div key={`g${i}`} style={st} aria-hidden />
        ))}

        <div
          style={{
            position: 'absolute', left: '8%', right: '8%', top: '38%',
            textAlign: 'center',
            fontFamily: fontStack(p.font), fontWeight: 700,
            fontSize: Math.round(S * (p.size / 1080)),
            lineHeight: 1.04, letterSpacing: '-0.03em',
            color: p.ink,
            opacity: lineIn,
            transform: 'translateY(-50%)',
            ...el('line'),
          }}
        >
          {ws.map((w, i) => {
            const wt = glide(clamp01((t - 120 - i * 110) / 340));
            return (
              <span key={i} style={{
                display: 'inline-block', whiteSpace: 'pre',
                color: i >= p.accentFrom ? p.accent : p.ink,
                opacity: wt,
                transform: `translateY(${(1 - wt) * S * 0.05}px) scale(${lerp(0.92, 1, wt)})`,
              }}>{w}{i < ws.length - 1 ? ' ' : ''}</span>
            );
          })}
        </div>

        {/* the click ring pulses OUT from the button, under it */}
        {ringOn && (
          <div style={{
            position: 'absolute',
            left: cx, top: cy,
            width: btnW, height: btnH,
            marginLeft: -btnW / 2, marginTop: -btnH / 2,
            borderRadius: 999,
            border: `${Math.max(2, Math.round(S * 0.004))}px solid ${p.accent}`,
            opacity: (1 - ring) * 0.7,
            transform: `scale(${lerp(1, 1.45, glide(ring))})`,
            ...el('ring'),
          }} aria-hidden />
        )}

        <div
          style={{
            position: 'absolute',
            left: cx, top: cy,
            width: btnW, height: btnH,
            marginLeft: -btnW / 2, marginTop: -btnH / 2,
            borderRadius: 999,
            background: `linear-gradient(100deg, ${p.accent} 0%, ${p.accent2} 130%)`,
            color: '#ffffff',
            display: 'grid', placeItems: 'center',
            fontFamily: fontStack(p.font), fontWeight: 700,
            fontSize: Math.round(btnH * 0.42),
            boxShadow: `0 ${Math.round(S * 0.022)}px ${Math.round(S * 0.05)}px ${alpha(p.accent, 0.4)}`,
            opacity: b,
            transform: `translateY(${(1 - b) * S * 0.05}px) scale(${lerp(0.9, 1, b) * (1 - press * 0.05)})`,
            ...el('button'),
          }}
        >
          {p.button}
        </div>

        {p.note && (
          <div style={{
            position: 'absolute', left: 0, right: 0, top: cy + btnH * 0.95,
            textAlign: 'center',
            fontSize: Math.round(S * 0.026), color: p.dim,
            opacity: noteIn,
          }}>{p.note}</div>
        )}

        {/* drawn cursor — no asset, identical on every surface */}
        <svg
          viewBox="0 0 24 24"
          style={{
            position: 'absolute',
            left: lerp(cx + S * 0.34, cx + btnW * 0.16, travel),
            top: lerp(cy + S * 0.3, cy + btnH * 0.24, travel) + press * S * 0.008,
            width: Math.round(S * 0.055), height: Math.round(S * 0.055),
            opacity: clamp01((t - 1150) / 220) * (1 - glide(clamp01((t - (durationMs - 300)) / 300))),
            ...el('cursor'),
          }}
          aria-hidden
        >
          <path d="M3 2l7.5 19 2.6-7.9 7.9-2.6z" fill="#ffffff" stroke="#101014" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>

        <div style={sceneGrain(fin.grain)} aria-hidden />
        <div style={sceneVignette(fin.vig)} aria-hidden />
      </div>
    );
  },
});
