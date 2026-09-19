// SCENE 4 — the proof row.
//
// Reference: the stats beat. Cards rise from below on a stagger, each landing slightly tilted
// and flattening, with its figure counting up as it arrives. One card is the hero: bigger,
// accent-filled, and it lands last so the eye finishes on it. A kicker line sets the row up.
//
// The counting is the point — a row of static numbers is a slide; numbers arriving under their
// own spring is a scene.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr } from '../motion';
import { alpha, clamp01, finishFor, glide, lerp, rows, sceneFade, sceneGrain, sceneGround, sceneVignette, win } from '../sceneKit';

export const sceneStatRow = defineGraphicsTemplate({
  id: 'scene_stat_row',
  name: 'Scene · Proof Row',
  category: 'story',
  tags: ['Scene', 'Stats', 'Proof', 'Counter', 'Explainer'],
  badge: 'Scene',
  design: { w: 1920, h: 1080 },
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['clash', 'inter'],

  elements: [
    { key: 'kicker', label: 'Kicker' },
    { key: 'cards',  label: 'Stat cards', hideable: false },
    { key: 'grain',  label: 'Grain' },
  ],

  params: [
    { type: 'text', key: 'kicker', label: 'Kicker', group: 'Content', default: 'Built for Indian creators', maxLength: 48 },
    { type: 'text', key: 'stats', label: 'Stats', group: 'Content', multiline: true, maxLength: 240,
      default: 'ACCURACY|99%\nCAPTION STYLES|30+\n*INDIAN LANGUAGES|22\nMAX EXPORT|4K',
      help: 'One per line: label | figure. Up to 4. Prefix one with * to make it the hero card.' },

    { type: 'color', key: 'bg',      label: 'Background', group: 'Style', default: '#0b0b0d' },
    { type: 'color', key: 'ink',     label: 'Figures',    group: 'Style', default: '#ffffff' },
    { type: 'color', key: 'dim',     label: 'Labels',     group: 'Style', default: '#8f8f96' },
    { type: 'color', key: 'accent',  label: 'Hero',       group: 'Style', default: '#fe9a00' },
    { type: 'color', key: 'surface', label: 'Card',       group: 'Style', default: '#161619' },
    { type: 'color', key: 'line',    label: 'Card edge',  group: 'Style', default: '#2c2c31' },
    { type: 'font',  key: 'font',    label: 'Font',       group: 'Style', default: 'clash' },

    { type: 'number', key: 'stagger', label: 'Card stagger', group: 'Motion', default: 190, min: 40, max: 500, step: 10, unit: 'ms' },
    { type: 'number', key: 'countMs', label: 'Count-up',     group: 'Motion', default: 900, min: 200, max: 2400, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
  ],

  sfx: (p) => [{ atMs: p.delay + 200, id: 'pop', gain: 0.35 }],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    const S = Math.min(width, height);
    const fin = finishFor(p.bg);
    const cells = rows(p.stats, 4);
    if (!cells.length) return null;

    const kickIn = win(t, 60, durationMs, 240, 260);
    const out = glide(clamp01((t - (durationMs - 320)) / 320));

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: sceneFade(t, durationMs), fontFamily: fontStack('inter') }}>
        {sceneGround(p.bg, p.accent, t, width, height).map((st, i) => (
          <div key={`g${i}`} style={st} aria-hidden />
        ))}

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: '26%',
            textAlign: 'center',
            fontFamily: fontStack(p.font), fontWeight: 700,
            fontSize: Math.round(S * 0.052),
            letterSpacing: '0.16em', textTransform: 'uppercase',
            color: p.accent,
            opacity: kickIn,
            transform: `translateY(${(1 - kickIn) * S * 0.03}px)`,
            ...el('kicker'),
          }}
        >
          {p.kicker}
        </div>

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: '52%',
            display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
            gap: Math.round(S * 0.032),
            transform: `translateY(-50%) translateY(${out * S * 0.08}px)`,
            ...el('cards'),
          }}
        >
          {cells.map((c, i) => {
            const hero = c[0].startsWith('*');
            const label = hero ? c[0].slice(1) : c[0];
            const figure = c[1] ?? '';
            // hero lands LAST so the eye finishes on it
            const order = hero ? cells.length - 1 : i;
            const at = 260 + order * p.stagger;
            const s = spring({
              frame: fr(t - at), fps: FPS,
              config: { damping: 16, mass: 0.7, stiffness: 150 },
              durationInFrames: Math.max(1, Math.round(fr(560))),
            });
            const e = glide(clamp01(s));
            // Count the leading number up and carry its suffix. Three things a naive version
            // gets wrong, all found by running real captured brands through this scene:
            //   '24/7' -> stripping non-digits gave 247, then '/7' rode along as a suffix
            //   '4.9'  -> Math.round made it 5
            //   '2010' -> toLocaleString made it 2,010 (a year is not a quantity)
            // So: only animate a figure that is genuinely "number then suffix", keep the
            // author's decimal places, and only group if the author grouped.
            const m = figure.match(/^([^\d]*)([\d.,]+)(.*)$/);
            const digitsAfter = m ? /\d/.test(m[3]) : true;
            const num = m ? parseFloat(m[2].replace(/,/g, '')) : NaN;
            const simple = !!m && !digitsAfter && Number.isFinite(num);
            const dp = m ? (m[2].split('.')[1]?.length ?? 0) : 0;
            const cp = glide(clamp01((t - at) / Math.max(1, p.countMs)));
            const val = num * cp;
            const body = dp > 0
              ? val.toFixed(dp)
              : (m?.[2].includes(',') ? Math.round(val).toLocaleString('en-US') : String(Math.round(val)));
            const shown = simple ? `${m[1]}${body}${m[3]}` : figure;

            return (
              <div
                key={i}
                style={{
                  width: hero ? Math.round(width * 0.185) : Math.round(width * 0.155),
                  padding: `${Math.round(S * (hero ? 0.048 : 0.04))}px 0 ${Math.round(S * (hero ? 0.036 : 0.03))}px`,
                  borderRadius: Math.round(S * 0.022),
                  textAlign: 'center',
                  background: hero ? p.accent : p.surface,
                  border: `2px solid ${hero ? p.accent : p.line}`,
                  boxShadow: hero
                    ? `0 ${Math.round(S * 0.03)}px ${Math.round(S * 0.07)}px ${alpha(p.accent, 0.28)}`
                    : `0 ${Math.round(S * 0.022)}px ${Math.round(S * 0.05)}px rgba(0,0,0,.35)`,
                  opacity: e,
                  transform: `translateY(${(1 - e) * S * 0.13}px) rotate(${lerp(i % 2 ? 3.2 : -3.2, 0, e)}deg) scale(${lerp(0.93, 1, e)})`,
                }}
              >
                <div style={{
                  fontFamily: fontStack(p.font), fontWeight: 700,
                  fontSize: Math.round(S * (hero ? 0.105 : 0.086)),
                  lineHeight: 1,
                  color: hero ? p.bg : p.ink,
                  fontVariantNumeric: 'tabular-nums',
                }}>{shown}</div>
                <div style={{
                  marginTop: Math.round(S * 0.014),
                  fontSize: Math.round(S * 0.019),
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: hero ? alpha(p.bg, 0.75) : p.dim,
                }}>{label}</div>
              </div>
            );
          })}
        </div>

        <div style={{ ...sceneGrain(fin.grain), ...el('grain') }} aria-hidden />
        <div style={sceneVignette(fin.vig)} aria-hidden />
      </div>
    );
  },
});
