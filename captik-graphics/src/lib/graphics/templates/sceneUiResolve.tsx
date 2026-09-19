// SCENE 3 — the product surface.
//
// Reference: the dashboard beat. The UI does NOT fade in — it arrives as a blurred,
// over-saturated, over-bright blob and RESOLVES into sharp product (a focus pull), landing
// tilted in 3D and flattening as it settles. Then the camera drifts across it while the
// interior lives: a caption line sits on the preview, a waveform lights left-to-right, tool
// chips light one after another, list rows slide in on a stagger, and a label chip drops in,
// hangs, and leaves before anything else needs the space.
//
// The scene owns the frame so the surface can be big and off-centre — the thing that makes a
// product shot read as cinematography rather than a screenshot.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, finishFor, glide, lerp, ramp, sceneFade, sceneGrain, sceneGround, sceneVignette, win } from '../sceneKit';

export const sceneUiResolve = defineGraphicsTemplate({
  id: 'scene_ui_resolve',
  name: 'Scene · Product Surface',
  category: 'story',
  tags: ['Scene', 'Product', 'Dashboard', 'UI', 'Focus pull', 'Explainer'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'surface', label: 'Product surface', hideable: false },
    { key: 'caption', label: 'Caption line' },
    { key: 'wave',    label: 'Waveform' },
    { key: 'chips',   label: 'Tool chips' },
    { key: 'list',    label: 'List rows' },
    { key: 'label',   label: 'Label chip' },
    { key: 'grain',   label: 'Grain' },
  ],

  params: [
    { type: 'text', key: 'title',   label: 'Window title', group: 'Content', default: 'reel_final.mp4 — Captik', maxLength: 40 },
    { type: 'text', key: 'caption', label: 'Caption line', group: 'Content', default: 'yeh wala scene *full paisa vasool*', maxLength: 60,
      help: 'Wrap a phrase in *asterisks* to give it the accent colour.' },
    { type: 'text', key: 'chips',   label: 'Tool chips', group: 'Content', default: 'yeh|wala|scene|vasool', maxLength: 90,
      help: 'Pipe separated. They light one after another.' },
    { type: 'text', key: 'label',   label: 'Label chip', group: 'Content', default: 'Edit every word before you export', maxLength: 48 },

    { type: 'color', key: 'bg',      label: 'Background', group: 'Style', default: '#0b0b0d' },
    { type: 'color', key: 'ink',     label: 'Text',       group: 'Style', default: '#ffffff' },
    { type: 'color', key: 'accent',  label: 'Accent',     group: 'Style', default: '#fe9a00' },
    { type: 'color', key: 'surface', label: 'Panel',      group: 'Style', default: '#161619' },
    { type: 'color', key: 'line',    label: 'Panel edge', group: 'Style', default: '#2c2c31' },
    { type: 'font',  key: 'font',    label: 'Font',       group: 'Style', default: 'clash' },

    { type: 'number', key: 'resolveMs', label: 'Focus pull over', group: 'Motion', default: 1500, min: 400, max: 3000, step: 50, unit: 'ms' },
    { type: 'boolean', key: 'drift',    label: 'Camera drift', group: 'Motion', default: true },
    { type: 'number', key: 'delay',     label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [
    { atMs: p.delay + 60, id: 'whoosh', gain: 0.4 },
    { atMs: p.delay + p.resolveMs, id: 'chime', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const fin = finishFor(p.bg);
    const chips = String(p.chips).split('|').map((c) => c.trim()).filter(Boolean).slice(0, 6);
    const capRaw = String(p.caption);
    const capParts = capRaw.split('*');

    // ---- the focus pull: blurred over-bright blob -> sharp product, tilted -> flat ----
    const res = glide(clamp01(t / Math.max(1, p.resolveMs)));
    const land = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 20, mass: 0.9, stiffness: 120 },
      durationInFrames: Math.max(1, Math.round(fr(p.resolveMs))),
    });
    // camera drift with a speed ramp — reads across the middle, never stops
    const dr = p.drift ? ramp(clamp01((t - p.resolveMs * 0.6) / Math.max(1, durationMs - p.resolveMs * 0.6)), 0.6) : 0;
    const out = glide(clamp01((t - (durationMs - 340)) / 340));

    const panelW = Math.round(width * 0.62);
    const panelH = Math.round(panelW * 0.60);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack('inter') }}>
        {sceneGround(p.bg, p.accent, t, width, height).map((st, i) => (
          <div key={`g${i}`} style={st} aria-hidden />
        ))}

        {/* perspective wrapper — the filter lives on the INNER card, never on this container,
            or preserve-3d is flattened */}
        <div style={{ position: 'absolute', inset: 0, perspective: `${Math.round(S * 1.4)}px` }}>
          <div
            style={{
              position: 'absolute',
              left: '50%', top: '50%',
              width: panelW, height: panelH,
              marginLeft: -panelW / 2, marginTop: -panelH / 2,
              transform:
                `translate(${lerp(width * 0.06, -width * 0.05, dr) - out * width * 0.3}px, ${lerp(S * 0.05, -S * 0.03, dr)}px)`
                + ` scale(${lerp(1.22, 1, glide(land)) * lerp(1, 1.05, Math.sin(dr * Math.PI))})`
                + ` rotateX(${lerp(13, 0, glide(land))}deg) rotateZ(${lerp(4, 0, glide(land))}deg)`,
              opacity: (1 - out) * clamp01(t / 160),
              ...el('surface'),
            }}
          >
            <div
              style={{
                position: 'absolute', inset: 0,
                borderRadius: Math.round(S * 0.026),
                background: p.surface,
                border: `2px solid ${p.line}`,
                boxShadow: `0 ${Math.round(S * 0.05)}px ${Math.round(S * 0.11)}px rgba(0,0,0,.5)`,
                overflow: 'hidden',
                filter: res < 0.995
                  ? `blur(${(1 - res) * S * 0.03}px) saturate(${1 + (1 - res) * 1.7}) brightness(${1 + (1 - res) * 0.4})`
                  : 'none',
              }}
            >
              {/* title bar */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: panelH * 0.09,
                borderBottom: `2px solid ${p.line}`, display: 'flex', alignItems: 'center', gap: panelW * 0.008,
                padding: `0 ${panelW * 0.022}px` }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: panelH * 0.017, height: panelH * 0.017, borderRadius: '50%', background: p.line }} />
                ))}
                <div style={{ marginLeft: panelW * 0.012, fontSize: panelH * 0.036, color: alpha(p.ink, 0.5) }}>{p.title}</div>
              </div>

              {/* preview pane with the caption line sitting on it */}
              <div style={{ position: 'absolute', left: panelW * 0.022, top: panelH * 0.135,
                width: panelW * 0.55, height: panelH * 0.6, borderRadius: Math.round(S * 0.016),
                background: alpha(p.bg, 0.85), border: `2px solid ${p.line}`, overflow: 'hidden' }}>
                <div
                  style={{
                    position: 'absolute', left: '50%', bottom: panelH * 0.07,
                    transform: `translateX(-50%) scale(${lerp(0.9, 1, glide(clamp01((t - 700) / 420)))})`,
                    padding: `${panelH * 0.022}px ${panelH * 0.042}px`,
                    borderRadius: Math.round(S * 0.012),
                    background: alpha('#000000', 0.8),
                    fontFamily: fontStack(p.font),
                    fontSize: panelH * 0.052, fontWeight: 700, whiteSpace: 'nowrap',
                    color: p.ink,
                    opacity: glide(clamp01((t - 700) / 420)),
                    ...el('caption'),
                  }}
                >
                  {capParts.map((seg, i) => (
                    <span key={i} style={{ color: i % 2 === 1 ? p.accent : p.ink }}>{seg}</span>
                  ))}
                </div>
              </div>

              {/* waveform lighting left to right */}
              <div style={{ position: 'absolute', left: panelW * 0.022, bottom: panelH * 0.13,
                width: panelW * 0.55, height: panelH * 0.07, display: 'flex', alignItems: 'center',
                gap: panelW * 0.004, ...el('wave') }}>
                {Array.from({ length: 42 }, (_, i) => {
                  const lit = t > 900 + (i * 900) / 42;
                  return (
                    <div key={i} style={{
                      width: panelW * 0.0068, borderRadius: 999,
                      height: panelH * (0.014 + 0.045 * Math.abs(Math.sin(i * 0.83) + 0.4 * Math.sin(i * 2.11))),
                      background: lit ? p.accent : p.line,
                      opacity: lit ? 0.95 : 0.5,
                    }} />
                  );
                })}
              </div>

              {/* tool chips lighting one after another */}
              <div style={{ position: 'absolute', left: panelW * 0.022, bottom: panelH * 0.035,
                display: 'flex', gap: panelW * 0.012, ...el('chips') }}>
                {chips.map((c, i) => {
                  const at = 1100 + i * 460;
                  const on = t >= at && t < at + 460;
                  const pop = clamp01(1 - Math.abs(t - at) / 200);
                  return (
                    <div key={i} style={{
                      padding: `${panelH * 0.018}px ${panelH * 0.036}px`,
                      borderRadius: Math.round(S * 0.009),
                      fontSize: panelH * 0.038, fontWeight: 700,
                      background: on ? p.accent : alpha(p.bg, 0.7),
                      color: on ? p.bg : alpha(p.ink, 0.6),
                      border: `2px solid ${on ? p.accent : p.line}`,
                      transform: `translateY(${-pop * panelH * 0.014}px) scale(${1 + pop * 0.07})`,
                    }}>{c}</div>
                  );
                })}
              </div>

              {/* right-hand list rows sliding in on a stagger */}
              <div style={{ position: 'absolute', right: panelW * 0.022, top: panelH * 0.135,
                width: panelW * 0.38, ...el('list') }}>
                {Array.from({ length: 5 }, (_, i) => {
                  const rt = glide(clamp01((t - 520 - i * 130) / 420));
                  return (
                    <div key={i} style={{
                      height: panelH * 0.088, marginBottom: panelH * 0.026,
                      borderRadius: Math.round(S * 0.011),
                      background: alpha(p.bg, 0.6), border: `2px solid ${p.line}`,
                      display: 'flex', alignItems: 'center', gap: panelW * 0.014,
                      padding: `0 ${panelW * 0.016}px`,
                      opacity: rt, transform: `translateX(${(1 - rt) * panelW * 0.08}px)`,
                    }}>
                      <div style={{ width: panelH * 0.05, height: panelH * 0.05, borderRadius: Math.round(S * 0.006),
                        background: i === 1 ? p.accent : p.line, flex: 'none' }} />
                      <div style={{ height: panelH * 0.016, borderRadius: 999, background: p.line,
                        width: `${44 + ((i * 23) % 38)}%` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* label chip: drops in, hangs, and is gone before the scene ends */}
        <div
          style={{
            position: 'absolute', left: '50%', top: '11%',
            padding: `${Math.round(S * 0.019)}px ${Math.round(S * 0.04)}px`,
            borderRadius: 999,
            background: p.accent, color: p.bg,
            fontFamily: fontStack(p.font),
            fontSize: Math.round(S * 0.036), fontWeight: 700, whiteSpace: 'nowrap',
            boxShadow: `0 ${Math.round(S * 0.02)}px ${Math.round(S * 0.05)}px rgba(0,0,0,.35)`,
            opacity: win(t, 900, durationMs - 500, 300, 300),
            transform: `translateX(-50%) translateY(${lerp(-S * 0.09, 0, glide(clamp01((t - 900) / 420)))}px)`,
            ...el('label'),
          }}
        >
          {p.label}
        </div>

        <div style={{ ...sceneGrain(fin.grain), ...el('grain') }} aria-hidden />
        <div style={sceneVignette(fin.vig)} aria-hidden />
      </div>
    );
  },
});
