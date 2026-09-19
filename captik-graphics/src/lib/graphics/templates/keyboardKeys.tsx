// Keyboard shortcut — 2-4 keycaps drop in, press DOWN in sequence, then release together
// with a chord flash and the shortcut's meaning chip beside. Craft: the keycap's 3D side is
// ONE solid box-shadow whose offset tracks the top-face translate — it compresses on press
// and rides along on the release overshoot, so the geometry stays glued at any legend width.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, smear, sway3d, swingIn, vel } from '../juice';

const MAX = 4;

/** Blend two hex colours — derives the keycap side / top-light / pressed tint from the user's key colour. */
function mix(a: string, b: string, f: number): string {
  const ex = (h: string) => {
    const raw = h.trim().replace('#', '');
    return raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  };
  const pa = ex(a);
  const pb = ex(b);
  if (!/^[0-9a-f]{6}$/i.test(pa) || !/^[0-9a-f]{6}$/i.test(pb)) return a;
  const c = (i: number) => Math.round(parseInt(pa.slice(i, i + 2), 16) * (1 - f) + parseInt(pb.slice(i, i + 2), 16) * f);
  return `rgb(${c(0)},${c(2)},${c(4)})`;
}

export const keyboardKeys = defineGraphicsTemplate({
  id: 'keyboard_keys',
  name: 'Keyboard Keys',
  category: 'device',
  tags: ['Keyboard', 'Keycaps', 'Shortcut', 'Press', 'Keys'],
  badge: 'New',
  design: { w: 900, h: 320 },
  // Floats transparently over footage — the keycaps paint their own plastic.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 64 },
  fonts: ['montserrat'],

  elements: [
    ...Array.from({ length: MAX }, (_, i) => ({ key: `key${i + 1}`, label: `Key ${i + 1}` })),
    { key: 'plus', label: 'Plus signs' },
    { key: 'flash', label: 'Chord flash' },
    { key: 'label', label: 'Meaning label' },
  ],

  params: [
    { type: 'text', key: 'keys', label: 'Keys', group: 'Content', default: 'Ctrl|Shift|K', maxLength: 40,
      help: 'Up to 4 keys, separated by |.' },
    { type: 'text', key: 'label', label: 'Meaning', group: 'Content', default: 'Quick Search', maxLength: 26 },

    { type: 'color', key: 'keyColor', label: 'Keycap', group: 'Style', default: '#F5F1E6' },
    { type: 'color', key: 'ink',      label: 'Legend', group: 'Style', default: '#22201B' },
    { type: 'color', key: 'accent',   label: 'Accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'pressMs', label: 'Press speed', group: 'Motion', default: 90, min: 40, max: 260, step: 10, unit: 'ms' },
    { type: 'number', key: 'cadence', label: 'Press cadence', group: 'Motion', default: 320, min: 120, max: 900, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Key thocks AT the press beats and a dry snap at the chord release — the 950ms press start
  // and the +460ms release offset are the SAME constants the render's beat grid uses, so
  // retiming the cadence retimes the sound. Type cues cap at three so a 4-key chord stays ≤4.
  sfx: (p) => {
    const n = Math.min(4, Math.max(1, p.keys.split('|').map((s) => s.trim()).filter(Boolean).length));
    return [
      ...Array.from({ length: Math.min(3, n) }, (_, i) => ({
        atMs: p.delay + 950 + i * p.cadence, id: 'type' as const, gain: 0.55,
      })),
      { atMs: p.delay + 950 + (n - 1) * p.cadence + 460, id: 'snap' as const, gain: 0.6 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const keys = p.keys.split('|').map((s) => s.trim()).filter(Boolean).slice(0, MAX);
    if (!keys.length) return null;
    const n = keys.length;

    const sideH = height * 0.046;
    const fsKey = Math.round(height * 0.135);
    const sideCol = mix(p.keyColor, '#000000', 0.3);

    // Beat grid: keys land, press one by one, ALL release together on a chord.
    const pressStart = 950;
    const relT = pressStart + (n - 1) * p.cadence + 460;
    const rel = spring({
      frame: fr(t - relT), fps: FPS,
      config: { damping: 13, mass: 0.5, stiffness: 250 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const flashF = t >= relT ? easeOutQuint(clamp01((t - relT) / 480)) : 0;
    const labelIn = spring({
      frame: fr(t - relT - 120), fps: FPS,
      config: { damping: 20, mass: 0.7, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });
    const chipRot = (random(`${seed}-chip`) - 0.5) * 2.6;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexWrap: 'wrap', columnGap: width * 0.035, rowGap: height * 0.1,
          fontFamily: ff,
        }}
      >
        {/* DEPTH: the chord group keeps a ≤0.8° 3D sway once settled — keycaps are a device
            mimic, so they rest nearly still but never go dead. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', columnGap: width * 0.026, transform: sway3d(t, seed, 0.8, 4800) }}>
          {t >= relT && flashF < 1 && (
            <div style={{ position: 'absolute', inset: -height * 0.075, ...el('flash') }}>
              <div
                style={{
                  position: 'absolute', inset: 0,
                  borderRadius: height * 0.09,
                  border: `${Math.max(2, height * 0.009).toFixed(1)}px solid ${rgba(p.accent, 0.9 * (1 - flashF))}`,
                  transform: `scale(${(1 + 0.16 * flashF).toFixed(4)})`,
                }}
              />
              <div
                style={{
                  position: 'absolute', inset: -height * 0.06,
                  background: `radial-gradient(ellipse at 50% 50%, ${rgba(p.accent, 0.3 * (1 - flashF))} 0%, transparent 70%)`,
                }}
              />
            </div>
          )}

          {keys.map((legend, i) => {
            const landAt = 100 + i * 150;
            const landSpr = (ms: number) => spring({
              frame: fr(ms - landAt), fps: FPS,
              config: { damping: 20, mass: 0.7, stiffness: 200 },
              durationInFrames: Math.max(1, Math.round(fr(480))),
            });
            const land = landSpr(t);
            // Each cap drops in off its own top hinge with a fall-velocity smear that dies on
            // touchdown — physical plastic arriving, not a sprite fading. Press mechanics below
            // are untouched.
            const dropSmear = smear(0, vel((ms: number) => (1 - landSpr(ms)) * height * 0.22, t));
            // Press: 90ms smoothstep down, held, then the shared release spring lifts it
            // (overshoot > 1 makes `press` dip negative = the satisfying pop above rest).
            const dp = clamp01((t - (pressStart + i * p.cadence)) / Math.max(1, p.pressMs));
            const down = dp * dp * (3 - 2 * dp);
            const press = down * (1 - rel);
            const pressPx = press * sideH;
            const solidOff = sideH - clamp(pressPx, 0, sideH);
            const gap = Math.max(0, -pressPx);
            const tinted = press > 0.01 ? mix(p.keyColor, p.accent, 0.3 * clamp01(press)) : p.keyColor;
            const rot = (random(`${seed}-k${i}`) - 0.5) * 2;
            const shadow = [
              `0 ${solidOff.toFixed(1)}px 0 ${sideCol}`,
              `0 ${(solidOff + gap + 6).toFixed(1)}px ${(14 + gap * 1.5).toFixed(1)}px rgba(0,0,0,0.28)`,
              press > 0.01 ? `0 0 ${(26 * press).toFixed(1)}px ${rgba(p.accent, 0.45 * clamp01(press))}` : '',
            ].filter(Boolean).join(', ');

            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', columnGap: width * 0.026 }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: fsKey, fontWeight: 700, lineHeight: 1,
                    letterSpacing: '0.02em', color: p.ink,
                    background: `linear-gradient(180deg, ${mix(tinted, '#FFFFFF', 0.55)} 0%, ${tinted} 60%)`,
                    border: '1.5px solid rgba(0,0,0,0.12)',
                    borderRadius: height * 0.045,
                    padding: `${Math.round(height * 0.052)}px ${Math.round(height * 0.085)}px`,
                    minWidth: height * 0.28, textAlign: 'center', boxSizing: 'border-box',
                    marginBottom: sideH,
                    boxShadow: shadow,
                    opacity: clamp01(land * 1.6),
                    filter: dropSmear.blurPx > 0.3 ? `blur(${dropSmear.blurPx.toFixed(2)}px)` : undefined,
                    transform: `${swingIn(land, { rx: -18 - i * 4, z: -80 })} translateY(${(pressPx + (1 - land) * -height * 0.22).toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${((0.92 + 0.08 * land) * dropSmear.sx).toFixed(4)}, ${((0.92 + 0.08 * land) * dropSmear.sy).toFixed(4)})`,
                    ...el(`key${i + 1}`),
                  }}
                >
                  {legend}
                </span>
                {i < n - 1 && (
                  <span
                    style={{
                      fontSize: fsKey * 0.9, fontWeight: 800, lineHeight: 1,
                      color: '#FFFFFF', textShadow: '0 2px 12px rgba(0,0,0,0.55)',
                      marginBottom: sideH,
                      opacity: clamp01((t - (100 + (i + 1) * 150)) / 200),
                      ...el('plus'),
                    }}
                  >
                    +
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {p.label.trim() && (
          <div
            style={{
              display: 'flex', alignItems: 'center', columnGap: width * 0.024,
              opacity: clamp01(labelIn * 1.4),
              // The meaning chip swings in off its own hinge and keeps its own faint sway, so it
              // lives in the same space as the caps without moving in lockstep with them.
              transform: `${depthPose(t, `${seed}-lbl`, { enter: labelIn, rx: -12, z: -50, swayDeg: 0.7, periodMs: 4400 })} translateY(${((1 - labelIn) * height * 0.06).toFixed(2)}px)`,
              ...el('label'),
            }}
          >
            <span style={{ fontSize: fsKey * 0.95, fontWeight: 800, lineHeight: 1, color: '#FFFFFF', textShadow: '0 2px 12px rgba(0,0,0,0.55)' }}>
              =
            </span>
            <span
              style={{
                fontSize: fsKey * 0.78, fontWeight: 700, lineHeight: 1, color: p.ink,
                background: p.keyColor, borderRadius: 999,
                padding: `${Math.round(height * 0.048)}px ${Math.round(height * 0.1)}px`,
                boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
                transform: `rotate(${chipRot.toFixed(2)}deg)`,
                whiteSpace: 'nowrap',
              }}
            >
              {p.label}
            </span>
          </div>
        )}
      </div>
    );
  },
});
