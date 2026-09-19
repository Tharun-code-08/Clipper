// "Archival photo" treatment: a printed-photo border with a typewritten caption strip, sepia
// inner vignette + grain, and a slow 2% push-in — the photo window is a real HOLE, the user's
// footage IS the photo. The frame is one div with per-side CSS borders on a transparent
// background, and the vignette is an inset box-shadow — both render around/over a transparent
// center with no mask-image, which is what keeps the window genuinely see-through.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp, clamp01, fr, outRamp, rgba } from '../motion';
import { easeOutQuint, luxeGrain } from '../luxe';
import { depthPose } from '../juice';

export const archivalFrame = defineGraphicsTemplate({
  id: 'archival_frame',
  name: 'Archival Frame',
  category: 'story',
  tags: ['Photo', 'Frame', 'Vintage', 'Sepia', 'Caption'],
  badge: 'New',
  design: { w: 720, h: 600 },
  // Transparent by design — the footage shows through the window; a plate would fill the hole.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 58 },
  fonts: ['montserrat'],

  elements: [
    { key: 'frame',    label: 'Photo border', hideable: false },
    { key: 'vignette', label: 'Sepia vignette' },
    { key: 'grain',    label: 'Grain' },
    { key: 'caption',  label: 'Caption' },
  ],

  params: [
    { type: 'text', key: 'caption', label: 'Caption', group: 'Content', default: 'BERLIN, 1989', maxLength: 32 },
    { type: 'image', key: 'photo', label: 'Photo', group: 'Content', default: '', help: 'Optional — the window stays transparent (your footage shows through) when empty.' },

    { type: 'color',  key: 'frameColor', label: 'Border', group: 'Style', default: '#EFE8D8' },
    { type: 'color',  key: 'ink',    label: 'Caption ink', group: 'Style', default: '#4A4034' },
    { type: 'number', key: 'border', label: 'Border width', group: 'Style', default: 20, min: 10, max: 36, step: 1, unit: 'px' },
    { type: 'number', key: 'sepia',  label: 'Sepia', group: 'Style', default: 55, min: 0, max: 100, step: 5 },
    { type: 'boolean', key: 'tilt',  label: 'Casual tilt', group: 'Style', default: true },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Documentary chrome whispers: a low airy sweep as the print racks into focus, one
  // typewriter tick as the caption starts striking (650 is the typeStart in render).
  sfx: (p) => [
    { atMs: p.delay + 60, id: 'sweep', gain: 0.35 },
    { atMs: p.delay + 650 + 65, id: 'tick', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, durationMs, height, seed }) => {
    const t = timeMs - p.delay;
    const out = outRamp(timeMs, durationMs, 350);
    const fadeIn = easeOutQuint(clamp01(t / 350));

    // One settle spring in, then the slow archival push — 2% over the whole hold.
    const pop = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 26, mass: 0.9, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    const push = 1 + clamp01(t / Math.max(1, durationMs)) * 0.02;
    const scale = (0.955 + 0.045 * pop) * push;
    const tiltDeg = p.tilt ? (random(seed + '-tilt') - 0.5) * 2.8 : 0;

    // Documentary chrome: the print hangs in space with a whisper of 3D — a shallow swing in on
    // the settle spring, then a sub-degree sway so the frame never flattens into a web page. The
    // entrance is also a rack focus (blur → sharp): the archival language for "found footage".
    const pose = depthPose(t, seed, { enter: pop, rx: -8, z: -60, swayDeg: 0.7, periodMs: 4200 });
    const rack = (1 - Math.min(1, pop)) * 3;

    const bt = p.border;
    const ch = Math.round(Math.max(bt * 2.4, height * 0.145));
    const s = p.sepia / 100;
    const fsCap = Math.round(height * 0.044);

    // Typewritten caption: pure integer division of elapsed time.
    const typeStart = 650;
    const chars = clamp(Math.floor((t - typeStart) / 65), 0, p.caption.length);

    // The transparent photo window, in design px.
    const win = { left: bt, top: bt, right: bt, bottom: ch } as const;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          opacity: fadeIn * out,
          filter: rack > 0.3 ? `blur(${rack.toFixed(2)}px)` : undefined,
          transform: `${pose} rotate(${tiltDeg.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
          fontFamily: fontStack('montserrat'),
        }}
      >
        {/* Per-side borders + transparent background = the hole. Outer shadow stays outside it. */}
        <div
          style={{
            position: 'absolute', inset: 0,
            borderStyle: 'solid',
            borderColor: p.frameColor,
            borderWidth: `${bt}px ${bt}px ${ch}px ${bt}px`,
            borderRadius: 3,
            boxShadow: '0 18px 55px rgba(0,0,0,0.45), 0 4px 14px rgba(0,0,0,0.3)',
            ...el('frame'),
          }}
        />

        {/* Optional photo fills the window; the sepia vignette + grain below still paint over it. */}
        {p.photo && (
          <div
            style={{
              position: 'absolute',
              left: win.left, top: win.top, right: win.right, bottom: win.bottom,
              overflow: 'hidden',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        {/* Sepia age: flat warm wash + inset shadows + a print-edge hairline, all on one div. */}
        <div
          style={{
            position: 'absolute',
            left: win.left, top: win.top, right: win.right, bottom: win.bottom,
            background: rgba('#9C6E2C', 0.1 * s),
            border: `2px solid ${rgba('#2B1A0A', 0.4 * s)}`,
            boxShadow: `inset 0 0 ${Math.round(height * 0.09)}px ${rgba('#3A2410', 0.55 * s)}, inset 0 0 ${Math.round(height * 0.24)}px ${rgba('#241505', 0.35 * s)}`,
            ...el('vignette'),
          }}
        />

        {/* Film grain, normal blend — overlay blending against transparent footage is undefined. */}
        <div
          style={{
            ...luxeGrain(0.07),
            mixBlendMode: 'normal',
            inset: `${win.top}px ${win.right}px ${win.bottom}px ${win.left}px`,
            ...el('grain'),
          }}
        />

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: height - ch, height: ch,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: fsCap, fontWeight: 600, letterSpacing: '0.3em',
            textTransform: 'uppercase', whiteSpace: 'pre',
            color: p.ink,
            paddingLeft: '0.3em',
            ...el('caption'),
          }}
        >
          {p.caption.slice(0, chars)}
        </div>
      </div>
    );
  },
});
