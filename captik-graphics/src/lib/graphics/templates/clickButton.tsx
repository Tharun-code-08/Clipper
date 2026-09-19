// Reference: ui-elements/click-animation.mp4  (window 0-4760ms, settles ~1360ms)
// A small button that a cursor arrives at, presses, and releases — with a ripple expanding out of
// the click point. Four independent motions: the button pops, the cursor travels, the button
// depresses under it, and the ripple expands and fades on its own clock. The ripple can repeat, so
// it is driven by a modulo of timeMs rather than a one-shot.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, inkOn, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

export const clickButton = defineGraphicsTemplate({
  id: 'click_button',
  name: 'Click Button',
  category: 'cta',
  tags: ['Button', 'Cursor', 'Ripple'],
  design: { w: 520, h: 300 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 90 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'button', label: 'Button', hideable: false },
    { key: 'label',  label: 'Label' },
    { key: 'cursor', label: 'Cursor' },
    { key: 'ripple', label: 'Ripple' },
  ],

  params: [
    { type: 'text', key: 'label', label: 'Label', group: 'Content', default: 'Click Me', maxLength: 24 },

    { type: 'color',  key: 'fill',   label: 'Button', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Text',   group: 'Style', default: '#1F1808' },
    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Text size', group: 'Style', default: 34, min: 12, max: 90, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 12, min: 0, max: 60, step: 1, unit: 'px' },

    { type: 'number',  key: 'clickAt', label: 'First click at', group: 'Motion', default: 1250, min: 200, max: 4000, step: 50, unit: 'ms' },
    { type: 'number',  key: 'repeat',  label: 'Repeat every',   group: 'Motion', default: 1900, min: 0, max: 4000, step: 100, unit: 'ms',
      help: '0 clicks once and stops.' },
    { type: 'boolean', key: 'cursor',  label: 'Show cursor',    group: 'Motion', default: true },
  ],

  // A glossy pop as the button stamps in, then a dry snap AT the click beat — the same clickAt
  // constant that starts the press dip, so retiming the click retimes the sound.
  sfx: (p) => [
    { atMs: 200, id: 'pop', gain: 0.5 },
    { atMs: p.clickAt, id: 'snap', gain: 0.8 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const popAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 18, mass: 0.6, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });
    const pop = popAt(timeMs);

    // Clicks repeat on a fixed cadence; `cyc` is time since the most recent click.
    const since = timeMs - p.clickAt;
    const cyc = p.repeat > 0 && since >= 0 ? since % p.repeat : since;
    const clicked = since >= 0;

    // Press: down fast, back up with a little spring. A closure of ms so vel() can sample it.
    const pressAt = (ms: number) => {
      const s = ms - p.clickAt;
      const c = p.repeat > 0 && s >= 0 ? s % p.repeat : s;
      return s >= 0
        ? interpolate(c, [0, 90, 260], [1, 0.94, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad),
          })
        : 1;
    };
    const press = pressAt(timeMs);

    // DEPTH + BLUR: the button STAMPS in through 3D — a top-hinged swing on the existing pop
    // spring while the scale sets down from 1.55 — and keeps a faint sway so the pose never
    // dies. Its total scale velocity (stamp + press dip) smears it in flight and the blur dies
    // the frame it rests.
    const scaleAt = (ms: number) => (1.55 - 0.55 * popAt(ms)) * pressAt(ms);
    const scale = scaleAt(timeMs);
    const btnSmear = smear(0, vel(scaleAt, timeMs) * height * 0.6);
    const pose = depthPose(timeMs, seed, { enter: pop, rx: -16, z: -80, swayDeg: 1.2 });

    // Ripple expands and fades over 900ms from each click.
    const rip = clicked
      ? interpolate(cyc, [0, 900], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
      : 0;

    // Cursor glides in over the 700ms before the FIRST click, then holds.
    const travel = interpolate(timeMs, [p.clickAt - 700, p.clickAt], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    });
    const cx = interpolate(travel, [0, 1], [width * 0.70, width * 0.53]);
    const cy = interpolate(travel, [0, 1], [height * 0.66, height * 0.53]);

    const ink = p.ink || inkOn(p.fill);
    const btnW = Math.round(width * 0.42);
    const btnH = Math.round(height * 0.2);
    const rippleMax = width * 0.38;

    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontStack(p.font) }}>
        {rip > 0 && rip < 1 && (
          <div
            style={{
              position: 'absolute',
              left: '50%', top: '50%',
              width: rippleMax * 2, height: rippleMax * 2,
              marginLeft: -rippleMax, marginTop: -rippleMax,
              borderRadius: '50%',
              background: rgba(p.fill, 0.45 * (1 - rip)),
              transform: `scale(${(0.2 + rip * 0.8).toFixed(4)})`,
              ...el('ripple'),
            }}
          />
        )}

        <div
          style={{
            width: btnW, height: btnH,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // Metallic read: diagonal sheen over the fill, hairline light edge, and a shadow
            // stack of contact + ambient dark layers with a soft fill-coloured bloom.
            background: `linear-gradient(165deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 48%), ${p.fill}`,
            border: '1px solid rgba(255,255,255,0.28)',
            boxSizing: 'border-box',
            borderRadius: p.radius,
            boxShadow:
              `0 ${Math.round(btnH * 0.06)}px ${Math.round(btnH * 0.16)}px ${rgba('#000000', 0.28)}, `
              + `0 ${Math.round(btnH * 0.2)}px ${Math.round(btnH * 0.5)}px ${rgba('#000000', 0.2)}, `
              + `0 0 ${Math.round(btnH * 0.5)}px ${rgba(p.fill, 0.22)}`,
            opacity: interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
            filter: btnSmear.blurPx > 0.3 ? `blur(${btnSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} scale(${(scale * btnSmear.sx).toFixed(4)}, ${(scale * btnSmear.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('button'),
          }}
        >
          <span style={{ fontSize: p.size, fontWeight: 700, color: ink, letterSpacing: '0.02em', whiteSpace: 'nowrap', ...el('label') }}>
            {p.label}
          </span>
        </div>

        {p.cursor && travel > 0 && (
          <svg
            width={width * 0.06} height={width * 0.074} viewBox="0 0 16 20" aria-hidden="true"
            style={{
              position: 'absolute', left: cx, top: cy,
              opacity: Math.min(1, travel * 3),
              filter: `drop-shadow(0 2px 4px ${rgba('#000000', 0.35)})`,
              transform: `scale(${press.toFixed(3)})`,
              transformOrigin: 'top left',
              ...el('cursor'),
            }}
          >
            <path d="M1 1l12.5 8.2-5.6.7 3.2 6.4-2.6 1.3-3.2-6.4L1 15.4Z" fill="#ffffff" stroke="#111" strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    );
  },
});
