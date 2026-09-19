// Reference: ui-elements/pop-up-message-bubble.mp4
// A black speech bubble with a short tail at the lower-left. It springs in with a real overshoot
// and then holds — the bubble and its text arrive on separate springs so the type settles a beat
// after the box, which is what stops it reading as a single sliding block.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, inkOn, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

export const popUpBubble = defineGraphicsTemplate({
  id: 'pop_up_bubble',
  name: 'Message Bubble',
  category: 'notify',
  tags: ['Bubble', 'Chat', 'Callout'],
  // Measured off the reference by thresholding the black shape directly (local-contrast bbox was
  // inflated by the blur halo and sent me chasing the wrong error for a while):
  //   body 215x82 -> aspect 2.622, centred at 50.00% / 50.07% of the frame
  //   tail 8x8, inset 20.9% of the body width from its left edge
  //   cap height 24.4% of body height, text width 52.1% of body width
  // Design box must CONTAIN the tail, so: body 700x267 + tail 26 = 700x293.
  design: { w: 700, h: 293 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3500,
  defaultBox: { xPercent: 50, yPercent: 50.6, widthPercent: 51 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'bubble', label: 'Bubble', hideable: false },
    { key: 'label',  label: 'Text' },
    { key: 'tail',   label: 'Tail' },
  ],

  params: [
    { type: 'text', key: 'text', label: 'Text', group: 'Content', default: 'CAPTIK', maxLength: 32 },

    { type: 'color',  key: 'fill',   label: 'Bubble',   group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'ink',    label: 'Text',     group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Text size', group: 'Style', default: 90, min: 18, max: 200, step: 2, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',   group: 'Style', default: 34, min: 0, max: 90, step: 2, unit: 'px' },
    { type: 'select', key: 'tailSide', label: 'Tail', group: 'Style', default: 'left',
      options: [
        { value: 'left',  label: 'Bottom left' },
        { value: 'right', label: 'Bottom right' },
        { value: 'none',  label: 'None' },
      ] },
    { type: 'boolean', key: 'upper', label: 'UPPERCASE', group: 'Style', default: true },
    // The reference casts no visible shadow — measuring it, the content box is exactly the bubble
    // (247px) with nothing bleeding past the edges. Default off; it stays available as a knob.
    { type: 'number', key: 'shadow', label: 'Shadow', group: 'Style', default: 0, min: 0, max: 0.4, step: 0.01 },

    { type: 'number',  key: 'popMs', label: 'Pop-in',  group: 'Motion', default: 420, min: 120, max: 1200, step: 20, unit: 'ms' },
    { type: 'number',  key: 'bounce', label: 'Bounce', group: 'Motion', default: 11, min: 0, max: 26, step: 1,
      help: 'Lower is springier. 0 removes the overshoot entirely.' },
    { type: 'boolean', key: 'exit',  label: 'Pop out at the end', group: 'Motion', default: false },
  ],

  // One glossy UI pop as the bubble lands — timed off the same popMs that drives the spring, so
  // retiming the pop retimes the sound. The text settling gets nothing; one voice per beat.
  sfx: (p) => [
    { atMs: p.popMs * 0.45, id: 'pop', gain: 0.75 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const dur = Math.max(1, Math.round(fr(p.popMs)));
    // damping 0 would never settle; map the slider so 0 means "critically damped, no overshoot".
    const damping = p.bounce <= 0 ? 200 : 30 - p.bounce;

    const popAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping, mass: 0.62, stiffness: 165 },
      durationInFrames: dur,
    });
    const pop = popAt(timeMs);
    // The text follows one beat behind the box on its own spring.
    const textIn = spring({
      frame: fr(timeMs - p.popMs * 0.34), fps: FPS,
      config: { damping: 24, mass: 0.5, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(280))),
    });

    const leavingAt = (ms: number) => p.exit
      ? interpolate(durationMs - ms, [0, 260], [1, 0], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.back(1.4)),
        })
      : 0;
    const leaving = leavingAt(timeMs);

    const sAt = (ms: number) => interpolate(popAt(ms), [0, 1], [0.34, 1]) * (1 - leavingAt(ms));
    const s = sAt(timeMs);
    const op = interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }) * (1 - leaving);

    // DEPTH: the bubble is a graphic, not device chrome — it swings in on the SAME spring the
    // bounce slider drives, and keeps a subtle 1.8° sway so the held pose never flattens back
    // into a web page. Its scale velocity (in AND out — the exit back-ease smears too) drives
    // the motion blur, which dies the instant the pose settles.
    const pose = depthPose(timeMs, seed, { enter: pop * (1 - leaving), rx: -16, z: -85, swayDeg: 1.8 });
    const bubSmear = smear(0, vel(sAt, timeMs) * width * 0.35);

    // Body occupies the upper part of the design box; the tail hangs below it, inside the box.
    const tailH = Math.round(height * 0.0887);   // 26/293
    const bodyH = height - tailH;
    const tailW = Math.round(width * 0.0372);    // 8/215 of the body width
    const tailInset = Math.round(width * 0.209); // 45/215 from the body's left edge
    const ink = p.ink || inkOn(p.fill);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          transform: `${pose} scale(${(s * bubSmear.sx).toFixed(4)}, ${(s * bubSmear.sy).toFixed(4)})`,
          transformOrigin: 'center center',
          filter: bubSmear.blurPx > 0.3 ? `blur(${bubSmear.blurPx.toFixed(2)}px)` : undefined,
          opacity: op,
        }}
      >
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, height: bodyH,
            // Whisper of a top-light over the flat fill; the tail below stays flat p.fill —
            // at tail scale the difference is invisible.
            background: `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 60%), ${p.fill}`,
            borderRadius: p.radius,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: fontStack(p.font),
            boxShadow:
              `inset 0 1px 0 rgba(255,255,255,0.07)`
              + (p.shadow > 0
                ? `, 0 ${Math.round(height * 0.035)}px ${Math.round(height * 0.09)}px ${rgba('#000000', p.shadow)}, `
                  + `0 ${Math.round(height * 0.12)}px ${Math.round(height * 0.3)}px ${rgba('#000000', p.shadow)}`
                : ''),
            ...el('bubble'),
          }}
        >
          <span
            style={{
              fontSize: p.size, fontWeight: 800, color: ink,
              letterSpacing: '0.04em', whiteSpace: 'nowrap',
              textTransform: p.upper ? 'uppercase' : 'none',
              opacity: interpolate(textIn, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `scale(${interpolate(textIn, [0, 1], [0.86, 1]).toFixed(4)})`,
              ...el('label'),
            }}
          >
            {p.text}
          </span>
        </div>

        {p.tailSide !== 'none' && (
          <svg
            width={tailW} height={tailH} viewBox="0 0 12 14" aria-hidden="true"
            style={{
              position: 'absolute',
              top: bodyH - 2,
              left: p.tailSide === 'left' ? tailInset : undefined,
              right: p.tailSide === 'right' ? tailInset : undefined,
              transform: p.tailSide === 'right' ? 'scaleX(-1)' : undefined,
              ...el('tail'),
            }}
          >
            <path d="M0 0 H12 C7 2 4 7 2.5 14 C2.2 8 1.4 3 0 0 Z" fill={p.fill} />
          </svg>
        )}
      </div>
    );
  },
});
