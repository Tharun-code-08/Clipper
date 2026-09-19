// Documentary chapter card: full-bleed near-black, a tracked gold kicker ("CHAPTER 01"),
// a serif headline that settles up from a slight scale, a thin rule that grows underneath,
// grain + vignette + a warm light leak. The pacing is deliberately slow — chapter cards
// breathe; they are the pause between acts.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { LUXE, easeOutQuint, luxeGrain, luxeLabel, luxeLightLeak, luxeVignette } from '../luxe';
import { depthPose, parallax } from '../juice';

export const chapterCard = defineGraphicsTemplate({
  id: 'chapter_card',
  name: 'Chapter Card',
  category: 'story',
  tags: ['Chapter', 'Documentary', 'Serif', 'Fullscreen', 'Luxury'],
  badge: 'New',
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat', 'playfair'],

  elements: [
    { key: 'bg',     label: 'Background' },
    { key: 'kicker', label: 'Kicker' },
    { key: 'headline', label: 'Headline', hideable: false },
    { key: 'rule',   label: 'Rule' },
  ],

  params: [
    { type: 'text', key: 'kicker',   label: 'Kicker',   group: 'Content', default: 'CHAPTER 01', maxLength: 24 },
    { type: 'text', key: 'headline', label: 'Headline', group: 'Content', default: 'The Beginning', maxLength: 40 },

    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'boolean', key: 'italic', label: 'Italic serif', group: 'Style', default: true },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // A quiet air sweep as the headline racks into focus, a soft chime when the rule draws —
  // chapter cards whisper, they don't slam.
  sfx: (p) => [
    { atMs: p.delay + 600, id: 'whoosh', gain: 0.4 },
    { atMs: p.delay + 1150, id: 'chime', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;

    const bgIn = easeOutQuint(clamp01(t / 600));
    const kickIn = easeOutQuint(clamp01((t - 350) / 600));
    const headIn = spring({
      frame: fr(t - 600), fps: FPS,
      config: { damping: 40, mass: 1, stiffness: 90 },
      durationInFrames: Math.max(1, Math.round(fr(900))),
    });
    const ruleIn = easeOutQuint(clamp01((t - 1100) / 700));

    // Cinematic depth: the whole title block lives in 3D with a slow breath (period 4600 —
    // chapter cards are the pause between acts, not a slam), the field pushes in Ken-Burns
    // style over the window, and the headline arrives as a RACK FOCUS (blur → sharp), which
    // is the documentary language for "this matters".
    const pose = depthPose(t, seed, { enter: headIn, rx: -7, z: -50, swayDeg: 1.6, periodMs: 4600 });
    const push = 1 + Math.min(1, t / Math.max(1, durationMs)) * 0.045;
    const parKick = parallax(t, seed, 0.5, height * 0.007, 4600);
    const parRule = parallax(t, seed, 0.85, height * 0.007, 4600);
    const parLeak = parallax(t, seed, 0.28, height * 0.012, 4600);
    const focusHead = (1 - headIn) * 6;
    const focusKick = (1 - kickIn) * 4;

    const fsKick = Math.round(height * 0.021);
    const fsHead = Math.round(height * 0.052);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: LUXE.bg0, opacity: bgIn, transform: `scale(${push.toFixed(4)})`, ...el('bg') }} />
        <div style={{ ...luxeLightLeak('75%', '4%', 0.13), opacity: bgIn, transform: `translate(${parLeak.x.toFixed(2)}px, ${parLeak.y.toFixed(2)}px) scale(${push.toFixed(4)})` }} />

        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: height * 0.024,
            transform: pose,
          }}
        >
          <span
            style={{
              ...luxeLabel(fsKick, p.accent),
              opacity: kickIn,
              transform: `translate(${parKick.x.toFixed(2)}px, ${(parKick.y + (1 - kickIn) * height * 0.012).toFixed(2)}px)`,
              filter: focusKick > 0.3 ? `blur(${focusKick.toFixed(2)}px)` : undefined,
              textShadow: `0 0 18px ${p.accent}44`,
              ...el('kicker'),
            }}
          >
            {p.kicker}
          </span>

          <span
            style={{
              fontFamily: fontStack('playfair'),
              fontStyle: p.italic ? 'italic' : 'normal',
              fontWeight: 600,
              fontSize: fsHead, color: LUXE.ink, textAlign: 'center',
              maxWidth: width * 0.84, lineHeight: 1.15,
              opacity: headIn,
              filter: focusHead > 0.3 ? `blur(${focusHead.toFixed(2)}px)` : undefined,
              transform: `scale(${(0.965 + headIn * 0.035).toFixed(4)}) translateY(${((1 - headIn) * height * 0.01).toFixed(2)}px)`,
              ...el('headline'),
            }}
          >
            {p.headline}
          </span>

          <div
            style={{
              width: width * 0.14 * ruleIn, height: 2,
              background: p.accent, opacity: 0.9,
              marginTop: height * 0.012,
              transform: `translate(${parRule.x.toFixed(2)}px, ${parRule.y.toFixed(2)}px)`,
              ...el('rule'),
            }}
          />
        </div>

        <div style={{ ...luxeVignette(0.5), opacity: bgIn }} />
        <div style={{ ...luxeGrain(0.055), opacity: bgIn }} />
      </div>
    );
  },
});
