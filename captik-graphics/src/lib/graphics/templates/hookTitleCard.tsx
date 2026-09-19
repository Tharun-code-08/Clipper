import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { luxeGlow } from '../luxe';
import { idleFloat, smear, sway3d, swingIn, vel } from '../juice';

export const hookTitleCard = defineGraphicsTemplate({
  id: 'hook_title_card',
  name: 'Hook Title',
  category: 'title',
  tags: ['Hook', 'Kinetic', 'Text'],
  badge: 'New',
  design: { w: 900, h: 520 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 84 },
  fonts: ['montserrat'],

  elements: [
    { key: 'text', label: 'Headline', hideable: false },
    // Every word is separately positionable and scalable — the headline is the whole template,
    // so word-level control is the meaningful granularity here.
    ...Array.from({ length: 10 }, (_, i) => ({ key: `word${i + 1}`, label: `Word ${i + 1}` })),
  ],

  params: [
    { type: 'text',   key: 'text',   label: 'Headline', group: 'Content', default: 'nobody tells you this', maxLength: 120, multiline: true },
    { type: 'number', key: 'accentFrom', label: 'Accent from word', group: 'Content', default: 2, min: 0, max: 12, step: 1,
      help: 'Words from this index onward take the accent colour. Set past the end for none.' },

    { type: 'font',   key: 'font',    label: 'Font',         group: 'Style', default: 'montserrat' },
    { type: 'color',  key: 'color',   label: 'Text colour',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'accent',  label: 'Accent',       group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'size',    label: 'Size',         group: 'Style', default: 96, min: 40, max: 170, step: 2, unit: 'px' },
    { type: 'select', key: 'align',   label: 'Align',        group: 'Style', default: 'center',
      options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }] },
    { type: 'boolean', key: 'shadow', label: 'Drop shadow',  group: 'Style', default: true },
    { type: 'boolean', key: 'upper',  label: 'UPPERCASE',    group: 'Style', default: true },

    { type: 'number',  key: 'stagger', label: 'Word stagger', group: 'Motion', default: 90, min: 0, max: 300, step: 10, unit: 'ms' },
    { type: 'boolean', key: 'jitter',  label: 'Tilt each word', group: 'Motion', default: true },
  ],

  // One air sweep as the cascade starts, one soft hit when the LAST word lands — retiming the
  // stagger retimes the landing beat with it.
  sfx: (p) => {
    const n = Math.max(1, p.text.split(/\s+/).filter(Boolean).length);
    return [
      { atMs: 30, id: 'whoosh', gain: 0.5 },
      { atMs: (n - 1) * p.stagger + 240, id: 'slam', gain: 0.55 },
    ];
  },

  render: ({ params: p, el, timeMs, seed, width }) => {
    const words = p.text.split(/\s+/).filter(Boolean);
    const ff = fontStack(p.font);
    const justify = p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center';

    // The settled headline never flattens back into a web page: a ±1.7° sway plus a small drift
    // keeps the block living in space for its whole hold.
    const fl = idleFloat(timeMs, seed, 3);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexWrap: 'wrap', alignContent: 'center',
          justifyContent: justify, alignItems: 'center',
          gap: `${p.size * 0.14}px ${p.size * 0.26}px`,
          fontFamily: ff, textAlign: p.align as 'left' | 'center' | 'right',
          transform: `${sway3d(timeMs, seed, 1.7)} translate(${fl.x.toFixed(2)}px, ${fl.y.toFixed(2)}px)`,
          ...el('text'),
        }}
      >
        {words.map((w, i) => {
          const appearAt = i * p.stagger;
          // Each word rides its OWN spring, so they arrive with physics instead of a shared ramp.
          const spAt = (ms: number) => spring({
            frame: fr(ms - appearAt), fps: FPS,
            config: { damping: 24, mass: 0.6, stiffness: 175 },
            durationInFrames: Math.max(1, Math.round(fr(420))),
          });
          const sp = spAt(timeMs);
          const t = Math.max(0, Math.min(1, sp));
          // Seeded, NOT Math.random() — the preview and every export frame must agree, and the
          // tilt must stay the same on a re-render. random() is remotion's pure mulberry32.
          const tilt = p.jitter ? (random(`${seed}w${i}`) - 0.5) * 7 : 0;
          const rise = (1 - t) * p.size * 0.55;
          // MOTION BLUR: the word's own rise velocity drives the smear (blur + stretch along
          // the travel axis) — it dies the frame the word parks, so the pose is always crisp.
          const vW = vel((ms) => (1 - Math.max(0, Math.min(1, spAt(ms)))) * p.size * 0.55, timeMs);
          const sm = smear(0, vW, 1.05);
          // Every word swings in from its own seeded hinge — the cascade reads as objects
          // arriving in space, not divs fading on.
          const hinge = { rx: -12, ry: (random(`${seed}h${i}`) - 0.5) * 26, z: -70 };

          const isAccent = i >= p.accentFrom;
          // Layered soft depth shadow; accent words also carry a restrained bloom in their
          // own colour so the emphasis reads lit, not merely re-inked.
          const depth = p.shadow
            ? `0 ${p.size * 0.05}px ${p.size * 0.12}px ${rgba('#000000', 0.35)}, 0 ${p.size * 0.16}px ${p.size * 0.38}px ${rgba('#000000', 0.28)}`
            : '';
          const shadows = [isAccent ? luxeGlow(p.accent, 0.6) : '', depth].filter(Boolean).join(', ');

          return (
            <span
              key={`${w}-${i}`}
              style={{
                display: 'inline-block',
                fontSize: p.size,
                lineHeight: 1.02,
                fontWeight: 800,
                color: isAccent ? p.accent : p.color,
                textTransform: p.upper ? 'uppercase' : 'none',
                opacity: t,
                transform: `${swingIn(sp, hinge)} translateY(${rise.toFixed(2)}px) rotate(${tilt.toFixed(2)}deg) scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
                filter: sm.blurPx > 0.4 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                textShadow: shadows || undefined,
                maxWidth: width,
                ...el(`word${i + 1}`),
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    );
  },
});
