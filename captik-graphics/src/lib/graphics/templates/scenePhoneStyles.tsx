// SCENE 5 — the phone / styles beat.
//
// Reference: the device beat. The phone travels in from the side on a speed ramp, lands tilted
// in 3D and flattens; a ribbon DRAWS itself behind it (stroke dash, not a fade); and the caption
// on its screen CYCLES through looks — same words, three different treatments — because that is
// the product claim being made. A headline holds the opposite side of the frame so the
// composition is a two-hander, not a centred object.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, finishFor, glide, lerp, ramp, sceneFade, sceneGrain, sceneGround, sceneVignette, win, words } from '../sceneKit';

export const scenePhoneStyles = defineGraphicsTemplate({
  id: 'scene_phone_styles',
  name: 'Scene · Phone & Styles',
  category: 'story',
  tags: ['Scene', 'Phone', 'Device', 'Styles', 'Ribbon', 'Explainer'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'phone',    label: 'Phone', hideable: false },
    { key: 'ribbon',   label: 'Ribbon' },
    { key: 'headline', label: 'Headline' },
    { key: 'sub',      label: 'Subline' },
    { key: 'grain',    label: 'Grain' },
  ],

  params: [
    { type: 'text', key: 'headline', label: 'Headline', group: 'Content', default: 'Styles that pop', maxLength: 40 },
    { type: 'number', key: 'accentFrom', label: 'Accent from word', group: 'Content', default: 2, min: 0, max: 8, step: 1 },
    { type: 'text', key: 'sub', label: 'Subline', group: 'Content', default: '30+ looks. Every one editable.', maxLength: 80 },
    { type: 'text', key: 'caption', label: 'Caption words', group: 'Content', default: 'kya scene hai!', maxLength: 40,
      help: 'The same words, shown in three different caption looks.' },

    { type: 'color', key: 'bg',      label: 'Background', group: 'Style', default: '#0b0b0d' },
    { type: 'color', key: 'ink',     label: 'Headline',   group: 'Style', default: '#ffffff' },
    { type: 'color', key: 'dim',     label: 'Subline',    group: 'Style', default: '#9a9aa0' },
    { type: 'color', key: 'accent',  label: 'Accent',     group: 'Style', default: '#fe9a00' },
    { type: 'color', key: 'surface', label: 'Device',     group: 'Style', default: '#161619' },
    { type: 'color', key: 'line',    label: 'Device edge', group: 'Style', default: '#2c2c31' },
    { type: 'font',  key: 'font',    label: 'Font',       group: 'Style', default: 'clash' },
    { type: 'boolean', key: 'ribbon', label: 'Draw ribbon', group: 'Style', default: true },
    { type: 'select', key: 'side',   label: 'Phone side', group: 'Style', default: 'right',
      options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }] },

    { type: 'number', key: 'cycleMs', label: 'Style holds for', group: 'Motion', default: 1150, min: 400, max: 2600, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [
    { atMs: p.delay + 120, id: 'whoosh', gain: 0.45 },
    { atMs: p.delay + p.cycleMs, id: 'pop', gain: 0.3 },
    { atMs: p.delay + p.cycleMs * 2, id: 'pop', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const fin = finishFor(p.bg);
    const right = p.side === 'right';

    const land = spring({
      frame: fr(t - 60), fps: FPS,
      config: { damping: 18, mass: 0.9, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const e = glide(clamp01(land));
    const travel = ramp(clamp01((t - 40) / 620));
    const out = glide(clamp01((t - (durationMs - 340)) / 340));

    const phoneH = Math.round(height * 0.74);
    const phoneW = Math.round(phoneH * 0.49);
    const cx = right ? width * 0.72 : width * 0.28;

    // the caption look cycles: same words, three treatments
    const idx = Math.min(2, Math.max(0, Math.floor((t - 500) / Math.max(1, p.cycleMs))));
    const pop = Math.max(
      clamp01(1 - Math.abs(t - (500 + p.cycleMs)) / 190),
      clamp01(1 - Math.abs(t - (500 + p.cycleMs * 2)) / 190),
    );
    const capFs = Math.round(phoneH * 0.052);
    const looks = [
      { background: alpha('#000000', 0.82), color: '#ffffff', borderRadius: Math.round(S * 0.014), padding: `${capFs * 0.42}px ${capFs * 0.8}px`, boxShadow: 'none', border: 'none' },
      { background: p.accent, color: p.bg, borderRadius: Math.round(S * 0.005), padding: `${capFs * 0.42}px ${capFs * 0.8}px`, boxShadow: 'none', border: 'none' },
      { background: 'transparent', color: '#ffffff', borderRadius: 999, padding: `${capFs * 0.42}px ${capFs * 0.9}px`,
        boxShadow: `0 0 0 2px ${p.accent}, 0 0 ${Math.round(S * 0.03)}px ${Math.round(S * 0.006)}px ${alpha(p.accent, 0.75)}, inset 0 0 ${Math.round(S * 0.04)}px ${alpha(p.accent, 0.18)}`, border: 'none' },
    ];
    const look = looks[idx];

    const headIn = win(t, 260, durationMs, 260, 300);
    const ws = words(p.headline);
    const RIB = 3400;
    const draw = glide(clamp01((t - 240) / 900));

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack('inter') }}>
        {sceneGround(p.bg, p.accent, t, width, height).map((st, i) => (
          <div key={`g${i}`} style={st} aria-hidden />
        ))}

        {/* ribbon draws BEHIND the phone (positive z, earlier in document order) */}
        {p.ribbon && (
          <svg
            viewBox="0 0 1050 950"
            fill="none"
            style={{
              position: 'absolute',
              left: cx - phoneW * 1.5, top: height * 0.5 - phoneH * 0.62,
              width: phoneW * 3, height: phoneH * 1.24,
              opacity: (1 - out) * 0.95,
              ...el('ribbon'),
            }}
            aria-hidden
          >
            <path
              d="M60 780 C 260 900, 640 850, 760 600 C 880 350, 700 170, 480 210 C 300 245, 260 430, 430 520 C 640 630, 930 480, 990 300"
              stroke={p.accent}
              strokeWidth={58}
              strokeLinecap="round"
              strokeDasharray={RIB}
              strokeDashoffset={RIB * (1 - draw)}
              opacity={0.85}
            />
          </svg>
        )}

        {/* phone */}
        <div style={{ position: 'absolute', inset: 0, perspective: `${Math.round(S * 1.5)}px` }}>
          <div
            style={{
              position: 'absolute',
              left: cx - phoneW / 2, top: height * 0.5 - phoneH / 2,
              width: phoneW, height: phoneH,
              transform:
                `translateX(${lerp(right ? width * 0.28 : -width * 0.28, 0, travel) + out * (right ? width * 0.12 : -width * 0.12)}px)`
                + ` translateY(${lerp(S * 0.09, 0, e)}px)`
                + ` rotateY(${lerp(right ? -26 : 26, right ? -7 : 7, e)}deg) rotate(${lerp(right ? 7 : -7, right ? 2 : -2, e)}deg)`,
              opacity: 1 - out,
              ...el('phone'),
            }}
          >
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: Math.round(phoneW * 0.13),
              background: p.surface,
              border: `3px solid ${p.line}`,
              boxShadow: `0 ${Math.round(S * 0.05)}px ${Math.round(S * 0.11)}px rgba(0,0,0,.55)`,
              overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: phoneH * 0.018, left: '50%', width: phoneW * 0.3,
                height: phoneH * 0.016, marginLeft: -(phoneW * 0.15), borderRadius: 999, background: p.line }} />
              <div style={{ position: 'absolute', inset: `${phoneH * 0.055}px ${phoneW * 0.045}px ${phoneH * 0.03}px`,
                borderRadius: Math.round(phoneW * 0.1), background: alpha(p.bg, 0.9), overflow: 'hidden' }}>
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: `${10 + ((i * 29) % 16)}%`, right: `${10 + ((i * 17) % 20)}%`,
                    top: phoneH * (0.05 + i * 0.055), height: phoneH * 0.014,
                    borderRadius: 999, background: p.line, opacity: 0.65,
                  }} />
                ))}
                <div style={{
                  position: 'absolute', left: '50%', bottom: phoneH * 0.13,
                  transform: `translateX(-50%) scale(${1 + pop * 0.16})`,
                  whiteSpace: 'nowrap',
                  fontFamily: fontStack(p.font), fontWeight: 700, fontSize: capFs,
                  ...look,
                }}>
                  {p.caption}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* headline holds the other side */}
        <div
          style={{
            position: 'absolute',
            left: right ? '7%' : '48%', width: '45%',
            top: '44%',
            opacity: headIn,
            transform: `translateY(-50%) translateY(${(1 - headIn) * S * 0.05}px)`,
            ...el('headline'),
          }}
        >
          <div style={{
            fontFamily: fontStack(p.font), fontWeight: 700,
            fontSize: Math.round(S * 0.096), lineHeight: 1.05,
            letterSpacing: lerp(0.06, -0.02, glide(clamp01((t - 300) / 560))) + 'em',
            color: p.ink,
          }}>
            {ws.map((w, i) => {
              const wt = glide(clamp01((t - 300 - i * 90) / 340));
              return (
                <span key={i} style={{
                  display: 'inline-block', whiteSpace: 'pre',
                  color: i >= p.accentFrom ? p.accent : p.ink,
                  opacity: wt,
                  transform: `translateY(${(1 - wt) * S * 0.05}px)`,
                }}>{w}{i < ws.length - 1 ? ' ' : ''}</span>
              );
            })}
          </div>
          {p.sub && (
            <div style={{
              marginTop: Math.round(S * 0.03),
              fontSize: Math.round(S * 0.028), color: p.dim,
              opacity: win(t, 620, durationMs, 260, 260),
              ...el('sub'),
            }}>{p.sub}</div>
          )}
        </div>

        <div style={{ ...sceneGrain(fin.grain), ...el('grain') }} aria-hidden />
        <div style={sceneVignette(fin.vig)} aria-hidden />
      </div>
    );
  },
});
