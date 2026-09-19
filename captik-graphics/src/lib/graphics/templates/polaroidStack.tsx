// Instant-photo pile — 2-4 white-bordered prints drop in one per beat at seeded angles and
// overlap into a casual stack; the last print lands centred and straightens. The craft: the
// SHADOW does the falling — wide and soft while airborne, snapping tight as the spring lands —
// so each drop reads as height above the desk rather than a zoom.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

const PLACEHOLDERS = [
  'linear-gradient(160deg,#E7C08A,#C08A4E)',
  'linear-gradient(160deg,#D9A05B,#A3672F)',
  'linear-gradient(160deg,#EAD9B8,#C9A97C)',
  'linear-gradient(160deg,#B98A5E,#8A5D38)',
];

export const polaroidStack = defineGraphicsTemplate({
  id: 'polaroid_stack',
  name: 'Polaroid Stack',
  category: 'social',
  tags: ['Polaroid', 'Photos', 'Pile', 'Instant', 'Snapshot'],
  badge: 'New',
  design: { w: 900, h: 700 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 52 },
  fonts: ['playfair'],

  elements: [
    { key: 'photo1', label: 'Photo 1' },
    { key: 'photo2', label: 'Photo 2' },
    { key: 'photo3', label: 'Photo 3' },
    { key: 'photo4', label: 'Photo 4' },
  ],

  params: [
    { type: 'image', key: 'ph1', label: 'Photo 1', group: 'Content', default: '' },
    { type: 'image', key: 'ph2', label: 'Photo 2', group: 'Content', default: '' },
    { type: 'image', key: 'ph3', label: 'Photo 3', group: 'Content', default: '' },
    { type: 'image', key: 'ph4', label: 'Photo 4', group: 'Content', default: '' },
    { type: 'text', key: 'cap1', label: 'Caption 1', group: 'Content', default: 'day one', maxLength: 24 },
    { type: 'text', key: 'cap2', label: 'Caption 2', group: 'Content', default: 'the grind', maxLength: 24 },
    { type: 'text', key: 'cap3', label: 'Caption 3', group: 'Content', default: 'we made it', maxLength: 24 },
    { type: 'text', key: 'cap4', label: 'Caption 4', group: 'Content', default: 'what a ride', maxLength: 24 },
    { type: 'number', key: 'count', label: 'How many', group: 'Content', default: 3, min: 2, max: 4, step: 1 },

    { type: 'color', key: 'frame', label: 'Frame', group: 'Style', default: '#FFFDF6' },
    { type: 'color', key: 'ink', label: 'Ink', group: 'Style', default: '#22201B' },
    { type: 'number', key: 'tilt', label: 'Max tilt', group: 'Style', default: 6, min: 0, max: 12, step: 0.5, unit: '°' },

    { type: 'number', key: 'beat', label: 'Beat', group: 'Motion', default: 700, min: 300, max: 1400, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER language: a page flick per drop, then a soft pop as the last print lands centred and
  // straightens — beat/delay retime the cues with the pile.
  sfx: (p) => {
    const n = Math.round(p.count);
    return [
      ...Array.from({ length: Math.min(3, n - 1) }, (_, i) => ({
        atMs: p.delay + 150 + i * p.beat + 240,
        id: 'paper' as const,
        gain: 0.45,
      })),
      { atMs: p.delay + 150 + (n - 1) * p.beat + 260, id: 'pop' as const, gain: 0.55 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;

    const n = Math.round(p.count);
    const srcs = [p.ph1, p.ph2, p.ph3, p.ph4].slice(0, n);
    const caps = [p.cap1, p.cap2, p.cap3, p.cap4].slice(0, n);

    // Classic print proportions: thin white border, thicker strip at the bottom for the caption.
    const pw = Math.min(width * 0.4, (height * 0.82) / 1.21);
    const bd = pw * 0.05;
    const ph = pw * 1.21;
    const photoSize = pw - bd * 2;
    const fsCap = Math.round(pw * 0.105);

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: fontStack('playfair') }}>
        {srcs.map((src, i) => {
          const dropAt = 150 + i * p.beat;
          if (t < dropAt) return null;
          const last = i === n - 1;

          const sAt = (ms: number) => spring({
            frame: fr(ms - dropAt), fps: FPS,
            config: { damping: 21, mass: 0.8, stiffness: 165 },
            durationInFrames: Math.max(1, Math.round(fr(750))),
          });
          const s = sAt(t);
          const air = clamp01(1 - s);

          // TRUE flight smear: the fall is the 1.3→1 scale, so its derivative (at the print's
          // edge) drives blur + stretch that die the instant the print hits the desk.
          const scAt = (ms: number) => 1.3 - 0.3 * sAt(ms);
          const sm = smear(0, vel(scAt, t) * ph * 0.5, 1.3);

          // Each print is TOSSED: a seeded 3D hinge per drop (slightly different every print, so
          // the pile builds as objects landing on a desk) and a casual resting sway after — the
          // pose never flattens back into a web page.
          const pose = depthPose(t, `${seed}-d${i}`, {
            enter: s,
            rx: -(10 + random(`${seed}-hx${i}`) * 8),
            ry: (random(`${seed}-hy${i}`) - 0.5) * 14,
            z: -80,
            swayDeg: last ? 1.1 : 0.8,
          });

          const aRaw = (random(`${seed}-a${i}`) - 0.5) * 2 * p.tilt;
          const ang = last ? aRaw * 0.3 : aRaw;
          const dx = last
            ? 0
            : (random(`${seed}-x${i}`) - 0.5) * width * 0.26 + (i % 2 === 0 ? -1 : 1) * width * 0.05;
          const dy = last ? height * 0.015 : (random(`${seed}-y${i}`) - 0.5) * height * 0.13;

          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: '50%', top: '50%',
                width: pw, height: ph,
                marginLeft: -pw / 2, marginTop: -ph / 2,
                background: p.frame,
                borderRadius: 6,
                padding: bd, boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column',
                opacity: interpolate(s, [0, 0.22], [0, 1], { extrapolateRight: 'clamp' }),
                boxShadow: `0 ${(5 + air * 26).toFixed(1)}px ${(16 + air * 44).toFixed(1)}px rgba(0,0,0,${(0.16 + air * 0.1).toFixed(3)}), 0 2px 6px rgba(0,0,0,0.10)`,
                filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                transform:
                  `${pose} translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) ` +
                  `rotate(${(ang * (1 + air * 0.9)).toFixed(3)}deg) ` +
                  `scale(${(scAt(t) * sm.sx).toFixed(4)}, ${(scAt(t) * sm.sy).toFixed(4)})`,
                transformOrigin: 'center center',
                ...el(`photo${i + 1}`),
              }}
            >
              <div
                style={{
                  width: photoSize, height: photoSize, flexShrink: 0,
                  borderRadius: 3, overflow: 'hidden',
                  background: src ? undefined : PLACEHOLDERS[i % PLACEHOLDERS.length],
                  boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.05)',
                }}
              >
                {src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
              <div
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontStyle: 'italic', fontWeight: 500, fontSize: fsCap,
                  color: rgba(p.ink, 0.78), whiteSpace: 'nowrap', overflow: 'hidden',
                }}
              >
                {caps[i]}
              </div>
            </div>
          );
        })}
      </div>
    );
  },
});
