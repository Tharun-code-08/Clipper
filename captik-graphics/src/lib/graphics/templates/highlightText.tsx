// Bare highlighter text for over-footage use — no card, just bold lines with a translucent
// amber sweep behind whatever the user wraps in *asterisks*. Each marked phrase is parsed
// into its own inline-block, so the sweep rect inherits the exact text metrics, and phrases
// stagger left-to-right the way a real highlighter makes multiple passes.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, smear, vel } from '../juice';

type Seg = { text: string; hl: boolean; k: number };

/** '*word*' markers → segments, highlight order counted across all lines for the stagger.
 *  An unclosed trailing marker still highlights — better than silently eating the star. */
function parseLines(text: string): Seg[][] {
  const lines: Seg[][] = [];
  let k = 0;
  for (const rawLine of text.split('\n')) {
    const segs: Seg[] = [];
    const parts = rawLine.split('*');
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      const hl = i % 2 === 1;
      segs.push({ text: parts[i], hl, k: hl ? k++ : -1 });
    }
    lines.push(segs);
  }
  return lines;
}

export const highlightText = defineGraphicsTemplate({
  id: 'highlight_text',
  name: 'Highlighter',
  category: 'title',
  tags: ['Highlighter', 'Marker', 'Text', 'Emphasis', 'Overlay'],
  badge: 'New',
  design: { w: 900, h: 400 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3500,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 74 },
  fonts: ['montserrat'],

  elements: [
    { key: 'text',      label: 'Text', hideable: false },
    { key: 'highlight', label: 'Highlighter' },
  ],

  params: [
    { type: 'text', key: 'text', label: 'Text', group: 'Content', multiline: true, maxLength: 120,
      default: 'This is where\n*everything changed*',
      help: 'Wrap the words to highlight in *asterisks*.' },

    { type: 'font',    key: 'font',   label: 'Font',        group: 'Style', default: 'montserrat' },
    { type: 'number',  key: 'size',   label: 'Text size',   group: 'Style', default: 64, min: 28, max: 130, step: 2, unit: 'px' },
    { type: 'color',   key: 'ink',    label: 'Text colour', group: 'Style', default: '#F4F1E8' },
    { type: 'color',   key: 'accent', label: 'Highlighter', group: 'Style', default: '#F59E0B' },
    { type: 'boolean', key: 'shadow', label: 'Legibility shadow', group: 'Style', default: true },

    { type: 'number', key: 'sweepMs', label: 'Sweep time', group: 'Motion', default: 520, min: 200, max: 1200, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay',      group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // A quiet air pass as the text rises, then one swish per highlighter stroke — the same
  // 550 + k*300 beats the sweeps run on, so retimed delay retimes the sound. No marked
  // phrases → no swish.
  sfx: (p) => {
    const n = parseLines(p.text).flat().filter((s) => s.hl).length;
    const cues: { atMs: number; id: 'whoosh' | 'swish'; gain: number }[] = [
      { atMs: p.delay + 80, id: 'whoosh', gain: 0.4 },
    ];
    for (let k = 0; k < Math.min(3, n); k++) {
      cues.push({ atMs: p.delay + 550 + k * 300 + 60, id: 'swish', gain: 0.5 });
    }
    return cues;
  },

  render: ({ params: p, el, timeMs, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const lines = parseLines(p.text);

    const riseAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 23, mass: 0.8, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    const rise = riseAt(t);
    // k-th phrase sweeps after the text has landed, one pass at a time.
    const sweepAt = (ms: number, k: number) => easeOutQuint(clamp01((ms - 550 - k * 300) / p.sweepMs));
    const sweep = (k: number) => sweepAt(t, k);

    // The block arrives through space (gentle top hinge) and keeps a ±1.6° breath through the
    // hold; its rise velocity smears it vertically mid-flight and dies the frame it settles.
    const pose = depthPose(t, seed, { enter: rise, rx: -12, z: -70, swayDeg: 1.6 });
    const vRise = vel(riseAt, t) * height * 0.06;
    const smRise = smear(0, vRise, 1);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: fontStack(p.font),
          opacity: interpolate(rise, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
          filter: smRise.blurPx > 0.3 ? `blur(${smRise.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} translateY(${((1 - rise) * height * 0.06).toFixed(2)}px) scale(${smRise.sx.toFixed(4)}, ${smRise.sy.toFixed(4)})`,
          transformOrigin: 'center center',
          ...el('text'),
        }}
      >
        {lines.map((segs, li) => (
          <div
            key={li}
            style={{
              fontSize: p.size, fontWeight: 800, lineHeight: 1.24, letterSpacing: '-0.01em',
              color: p.ink, textAlign: 'center',
              textShadow: p.shadow ? '0 2px 18px rgba(0,0,0,0.5)' : undefined,
            }}
          >
            {segs.map((s, si) => {
              // Marker-ink smear: the sweep edge's velocity blurs the wet leading edge of the
              // pass; easeOutQuint's derivative hits zero at the end, so the ink dries crisp.
              const vSweep = s.hl ? vel((ms) => sweepAt(ms, s.k), t) * p.size * 3.5 : 0;
              const smSweep = smear(vSweep, 0, 0.8);
              return s.hl ? (
                <span key={si} style={{ position: 'relative', display: 'inline-block', padding: '0 0.14em', margin: '0 -0.04em' }}>
                  {/* Both spans positioned → DOM order keeps the rect behind the words. */}
                  <span
                    style={{
                      position: 'absolute', inset: '10% -2% 0%',
                      background: rgba(p.accent, 0.45),
                      borderRadius: p.size * 0.09,
                      filter: smSweep.blurPx > 0.3 ? `blur(${smSweep.blurPx.toFixed(2)}px)` : undefined,
                      transform: `skewX(-2deg) scaleX(${sweep(s.k).toFixed(4)})`,
                      transformOrigin: 'left center',
                      ...el('highlight'),
                    }}
                  />
                  <span style={{ position: 'relative' }}>{s.text}</span>
                </span>
              ) : (
                <span key={si}>{s.text}</span>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
});
