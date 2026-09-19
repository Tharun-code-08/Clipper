// Bracket title: two thick amber square brackets start CLOSED at center — touching, they read
// as one box — then spring apart, the word scaling in through the gap as it opens. The final
// gap is fixed and the word is font-sized to FIT it (not vice versa), so the spring's
// overshoot can cross the glyphs without ever colliding at rest. Brackets breathe ±1% after
// settling — alive, not busy.

import type { CSSProperties } from 'react';
import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, outRamp } from '../motion';
import { LUXE, easeOutQuint, luxeLabel } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

export const bracketTitle = defineGraphicsTemplate({
  id: 'bracket_title',
  name: 'Bracket Title',
  category: 'title',
  tags: ['Brackets', 'Frame', 'Spread', 'Bold', 'Amber'],
  badge: 'New',
  design: { w: 900, h: 400 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3600,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 70 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'brackets', label: 'Brackets' },
    { key: 'word',     label: 'Word', hideable: false },
    { key: 'kicker',   label: 'Kicker' },
  ],

  params: [
    { type: 'text', key: 'word',   label: 'Word',   group: 'Content', default: 'NO EXCUSES', maxLength: 16 },
    { type: 'text', key: 'kicker', label: 'Kicker', group: 'Content', default: 'RULE 01', maxLength: 32 },

    { type: 'color',  key: 'accent', label: 'Brackets', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Word',     group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'anton' },
    { type: 'number', key: 'weight', label: 'Bracket weight', group: 'Style', default: 10, min: 4, max: 16, step: 1, unit: 'px' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // The throw, the word setting between the arms, then the kicker — the same three beats the
  // motion has, off the same delay.
  sfx: (p) => [
    { atMs: p.delay + 140, id: 'whoosh', gain: 0.6 },
    { atMs: p.delay + 420, id: 'slam', gain: 0.75 },
    { atMs: p.delay + 950, id: 'swish', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const out = outRamp(timeMs, durationMs, 320);
    const word = p.word.trim();

    const bh = height * 0.58;
    const armW = Math.round(bh * 0.16);
    const S = width * 0.3;
    const bw = p.weight;

    // Damping 15: the brackets fly past their marks by a few percent and snap back — the
    // spread reads as thrown open, not eased open.
    const apartAt = (ms: number) => spring({
      frame: fr(ms - 140), fps: FPS,
      config: { damping: 15, mass: 0.9, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const apart = apartAt(t);
    // Post-settle breath, amplitude ramped in so it never fights the spring's own tail.
    const breatheAt = (ms: number) => (ms > 1100 ? Math.sin((ms - 1100) / 300) * 0.01 * clamp01((ms - 1100) / 600) : 0);
    // Sampled as ONE closure so the arms' true px/ms drives the smear — the breath's own
    // velocity is ~0.01px/ms, which is below the blur floor, so the settled pose stays crisp.
    const offAt = (ms: number) => S * apartAt(ms) * (1 + breatheAt(ms));
    const off = offAt(t);
    const brSm = smear(vel(offAt, t), 0, 1.1);

    const wordInAt = (ms: number) => easeOutQuint(clamp01((apartAt(ms) - 0.2) / 0.6));
    const wordIn = wordInAt(t);
    const kickIn = easeOutQuint(clamp01((t - 950) / 460));

    const fs = Math.round(Math.min(bh * 0.5, (2 * (S - armW) * 1.55) / Math.max(3, word.length)));
    const fsKick = Math.round(height * 0.052);

    // The whole lockup arrives top-hinged through space on the SAME spring that throws the
    // arms open, then keeps a ±1.8° sway so it never flattens back into a web page; the word
    // and kicker sit at different depths and shear over it.
    const pose = depthPose(t, seed, { enter: apart, rx: -12, z: -90, swayDeg: 1.8 });
    const parWord = parallax(t, seed, 0.3, height * 0.02);
    const parKick = parallax(t, seed, 0.75, height * 0.02);
    // The word's growth velocity measured at the outer glyph edge — a whisper of smear on a
    // 0.9→1 scale, gone the instant it sets.
    const wSm = smear(vel(wordInAt, t) * (S - armW) * 0.1, 0, 1);

    const bracket = (side: 'left' | 'right'): CSSProperties => ({
      position: 'absolute', left: '50%', top: '50%',
      width: armW, height: bh, boxSizing: 'border-box',
      borderStyle: 'solid', borderColor: p.accent,
      borderWidth: side === 'left' ? `${bw}px 0 ${bw}px ${bw}px` : `${bw}px ${bw}px ${bw}px 0`,
      transform: `translate(${(side === 'left' ? -off - armW : off).toFixed(2)}px, -50%) scale(${brSm.sx.toFixed(4)}, ${brSm.sy.toFixed(4)})`,
      filter: brSm.blurPx > 0.3 ? `blur(${brSm.blurPx.toFixed(2)}px)` : undefined,
      boxShadow: `0 0 18px rgba(0,0,0,0.35)`,
      opacity: clamp01(t / 160),
    });

    return (
      <div
        style={{
          position: 'absolute', inset: 0, opacity: out,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: height * 0.055,
          transform: pose,
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: bh }}>
          <div style={{ ...bracket('left'), ...el('brackets') }} />
          <div style={{ ...bracket('right'), ...el('brackets') }} />

          <span
            style={{
              position: 'absolute', left: '50%', top: '50%',
              fontFamily: fontStack(p.font),
              fontSize: fs, fontWeight: 400, lineHeight: 1,
              letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              color: p.ink,
              textShadow: '0 8px 26px rgba(0,0,0,0.45)',
              opacity: wordIn,
              filter: wSm.blurPx > 0.3 ? `blur(${wSm.blurPx.toFixed(2)}px)` : undefined,
              transform: `translate(-50%, -50%) translate(${parWord.x.toFixed(2)}px, ${parWord.y.toFixed(2)}px) scale(${((0.9 + 0.1 * wordIn) * wSm.sx).toFixed(4)}, ${((0.9 + 0.1 * wordIn) * wSm.sy).toFixed(4)})`,
              ...el('word'),
            }}
          >
            {word}
          </span>
        </div>

        <span
          style={{
            fontFamily: fontStack('montserrat'),
            ...luxeLabel(fsKick, LUXE.inkDim),
            letterSpacing: '0.26em',
            opacity: kickIn,
            transform: `translate(${parKick.x.toFixed(2)}px, ${(parKick.y + (1 - kickIn) * height * 0.02).toFixed(2)}px)`,
            ...el('kicker'),
          }}
        >
          {p.kicker}
        </span>
      </div>
    );
  },
});
