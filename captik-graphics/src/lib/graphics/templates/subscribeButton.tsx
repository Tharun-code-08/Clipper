// Reference: social/youtube-subscribe-button.mp4  (window 480-3280ms, settles ~2200ms)
// Rebuilt against the recording — the first pass was written without one and had a pill shape, a
// bell icon, and the wrong state change. The reference is a small-radius rectangle with a play
// glyph, and on click it cross-fades RED -> DARK with the label becoming "Subscribed" plus a tick.
//
// Independent motions: the button pops, the cursor travels in, the button depresses under the
// press, and the fill/label swap on their own ramp trailing just behind the press.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, inkOn, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

/** Cross-fade two hex colours — the reference transitions the fill rather than swapping it. */
function mix(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const s = h.replace('#', '');
    const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}

export const subscribeButton = defineGraphicsTemplate({
  id: 'subscribe_button',
  name: 'Subscribe Button',
  category: 'cta',
  tags: ['YouTube', 'CTA', 'Button'],
  design: { w: 620, h: 188 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3500,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 53 },
  fonts: ['inter'],

  elements: [
    { key: 'button', label: 'Button', hideable: false },
    { key: 'glyph',  label: 'Play icon' },
    { key: 'label',  label: 'Label' },
    { key: 'cursor', label: 'Cursor' },
  ],

  params: [
    { type: 'text',    key: 'label', label: 'Label',       group: 'Content', default: 'Subscribe',  maxLength: 24 },
    { type: 'text',    key: 'done',  label: 'After click', group: 'Content', default: 'Subscribed', maxLength: 24 },
    { type: 'boolean', key: 'glyph', label: 'Play icon',   group: 'Content', default: true },
    { type: 'boolean', key: 'tick',  label: 'Tick when subscribed', group: 'Content', default: true },

    { type: 'color',  key: 'fill',     label: 'Button',     group: 'Style', default: '#e62117' },
    { type: 'color',  key: 'doneFill', label: 'Subscribed', group: 'Style', default: '#0f0f0f' },
    { type: 'color',  key: 'ink',      label: 'Text',       group: 'Style', default: '#ffffff' },
    { type: 'font',   key: 'font',     label: 'Font',       group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',     label: 'Text size',  group: 'Style', default: 46, min: 14, max: 110, step: 1, unit: 'px' },
    { type: 'number', key: 'radius',   label: 'Corner',     group: 'Style', default: 10, min: 0, max: 100, step: 1, unit: 'px' },

    { type: 'number',  key: 'clickAt', label: 'Click at',    group: 'Motion', default: 1500, min: 200, max: 5000, step: 50, unit: 'ms' },
    { type: 'boolean', key: 'cursor',  label: 'Show cursor', group: 'Motion', default: true },
  ],

  // A soft pop as the button lands, then a dry snap AT the click beat — the same clickAt
  // constant that drives the press dip and the RED→dark swap, so retiming one retimes both.
  sfx: (p) => [
    { atMs: 150, id: 'pop', gain: 0.5 },
    { atMs: p.clickAt, id: 'snap', gain: 0.8 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const popAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 17, mass: 0.6, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const pop = popAt(timeMs);

    const pressAt = (ms: number) => interpolate(ms, [p.clickAt - 90, p.clickAt, p.clickAt + 170], [1, 0.94, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad),
    });
    const press = pressAt(timeMs);

    // DEPTH + BLUR: the button swings in through a shallow top hinge on its existing pop
    // spring. This is a platform-button mimic, so the rest pose stays NEARLY still — 0.5° of
    // sway, no float — and the combined entrance + press-dip scale velocity smears it only
    // for the frames it actually moves.
    const scaleAt = (ms: number) => interpolate(popAt(ms), [0, 1], [0.84, 1]) * pressAt(ms);
    const btnSmear = smear(0, vel(scaleAt, timeMs) * height * 0.7);
    const pose = depthPose(timeMs, seed, { enter: pop, rx: -14, z: -70, swayDeg: 0.5 });
    const swap = interpolate(timeMs - p.clickAt, [40, 260], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad),
    });

    const travel = interpolate(timeMs, [p.clickAt - 620, p.clickAt], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    });
    const curX = interpolate(travel, [0, 1], [width * 0.9, width * 0.6]);
    const curY = interpolate(travel, [0, 1], [height * 1.6, height * 1.10]);

    const fill = mix(p.fill, p.doneFill, swap);
    const ink = p.ink || inkOn(fill);
    const fs = p.size;
    const gl = fs * 1.18;

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: fontStack(p.font) }}>
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: fs * 0.42,
            background: fill,
            borderRadius: p.radius,
            // Layered soft shadows — a contact layer and a deep ambient one — instead of the
            // button sitting flat on the footage.
            boxShadow:
              `0 ${Math.round(height * 0.045)}px ${Math.round(height * 0.12)}px ${rgba('#000000', 0.16)}, `
              + `0 ${Math.round(height * 0.15)}px ${Math.round(height * 0.36)}px ${rgba('#000000', 0.18)}`,
            opacity: interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
            filter: btnSmear.blurPx > 0.3 ? `blur(${btnSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} scale(${(scaleAt(timeMs) * btnSmear.sx).toFixed(4)}, ${(scaleAt(timeMs) * btnSmear.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('button'),
          }}
        >
          {p.glyph && (
            <span
              style={{
                width: gl, height: gl * 0.7, borderRadius: gl * 0.2, background: ink, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                ...el('glyph'),
              }}
            >
              <span
                style={{
                  width: 0, height: 0,
                  borderTop: `${gl * 0.17}px solid transparent`,
                  borderBottom: `${gl * 0.17}px solid transparent`,
                  borderLeft: `${gl * 0.28}px solid ${fill}`,
                  marginLeft: gl * 0.06,
                }}
              />
            </span>
          )}

          <span style={{ fontSize: fs, fontWeight: 700, color: ink, whiteSpace: 'nowrap', letterSpacing: '0.01em', ...el('label') }}>
            {swap > 0.5 ? p.done : p.label}
          </span>

          {p.tick && swap > 0.5 && (
            <svg
              width={fs * 0.8} height={fs * 0.8} viewBox="0 0 24 24" aria-hidden="true"
              style={{ opacity: interpolate(swap, [0.5, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}
            >
              <path d="M4 12.5 9.5 18 20 6.5" fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        {p.cursor && travel > 0 && (
          <svg
            width={width * 0.07} height={width * 0.086} viewBox="0 0 16 20" aria-hidden="true"
            style={{
              position: 'absolute', left: curX, top: curY,
              transform: `scale(${press.toFixed(3)})`, transformOrigin: 'top left',
              filter: `drop-shadow(0 2px 5px ${rgba('#000000', 0.4)})`,
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
