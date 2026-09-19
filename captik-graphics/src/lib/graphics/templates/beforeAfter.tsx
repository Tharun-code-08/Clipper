// PUNCH before/after split — a dim gray BEFORE card settles in quietly, a thick divider draws,
// then the amber-lit AFTER card slams in from the right a beat later and lands with a decaying
// settle-shake. The two entrances are deliberately unequal: BEFORE gets no drama, so ALL the
// impact budget is spent on the transformation.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

const INK = '#F4F1E8';

/** Decaying settle-shake: pure function of ms-since-impact, dead within ~450ms. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

export const beforeAfter = defineGraphicsTemplate({
  id: 'before_after',
  name: 'Before / After',
  category: 'story',
  tags: ['Split', 'Before', 'After', 'Compare', 'Cards'],
  badge: 'New',
  design: { w: 900, h: 600 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 80 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'before',  label: 'Before card' },
    { key: 'after',   label: 'After card', hideable: false },
    { key: 'divider', label: 'Divider' },
  ],

  params: [
    { type: 'text', key: 'beforeLabel', label: 'Before label', group: 'Content', default: 'BEFORE', maxLength: 16 },
    { type: 'text', key: 'beforeValue', label: 'Before value', group: 'Content', default: '2 CLIENTS', maxLength: 20 },
    { type: 'text', key: 'afterLabel',  label: 'After label',  group: 'Content', default: 'AFTER', maxLength: 16 },
    { type: 'text', key: 'afterValue',  label: 'After value',  group: 'Content', default: '30 CLIENTS', maxLength: 20 },
    { type: 'image', key: 'beforeImg', label: 'Before photo', group: 'Content', default: '', help: 'Optional — the card keeps its flat colour when empty.' },
    { type: 'image', key: 'afterImg',  label: 'After photo',  group: 'Content', default: '', help: 'Optional — the card keeps its gradient when empty.' },

    { type: 'color', key: 'accent', label: 'Accent',     group: 'Style', default: '#F59E0B' },
    { type: 'font',  key: 'font',   label: 'Value font', group: 'Style', default: 'anton' },

    { type: 'number', key: 'beat',  label: 'After lands at', group: 'Motion', default: 900, min: 200, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'shake', label: 'Shake',          group: 'Motion', default: 3, min: 0, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay', label: 'Delay',          group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // A light pass for the quiet BEFORE, then the transformation gets the budget: whoosh on
  // approach, slam when the AFTER card lands — all timed off beat, so retiming retimes them.
  sfx: (p) => [
    { atMs: p.delay + 100, id: 'swish', gain: 0.3 },
    { atMs: p.delay + Math.max(0, p.beat - 120), id: 'whoosh', gain: 0.6 },
    { atMs: p.delay + p.beat + 180, id: 'slam', gain: 0.9 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ffVal = fontStack(p.font);
    const ffSans = fontStack('montserrat');

    const cardW = width * 0.425;
    const cardY = height * 0.13, cardH = height * 0.74;

    // BEFORE: a quiet settle — heavy damping, no overshoot. It is the baseline, not the star.
    const sB = spring({
      frame: fr(t - 100), fps: FPS,
      config: { damping: 26, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });

    const dv = easeOut((t - 420) / 360);

    // AFTER: slams in from the right; damping 15 gives the 1-2 frame overshoot past its slot.
    const sAAt = (ms: number) => spring({
      frame: fr(ms - p.beat), fps: FPS,
      config: { damping: 15, mass: 0.8, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    const sA = sAAt(t);
    const impact = p.beat + 180;
    const shk = settle(t - impact, p.shake);
    const glowIn = clamp01((t - impact) / 260);

    // The two cards HINGE from opposite sides of the split: BEFORE swings gently off its left
    // edge, AFTER off its right — the divider is the fold line of the whole comparison. Each
    // keeps a small resting sway after (the transformation stays alive, never a flat webpage).
    const poseB = depthPose(t, `${seed}-b`, { enter: sB, ry: 16, z: -60, swayDeg: 0.8 });
    const poseA = depthPose(t, `${seed}-a`, { enter: sA, ry: -22, z: -110, swayDeg: 1.3 });
    // TRUE slam smear: the AFTER card's slide velocity drives blur + stretch that die on impact.
    const txAt = (ms: number) => (1 - sAAt(ms)) * width * 0.5;
    const smA = smear(vel(txAt, t), 0, 1);

    const fsLabel = Math.round(height * 0.045);
    const fsBefore = Math.min(height * 0.14, (cardW - 64) / (0.56 * Math.max(3, p.beforeValue.length)));
    const fsAfter = Math.min(height * 0.14 * 1.3, (cardW - 64) / (0.56 * Math.max(3, p.afterValue.length)));

    return (
      <div style={{ position: 'absolute', inset: 0, opacity: clamp01(t / 120), fontFamily: ffSans }}>
        {/* BEFORE — dim gray, deliberately flat. */}
        <div
          style={{
            position: 'absolute', left: width * 0.038, top: cardY, width: cardW, height: cardH,
            boxSizing: 'border-box', borderRadius: 20,
            background: '#1B1B1E',
            border: '2px solid rgba(255,255,255,0.08)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: height * 0.06,
            opacity: clamp01(sB * 2.5),
            transform: `${poseB} translateY(${((1 - sB) * 24).toFixed(2)}px)`,
            transformOrigin: 'left center',
            ...el('before'),
          }}
        >
          {p.beforeImg && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: 18, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.beforeImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {/* Darkening wash so the label/value stay readable over any photo. */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.58) 100%)' }} />
            </div>
          )}
          <span style={{ position: 'relative', fontSize: fsLabel, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: rgba(INK, 0.5) }}>
            {p.beforeLabel}
          </span>
          <span style={{ position: 'relative', fontFamily: ffVal, fontSize: Math.round(fsBefore), fontWeight: 700, color: rgba(INK, 0.75), whiteSpace: 'nowrap', lineHeight: 1 }}>
            {p.beforeValue}
          </span>
        </div>

        {/* Divider — thick center bar, grows from the middle out. */}
        <div
          style={{
            position: 'absolute', left: width / 2 - 6, top: cardY, width: 12, height: cardH,
            borderRadius: 6, background: p.accent,
            boxShadow: `0 0 18px ${rgba(p.accent, 0.4)}`,
            transform: `scaleY(${dv.toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('divider'),
          }}
        />

        {/* AFTER — amber-lit, 1.3x weight, slams in and settles. */}
        <div
          style={{
            position: 'absolute', left: width - width * 0.038 - cardW, top: cardY, width: cardW, height: cardH,
            boxSizing: 'border-box', borderRadius: 20,
            background: 'linear-gradient(180deg, #231903 0%, #0B0B0D 70%)',
            border: `3px solid ${p.accent}`,
            boxShadow: `0 16px 44px rgba(0,0,0,0.5), 0 0 ${Math.round(40 * glowIn)}px ${rgba(p.accent, 0.3 * glowIn)}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: height * 0.06,
            opacity: clamp01(sA * 3),
            filter: smA.blurPx > 0.3 ? `blur(${smA.blurPx.toFixed(2)}px)` : undefined,
            transform:
              `${poseA} translate(${(txAt(t) + shk.x).toFixed(2)}px, ${shk.y.toFixed(2)}px) ` +
              `scale(${smA.sx.toFixed(4)}, ${smA.sy.toFixed(4)})`,
            transformOrigin: 'right center',
            ...el('after'),
          }}
        >
          {p.afterImg && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: 17, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.afterImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {/* Darkening wash so the label/value stay readable over any photo. */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.58) 100%)' }} />
            </div>
          )}
          <span style={{ position: 'relative', fontSize: fsLabel, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: p.accent }}>
            {p.afterLabel}
          </span>
          <span
            style={{
              position: 'relative',
              fontFamily: ffVal, fontSize: Math.round(fsAfter), fontWeight: 900, color: INK,
              whiteSpace: 'nowrap', lineHeight: 1,
              textShadow: `0 0 ${Math.round(fsAfter * 0.3)}px ${rgba(p.accent, 0.4)}, 0 8px 26px rgba(0,0,0,0.45)`,
            }}
          >
            {p.afterValue}
          </span>
        </div>
      </div>
    );
  },
});
