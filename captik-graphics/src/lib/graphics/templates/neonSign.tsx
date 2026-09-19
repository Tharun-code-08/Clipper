// Reference: text/night-street-market.mp4  (window 440-5280ms, all three words lit by ~1720ms)
// A stacked neon sign: each word sits in its own outlined box and strikes on separately, stuttering
// a couple of times before it holds — then breathes. A badge and a string of bulbs finish it.
//
// The flicker is a SEEDED pattern sampled off timeMs, not a random draw per frame: same millisecond,
// same stutter, on every surface. A CSS keyframe flicker would look right in the preview and export
// as one frozen state.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { parallax, smear, sway3d, swingIn, vel } from '../juice';

const MAX_WORDS = 4;
const MAX_BULBS = 14;

export const neonSign = defineGraphicsTemplate({
  id: 'neon_sign',
  name: 'Neon Sign',
  category: 'title',
  tags: ['Neon', 'Night', 'Sign'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter', 'anton'],

  elements: [
    { key: 'sign',   label: 'Sign', hideable: false },
    { key: 'badge',  label: 'Badge' },
    { key: 'lights', label: 'Bulb string' },
    ...Array.from({ length: MAX_WORDS }, (_, i) => ({ key: `word${i + 1}`, label: `Word ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'lines', label: 'Words', group: 'Content', multiline: true, maxLength: 120,
      default: 'NIGHT\nSTREET\nMARKET', help: 'One per line, up to four.' },
    { type: 'text', key: 'badge', label: 'Badge', group: 'Content', default: 'OPEN\nLATE', maxLength: 24,
      help: 'Two short lines work best. Leave empty to hide.' },

    { type: 'color',  key: 'neon',    label: 'Neon',       group: 'Style', default: '#ff2d4a' },
    { type: 'color',  key: 'ink',     label: 'Text',       group: 'Style', default: '#ffe9ec' },
    { type: 'color',  key: 'badgeBg', label: 'Badge',      group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'badgeInk', label: 'Badge text', group: 'Style', default: '#1a1206' },
    { type: 'font',   key: 'font',    label: 'Font',       group: 'Style', default: 'anton' },
    { type: 'number', key: 'size',    label: 'Size',       group: 'Style', default: 160, min: 20, max: 220, step: 4, unit: 'px' },
    { type: 'number', key: 'track',   label: 'Tracking',   group: 'Style', default: 4, min: -10, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'padX',    label: 'Box padding', group: 'Style', default: 34, min: 0, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'gap',     label: 'Row gap',    group: 'Style', default: 26, min: 0, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'glow',    label: 'Glow',       group: 'Style', default: 44, min: 0, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'ambient', label: 'Ambient wash', group: 'Style', default: 0.28, min: 0, max: 1, step: 0.02,
      help: 'How far the neon bleeds into the night around the sign.' },
    { type: 'boolean', key: 'bulbs',  label: 'Bulb string', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First word at', group: 'Motion', default: 140, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Word stagger',  group: 'Motion', default: 440, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stutter', label: 'Strike stutter', group: 'Motion', default: 320, min: 0, max: 1200, step: 20, unit: 'ms',
      help: 'How long a word flickers before it holds.' },
    { type: 'number', key: 'breathe', label: 'Breathe',       group: 'Motion', default: 0.1, min: 0, max: 0.5, step: 0.02 },
    { type: 'number', key: 'badgeAt', label: 'Badge at',      group: 'Motion', default: 1500, min: 0, max: 6000, step: 50, unit: 'ms' },
  ],

  // One dry snap per tube the instant its stutter ends and it holds (the strike moment the
  // flicker resolves on), then a glossy pop for the badge stamp — same grid as the motion.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX_WORDS, p.lines.split('\n').map((s) => s.trim()).filter(Boolean).length));
    const cues: { atMs: number; id: 'snap' | 'pop'; gain: number }[] = [];
    for (let i = 0; i < Math.min(n, 3); i++) {
      cues.push({ atMs: p.firstAt + i * p.stagger + p.stutter, id: 'snap', gain: i === n - 1 ? 0.5 : 0.4 });
    }
    if (p.badge.trim() && cues.length < 4) cues.push({ atMs: p.badgeAt + 160, id: 'pop', gain: 0.6 });
    return cues;
  },

  render: ({ params: p, el, timeMs, seed, width }) => {
    const ff = fontStack(p.font);
    const words = p.lines.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_WORDS);

    const lightsIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const litU = clamp01((timeMs - p.firstAt) / Math.max(1, (Math.max(1, words.length) - 1) * p.stagger + p.stutter));
    const badgeInAt = (ms: number) => spring({
      frame: fr(ms - p.badgeAt), fps: FPS,
      config: { damping: 14, mass: 0.6, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const badgeIn = badgeInAt(timeMs);

    // DEPTH, not retiming: the mounted sign shares one slow ±1.3° sway (a physical board on a
    // wall, not a flat comp) and each row sits at its own parallax depth so the sway shears
    // them; the bulb string hangs behind at a shallower depth. The strike/flicker clock is
    // untouched. The badge stamps in through 3D, its arrival velocity smearing it briefly.
    const signSway = sway3d(timeMs, seed, 1.3, 4200);
    const parBulbs = parallax(timeMs, seed, 0.3, width * 0.006, 4200);
    const parBadge = parallax(timeMs, seed, 0.8, width * 0.006, 4200);
    const vBadge = vel(badgeInAt, timeMs) * width * 0.075;
    const smBadge = smear(0, vBadge, 0.9);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: p.gap, fontFamily: ff, paddingBottom: '20%', boxSizing: 'border-box',
          ...el('sign'),
        }}
      >
        {/* Deep night backdrop — the darkness the tubes strike against. */}
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 130% 95% at 50% 30%, #0E0E16 0%, #07070B 58%, #030305 100%)',
          }}
        />
        {p.ambient > 0 && (
          <div
            style={{
              position: 'absolute', inset: 0,
              // The whole street is lit by the sign, and it opens up as each tube strikes.
              background: `radial-gradient(61% ${(29 + 15 * litU).toFixed(1)}% at 50% ${(26 + 12 * litU).toFixed(1)}%, `
                + `${rgba(p.neon, p.ambient)} 0%, ${rgba(p.neon, p.ambient * 0.47)} 80%, ${rgba(p.neon, 0)} 100%)`,
            }}
          />
        )}
        {p.bulbs && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: '6%', height: width * 0.12, transform: `translate(${parBulbs.x.toFixed(2)}px, ${parBulbs.y.toFixed(2)}px)`, ...el('lights') }}>
            {Array.from({ length: MAX_BULBS }).map((_, i) => {
              const u = i / (MAX_BULBS - 1);
              // A slack catenary across the top, with each bulb pulsing on its own phase.
              const sag = Math.sin(u * Math.PI) * width * 0.055;
              const ph = random(`${seed}b${i}`) * Math.PI * 2;
              const lit = 0.55 + 0.45 * Math.sin(timeMs / 620 + ph);
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${u * 100}%`, top: sag,
                    width: width * 0.011, height: width * 0.011, borderRadius: '50%',
                    background: p.badgeBg,
                    opacity: clamp01(lightsIn) * lit,
                    boxShadow: `0 0 ${width * 0.02}px ${rgba(p.badgeBg, 0.9 * lit)}`,
                  }}
                />
              );
            })}
          </div>
        )}

        {words.map((w, i) => {
          const at = p.firstAt + i * p.stagger;
          const since = timeMs - at;
          // Strike: a seeded stutter while the tube warms, then solid.
          let on = 0;
          if (since >= 0) {
            if (since >= p.stutter) on = 1;
            else {
              const step = Math.floor(since / Math.max(1, p.stutter / 5));
              on = random(`${seed}f${i}_${step}`) > 0.42 ? 1 : 0.12;
            }
          }
          const pulse = 1 - p.breathe * 0.5 * (1 + Math.sin(timeMs / 900 + i));
          const strength = on * pulse;
          const parRow = parallax(timeMs, seed, 0.15 + i * 0.2, width * 0.006, 4200);
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                transform: `${signSway} translate(${parRow.x.toFixed(2)}px, ${parRow.y.toFixed(2)}px)`,
                transformOrigin: 'center center',
                border: `${p.size * 0.03}px solid ${rgba(p.neon, 0.55 * strength + 0.12)}`,
                borderRadius: 8,
                padding: `${p.size * 0.12}px ${p.padX}px`,
                color: p.ink, fontSize: p.size, letterSpacing: p.track,
                lineHeight: 1.05, whiteSpace: 'nowrap',
                // An unstruck tube is not there at all — the sign builds word by word.
                opacity: since < 0 ? 0 : 0.22 + 0.78 * strength,
                // Hot ink-coloured core first, then successively wider, fainter halos — a tube,
                // not a blur.
                textShadow: p.glow > 0
                  ? `0 0 ${p.glow * 0.14}px ${rgba(p.ink, 0.9 * strength)}, 0 0 ${p.glow * 0.4}px ${rgba(p.neon, strength)}, `
                    + `0 0 ${p.glow}px ${rgba(p.neon, 0.85 * strength)}, 0 0 ${p.glow * 2.2}px ${rgba(p.neon, 0.5 * strength)}, `
                    + `0 0 ${p.glow * 4}px ${rgba(p.neon, 0.22 * strength)}`
                  : undefined,
                boxShadow: p.glow > 0
                  ? `0 0 ${p.glow * 0.7}px ${rgba(p.neon, 0.5 * strength)}, 0 0 ${p.glow * 2}px ${rgba(p.neon, 0.2 * strength)}, `
                    + `inset 0 0 ${p.glow * 0.5}px ${rgba(p.neon, 0.3 * strength)}`
                  : undefined,
                ...el(`word${i + 1}`),
              }}
            >
              {w}
            </div>
          );
        })}

        {p.badge.trim() && (
          <div
            style={{
              position: 'absolute', right: '10%', bottom: '26%',
              width: width * 0.15, height: width * 0.15, borderRadius: '50%',
              background: p.badgeBg, color: p.badgeInk,
              display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              fontSize: width * 0.032, lineHeight: 1.05, whiteSpace: 'pre-line',
              opacity: clamp01(badgeIn * 1.5),
              filter: smBadge.blurPx > 0.3 ? `blur(${smBadge.blurPx.toFixed(2)}px)` : undefined,
              transform:
                `${swingIn(badgeIn, { rx: -18, ry: 12, z: -120 })} `
                + `translate(${parBadge.x.toFixed(2)}px, ${parBadge.y.toFixed(2)}px) `
                + `rotate(${(-12 * (1 - badgeIn) - 8).toFixed(2)}deg) `
                + `scale(${((0.5 + 0.5 * badgeIn) * smBadge.sx).toFixed(4)}, ${((0.5 + 0.5 * badgeIn) * smBadge.sy).toFixed(4)})`,
              transformOrigin: 'center center',
              ...el('badge'),
            }}
          >
            {p.badge}
          </div>
        )}

        <div style={luxeVignette(0.5)} />
        <div style={luxeGrain(0.05)} />
      </div>
    );
  },
});
