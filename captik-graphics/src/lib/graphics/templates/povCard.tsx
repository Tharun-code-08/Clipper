// "POV:" card — the curiosity hook. A frosted dark glass chip types "POV:" in amber mono with a
// blinking block caret, then the payoff line blur-reveals under it (blurred + oversized, snapping
// sharp with a chromatic pop + settle shake). Never still: the lockup idleFloats, the glow
// breathes, a faint light band sweeps the whole lockup every ~3s. The craft: a ghost of the full
// chip text reserves the glass width, so the chip never jumps while it types.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp, clamp01, fr, rgba } from '../motion';
import { chromaPop, depthPose, idleFloat, impactFlash, parallax, pulse, shakeDecay, smear, vel } from '../juice';

export const povCard = defineGraphicsTemplate({
  id: 'pov_card',
  name: 'POV Card',
  category: 'title',
  tags: ['POV', 'Glass', 'Chip', 'Typing', 'Blur'],
  badge: 'Hot',
  design: { w: 900, h: 520 },
  // Transparent by design — the glass chip + type float straight over footage.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 30, widthPercent: 58 },
  fonts: ['pixel', 'montserrat'],

  elements: [
    { key: 'chip',  label: 'POV chip' },
    { key: 'line',  label: 'Payoff line', hideable: false },
    { key: 'sweep', label: 'Light sweep' },
  ],

  params: [
    { type: 'text', key: 'pov',  label: 'Chip text', group: 'Content', default: 'POV:', maxLength: 10 },
    { type: 'text', key: 'line', label: 'Payoff line', group: 'Content', default: 'you finally stopped scrolling', maxLength: 60 },

    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',    label: 'Line colour', group: 'Style', default: '#F6F2E8' },

    { type: 'number', key: 'typeMs', label: 'Type speed', group: 'Motion', default: 90, min: 40, max: 200, step: 5, unit: 'ms',
      help: 'Per character.' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Air sweep as the payoff line rises out of the blur, pop as it snaps sharp — both on the
  // same typing clock the motion runs on (typeDone = 260 + chars * typeMs; land = +390).
  sfx: (p) => [
    { atMs: p.delay + 260 + p.pov.length * p.typeMs + 40, id: 'whoosh', gain: 0.55 },
    { atMs: p.delay + 260 + p.pov.length * p.typeMs + 390, id: 'pop', gain: 0.8 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;

    // Fit the WIDTH even when an aspect preset makes the canvas taller than designed.
    const m = Math.min(height, width * (520 / 900));

    // ── Typing clock ──
    const typeStart = 260;
    const chars = clamp(Math.floor((t - typeStart) / p.typeMs) + 1, 0, p.pov.length);
    const typeDone = typeStart + p.pov.length * p.typeMs;
    const caretOn = Math.floor(t / 380) % 2 === 0;
    const caretO = t < typeDone + 700 ? 1 : clamp01(1 - (t - typeDone - 700) / 300);

    // ── Payoff blur-reveal: oversized + soft, snapping sharp with an overshooting spring ──
    const revealAt = typeDone + 160;
    const landAt = revealAt + 230;
    const riseAt = (ms: number) => spring({
      frame: fr(ms - revealAt), fps: FPS,
      config: { damping: 15, mass: 0.7, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });
    const sharpQ = clamp01((t - revealAt) / 260);
    const blurPx = Math.pow(1 - sharpQ, 2) * m * 0.028;
    const lineScaleAt = (ms: number) => 1.3 - 0.3 * riseAt(ms);
    const lineScale = lineScaleAt(t);
    // Velocity smear rides ON TOP of the rack-focus blur while the line is collapsing — the
    // stretch is what makes the snap read as motion, and both die to zero at the land.
    const lineSmear = smear(0, vel(lineScaleAt, t) * m * 0.7);

    const chipIn = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 18, mass: 0.7, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    const shake = shakeDecay(t, landAt, m * 0.014, { seed });
    const flash = impactFlash(t, landAt, 140);
    const drift = idleFloat(t, seed, m * 0.009, 2900);
    const glowK = pulse(t, 1600, 0.5, 1);

    // DEPTH: the whole lockup swings in top-hinged with the chip's spring and never flattens
    // back — the chip (foreground) and light sweep (backplate) parallax over the payoff line.
    const pose = depthPose(t, seed, { enter: chipIn, rx: -14, z: -80, swayDeg: 2 });
    const parChip = parallax(t, seed, 0.7, m * 0.013);
    const parSweep = parallax(t, seed, 0.25, m * 0.013);

    // Faint light band sweeping the whole lockup every ~3s, only after the land.
    const sweepQ = t > landAt ? ((t - landAt) % 3000) / 3000 : 0;
    const sweepX = -40 + sweepQ * 170;

    const fsChip = m * 0.082;
    const fsLine = m * 0.125;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: m * 0.05,
          transform: `${pose} translate(${(shake.x + drift.x).toFixed(2)}px, ${(shake.y + drift.y).toFixed(2)}px) rotate(${drift.rot.toFixed(3)}deg)`,
          transformOrigin: '50% 35%',
        }}
      >
        {/* ── Frosted glass chip typing "POV:" ── */}
        <div
          style={{
            position: 'relative',
            padding: `${m * 0.028}px ${m * 0.052}px`,
            borderRadius: m * 0.034,
            background: 'rgba(13,13,16,0.72)',
            border: '1.5px solid rgba(255,255,255,0.16)',
            boxShadow: [
              `inset 0 1px 0 rgba(255,255,255,0.22)`,
              `0 ${m * 0.016}px ${m * 0.05}px rgba(0,0,0,0.45)`,
              `0 0 ${(m * 0.07 * glowK).toFixed(1)}px ${rgba(p.accent, 0.28 * glowK)}`,
            ].join(', '),
            fontFamily: fontStack('pixel'),
            fontSize: fsChip,
            lineHeight: 1.1,
            letterSpacing: '0.06em',
            color: p.accent,
            opacity: Math.min(1, chipIn * 1.5),
            transform: `translate(${parChip.x.toFixed(2)}px, ${parChip.y.toFixed(2)}px) scale(${(0.85 + chipIn * 0.15).toFixed(4)})`,
            ...el('chip'),
          }}
        >
          {/* ghost reserves the full width so the glass never jumps mid-type */}
          <span style={{ opacity: 0 }}>{p.pov}</span>
          <span style={{ position: 'absolute', left: m * 0.052, top: m * 0.028, whiteSpace: 'nowrap' }}>
            {p.pov.slice(0, chars)}
            <span
              style={{
                display: 'inline-block',
                width: '0.55em', height: '0.95em',
                marginLeft: '0.1em',
                verticalAlign: '-0.12em',
                background: p.accent,
                boxShadow: `0 0 ${(m * 0.03 * glowK).toFixed(1)}px ${rgba(p.accent, 0.6 * glowK)}`,
                opacity: caretOn ? caretO : 0,
              }}
            />
          </span>
        </div>

        {/* ── Payoff line: blurred + oversized → snaps sharp with a chroma pop ── */}
        <span
          style={{
            fontFamily: fontStack('montserrat'),
            fontWeight: 800,
            fontSize: fsLine,
            lineHeight: 1.08,
            textAlign: 'center',
            maxWidth: '94%',
            color: p.ink,
            textShadow: [
              `0 ${m * 0.012}px ${m * 0.045}px rgba(0,0,0,0.7)`,
              `0 0 ${(m * 0.08 * glowK).toFixed(1)}px ${rgba(p.accent, 0.22 * glowK)}`,
              chromaPop(t, landAt, m * 0.013),
            ].filter(Boolean).join(', '),
            filter: blurPx + lineSmear.blurPx > 0.15 ? `blur(${(blurPx + lineSmear.blurPx).toFixed(2)}px)` : undefined,
            opacity: clamp01((t - revealAt) / 180),
            transform: `scale(${(lineScale * lineSmear.sx).toFixed(4)}, ${(lineScale * lineSmear.sy).toFixed(4)})`,
            ...el('line'),
          }}
        >
          {p.line}
        </span>

        {/* ── Faint light sweep across the lockup every ~3s ── */}
        <div
          style={{
            position: 'absolute', inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            opacity: t > landAt ? 1 : 0,
            transform: `translate(${parSweep.x.toFixed(2)}px, ${parSweep.y.toFixed(2)}px)`,
            ...el('sweep'),
          }}
        >
          <div
            style={{
              position: 'absolute', top: '-25%', bottom: '-25%',
              left: `${sweepX.toFixed(2)}%`, width: '24%',
              transform: 'rotate(14deg)',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.13), transparent)',
            }}
          />
        </div>

        {/* impact flash on the snap */}
        {flash > 0.02 && (
          <div
            style={{
              position: 'absolute', inset: '-4%',
              background: `radial-gradient(circle, rgba(255,255,255,${(0.4 * flash).toFixed(3)}) 0%, transparent 60%)`,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    );
  },
});
