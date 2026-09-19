// Reference: text/the-future-of-design-1.mp4  (window 640-5280ms, set by ~2000ms)
// A magazine cover lockup: a small word above, one large italic word, a small line beneath. The
// hero word slides up from behind a mask while the small words fade in from the outside in, so
// three separate arrivals read as one composed title.
//
// The mask is a plain overflow:hidden wrapper sized to the line — a clip-path would need the glyph
// metrics, and this gets the same "rises out of the baseline" read from layout alone.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

export const editorialTitle = defineGraphicsTemplate({
  id: 'editorial_title',
  name: 'Editorial Title',
  category: 'title',
  tags: ['Text', 'Elegant', 'Lockup', 'Luxury'],
  design: { w: 900, h: 620 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat', 'playfair'],

  elements: [
    { key: 'lockup', label: 'Lockup', hideable: false },
    { key: 'top',    label: 'Top word' },
    { key: 'main',   label: 'Hero word' },
    { key: 'bottom', label: 'Bottom line' },
  ],

  params: [
    { type: 'text', key: 'top',    label: 'Top word',    group: 'Content', default: 'the', maxLength: 24 },
    { type: 'text', key: 'main',   label: 'Hero word',   group: 'Content', default: 'future', maxLength: 20 },
    { type: 'text', key: 'bottom', label: 'Bottom line', group: 'Content', default: 'of design', maxLength: 32 },

    { type: 'color',  key: 'ink',    label: 'Text',  group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',   label: 'Hero font',  group: 'Style', default: 'playfair' },
    { type: 'font',   key: 'smallFont', label: 'Small font', group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Hero size',  group: 'Style', default: 220, min: 40, max: 320, step: 4, unit: 'px' },
    { type: 'number', key: 'small',  label: 'Small size', group: 'Style', default: 50, min: 10, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'lean',   label: 'Italic lean', group: 'Style', default: 12, min: 0, max: 30, step: 1, unit: '°' },
    { type: 'number', key: 'weight', label: 'Hero weight', group: 'Style', default: 700, min: 300, max: 900, step: 100 },
    { type: 'number', key: 'track',  label: 'Small tracking', group: 'Style', default: 9, min: 0, max: 30, step: 1, unit: 'px' },

    { type: 'number', key: 'heroAt', label: 'Hero at',   group: 'Motion', default: 0, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'topAt',  label: 'Top word at', group: 'Motion', default: 620, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'botAt',  label: 'Bottom line at', group: 'Motion', default: 860, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'slide',  label: 'Small-word slide', group: 'Motion', default: 40, min: 0, max: 200, step: 4, unit: 'px' },
  ],

  // Magazine whisper: air as the hero rises out of its mask, a luxe ping and a soft chime as the
  // small words slide home — three quiet cues for three arrivals, all off the same Motion params.
  sfx: (p) => [
    { atMs: p.heroAt + 80, id: 'whoosh', gain: 0.45 },
    { atMs: p.topAt + 120, id: 'glass', gain: 0.4 },
    { atMs: p.botAt + 260, id: 'chime', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, seed }) => {
    const heroFf = fontStack(p.font);
    const smallFf = fontStack(p.smallFont);

    const heroAt = (ms: number) => spring({
      frame: fr(ms - p.heroAt), fps: FPS,
      config: { damping: 26, mass: 0.9, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    const topAt = (ms: number) => spring({
      frame: fr(ms - p.topAt), fps: FPS,
      config: { damping: 28, mass: 0.6, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const botAt = (ms: number) => spring({
      frame: fr(ms - p.botAt), fps: FPS,
      config: { damping: 28, mass: 0.6, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const hero = heroAt(timeMs);
    const top = topAt(timeMs);
    const bot = botAt(timeMs);

    // The lockup lives in 3D: a shallow top-hinged swing rides the hero's own spring, then a slow
    // ±1.5° sway keeps the cover breathing. The small words sit on nearer planes and shear
    // against the hero as it sways — a lockup with depth, not three flat lines.
    const pose = depthPose(timeMs, seed, { enter: hero, rx: -9, z: -70, swayDeg: 1.5, periodMs: 4200 });
    const parTop = parallax(timeMs, seed, 0.55, p.small * 0.16, 4200);
    const parBot = parallax(timeMs, seed, 0.8, p.small * 0.16, 4200);

    // MOTION BLUR: each mover's own velocity — the hero's rise through the mask, the small words'
    // slides — drives a smear that dies the frame it settles. The held cover stays crisp.
    const vHero = vel((ms) => (1 - heroAt(ms)) * p.size * 0.62, timeMs);
    const smHero = smear(0, vHero, 1);
    const vTop = vel((ms) => (1 - topAt(ms)) * -p.slide, timeMs);
    const smTop = smear(vTop, 0, 0.9);
    const vBot = vel((ms) => (1 - botAt(ms)) * p.slide, timeMs);
    const smBot = smear(vBot, 0, 0.9);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          transform: pose,
          ...el('lockup'),
        }}
      >
        <span
          style={{
            fontFamily: smallFf, fontSize: p.small, color: p.ink,
            letterSpacing: p.track, fontWeight: 600, textTransform: 'uppercase',
            marginBottom: -p.small * 0.1,
            opacity: 0.62 * clamp01(top * 1.5),
            filter: smTop.blurPx > 0.3 ? `blur(${smTop.blurPx.toFixed(2)}px)` : undefined,
            transform:
              `translate(${((1 - top) * -p.slide + parTop.x).toFixed(2)}px, ${parTop.y.toFixed(2)}px) `
              + `scale(${smTop.sx.toFixed(4)}, ${smTop.sy.toFixed(4)})`,
            ...el('top'),
          }}
        >
          {p.top}
        </span>

        {/* Mask: the hero word rises out of its own line box. */}
        <span style={{ display: 'block', overflow: 'hidden', lineHeight: 1.02, paddingBottom: p.size * 0.06 }}>
          <span
            style={{
              display: 'inline-block',
              fontFamily: heroFf, fontSize: p.size, fontWeight: p.weight, color: p.ink,
              letterSpacing: -p.size * 0.012, lineHeight: 1.02, whiteSpace: 'nowrap',
              filter: smHero.blurPx > 0.3 ? `blur(${smHero.blurPx.toFixed(2)}px)` : undefined,
              transform:
                `translateY(${((1 - hero) * p.size * 0.62).toFixed(2)}px) `
                + `skewX(${-p.lean}deg) `
                + `scale(${smHero.sx.toFixed(4)}, ${smHero.sy.toFixed(4)})`,
              ...el('main'),
            }}
          >
            {p.main}
          </span>
        </span>

        <span
          style={{
            fontFamily: smallFf, fontSize: p.small, color: p.ink,
            letterSpacing: p.track, fontWeight: 600, textTransform: 'uppercase',
            marginTop: p.small * 0.2,
            opacity: 0.62 * clamp01(bot * 1.5),
            filter: smBot.blurPx > 0.3 ? `blur(${smBot.blurPx.toFixed(2)}px)` : undefined,
            transform:
              `translate(${((1 - bot) * p.slide + parBot.x).toFixed(2)}px, ${parBot.y.toFixed(2)}px) `
              + `scale(${smBot.sx.toFixed(4)}, ${smBot.sy.toFixed(4)})`,
            ...el('bottom'),
          }}
        >
          {p.bottom}
        </span>
      </div>
    );
  },
});
