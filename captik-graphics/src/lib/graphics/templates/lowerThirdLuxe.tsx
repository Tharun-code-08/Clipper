// Luxury lower third: a gold hairline rule grows out first, the tracked uppercase kicker
// follows it, then the name lands with a masked rise. The whole lockup exits the way it
// entered when the clip ends. Deliberately quiet — a lower third that pulls focus is a
// failed lower third.

import { Easing, interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { LUXE, easeOutQuint, luxeLabel } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

export const lowerThirdLuxe = defineGraphicsTemplate({
  id: 'lower_third_luxe',
  name: 'Lower Third',
  category: 'title',
  tags: ['Name', 'Lower third', 'Interview', 'Luxury'],
  badge: 'New',
  design: { w: 900, h: 220 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 34, yPercent: 72, widthPercent: 56 },
  fonts: ['montserrat'],

  elements: [
    { key: 'rule',   label: 'Gold rule' },
    { key: 'kicker', label: 'Kicker' },
    { key: 'name',   label: 'Name', hideable: false },
  ],

  params: [
    { type: 'text', key: 'name',   label: 'Name',   group: 'Content', default: 'IMAN GADZHI', maxLength: 32 },
    { type: 'text', key: 'kicker', label: 'Kicker', group: 'Content', default: 'FOUNDER, IAG MEDIA', maxLength: 40 },
    { type: 'image', key: 'photo', label: 'Headshot', group: 'Content', default: '', help: 'Optional — adds a round speaker photo at the head of the lower third; nothing when empty.' },

    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'font',  key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'boolean', key: 'shade', label: 'Backing shade', group: 'Style', default: true },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // A lower third that pulls focus is a failed lower third — so: one soft air pass as the plate
  // turns in, one luxe ping as the name sets. Both off delay + the 380ms name beat.
  sfx: (p) => [
    { atMs: p.delay, id: 'whoosh', gain: 0.4 },
    { atMs: p.delay + 380, id: 'glass', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    const ruleIn = easeOutQuint(clamp01(t / 500));
    const kickIn = easeOutQuint(clamp01((t - 220) / 450));
    const nameInAt = (ms: number) => spring({
      frame: fr(ms - 380), fps: FPS,
      config: { damping: 30, mass: 0.7, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    const nameIn = nameInAt(t);
    const out = interpolate(durationMs - timeMs, [0, 350], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic),
    });

    const fsName = Math.round(height * 0.30);
    const fsKick = Math.round(height * 0.115);

    // Optional headshot disc at the head — the whole lockup shifts right by the disc
    // width ONLY when a photo is set; empty keeps today's layout untouched.
    const disc = Math.round(height * 0.62);
    const shift = p.photo ? disc + height * 0.12 : 0;

    // A name plate is LEFT-anchored, so it hinges on its left edge and turns in — never slides
    // in like a div — then holds a ±1.5° breath, deliberately shallower than a hero card. The
    // rule sits proud of the plate, the kicker mid, the name flat on it: the breath shears them.
    const pose = depthPose(t, seed, { enter: ruleIn, rx: -5, ry: 20, z: -70, swayDeg: 1.5, periodMs: 4400 });
    const parRule = parallax(t, seed, 0.85, height * 0.035, 4400);
    const parKick = parallax(t, seed, 0.5, height * 0.035, 4400);
    const parDisc = parallax(t, seed, 0.3, height * 0.035, 4400);
    // The masked rise is the one real move in here — the name climbs ~80px out of its slot, so
    // it carries a genuine smear that is gone the moment it seats.
    const riseAt = (ms: number) => (1 - nameInAt(ms)) * fsName * 1.25;
    const nameSm = smear(0, -vel(riseAt, t), 1);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, fontFamily: ff, opacity: out,
          transform: pose, transformOrigin: 'left center',
        }}
      >
        {/* Optional soft shade so the lockup reads over busy footage without a hard plate. */}
        {p.shade && (
          <div
            style={{
              position: 'absolute', inset: `${-height * 0.2}px ${-width * 0.06}px`,
              background: 'radial-gradient(ellipse 90% 100% at 18% 60%, rgba(6,6,8,0.55) 0%, transparent 70%)',
            }}
          />
        )}

        {p.photo && (
          <div
            style={{
              position: 'absolute', left: 0, top: height * 0.15,
              width: disc, height: disc,
              borderRadius: '50%', overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              opacity: ruleIn,
              transform: `translate(${parDisc.x.toFixed(2)}px, ${parDisc.y.toFixed(2)}px) scale(${(0.9 + 0.1 * ruleIn).toFixed(4)})`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        <div
          style={{
            position: 'absolute', left: shift, top: height * 0.14,
            width: width * 0.30 * ruleIn, height: Math.max(2, height * 0.016),
            background: p.accent,
            boxShadow: `0 0 12px ${p.accent}55`,
            transform: `translate(${parRule.x.toFixed(2)}px, ${parRule.y.toFixed(2)}px)`,
            transformOrigin: 'left center',
            ...el('rule'),
          }}
        />

        <span
          style={{
            position: 'absolute', left: shift, top: height * 0.24,
            ...luxeLabel(fsKick, LUXE.inkDim),
            opacity: kickIn,
            transform: `translate(${(parKick.x + (1 - kickIn) * -width * 0.02).toFixed(2)}px, ${parKick.y.toFixed(2)}px)`,
            whiteSpace: 'nowrap',
            ...el('kicker'),
          }}
        >
          {p.kicker}
        </span>

        {/* Masked rise: the name climbs out of an overflow-hidden slot. */}
        <div style={{ position: 'absolute', left: shift, top: height * 0.42, overflow: 'hidden', paddingBottom: height * 0.06 }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: fsName, fontWeight: 800, color: p.ink,
              letterSpacing: '0.045em', whiteSpace: 'nowrap', lineHeight: 1.1,
              filter: nameSm.blurPx > 0.3 ? `blur(${nameSm.blurPx.toFixed(2)}px)` : undefined,
              transform: `translateY(${((1 - nameIn) * fsName * 1.25).toFixed(2)}px) scale(${nameSm.sx.toFixed(4)}, ${nameSm.sy.toFixed(4)})`,
              ...el('name'),
            }}
          >
            {p.name}
          </span>
        </div>
      </div>
    );
  },
});
