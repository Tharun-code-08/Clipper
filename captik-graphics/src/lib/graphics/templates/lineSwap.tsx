// Reference: text/i-want-a-smooth-animation-where-the-text-with-2-li.mp4
//   (usable window 3480-6200ms — the capture's first swap is off the front of the loop)
// A two-line headline that keeps replacing itself: the outgoing letters tip away on the X axis one
// after another while the incoming ones tip in behind them. The two halves OVERLAP, which is the
// whole reason it reads as a swap and not a fade.
//
// Each letter's rotateX is its own, staggered by index, so a long word ripples rather than flipping
// as a slab.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { depthPose, parallax, smear } from '../juice';

const MAX_PHRASES = 6;

export const lineSwap = defineGraphicsTemplate({
  id: 'line_swap',
  name: 'Line Swap',
  category: 'title',
  tags: ['Text', 'Flip', 'Loop'],
  design: { w: 900, h: 520 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 6000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 88 },
  fonts: ['montserrat'],

  elements: [
    { key: 'block', label: 'Block', hideable: false },
    { key: 'top',   label: 'Top line' },
    { key: 'bottom', label: 'Bottom line' },
  ],

  params: [
    { type: 'text', key: 'phrases', label: 'Phrases', group: 'Content', multiline: true, maxLength: 300,
      default: 'Creative|Motion\nBold|Stories\nCaptik|Design',
      help: 'One phrase per line, the two lines separated by a pipe.' },

    { type: 'color',  key: 'ink',   label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Size',   group: 'Style', default: 140, min: 20, max: 220, step: 4, unit: 'px' },
    { type: 'number', key: 'weight', label: 'Weight', group: 'Style', default: 800, min: 300, max: 900, step: 100 },
    { type: 'number', key: 'lead',  label: 'Line height', group: 'Style', default: 1.14, min: 0.8, max: 2, step: 0.02 },

    { type: 'number', key: 'hold',    label: 'Hold each phrase', group: 'Motion', default: 1700, min: 300, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'swapMs',  label: 'Swap over',        group: 'Motion', default: 620, min: 120, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'perChar', label: 'Per letter',       group: 'Motion', default: 26, min: 0, max: 160, step: 2, unit: 'ms' },
    { type: 'number', key: 'tipDeg',  label: 'Tip',              group: 'Motion', default: 82, min: 20, max: 120, step: 2, unit: '°' },
  ],

  // A quiet arrival, then one swish per flip — computed off the same hold + swapMs cycle the
  // letters ripple on, capped inside the default window.
  sfx: (p) => {
    const cues: { atMs: number; id: 'whoosh' | 'swish'; gain: number }[] = [
      { atMs: 140, id: 'whoosh', gain: 0.35 },
    ];
    const cycle = p.hold + p.swapMs;
    for (let k = 0; k < 3 && cues.length < 4; k++) {
      const at = p.hold + k * cycle + p.swapMs * 0.3;
      if (at <= 5940) cues.push({ atMs: at, id: 'swish', gain: 0.5 });
    }
    return cues;
  },

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const phrases = p.phrases.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_PHRASES)
      .map((l) => l.split('|').map((s) => s.trim()));
    if (!phrases.length) return null;

    const cycle = p.hold + p.swapMs;
    const idx = Math.floor(timeMs / cycle);
    const within = timeMs - idx * cycle;
    const cur = phrases[idx % phrases.length];
    const next = phrases[(idx + 1) % phrases.length];
    // 0 while holding, then 0 -> 1 across the swap.
    const t = clamp01((within - p.hold) / Math.max(1, p.swapMs));

    // Tip speed at the glyph edge, px/ms — the flip is linear in t so the velocity is known
    // analytically; the sin(π·lt) envelope takes the blur to zero at both ends of the ripple,
    // so held lines are always crisp.
    const tipV = (p.tipDeg / Math.max(1, 0.75 * p.swapMs)) * (Math.PI / 180) * p.size * 0.5;

    /** One line, drawn twice: the outgoing copy tipping away and the incoming one tipping in.
     *  The two lines sit at different parallax depths, so the block's sway shears them. */
    const line = (outText: string, inText: string, key: 'top' | 'bottom') => {
      const par = parallax(timeMs, seed, key === 'top' ? 0.25 : 0.5, p.size * 0.06);
      return (
      <div style={{ position: 'relative', height: p.size * p.lead, transform: `translate(${par.x.toFixed(2)}px, ${par.y.toFixed(2)}px)`, ...el(key) }}>
        {[{ text: outText, leaving: true }, { text: inText, leaving: false }].map((layer, li) => (
          <div
            key={li}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              perspective: p.size * 8,
            }}
          >
            {[...layer.text].map((ch, i) => {
              // Per-letter stagger, so the line ripples across rather than flipping as one slab.
              const lt = clamp01((t - i * (p.perChar / Math.max(1, p.swapMs))) / 0.75);
              const rot = layer.leaving
                ? interpolate(lt, [0, 1], [0, -p.tipDeg])
                : interpolate(lt, [0, 1], [p.tipDeg, 0]);
              const op = layer.leaving ? 1 - lt : lt;
              // MOTION BLUR: mid-flip the glyph edge is moving fast — smear it vertically and
              // land crisp; a holding line has lt at 0 or 1 and gets no blur at all.
              const sm = smear(0, tipV * Math.sin(Math.PI * lt), 1);
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block', whiteSpace: 'pre',
                    fontSize: p.size, fontWeight: p.weight, color: p.ink,
                    lineHeight: p.lead, letterSpacing: -p.size * 0.015,
                    opacity: clamp01(op),
                    filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                    transformOrigin: '50% 50%',
                    transform: `rotateX(${rot.toFixed(2)}deg) scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      );
    };

    const enter = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 24, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          opacity: clamp01(enter * 1.6),
          // The block swings in top-hinged and then holds a ±1.7° breath — the swap ripples
          // happen on a plane that lives in space, not on a flat page.
          transform: depthPose(timeMs, seed, { enter, rx: -12, z: -70, swayDeg: 1.7 }),
          transformOrigin: 'center center',
          ...el('block'),
        }}
      >
        {line(cur[0] ?? '', next[0] ?? '', 'top')}
        {line(cur[1] ?? '', next[1] ?? '', 'bottom')}
      </div>
    );
  },
});
